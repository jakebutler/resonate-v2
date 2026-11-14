import { type LookupFn, BlockedUrlError, validateRemoteUrl } from "./urlGuard";
import {scheduleToUtcIso} from "./schedules";
export {scheduleToUtcIso} from "./schedules";
import { type BufferDestination, type BufferRequestBudget, BufferRequestBudgetError, observeBufferRateLimit, safeLinkedInUrl, destinationHold, destinationIdentity } from "./bufferContracts";
import type {
  BrandId,
  ChannelId,
  ProviderAttemptStatus,
  ProviderId,
  ProviderStateStatus,
} from "./domain";
import { brandHasBufferLinkedInMapping, bufferLinkedInChannelForBrand } from "./domain";

export type ProviderSubmission = {
  postId: string;
  brandId: BrandId;
  channelId: ChannelId;
  title: string;
  content: string;
  firstComment?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  timezone: string;
  idempotencyKey: string;
  providerPostId?: string;
  expectedDestination?: BufferDestination;
  subreddit?: string;
};

export type ProviderIntentType = "cancel" | "unpublish";

export type ProviderAdapterContext = {
  env: Record<string, string | undefined>;
  liveProviderValidationApproved?: boolean;
  fetchImpl?: typeof fetch;
  requestBudget?: BufferRequestBudget;
  beforeCreate?: () => Promise<string | null>;
  /**
   * DNS resolver for the SSRF guard (`validateRemoteUrl`). Fetching callers
   * (the crawl paths) must supply it — without DNS resolution a public
   * hostname can still resolve to a private address, so no lookup means no
   * fetch.
   */
  lookup?: LookupFn;
};

export type ProviderResult = {
  ok: boolean;
  status: ProviderAttemptStatus;
  providerStateStatus: ProviderStateStatus;
  providerPostId?: string;
  sanitizedResponse: Record<string, unknown>;
  reason?: string;
};

export type ProviderValidationResult = {
  ok: boolean;
  providerId: ProviderId;
  accountLabel?: string;
  reason?: string;
  sanitizedResponse: Record<string, unknown>;
};

export type ProviderAdapter = {
  providerId: ProviderId;
  requiredEnvVar: string | null;
  validateConnection(context: ProviderAdapterContext): Promise<ProviderValidationResult>;
  submit(
    submission: ProviderSubmission,
    context: ProviderAdapterContext
  ): Promise<ProviderResult>;
  recordCancelOrUnpublishIntent(
    submission: ProviderSubmission,
    intentType: ProviderIntentType,
    context: ProviderAdapterContext
  ): Promise<ProviderResult>;
  refreshStatus(
    providerPostId: string,
    context: ProviderAdapterContext
  ): Promise<ProviderResult>;
};

const SECRET_KEY_PATTERN = /token|secret|key|authorization|cookie|bearer|password/i;

export function providerForChannel(channelId: ChannelId): ProviderId | null {
  if (channelId === "linkedin") return "buffer";
  if (channelId === "reddit") return "zernio";
  if (channelId === "corvo-blog") return "github-pr";
  return null;
}

export function sanitizeProviderPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { value };
  }
  return sanitizeRecord(value as Record<string, unknown>);
}

function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => {
      if (SECRET_KEY_PATTERN.test(key)) return [key, "[redacted]"];
      if (Array.isArray(value)) return [key, value.map(sanitizeValue)];
      if (value && typeof value === "object") {
        return [key, sanitizeRecord(value as Record<string, unknown>)];
      }
      return [key, value];
    })
  );
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return sanitizeRecord(value as Record<string, unknown>);
  }
  return value;
}

export function classifyProviderError(input: {
  status?: number;
  code?: string;
  message?: string;
}): ProviderAttemptStatus {
  const message = input.message?.toLowerCase() ?? "";
  if (input.status === 401 || input.status === 403) return "permanent-failure";
  if (input.status === 404) return "permanent-failure";
  if (input.status === 409 || input.status === 425 || input.status === 429) {
    return "retryable-failure";
  }
  if (input.status && input.status >= 500) return "retryable-failure";
  if (/timeout|rate limit|temporar|try again|network/.test(message)) {
    return "retryable-failure";
  }
  if (/unknown|ambiguous|accepted but/.test(message)) return "ambiguous";
  return "permanent-failure";
}

export function classifyRedditError(input: {
  status?: number;
  code?: string;
  message?: string;
}): {
  attemptStatus: ProviderAttemptStatus;
  providerStateStatus: ProviderStateStatus;
} {
  const message = input.message?.toLowerCase() ?? "";
  const code = input.code?.toLowerCase() ?? "";

  if (
    /suspend|suspended|ban(?:ned)?|account.+disabled|account.+unavailable/.test(message) ||
    /suspend|banned/.test(code)
  ) {
    return { attemptStatus: "unavailable", providerStateStatus: "unavailable" };
  }
  if (/removed|deleted by|post removed|not found|missing post/.test(message) || code === "removed") {
    return { attemptStatus: "ambiguous", providerStateStatus: "needs-review" };
  }
  if (
    /moderat|automod|manual review|pending approval|subreddit rules|flair required|approval required|mod queue/.test(
      message
    ) ||
    /moderation|mod_queue/.test(code)
  ) {
    return { attemptStatus: "permanent-failure", providerStateStatus: "needs-review" };
  }
  if (input.status === 429 || /rate limit|too many requests|slow down/.test(message)) {
    return { attemptStatus: "retryable-failure", providerStateStatus: "failed" };
  }

  return {
    attemptStatus: classifyProviderError(input),
    providerStateStatus: "failed",
  };
}

function unavailable(providerId: ProviderId, reason: string): ProviderResult {
  return {
    ok: false,
    status: "unavailable",
    providerStateStatus: "unavailable",
    sanitizedResponse: { providerId, reason },
    reason,
  };
}

function needsApproval(providerId: ProviderId): ProviderResult {
  return unavailable(
    providerId,
    "Live provider calls require explicit approval; Mock Provider remains active."
  );
}

function credential(context: ProviderAdapterContext, envVar: string | null) {
  if (!envVar) return undefined;
  return context.env[envVar]?.trim();
}

function validateCredential(
  providerId: ProviderId,
  envVar: string | null,
  context: ProviderAdapterContext
): ProviderValidationResult | null {
  if (!envVar) return null;
  if (credential(context, envVar)) return null;
  return {
    ok: false,
    providerId,
    reason: `${envVar} is not configured in server secret scope.`,
    sanitizedResponse: { providerId, configured: false },
  };
}

function validateLiveApproval(
  providerId: ProviderId,
  context: ProviderAdapterContext
): ProviderValidationResult | null {
  if (context.liveProviderValidationApproved) return null;
  return {
    ok: false,
    providerId,
    reason: "Live provider validation requires explicit approval.",
    sanitizedResponse: { providerId, liveProviderValidationApproved: false },
  };
}

function fetchForContext(context: ProviderAdapterContext): typeof fetch {
  return context.fetchImpl ?? fetch;
}

function redactProviderId(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length <= 8) return `${value.slice(0, 2)}...`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function sanitizeBufferChannel(channel: Record<string, unknown>) {
  return {
    id: redactProviderId(channel.id),
    name: channel.name,
    displayName: channel.displayName,
    service: channel.service,
    isQueuePaused: channel.isQueuePaused,
  };
}

export { brandHasBufferLinkedInMapping };


function isBufferLiveSubmissionApproved(context: ProviderAdapterContext): boolean {
  return context.env.BUFFER_LIVE_SUBMISSION === "approved";
}

function needsLiveSubmissionApproval(providerId: ProviderId): ProviderResult {
  return unavailable(
    providerId,
    "Buffer live submission requires BUFFER_LIVE_SUBMISSION=approved."
  );
}

export function createBufferGraphqlClient(context: ProviderAdapterContext) {
  const fetchImpl = fetchForContext(context);
  const apiKey = credential(context, "BUFFER_API_KEY");
  return {
    apiKey,
    async graphql(query: string, variables?: Record<string, unknown>) {
      const budget=context.requestBudget;
      if(budget && (budget.remaining<=0 || (budget.backoffUntil??0)>Date.now()))throw new BufferRequestBudgetError(budget.backoffUntil);
      if(budget)budget.remaining-=1;
      const response = await fetchImpl("https://api.buffer.com", {
        method: "POST",
        signal:AbortSignal.timeout(15000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
      });
      if(budget)observeBufferRateLimit(response,budget);
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return { response, data };
    },
  };
}

function bufferGraphqlErrors(data: Record<string, unknown>) {
  return Array.isArray(data.errors) ? (data.errors as Array<Record<string, unknown>>) : [];
}

function bufferMutationPayload(
  data: Record<string, unknown>,
  mutationName: string
): Record<string, unknown> | null {
  const payload =
    data.data &&
    typeof data.data === "object" &&
    !Array.isArray(data.data) &&
    (data.data as Record<string, unknown>)[mutationName] &&
    typeof (data.data as Record<string, unknown>)[mutationName] === "object"
      ? ((data.data as Record<string, unknown>)[mutationName] as Record<string, unknown>)
      : null;
  return payload;
}

export function mapBufferPostStatus(status: unknown): ProviderStateStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "sent") return "published";
  if (normalized === "error") return "failed";
  if (normalized === "needs_approval") return "needs-review";
  if (normalized === "scheduled") return "queued";
  if (normalized === "sending") return "publishing";
  if (normalized === "draft") return "provider-draft";
  return "needs-review";
}

export async function listBufferLinkedInChannels(context: ProviderAdapterContext) {
  const client = createBufferGraphqlClient(context);
  const accountResult = await client.graphql(`query BufferAccount {
    account {
      organizations { id name }
    }
  }`);
  const accountErrors = bufferGraphqlErrors(accountResult.data);
  if (!accountResult.response.ok || accountErrors.length) {
    return {
      ok: false as const,
      reason: "Buffer account lookup failed.",
      sanitizedResponse: sanitizeProviderPayload({
        status: accountResult.response.status,
        errors: accountErrors,
      }),
    };
  }

  const account =
    accountResult.data.data &&
    typeof accountResult.data.data === "object" &&
    !Array.isArray(accountResult.data.data) &&
    (accountResult.data.data as Record<string, unknown>).account &&
    typeof (accountResult.data.data as Record<string, unknown>).account === "object"
      ? ((accountResult.data.data as Record<string, unknown>).account as Record<string, unknown>)
      : {};
  const organizations = Array.isArray(account.organizations)
    ? (account.organizations as Array<Record<string, unknown>>)
    : [];

  if(organizations.length>20)return {ok:false as const,reason:"Too many organizations for bounded discovery.",sanitizedResponse:{complete:false}};
  const channelResults = [];
  for(const organization of organizations){
    channelResults.push(await (async () => {
      const channelsResult = await client.graphql(
        `query BufferChannels($organizationId: OrganizationId!) {
          channels(input: { organizationId: $organizationId }) {
            id
            name
            displayName
            organizationId
            type
            externalLink
            isDisconnected
            isLocked
            service
            isQueuePaused
          }
        }`,
        { organizationId: organization.id }
      );
      const channelErrors = bufferGraphqlErrors(channelsResult.data);
      return {
        ok: channelsResult.response.ok && !channelErrors.length,
        status: channelsResult.response.status,
        errors: channelErrors,
        channels:
          channelsResult.data.data &&
          typeof channelsResult.data.data === "object" &&
          !Array.isArray(channelsResult.data.data) &&
          Array.isArray((channelsResult.data.data as Record<string, unknown>).channels)
            ? ((channelsResult.data.data as Record<string, unknown>).channels as Array<
                Record<string, unknown>
              >)
            : [],
      };
    })());
  }

  const failedChannelQuery = channelResults.find((result) => !result.ok);
  if (failedChannelQuery) {
    return {
      ok: false as const,
      reason: "Buffer channel lookup failed.",
      sanitizedResponse: sanitizeProviderPayload({
        status: failedChannelQuery.status,
        errors: failedChannelQuery.errors,
      }),
    };
  }

  const channels = channelResults.flatMap((result) => result.channels);
  const linkedinChannels = channels.filter((channel) =>
    String(channel.service ?? "").toLowerCase().includes("linkedin")
  );
  return { ok: true as const, linkedinChannels };
}

export async function resolveBufferLinkedInChannelId(
  brandId: BrandId,
  context: ProviderAdapterContext
): Promise<
  | { ok: true; channelId: string; channelName: string; destination: BufferDestination }
  | { ok: false; reason: string; sanitizedResponse: Record<string, unknown> }
> {
  if (!brandHasBufferLinkedInMapping(brandId)) {
    return {
      ok: false,
      reason: `No Buffer LinkedIn channel mapping exists for brand ${brandId}.`,
      sanitizedResponse: { brandId, mapped: false },
    };
  }
  const expectedName = bufferLinkedInChannelForBrand(brandId);
  if (!expectedName) {
    return {
      ok: false,
      reason: `No Buffer LinkedIn channel mapping exists for brand ${brandId}.`,
      sanitizedResponse: { brandId, mapped: false },
    };
  }

  const channelsResult = await listBufferLinkedInChannels(context);
  if (!channelsResult.ok) {
    return {
      ok: false,
      reason: channelsResult.reason,
      sanitizedResponse: channelsResult.sanitizedResponse,
    };
  }

  const matches = channelsResult.linkedinChannels.filter(item => String(item.name ?? "") === expectedName);
  const channel = matches.length === 1 ? matches[0] : undefined;
  if (!channel?.id) {
    return {
      ok: false,
      reason: `Buffer LinkedIn channel ${expectedName} was not found.`,
      sanitizedResponse: {
        brandId,
        expectedChannelName: expectedName,
        linkedinChannels: channelsResult.linkedinChannels.map(sanitizeBufferChannel),
      },
    };
  }

  return {
    ok: true,
    channelId: String(channel.id),
    channelName: expectedName,
    destination:{channelId:String(channel.id),organizationId:String(channel.organizationId??""),displayName:String(channel.displayName??expectedName),handle:expectedName,accountType:String(channel.type??"unknown"),profileUrl:safeLinkedInUrl(channel.externalLink),disconnected:channel.isDisconnected===true,locked:channel.isLocked===true,queuePaused:channel.isQueuePaused===true,flagsVerified:typeof channel.isDisconnected==="boolean"&&typeof channel.isLocked==="boolean"&&typeof channel.isQueuePaused==="boolean"&&typeof channel.organizationId==="string",checkedAt:Date.now(),firstComment:{value:"unknown",source:"unknown",checkedAt:Date.now(),evidence:"Provider does not expose verified first-comment plan entitlement in Channel."}},
  };
}

function sanitizeZernioAccount(account: Record<string, unknown>) {
  const profileId = account.profileId;
  const profile =
    profileId && typeof profileId === "object" && !Array.isArray(profileId)
      ? {
          id: redactProviderId((profileId as Record<string, unknown>)._id),
          name: (profileId as Record<string, unknown>).name,
          slug: (profileId as Record<string, unknown>).slug,
        }
      : redactProviderId(profileId);
  return {
    id: redactProviderId(account._id ?? account.id),
    platform: account.platform,
    username: account.username,
    displayName: account.displayName,
    profileUrl: account.profileUrl,
    isActive: account.isActive,
    profile,
  };
}

function sanitizeZernioHealth(item: Record<string, unknown>) {
  const permissions =
    item.permissions && typeof item.permissions === "object" && !Array.isArray(item.permissions)
      ? (item.permissions as Record<string, unknown>)
      : {};
  const tokenStatus =
    item.tokenStatus && typeof item.tokenStatus === "object" && !Array.isArray(item.tokenStatus)
      ? (item.tokenStatus as Record<string, unknown>)
      : {};
  return {
    accountId: redactProviderId(item.accountId ?? item._id ?? item.id),
    platform: item.platform,
    username: item.username,
    displayName: item.displayName,
    status: item.status,
    tokenValid: tokenStatus.valid,
    canPost: permissions.canPost,
    missingRequired: permissions.missingRequired,
    issues: item.issues,
  };
}

async function validateBufferConnection(
  context: ProviderAdapterContext
): Promise<ProviderValidationResult> {
  const providerId = "buffer" as const;
  const missingCredential = validateCredential(providerId, "BUFFER_API_KEY", context);
  if (missingCredential) return missingCredential;
  const approvalBlock = validateLiveApproval(providerId, context);
  if (approvalBlock) return approvalBlock;

  const fetchImpl = fetchForContext(context);
  const apiKey = credential(context, "BUFFER_API_KEY");
  async function graphql(query: string, variables?: Record<string, unknown>) {
    const response = await fetchImpl("https://api.buffer.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { response, data };
  }

  const accountResult = await graphql(`query BufferAccount {
    account {
      id
      name
      organizations {
        id
        name
      }
    }
  }`);
  const errors = Array.isArray(accountResult.data.errors)
    ? accountResult.data.errors
    : undefined;
  if (!accountResult.response.ok || errors?.length) {
    return {
      ok: false,
      providerId,
      reason: "Buffer API validation failed.",
      sanitizedResponse: sanitizeProviderPayload({
        status: accountResult.response.status,
        errors,
      }),
    };
  }

  const account =
    accountResult.data.data &&
    typeof accountResult.data.data === "object" &&
    !Array.isArray(accountResult.data.data) &&
    (accountResult.data.data as Record<string, unknown>).account &&
    typeof (accountResult.data.data as Record<string, unknown>).account === "object"
      ? ((accountResult.data.data as Record<string, unknown>).account as Record<
          string,
          unknown
        >)
      : {};
  const organizations = Array.isArray(account.organizations)
    ? (account.organizations as Array<Record<string, unknown>>)
    : [];
  const channelResults = await Promise.all(
    organizations.map(async (organization) => {
      const channelsResult = await graphql(
        `query BufferChannels($organizationId: OrganizationId!) {
          channels(input: { organizationId: $organizationId }) {
            id
            name
            displayName
            service
            isQueuePaused
          }
        }`,
        { organizationId: organization.id }
      );
      const channelErrors = Array.isArray(channelsResult.data.errors)
        ? channelsResult.data.errors
        : undefined;
      return {
        organization,
        ok: channelsResult.response.ok && !channelErrors?.length,
        status: channelsResult.response.status,
        errors: channelErrors,
        channels:
          channelsResult.data.data &&
          typeof channelsResult.data.data === "object" &&
          !Array.isArray(channelsResult.data.data) &&
          Array.isArray((channelsResult.data.data as Record<string, unknown>).channels)
            ? ((channelsResult.data.data as Record<string, unknown>).channels as Array<
                Record<string, unknown>
              >)
            : [],
      };
    })
  );
  const failedChannelQuery = channelResults.find((result) => !result.ok);
  if (failedChannelQuery) {
    return {
      ok: false,
      providerId,
      reason: "Buffer channel validation failed.",
      sanitizedResponse: sanitizeProviderPayload({
        status: failedChannelQuery.status,
        errors: failedChannelQuery.errors,
      }),
    };
  }
  const channels = channelResults.flatMap((result) => result.channels);
  const linkedinChannels = channels.filter((channel) =>
    String(channel.service ?? "").toLowerCase().includes("linkedin")
  );

  return {
    ok: linkedinChannels.length > 0,
    providerId,
    accountLabel:
      linkedinChannels.length > 0
        ? `${linkedinChannels.length} Buffer LinkedIn channel(s)`
        : "No Buffer LinkedIn channels",
    reason:
      linkedinChannels.length > 0
        ? undefined
        : "Buffer authenticated, but no LinkedIn channels were returned.",
    sanitizedResponse: {
      providerId,
      credential: "[server-secret-present]",
      account: {
        id: redactProviderId(account.id),
        name: account.name,
      },
      organizationCount: organizations.length,
      channelCount: channels.length,
      services: [...new Set(channels.map((channel) => channel.service))],
      linkedinChannels: linkedinChannels.map(sanitizeBufferChannel),
    },
  };
}

async function validateZernioConnection(
  context: ProviderAdapterContext
): Promise<ProviderValidationResult> {
  const providerId = "zernio" as const;
  const missingCredential = validateCredential(providerId, "ZERNIO_API_KEY", context);
  if (missingCredential) return missingCredential;
  const approvalBlock = validateLiveApproval(providerId, context);
  if (approvalBlock) return approvalBlock;

  const fetchImpl = fetchForContext(context);
  const apiKey = credential(context, "ZERNIO_API_KEY");
  const headers = { Authorization: `Bearer ${apiKey}` };
  const accountsResponse = await fetchImpl(
    "https://zernio.com/api/v1/accounts?platform=reddit",
    { headers }
  );
  const accountsData = (await accountsResponse.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!accountsResponse.ok) {
    return {
      ok: false,
      providerId,
      reason: "Zernio account validation failed.",
      sanitizedResponse: sanitizeProviderPayload({
        status: accountsResponse.status,
        error: accountsData.error,
      }),
    };
  }

  const healthResponse = await fetchImpl(
    "https://zernio.com/api/v1/accounts/health?platform=reddit",
    { headers }
  );
  const healthData = (await healthResponse.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const accounts = Array.isArray(accountsData.accounts)
    ? (accountsData.accounts as Array<Record<string, unknown>>)
    : [];
  const healthItems = Array.isArray(healthData.accounts)
    ? (healthData.accounts as Array<Record<string, unknown>>)
    : Array.isArray(healthData.health)
      ? (healthData.health as Array<Record<string, unknown>>)
      : [];
  const healthyAccounts = healthItems.filter((item) => item.status === "healthy");

  return {
    ok: accounts.length > 0 && healthResponse.ok && healthyAccounts.length > 0,
    providerId,
    accountLabel:
      accounts.length > 0
        ? `${accounts.length} Zernio Reddit account(s)`
        : "No Zernio Reddit accounts",
    reason:
      accounts.length > 0 && healthResponse.ok && healthyAccounts.length > 0
        ? undefined
        : "Zernio authenticated, but no healthy Reddit account was returned.",
    sanitizedResponse: {
      providerId,
      credential: "[server-secret-present]",
      accountCount: accounts.length,
      redditAccounts: accounts.map(sanitizeZernioAccount),
      healthStatus: healthResponse.status,
      redditHealth: healthItems.map(sanitizeZernioHealth),
    },
  };
}

const ZERNIO_REDDIT_USERNAME_BY_BRAND: Partial<Record<BrandId, string>> = {
  "lower-db": "the_lower_db",
};

export const ZERNIO_VALIDATION_SUBREDDIT = "testingground4bots";

function isZernioLiveSubmissionApproved(context: ProviderAdapterContext): boolean {
  return context.env.ZERNIO_LIVE_SUBMISSION === "approved";
}

function needsZernioLiveSubmissionApproval(providerId: ProviderId): ProviderResult {
  return unavailable(
    providerId,
    "Zernio live submission requires ZERNIO_LIVE_SUBMISSION=approved."
  );
}

function normalizeSubreddit(value: string): string {
  return value.trim().replace(/^r\//i, "");
}

function resolveSubmissionSubreddit(
  submission: ProviderSubmission,
  context: ProviderAdapterContext
): string {
  const fromSubmission = submission.subreddit?.trim();
  if (fromSubmission) return normalizeSubreddit(fromSubmission);
  const fromEnv = context.env.ZERNIO_VALIDATION_SUBREDDIT?.trim();
  if (fromEnv) return normalizeSubreddit(fromEnv);
  return ZERNIO_VALIDATION_SUBREDDIT;
}

function createZernioClient(context: ProviderAdapterContext) {
  const fetchImpl = fetchForContext(context);
  const apiKey = credential(context, "ZERNIO_API_KEY");
  return {
    apiKey,
    async request(path: string, init?: RequestInit) {
      const response = await fetchImpl(`https://zernio.com/api/v1${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return { response, data };
    },
  };
}

function zernioErrorMessage(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object" && !Array.isArray(data.error)) {
    const nested = data.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  if (typeof data.message === "string") return data.message;
  return fallback;
}

function mapZernioPostStatus(status: unknown): ProviderStateStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "published" || normalized === "posted" || normalized === "live") {
    return "published";
  }
  if (normalized === "failed" || normalized === "error") return "failed";
  if (
    normalized === "needs_moderation" ||
    normalized === "pending_moderation" ||
    normalized === "mod_queue" ||
    normalized === "needs_approval"
  ) {
    return "needs-review";
  }
  if (normalized === "removed") return "needs-review";
  if (normalized === "cancelled" || normalized === "canceled") return "cancel-intent-recorded";
  if (
    normalized === "scheduled" ||
    normalized === "pending" ||
    normalized === "queued" ||
    normalized === "draft"
  ) {
    return "submitted";
  }
  return "needs-review";
}

function sanitizeZernioPost(post: Record<string, unknown>) {
  return {
    id: redactProviderId(post._id ?? post.id),
    status: post.status,
    scheduledFor: post.scheduledFor,
    publishedAt: post.publishedAt,
    platforms: Array.isArray(post.platforms)
      ? post.platforms.map((platform) =>
          platform && typeof platform === "object" && !Array.isArray(platform)
            ? {
                platform: (platform as Record<string, unknown>).platform,
                status: (platform as Record<string, unknown>).status,
                accountId: redactProviderId((platform as Record<string, unknown>).accountId),
              }
            : platform
        )
      : post.platforms,
  };
}

async function listZernioRedditAccounts(context: ProviderAdapterContext) {
  const client = createZernioClient(context);
  const accountsResult = await client.request("/accounts?platform=reddit");
  if (!accountsResult.response.ok) {
    return {
      ok: false as const,
      reason: "Zernio account lookup failed.",
      sanitizedResponse: sanitizeProviderPayload({
        status: accountsResult.response.status,
        error: accountsResult.data.error,
      }),
    };
  }

  const accounts = Array.isArray(accountsResult.data.accounts)
    ? (accountsResult.data.accounts as Array<Record<string, unknown>>)
    : [];
  return { ok: true as const, accounts };
}

async function resolveZernioRedditAccountId(
  brandId: BrandId,
  context: ProviderAdapterContext
): Promise<
  | { ok: true; accountId: string; username: string }
  | { ok: false; reason: string; sanitizedResponse: Record<string, unknown> }
> {
  const expectedUsername = ZERNIO_REDDIT_USERNAME_BY_BRAND[brandId];
  if (!expectedUsername) {
    return {
      ok: false,
      reason: `No Zernio Reddit account mapping exists for brand ${brandId}.`,
      sanitizedResponse: { brandId, mapped: false },
    };
  }

  const accountsResult = await listZernioRedditAccounts(context);
  if (!accountsResult.ok) {
    return {
      ok: false,
      reason: accountsResult.reason,
      sanitizedResponse: accountsResult.sanitizedResponse,
    };
  }

  const account = accountsResult.accounts.find(
    (item) => String(item.username ?? "").toLowerCase() === expectedUsername.toLowerCase()
  );
  const accountId = account?._id ?? account?.id;
  if (!account || !accountId) {
    return {
      ok: false,
      reason: `Zernio Reddit account ${expectedUsername} was not found.`,
      sanitizedResponse: {
        brandId,
        expectedUsername,
        redditAccounts: accountsResult.accounts.map(sanitizeZernioAccount),
      },
    };
  }

  return {
    ok: true,
    accountId: String(accountId),
    username: expectedUsername,
  };
}

function baseSocialAdapter(input: {
  providerId: "buffer" | "zernio";
  requiredEnvVar: "BUFFER_API_KEY" | "ZERNIO_API_KEY";
  accountLabel: string;
  validateLiveConnection?: (
    context: ProviderAdapterContext
  ) => Promise<ProviderValidationResult>;
}): ProviderAdapter {
  return {
    providerId: input.providerId,
    requiredEnvVar: input.requiredEnvVar,
    async validateConnection(context) {
      if (input.validateLiveConnection) {
        return input.validateLiveConnection(context);
      }
      const missingCredential = validateCredential(
        input.providerId,
        input.requiredEnvVar,
        context
      );
      if (missingCredential) return missingCredential;
      const approvalBlock = validateLiveApproval(input.providerId, context);
      if (approvalBlock) return approvalBlock;

      return {
        ok: true,
        providerId: input.providerId,
        accountLabel: input.accountLabel,
        sanitizedResponse: {
          providerId: input.providerId,
          accountLabel: input.accountLabel,
          credential: "[server-secret-present]",
        },
      };
    },
    async submit(submission, context) {
      const missingCredential = validateCredential(
        input.providerId,
        input.requiredEnvVar,
        context
      );
      if (missingCredential) {
        return unavailable(input.providerId, missingCredential.reason ?? "Missing credential.");
      }
      if (!context.liveProviderValidationApproved) return needsApproval(input.providerId);

      return {
        ok: false,
        status: "unavailable",
        providerStateStatus: "unavailable",
        reason: "Live provider HTTP submission is intentionally not wired until validation approval.",
        sanitizedResponse: {
          providerId: input.providerId,
          idempotencyKey: submission.idempotencyKey,
          channelId: submission.channelId,
          credential: "[server-secret-present]",
        },
      };
    },
    async recordCancelOrUnpublishIntent(submission, intentType, context) {
      if (!context.liveProviderValidationApproved) return needsApproval(input.providerId);
      return {
        ok: false,
        status: "unavailable",
        providerStateStatus: "cancel-intent-recorded",
        reason: `${intentType} intent recorded locally; external mutation requires separate approval.`,
        sanitizedResponse: {
          providerId: input.providerId,
          intentType,
          idempotencyKey: submission.idempotencyKey,
        },
      };
    },
    async refreshStatus(providerPostId, context) {
      const missingCredential = validateCredential(
        input.providerId,
        input.requiredEnvVar,
        context
      );
      if (missingCredential) {
        return unavailable(input.providerId, missingCredential.reason ?? "Missing credential.");
      }
      if (!context.liveProviderValidationApproved) return needsApproval(input.providerId);
      return {
        ok: false,
        status: "unavailable",
        providerStateStatus: "unavailable",
        reason: "Live status refresh is intentionally gated until validation approval.",
        sanitizedResponse: {
          providerId: input.providerId,
          providerPostId,
          credential: "[server-secret-present]",
        },
      };
    },
  };
}

export const mockProviderAdapter: ProviderAdapter = {
  providerId: "mock",
  requiredEnvVar: null,
  async validateConnection() {
    return {
      ok: true,
      providerId: "mock",
      accountLabel: "Mock Provider",
      sanitizedResponse: { providerId: "mock", noExternalCall: true },
    };
  },
  async submit(submission) {
    return {
      ok: true,
      status: "success",
      providerStateStatus: "submitted",
      providerPostId: `mock-${submission.postId}`,
      sanitizedResponse: {
        providerId: "mock",
        providerPostId: `mock-${submission.postId}`,
        idempotencyKey: submission.idempotencyKey,
      },
    };
  },
  async recordCancelOrUnpublishIntent(submission, intentType) {
    return {
      ok: true,
      status: "success",
      providerStateStatus: "cancel-intent-recorded",
      sanitizedResponse: {
        providerId: "mock",
        intentType,
        idempotencyKey: submission.idempotencyKey,
      },
    };
  },
  async refreshStatus(providerPostId) {
    return {
      ok: true,
      status: "success",
      providerStateStatus: "submitted",
      providerPostId,
      sanitizedResponse: { providerId: "mock", providerPostId },
    };
  },
};

export const bufferProviderAdapter: ProviderAdapter = {
  providerId: "buffer",
  requiredEnvVar: "BUFFER_API_KEY",
  validateConnection: validateBufferConnection,
  async submit(submission, context) {
    const providerId = "buffer" as const;
    const missingCredential = validateCredential(providerId, "BUFFER_API_KEY", context);
    if (missingCredential) {
      return unavailable(providerId, missingCredential.reason ?? "Missing credential.");
    }
    if (!context.liveProviderValidationApproved) return needsApproval(providerId);
    if (!isBufferLiveSubmissionApproved(context)) return needsLiveSubmissionApproval(providerId);
    if (submission.channelId !== "linkedin") {
      return unavailable(providerId, "Buffer adapter only supports LinkedIn submissions.");
    }
    if (!submission.scheduledDate?.trim()) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "failed",
        reason: "Scheduled date is required for Buffer submission.",
        sanitizedResponse: { providerId, idempotencyKey: submission.idempotencyKey },
      };
    }
    if (!submission.content.trim()) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "failed",
        reason: "Post content is required for Buffer submission.",
        sanitizedResponse: { providerId, idempotencyKey: submission.idempotencyKey },
      };
    }

    const channel = await resolveBufferLinkedInChannelId(submission.brandId, context);
    if (!channel.ok) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "failed",
        reason: channel.reason,
        sanitizedResponse: {
          providerId,
          idempotencyKey: submission.idempotencyKey,
          ...channel.sanitizedResponse,
        },
      };
    }

    if(submission.expectedDestination) {
      const expected=submission.expectedDestination;
      const hold=destinationHold({...channel.destination,firstComment:expected.firstComment},Boolean(submission.firstComment?.trim()));
      if(destinationIdentity(channel.destination)!==destinationIdentity(expected)||hold)return {ok:false,status:"permanent-failure",providerStateStatus:"needs-review",reason:hold??"Reviewed destination changed; review again.",sanitizedResponse:{providerId,phase:"preflight",destinationChanged:destinationIdentity(channel.destination)!==destinationIdentity(expected)}};
    }

    const dueAt = scheduleToUtcIso({
      scheduledDate: submission.scheduledDate,
      scheduledTime: submission.scheduledTime,
      timezone: submission.timezone,
    });
    if (context.requestBudget && (context.requestBudget.remaining <= 0 || (context.requestBudget.backoffUntil ?? 0) > Date.now())) throw new BufferRequestBudgetError(context.requestBudget.backoffUntil);
    const preflight = await context.beforeCreate?.();
    if(preflight)return {ok:false,status:"permanent-failure",providerStateStatus:"needs-review",reason:preflight,sanitizedResponse:{providerId,phase:"preflight"}};
    if(submission.expectedDestination && Date.parse(dueAt)<=Date.now())return {ok:false,status:"permanent-failure",providerStateStatus:"needs-review",reason:"Exact scheduled time has passed.",sanitizedResponse:{providerId,phase:"preflight"}};
    const client = createBufferGraphqlClient(context);
    const createResult = await client.graphql(
      `mutation BufferCreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post { id status dueAt shareMode }
          }
          ... on MutationError {
            message
          }
        }
      }`,
      {
        input: {
          channelId: channel.channelId,
          text: submission.content.trim(),
          ...(submission.firstComment?.trim()
            ? { metadata: { linkedin: { firstComment: submission.firstComment.trim() } } }
            : {}),
          schedulingType: "automatic",
          mode: "customScheduled",
          dueAt,
          source: "resonate-v2",
        },
      }
    );
    const errors = bufferGraphqlErrors(createResult.data);
    const payload = bufferMutationPayload(createResult.data, "createPost");
    const mutationError =
      payload && typeof payload.message === "string" ? payload.message : undefined;
    const post =
      payload?.post && typeof payload.post === "object" && !Array.isArray(payload.post)
        ? (payload.post as Record<string, unknown>)
        : null;
    const providerPostId = post?.id ? String(post.id) : undefined;

    if (!createResult.response.ok || errors.length || mutationError || !providerPostId || !post) {
      const reason = mutationError ?? errors[0]?.message ?? "Buffer createPost failed.";
      const capacityHold = !providerPostId && createResult.response.status < 500 && Boolean(mutationError) && /queue|scheduled.{0,20}posts|post.{0,20}limit/i.test(String(reason)) && /full|capacity|limit|maximum|exceed/i.test(String(reason));
      return {
        ok: false,
        status: createResult.response.status>=500 || (!mutationError && !errors.length && !providerPostId) || Boolean(providerPostId) ? "ambiguous" : capacityHold ? "retryable-failure" : classifyProviderError({status:createResult.response.status,message:String(reason)}),
        providerPostId,
        providerStateStatus: "failed",
        reason: String(reason),
        sanitizedResponse: sanitizeProviderPayload({
          providerId,
          idempotencyKey: submission.idempotencyKey,
          channelName: channel.channelName,
          dueAt,
          status: createResult.response.status,
          errors,
          mutationError,
          capacityHold,
          firstCommentUnsupported:Boolean(submission.firstComment&&/first.?comment/i.test(String(reason))&&/plan|paid|upgrade|not supported|not available/i.test(String(reason))),
        }),
      };
    }

    const createdPost = post;
    return {
      ok: true,
      status: "success",
      providerStateStatus: mapBufferPostStatus(createdPost.status),
      providerPostId,
      sanitizedResponse: sanitizeProviderPayload({
        providerId,
        idempotencyKey: submission.idempotencyKey,
        channelName: channel.channelName,
        destination:channel.destination,
        dueAt,
        providerPostId: redactProviderId(providerPostId),
        status: createdPost.status,
        shareMode: createdPost.shareMode,
        credential: "[server-secret-present]",
      }),
    };
  },
  async recordCancelOrUnpublishIntent(submission, intentType, context) {
    const providerId = "buffer" as const;
    const missingCredential = validateCredential(providerId, "BUFFER_API_KEY", context);
    if (missingCredential) {
      return unavailable(providerId, missingCredential.reason ?? "Missing credential.");
    }
    if (!context.liveProviderValidationApproved) return needsApproval(providerId);
    if (!isBufferLiveSubmissionApproved(context)) return needsLiveSubmissionApproval(providerId);
    if (!submission.providerPostId?.trim()) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "failed",
        reason: "Buffer cancel requires providerPostId from a prior submission.",
        sanitizedResponse: {
          providerId,
          intentType,
          idempotencyKey: submission.idempotencyKey,
        },
      };
    }

    const client = createBufferGraphqlClient(context);
    const deleteResult = await client.graphql(
      `mutation BufferDeletePost($id: PostId!) {
        deletePost(input: { id: $id }) {
          ... on DeletePostSuccess { id }
          ... on MutationError { message }
        }
      }`,
      { id: submission.providerPostId }
    );
    const errors = bufferGraphqlErrors(deleteResult.data);
    const payload = bufferMutationPayload(deleteResult.data, "deletePost");
    const mutationError =
      payload && typeof payload.message === "string" ? payload.message : undefined;
    const deletedId = payload?.id ? String(payload.id) : undefined;

    if (!deleteResult.response.ok || errors.length || mutationError || !deletedId || deletedId!==submission.providerPostId) {
      const reason = mutationError ?? errors[0]?.message ?? "Buffer deletePost failed.";
      return {
        ok: false,
        status: classifyProviderError({
          status: deleteResult.response.status,
          message: String(reason),
        }),
        // Keep cancel retryable: do not latch cancel-intent-recorded on failure.
        providerStateStatus: "failed",
        reason: String(reason),
        sanitizedResponse: sanitizeProviderPayload({
          providerId,
          intentType,
          idempotencyKey: submission.idempotencyKey,
          providerPostId: redactProviderId(submission.providerPostId),
          status: deleteResult.response.status,
          errors,
          mutationError,
        }),
      };
    }

    return {
      ok: true,
      status: "success",
      providerStateStatus: intentType === "unpublish" ? "removed" : "cancelled",
      providerPostId: deletedId,
      sanitizedResponse: sanitizeProviderPayload({
        providerId,
        intentType,
        idempotencyKey: submission.idempotencyKey,
        providerPostId: redactProviderId(deletedId),
        deletionConfirmed:deletedId===submission.providerPostId,
        credential: "[server-secret-present]",
      }),
    };
  },
  async refreshStatus(providerPostId, context) {
    const providerId = "buffer" as const;
    const missingCredential = validateCredential(providerId, "BUFFER_API_KEY", context);
    if (missingCredential) {
      return unavailable(providerId, missingCredential.reason ?? "Missing credential.");
    }
    if (!context.liveProviderValidationApproved) return needsApproval(providerId);
    if (!isBufferLiveSubmissionApproved(context)) return needsLiveSubmissionApproval(providerId);
    if (!providerPostId.trim()) {
      return unavailable(providerId, "providerPostId is required for Buffer status refresh.");
    }

    const client = createBufferGraphqlClient(context);
    const postResult = await client.graphql(
      `query BufferPost($id: PostId!) {
        post(input: { id: $id }) {
          id
          status
          dueAt
          shareMode
          updatedAt
          sentAt
          externalLink
          channelId
        }
      }`,
      { id: providerPostId }
    );
    const errors = bufferGraphqlErrors(postResult.data);
    const post =
      postResult.data.data &&
      typeof postResult.data.data === "object" &&
      !Array.isArray(postResult.data.data) &&
      (postResult.data.data as Record<string, unknown>).post &&
      typeof (postResult.data.data as Record<string, unknown>).post === "object"
        ? ((postResult.data.data as Record<string, unknown>).post as Record<string, unknown>)
        : null;

    if (!postResult.response.ok || errors.length || !post?.id) {
      const reason = errors[0]?.message ?? "Buffer post lookup failed.";
      return {
        ok: false,
        status: classifyProviderError({
          status: postResult.response.status,
          message: String(reason),
        }),
        providerStateStatus: "unavailable",
        reason: String(reason),
        sanitizedResponse: sanitizeProviderPayload({
          providerId,
          providerPostId: redactProviderId(providerPostId),
          status: postResult.response.status,
          errors,
        }),
      };
    }

    return {
      ok: true,
      status: "success",
      providerStateStatus: mapBufferPostStatus(post.status),
      providerPostId: String(post.id),
      sanitizedResponse: sanitizeProviderPayload({
        providerId,
        providerPostId: redactProviderId(post.id),
        status: post.status,
        dueAt: post.dueAt,
        shareMode: post.shareMode,
        providerUpdatedAt:post.updatedAt, publishedAt:post.sentAt, publishedUrl:post.externalLink, channelId:post.channelId,
        credential: "[server-secret-present]",
      }),
    };
  },
};

export const zernioProviderAdapter: ProviderAdapter = {
  providerId: "zernio",
  requiredEnvVar: "ZERNIO_API_KEY",
  validateConnection: validateZernioConnection,
  async submit(submission, context) {
    const providerId = "zernio" as const;
    const missingCredential = validateCredential(providerId, "ZERNIO_API_KEY", context);
    if (missingCredential) {
      return unavailable(providerId, missingCredential.reason ?? "Missing credential.");
    }
    if (!context.liveProviderValidationApproved) return needsApproval(providerId);
    if (!isZernioLiveSubmissionApproved(context)) return needsZernioLiveSubmissionApproval(providerId);
    if (submission.channelId !== "reddit") {
      return unavailable(providerId, "Zernio adapter only supports Reddit submissions.");
    }
    if (!submission.scheduledDate?.trim()) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "failed",
        reason: "Scheduled date is required for Zernio submission.",
        sanitizedResponse: { providerId, idempotencyKey: submission.idempotencyKey },
      };
    }
    if (!submission.content.trim()) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "failed",
        reason: "Post content is required for Zernio submission.",
        sanitizedResponse: { providerId, idempotencyKey: submission.idempotencyKey },
      };
    }
    if (!submission.title.trim()) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "failed",
        reason: "Post title is required for Reddit submission.",
        sanitizedResponse: { providerId, idempotencyKey: submission.idempotencyKey },
      };
    }

    const account = await resolveZernioRedditAccountId(submission.brandId, context);
    if (!account.ok) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "failed",
        reason: account.reason,
        sanitizedResponse: {
          providerId,
          idempotencyKey: submission.idempotencyKey,
          ...account.sanitizedResponse,
        },
      };
    }

    const scheduledFor = scheduleToUtcIso({
      scheduledDate: submission.scheduledDate,
      scheduledTime: submission.scheduledTime,
      timezone: submission.timezone,
    });
    const subreddit = resolveSubmissionSubreddit(submission, context);
    const client = createZernioClient(context);
    const createResult = await client.request("/posts", {
      method: "POST",
      body: JSON.stringify({
        content: submission.content.trim(),
        title: submission.title.trim(),
        scheduledFor,
        timezone: submission.timezone,
        platforms: [
          {
            platform: "reddit",
            accountId: account.accountId,
            platformSpecificData: {
              subreddit,
              title: submission.title.trim(),
            },
          },
        ],
      }),
    });

    const post =
      createResult.data.post &&
      typeof createResult.data.post === "object" &&
      !Array.isArray(createResult.data.post)
        ? (createResult.data.post as Record<string, unknown>)
        : createResult.data;
    const providerPostId = post?._id ?? post?.id ? String(post._id ?? post.id) : undefined;

    if (!createResult.response.ok || !providerPostId) {
      const reason = zernioErrorMessage(createResult.data, "Zernio create post failed.");
      const classified = classifyRedditError({
        status: createResult.response.status,
        code: typeof createResult.data.code === "string" ? createResult.data.code : undefined,
        message: reason,
      });
      return {
        ok: false,
        status: classified.attemptStatus,
        providerStateStatus: classified.providerStateStatus,
        reason,
        sanitizedResponse: sanitizeProviderPayload({
          providerId,
          idempotencyKey: submission.idempotencyKey,
          username: account.username,
          subreddit,
          scheduledFor,
          status: createResult.response.status,
          error: createResult.data.error,
        }),
      };
    }

    return {
      ok: true,
      status: "success",
      providerStateStatus: mapZernioPostStatus(post.status),
      providerPostId,
      sanitizedResponse: sanitizeProviderPayload({
        providerId,
        idempotencyKey: submission.idempotencyKey,
        username: account.username,
        subreddit,
        scheduledFor,
        providerPostId: redactProviderId(providerPostId),
        status: post.status,
        credential: "[server-secret-present]",
      }),
    };
  },
  async recordCancelOrUnpublishIntent(submission, intentType, context) {
    const providerId = "zernio" as const;
    const missingCredential = validateCredential(providerId, "ZERNIO_API_KEY", context);
    if (missingCredential) {
      return unavailable(providerId, missingCredential.reason ?? "Missing credential.");
    }
    if (!context.liveProviderValidationApproved) return needsApproval(providerId);
    if (!isZernioLiveSubmissionApproved(context)) return needsZernioLiveSubmissionApproval(providerId);
    if (!submission.providerPostId?.trim()) {
      return {
        ok: false,
        status: "permanent-failure",
        providerStateStatus: "cancel-intent-recorded",
        reason: "Zernio cancel requires providerPostId from a prior submission.",
        sanitizedResponse: {
          providerId,
          intentType,
          idempotencyKey: submission.idempotencyKey,
        },
      };
    }

    const client = createZernioClient(context);
    const deleteResult = await client.request(`/posts/${submission.providerPostId}`, {
      method: "DELETE",
    });
    const deletedId =
      deleteResult.data.post &&
      typeof deleteResult.data.post === "object" &&
      !Array.isArray(deleteResult.data.post)
        ? String(
            (deleteResult.data.post as Record<string, unknown>)._id ??
              (deleteResult.data.post as Record<string, unknown>).id ??
              submission.providerPostId
          )
        : deleteResult.data.id
          ? String(deleteResult.data.id)
          : deleteResult.response.ok
            ? submission.providerPostId
            : undefined;

    if (!deleteResult.response.ok || !deletedId) {
      const reason = zernioErrorMessage(deleteResult.data, "Zernio delete post failed.");
      const classified = classifyRedditError({
        status: deleteResult.response.status,
        code: typeof deleteResult.data.code === "string" ? deleteResult.data.code : undefined,
        message: reason,
      });
      return {
        ok: false,
        status: classified.attemptStatus,
        providerStateStatus: "cancel-intent-recorded",
        reason,
        sanitizedResponse: sanitizeProviderPayload({
          providerId,
          intentType,
          idempotencyKey: submission.idempotencyKey,
          providerPostId: redactProviderId(submission.providerPostId),
          status: deleteResult.response.status,
          error: deleteResult.data.error,
        }),
      };
    }

    return {
      ok: true,
      status: "success",
      providerStateStatus: "cancel-intent-recorded",
      providerPostId: deletedId,
      sanitizedResponse: sanitizeProviderPayload({
        providerId,
        intentType,
        idempotencyKey: submission.idempotencyKey,
        providerPostId: redactProviderId(deletedId),
        credential: "[server-secret-present]",
      }),
    };
  },
  async refreshStatus(providerPostId, context) {
    const providerId = "zernio" as const;
    const missingCredential = validateCredential(providerId, "ZERNIO_API_KEY", context);
    if (missingCredential) {
      return unavailable(providerId, missingCredential.reason ?? "Missing credential.");
    }
    if (!context.liveProviderValidationApproved) return needsApproval(providerId);
    if (!isZernioLiveSubmissionApproved(context)) return needsZernioLiveSubmissionApproval(providerId);
    if (!providerPostId.trim()) {
      return unavailable(providerId, "providerPostId is required for Zernio status refresh.");
    }

    const client = createZernioClient(context);
    const postResult = await client.request(`/posts/${providerPostId}`);
    const post =
      postResult.data.post &&
      typeof postResult.data.post === "object" &&
      !Array.isArray(postResult.data.post)
        ? (postResult.data.post as Record<string, unknown>)
        : postResult.data._id || postResult.data.id
          ? (postResult.data as Record<string, unknown>)
          : null;

    if (!postResult.response.ok || !post) {
      const reason = zernioErrorMessage(postResult.data, "Zernio post lookup failed.");
      const classified = classifyRedditError({
        status: postResult.response.status,
        code: typeof postResult.data.code === "string" ? postResult.data.code : undefined,
        message: reason,
      });
      return {
        ok: false,
        status: classified.attemptStatus,
        providerStateStatus: classified.providerStateStatus,
        reason,
        sanitizedResponse: sanitizeProviderPayload({
          providerId,
          providerPostId: redactProviderId(providerPostId),
          status: postResult.response.status,
          error: postResult.data.error,
        }),
      };
    }

    const resolvedId = post._id ?? post.id ?? providerPostId;
    return {
      ok: true,
      status: "success",
      providerStateStatus: mapZernioPostStatus(post.status),
      providerPostId: String(resolvedId),
      sanitizedResponse: sanitizeProviderPayload({
        providerId,
        providerPostId: redactProviderId(resolvedId),
        post: sanitizeZernioPost(post),
        credential: "[server-secret-present]",
      }),
    };
  },
};

// ---- Firecrawl (AEO/SEO site-data vendor) ----
//
// Firecrawl is a read-only data vendor (site crawl + search) behind the same
// contract as the social providers: server-scope credential, explicit runtime
// live-validation approval, per-run cost ceilings, and sanitized results only.
// Nothing here dispatches at import time; every network call happens inside a
// gated function invoked with a ProviderAdapterContext.

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";
const FIRECRAWL_USER_AGENT_GROUP = "resonate-v2";
// Snapshot bound: crawl pages are stored truncated so one huge page cannot
// inflate a stored snapshot.
export const FIRECRAWL_SNAPSHOT_MAX_CHARS = 20_000;

const DEFAULT_FIRECRAWL_MAX_CRAWL_PAGES = 50;
const DEFAULT_FIRECRAWL_MAX_SEARCH_RESULTS = 10;

export type FirecrawlRunLimits = {
  maxCrawlPages: number;
  maxSearchResults: number;
};

function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function firecrawlRunLimits(context: Pick<ProviderAdapterContext, "env">): FirecrawlRunLimits {
  return {
    maxCrawlPages: positiveIntFromEnv(
      context.env.FIRECRAWL_MAX_CRAWL_PAGES,
      DEFAULT_FIRECRAWL_MAX_CRAWL_PAGES
    ),
    maxSearchResults: positiveIntFromEnv(
      context.env.FIRECRAWL_MAX_SEARCH_RESULTS,
      DEFAULT_FIRECRAWL_MAX_SEARCH_RESULTS
    ),
  };
}

export type SanitizedFirecrawlPage = {
  sourceUrl: string;
  title?: string;
  description?: string;
  markdown?: string;
  statusCode?: number;
};

export type SanitizedFirecrawlSearchResult = {
  url: string;
  title?: string;
  description?: string;
};

export type FirecrawlRunResult = {
  ok: boolean;
  reason?: string;
  sanitizedResponse: Record<string, unknown>;
  pages?: SanitizedFirecrawlPage[];
  results?: SanitizedFirecrawlSearchResult[];
};

export function isPrivateSiteHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((value) => value > 255)) return true;
    const [a, b] = octets;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

/**
 * Drops pages whose URL was already collected — Firecrawl's poll endpoint
 * re-serves every page seen so far on each status poll, so accumulating
 * without dedupe persists the same page once per poll.
 */
export function dedupePagesByUrl(
  pages: SanitizedFirecrawlPage[]
): SanitizedFirecrawlPage[] {
  const seen = new Set<string>();
  const unique: SanitizedFirecrawlPage[] = [];
  for (const page of pages) {
    if (seen.has(page.sourceUrl)) continue;
    seen.add(page.sourceUrl);
    unique.push(page);
  }
  return unique;
}

function truncateSnapshot(text: string | undefined): string | undefined {
  if (typeof text !== "string") return undefined;
  return text.length > FIRECRAWL_SNAPSHOT_MAX_CHARS
    ? `${text.slice(0, FIRECRAWL_SNAPSHOT_MAX_CHARS)}...`
    : text;
}

export function sanitizeFirecrawlPage(page: Record<string, unknown>): SanitizedFirecrawlPage {
  const metadata =
    page.metadata && typeof page.metadata === "object" && !Array.isArray(page.metadata)
      ? (page.metadata as Record<string, unknown>)
      : {};
  const sourceUrl = page.sourceUrl ?? page.url ?? metadata.sourceURL;
  const statusCode = metadata.statusCode;
  return {
    sourceUrl: typeof sourceUrl === "string" ? sourceUrl : "",
    title: typeof page.title === "string" ? page.title : undefined,
    description: typeof page.description === "string" ? page.description : undefined,
    // Only whitelisted fields survive into a stored snapshot; raw HTML and any
    // secret-bearing keys the provider echoes back are dropped entirely.
    markdown: truncateSnapshot(typeof page.markdown === "string" ? page.markdown : undefined),
    statusCode: typeof statusCode === "number" ? statusCode : undefined,
  };
}

export function sanitizeFirecrawlSearchResult(
  result: Record<string, unknown>
): SanitizedFirecrawlSearchResult {
  return {
    url: typeof result.url === "string" ? result.url : "",
    title: typeof result.title === "string" ? result.title : undefined,
    description: typeof result.description === "string" ? result.description : undefined,
  };
}

// Minimal RFC 9309-style robots check: use the group for our specific agent,
// falling back to the `*` group. Longest matching rule wins; ties allow.
export function robotsAllowsRequest(input: {
  robotsStatus: number;
  robotsBody: string;
  pathname: string;
  userAgent?: string;
}): { allowed: boolean; reason?: string } {
  if (input.robotsStatus === 404) return { allowed: true };
  if (input.robotsStatus !== 200) {
    return {
      allowed: false,
      reason: `robots.txt could not be fetched (HTTP ${input.robotsStatus}); refusing to crawl.`,
    };
  }

  type RobotRule = { type: "allow" | "disallow"; pattern: string };
  const groups = new Map<string, RobotRule[]>();
  let currentRules: RobotRule[] | null = null;
  for (const rawLine of input.robotsBody.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      currentRules = groups.get(value.toLowerCase()) ?? null;
      if (!currentRules) {
        currentRules = [];
        groups.set(value.toLowerCase(), currentRules);
      }
      continue;
    }
    if (!currentRules || (field !== "allow" && field !== "disallow")) continue;
    if (!value) continue;
    currentRules.push({ type: field, pattern: value });
  }

  const userAgent = (input.userAgent ?? FIRECRAWL_USER_AGENT_GROUP).toLowerCase();
  const specificGroup = groups.get(userAgent);
  const activeGroup =
    specificGroup && specificGroup.length ? specificGroup : (groups.get("*") ?? []);
  if (!activeGroup.length) return { allowed: true };

  function matchLength(pattern: string): number {
    const anchoredEnd = pattern.endsWith("$");
    const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
    const source = body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");

    const match = new RegExp(source).exec(input.pathname);
    if (!match) return -1;
    if (anchoredEnd && match.index + match[0].length !== input.pathname.length) return -1;
    return match[0].length;
  }

  let best: { type: "allow" | "disallow"; length: number } | null = null;
  for (const rule of activeGroup) {
    const length = matchLength(rule.pattern);
    if (length < 0) continue;
    if (!best || length > best.length || (length === best.length && rule.type === "allow")) {
      best = { type: rule.type, length };
    }
  }
  if (!best) return { allowed: true };
  return best.type === "allow"
    ? { allowed: true }
    : { allowed: false, reason: `robots.txt disallows crawling ${input.pathname}.` };
}

async function fetchRobotsForOrigin(
  target: URL,
  context: ProviderAdapterContext
): Promise<{ allowed: boolean; reason?: string }> {
  const fetchImpl = fetchForContext(context);
  try {
    const robotsResponse = await fetchImpl(`${target.origin}/robots.txt`, {
      headers: { "User-Agent": FIRECRAWL_USER_AGENT_GROUP },
      signal: AbortSignal.timeout(15000),
    });
    const robotsBody = await robotsResponse.text().catch(() => "");
    return robotsAllowsRequest({
      robotsStatus: robotsResponse.status,
      robotsBody,
      pathname: target.pathname,
    });
  } catch (error) {
    return {
      allowed: false,
      reason: `robots.txt fetch failed (${error instanceof Error ? error.message : "unknown"}); refusing to crawl.`,
    };
  }
}

function firecrawlRefusal(
  action: "crawl" | "search",
  reason: string
): FirecrawlRunResult {
  return {
    ok: false,
    reason,
    sanitizedResponse: { providerId: "firecrawl", action, refused: true },
  };
}

function firecrawlGate(
  context: ProviderAdapterContext
): { ok: true } | { ok: false; refusal: FirecrawlRunResult } {
  const missingCredential = validateCredential("firecrawl", "FIRECRAWL_API_KEY", context);
  if (missingCredential) {
    return { ok: false, refusal: firecrawlRefusal("crawl", missingCredential.reason ?? "Missing credential.") };
  }
  const approvalBlock = validateLiveApproval("firecrawl", context);
  if (approvalBlock) {
    return {
      ok: false,
      refusal: firecrawlRefusal("crawl", approvalBlock.reason ?? "Live provider calls require explicit approval."),
    };
  }
  return { ok: true };
}

export type FirecrawlCrawlRequest = {
  url: string;
  limit?: number;
  /** Poll interval for crawl completion; tests pass 0. */
  pollDelayMs?: number;
  maxPolls?: number;
};

export async function firecrawlCrawl(
  context: ProviderAdapterContext,
  request: FirecrawlCrawlRequest
): Promise<FirecrawlRunResult> {
  const gate = firecrawlGate(context);
  if (!gate.ok) return { ...gate.refusal, sanitizedResponse: { ...gate.refusal.sanitizedResponse, action: "crawl" } };

  // SSRF guard: the crawl target — and the robots.txt pre-fetch against its
  // origin below — must pass the repo's full remote-URL check (https only,
  // non-blocked host, every DNS answer in public space). Without a resolver
  // the check cannot run, so the crawl is refused, never guessed.
  const lookup = context.lookup;
  if (!lookup) {
    return firecrawlRefusal("crawl", "Crawl refused: no DNS resolver configured for outbound URL validation.");
  }
  let check: Awaited<ReturnType<typeof validateRemoteUrl>>;
  try {
    check = await validateRemoteUrl(request.url, lookup);
  } catch (error) {
    return firecrawlRefusal(
      "crawl",
      `Crawl target rejected by the SSRF guard: ${error instanceof BlockedUrlError ? error.message : "URL validation failed."}`
    );
  }
  const target = new URL(check.url);

  const limits = firecrawlRunLimits(context);
  const limit = request.limit ?? limits.maxCrawlPages;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return firecrawlRefusal("crawl", "Crawl limit must be a positive integer.");
  }
  // Per-run cost ceiling: refuse before any dispatch instead of silently
  // crawling more pages than the reviewed ceiling allows.
  if (limit > limits.maxCrawlPages) {
    return firecrawlRefusal(
      "crawl",
      `Crawl limit ${limit} exceeds the per-run ceiling of ${limits.maxCrawlPages} pages; raise FIRECRAWL_MAX_CRAWL_PAGES to crawl more.`
    );
  }

  const robots = await fetchRobotsForOrigin(target, context);
  if (!robots.allowed) return firecrawlRefusal("crawl", robots.reason ?? "robots.txt disallows this crawl.");

  const fetchImpl = fetchForContext(context);
  const apiKey = credential(context, "FIRECRAWL_API_KEY");
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const startResponse = await fetchImpl(`${FIRECRAWL_BASE_URL}/crawl`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: target.toString(),
      limit,
      scrapeOptions: { formats: ["markdown"] },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const startData = (await startResponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!startResponse.ok || startData.success === false) {
    return {
      ok: false,
      reason: "Firecrawl crawl start failed.",
      sanitizedResponse: sanitizeProviderPayload({
        providerId: "firecrawl",
        action: "crawl",
        status: startResponse.status,
        error: startData.error,
      }),
    };
  }
  const crawlId = typeof startData.id === "string" ? startData.id : "";
  if (!crawlId) {
    return firecrawlRefusal("crawl", "Firecrawl crawl start returned no job id.");
  }

  const maxPolls = request.maxPolls ?? 30;
  const pages: SanitizedFirecrawlPage[] = [];
  const seenPageUrls = new Set<string>();
  let pollPath: string | null = `/crawl/${encodeURIComponent(crawlId)}`;
  let completed = false;
  for (let poll = 0; poll < maxPolls && pollPath; poll++) {
    if (request.pollDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, request.pollDelayMs));
    }
    const pollResponse = await fetchImpl(`${FIRECRAWL_BASE_URL}${pollPath}`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const pollData = (await pollResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!pollResponse.ok || pollData.success === false) {
      return {
        ok: false,
        reason: "Firecrawl crawl status poll failed.",
        sanitizedResponse: sanitizeProviderPayload({
          providerId: "firecrawl",
          action: "crawl",
          status: pollResponse.status,
          error: pollData.error,
        }),
      };
    }
    const crawlData = Array.isArray(pollData.data) ? (pollData.data as Array<Record<string, unknown>>) : [];
    // Each poll re-serves every page collected so far — dedupe by URL across
    // polls (and within a poll) so a snapshot never stores the same page twice.
    const batch = dedupePagesByUrl(crawlData.map(sanitizeFirecrawlPage)).filter(
      (page) => !seenPageUrls.has(page.sourceUrl)
    );
    for (const page of batch) seenPageUrls.add(page.sourceUrl);
    pages.push(...batch);
    if (pollData.status === "failed" || pollData.status === "cancelled") {
      return {
        ok: false,
        reason: `Firecrawl crawl ended with status ${String(pollData.status)}.`,
        sanitizedResponse: sanitizeProviderPayload({
          providerId: "firecrawl",
          action: "crawl",
          crawlStatus: pollData.status,
          pageCollectCount: pages.length,
        }),
        pages,
      };
    }
    if (pollData.status === "completed" && typeof pollData.next !== "string") {
      completed = true;
      break;
    }
    // While the job is still scraping, keep polling the same job endpoint;
    // `next` chains additional result pages when present.
    pollPath = typeof pollData.next === "string"
      ? `/crawl/${encodeURIComponent(crawlId)}?next=${encodeURIComponent(pollData.next)}`
      : `/crawl/${encodeURIComponent(crawlId)}`;
  }
  if (!completed) {
    return {
      ok: false,
      reason: `Firecrawl crawl did not complete within ${maxPolls} status polls; retry with a smaller limit.`,
      sanitizedResponse: sanitizeProviderPayload({
        providerId: "firecrawl",
        action: "crawl",
        crawlStatus: "incomplete",
        pageCollectCount: pages.length,
      }),
      pages,
    };
  }

  return {
    ok: true,
    sanitizedResponse: sanitizeProviderPayload({
      providerId: "firecrawl",
      action: "crawl",
      url: target.toString(),
      limit,
      pageCount: pages.length,
    }),
    pages,
  };
}

export type FirecrawlSearchRequest = {
  query: string;
  limit?: number;
};

export async function firecrawlSearch(
  context: ProviderAdapterContext,
  request: FirecrawlSearchRequest
): Promise<FirecrawlRunResult> {
  const gate = firecrawlGate(context);
  if (!gate.ok) return { ...gate.refusal, sanitizedResponse: { ...gate.refusal.sanitizedResponse, action: "search" } };

  const query = request.query.trim();
  if (!query) {
    return firecrawlRefusal("search", "Search query is required.");
  }

  const limits = firecrawlRunLimits(context);
  const limit = request.limit ?? limits.maxSearchResults;
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return firecrawlRefusal("search", "Search limit must be a positive integer.");
  }
  if (limit > limits.maxSearchResults) {
    return firecrawlRefusal(
      "search",
      `Search limit ${limit} exceeds the per-run ceiling of ${limits.maxSearchResults} results; raise FIRECRAWL_MAX_SEARCH_RESULTS to search more.`
    );
  }

  const fetchImpl = fetchForContext(context);
  const response = await fetchImpl(`${FIRECRAWL_BASE_URL}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential(context, "FIRECRAWL_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success === false) {
    return {
      ok: false,
      reason: "Firecrawl search failed.",
      sanitizedResponse: sanitizeProviderPayload({
        providerId: "firecrawl",
        action: "search",
        status: response.status,
        error: data.error,
      }),
    };
  }
  const rawData = Array.isArray(data.data) ? (data.data as Array<Record<string, unknown>>) : [];
  const results = rawData.map(sanitizeFirecrawlSearchResult);
  return {
    ok: true,
    sanitizedResponse: sanitizeProviderPayload({
      providerId: "firecrawl",
      action: "search",
      query,
      limit,
      resultCount: results.length,
    }),
    results,
  };
}

async function validateFirecrawlConnection(
  context: ProviderAdapterContext
): Promise<ProviderValidationResult> {
  const providerId = "firecrawl" as const;
  const missingCredential = validateCredential(providerId, "FIRECRAWL_API_KEY", context);
  if (missingCredential) return missingCredential;
  const approvalBlock = validateLiveApproval(providerId, context);
  if (approvalBlock) return approvalBlock;

  // Read-only, zero-cost reachability check against the credit-usage endpoint;
  // no crawl or search runs during validation.
  const fetchImpl = fetchForContext(context);
  const response = await fetchImpl(`${FIRECRAWL_BASE_URL}/team/credit-usage`, {
    headers: { Authorization: `Bearer ${credential(context, "FIRECRAWL_API_KEY")}` },
    signal: AbortSignal.timeout(15000),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return {
      ok: false,
      providerId,
      reason: "Firecrawl API validation failed.",
      sanitizedResponse: sanitizeProviderPayload({
        providerId,
        status: response.status,
        error: data.error,
      }),
    };
  }
  const usage =
    data.data && typeof data.data === "object" && !Array.isArray(data.data)
      ? (data.data as Record<string, unknown>)
      : {};
  const remainingCredits = typeof usage.remaining_credits === "number" ? usage.remaining_credits : undefined;
  return {
    ok: true,
    providerId,
    accountLabel:
      typeof remainingCredits === "number"
        ? `Firecrawl API reachable; ${remainingCredits} credits remaining`
        : "Firecrawl API reachable",
    sanitizedResponse: {
      providerId,
      credential: "[server-secret-present]",
      remainingCredits,
    },
  };
}

export const firecrawlProviderAdapter: ProviderAdapter = {
  providerId: "firecrawl",
  requiredEnvVar: "FIRECRAWL_API_KEY",
  validateConnection: validateFirecrawlConnection,
  async submit() {
    return unavailable(
      "firecrawl",
      "Firecrawl is a read-only data vendor; it does not submit posts."
    );
  },
  async recordCancelOrUnpublishIntent() {
    return unavailable(
      "firecrawl",
      "Firecrawl is a read-only data vendor; there is nothing to cancel or unpublish."
    );
  },
  async refreshStatus() {
    return unavailable(
      "firecrawl",
      "Firecrawl is a read-only data vendor; there are no posts to refresh."
    );
  },
};

export function adapterForProvider(providerId: ProviderId): ProviderAdapter {
  if (providerId === "mock") return mockProviderAdapter;
  if (providerId === "buffer") return bufferProviderAdapter;
  if (providerId === "zernio") return zernioProviderAdapter;
  if (providerId === "firecrawl") return firecrawlProviderAdapter;
  return {
    providerId,
    requiredEnvVar: null,
    async validateConnection() {
      return {
        ok: false,
        providerId,
        reason: `${providerId} adapter is not implemented in the MVP validation shell.`,
        sanitizedResponse: { providerId, implemented: false },
      };
    },
    async submit() {
      return unavailable(providerId, `${providerId} adapter is not implemented.`);
    },
    async recordCancelOrUnpublishIntent() {
      return unavailable(providerId, `${providerId} adapter is not implemented.`);
    },
    async refreshStatus() {
      return unavailable(providerId, `${providerId} adapter is not implemented.`);
    },
  };
}

import type {
  V2BrandId,
  V2ChannelId,
  V2ProviderAttemptStatus,
  V2ProviderId,
  V2ProviderStateStatus,
} from "@/lib/v2";

export type V2ProviderSubmission = {
  postId: string;
  brandId: V2BrandId;
  channelId: V2ChannelId;
  title: string;
  content: string;
  scheduledDate?: string;
  scheduledTime?: string;
  timezone: string;
  idempotencyKey: string;
  providerPostId?: string;
  subreddit?: string;
};

export type V2ProviderIntentType = "cancel" | "unpublish";

export type V2ProviderAdapterContext = {
  env: Record<string, string | undefined>;
  liveProviderValidationApproved?: boolean;
  fetchImpl?: typeof fetch;
};

export type V2ProviderResult = {
  ok: boolean;
  status: V2ProviderAttemptStatus;
  providerStateStatus: V2ProviderStateStatus;
  providerPostId?: string;
  sanitizedResponse: Record<string, unknown>;
  reason?: string;
};

export type V2ProviderValidationResult = {
  ok: boolean;
  providerId: V2ProviderId;
  accountLabel?: string;
  reason?: string;
  sanitizedResponse: Record<string, unknown>;
};

export type V2ProviderAdapter = {
  providerId: V2ProviderId;
  requiredEnvVar: string | null;
  validateConnection(context: V2ProviderAdapterContext): Promise<V2ProviderValidationResult>;
  submit(
    submission: V2ProviderSubmission,
    context: V2ProviderAdapterContext
  ): Promise<V2ProviderResult>;
  recordCancelOrUnpublishIntent(
    submission: V2ProviderSubmission,
    intentType: V2ProviderIntentType,
    context: V2ProviderAdapterContext
  ): Promise<V2ProviderResult>;
  refreshStatus(
    providerPostId: string,
    context: V2ProviderAdapterContext
  ): Promise<V2ProviderResult>;
};

const SECRET_KEY_PATTERN = /token|secret|key|authorization|cookie|bearer|password/i;

export function providerForChannel(channelId: V2ChannelId): V2ProviderId | null {
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
}): V2ProviderAttemptStatus {
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
  attemptStatus: V2ProviderAttemptStatus;
  providerStateStatus: V2ProviderStateStatus;
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

function unavailable(providerId: V2ProviderId, reason: string): V2ProviderResult {
  return {
    ok: false,
    status: "unavailable",
    providerStateStatus: "unavailable",
    sanitizedResponse: { providerId, reason },
    reason,
  };
}

function needsApproval(providerId: V2ProviderId): V2ProviderResult {
  return unavailable(
    providerId,
    "Live provider calls require explicit approval; Mock Provider remains active."
  );
}

function credential(context: V2ProviderAdapterContext, envVar: string | null) {
  if (!envVar) return undefined;
  return context.env[envVar]?.trim();
}

function validateCredential(
  providerId: V2ProviderId,
  envVar: string | null,
  context: V2ProviderAdapterContext
): V2ProviderValidationResult | null {
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
  providerId: V2ProviderId,
  context: V2ProviderAdapterContext
): V2ProviderValidationResult | null {
  if (context.liveProviderValidationApproved) return null;
  return {
    ok: false,
    providerId,
    reason: "Live provider validation requires explicit approval.",
    sanitizedResponse: { providerId, liveProviderValidationApproved: false },
  };
}

function fetchForContext(context: V2ProviderAdapterContext): typeof fetch {
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

const BUFFER_LINKEDIN_CHANNEL_NAME_BY_BRAND: Partial<Record<V2BrandId, string>> = {
  corvo: "corvo-labs-us",
  "lower-db": "the-lower-db",
};

export function scheduleToUtcIso(input: {
  scheduledDate: string;
  scheduledTime?: string;
  timezone: string;
}): string {
  const [year, month, day] = input.scheduledDate.split("-").map(Number);
  const [hour, minute] = (input.scheduledTime ?? "09:00").split(":").map(Number);
  const readZoned = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: input.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));
    const pick = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? "0");
    return {
      year: pick("year"),
      month: pick("month"),
      day: pick("day"),
      hour: pick("hour"),
      minute: pick("minute"),
    };
  };

  let ms = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const zoned = readZoned(ms);
    const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
    const actual = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, 0);
    ms += desired - actual;
  }
  return new Date(ms).toISOString();
}

function isBufferLiveSubmissionApproved(context: V2ProviderAdapterContext): boolean {
  return context.env.BUFFER_LIVE_SUBMISSION === "approved";
}

function needsLiveSubmissionApproval(providerId: V2ProviderId): V2ProviderResult {
  return unavailable(
    providerId,
    "Buffer live submission requires BUFFER_LIVE_SUBMISSION=approved."
  );
}

function createBufferGraphqlClient(context: V2ProviderAdapterContext) {
  const fetchImpl = fetchForContext(context);
  const apiKey = credential(context, "BUFFER_API_KEY");
  return {
    apiKey,
    async graphql(query: string, variables?: Record<string, unknown>) {
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

function mapBufferPostStatus(status: unknown): V2ProviderStateStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "sent") return "published";
  if (normalized === "error") return "failed";
  if (normalized === "needs_approval") return "needs-review";
  if (normalized === "scheduled" || normalized === "sending" || normalized === "draft") {
    return "submitted";
  }
  return "needs-review";
}

async function listBufferLinkedInChannels(context: V2ProviderAdapterContext) {
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

  const channelResults = await Promise.all(
    organizations.map(async (organization) => {
      const channelsResult = await client.graphql(
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
    })
  );

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

async function resolveBufferLinkedInChannelId(
  brandId: V2BrandId,
  context: V2ProviderAdapterContext
): Promise<
  | { ok: true; channelId: string; channelName: string }
  | { ok: false; reason: string; sanitizedResponse: Record<string, unknown> }
> {
  const expectedName = BUFFER_LINKEDIN_CHANNEL_NAME_BY_BRAND[brandId];
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

  const channel = channelsResult.linkedinChannels.find(
    (item) => String(item.name ?? "") === expectedName
  );
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
  context: V2ProviderAdapterContext
): Promise<V2ProviderValidationResult> {
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
  context: V2ProviderAdapterContext
): Promise<V2ProviderValidationResult> {
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

const ZERNIO_REDDIT_USERNAME_BY_BRAND: Partial<Record<V2BrandId, string>> = {
  "lower-db": "the_lower_db",
};

export const ZERNIO_VALIDATION_SUBREDDIT = "testingground4bots";

function isZernioLiveSubmissionApproved(context: V2ProviderAdapterContext): boolean {
  return context.env.ZERNIO_LIVE_SUBMISSION === "approved";
}

function needsZernioLiveSubmissionApproval(providerId: V2ProviderId): V2ProviderResult {
  return unavailable(
    providerId,
    "Zernio live submission requires ZERNIO_LIVE_SUBMISSION=approved."
  );
}

function normalizeSubreddit(value: string): string {
  return value.trim().replace(/^r\//i, "");
}

function resolveSubmissionSubreddit(
  submission: V2ProviderSubmission,
  context: V2ProviderAdapterContext
): string {
  const fromSubmission = submission.subreddit?.trim();
  if (fromSubmission) return normalizeSubreddit(fromSubmission);
  const fromEnv = context.env.ZERNIO_VALIDATION_SUBREDDIT?.trim();
  if (fromEnv) return normalizeSubreddit(fromEnv);
  return ZERNIO_VALIDATION_SUBREDDIT;
}

function createZernioClient(context: V2ProviderAdapterContext) {
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

function mapZernioPostStatus(status: unknown): V2ProviderStateStatus {
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

async function listZernioRedditAccounts(context: V2ProviderAdapterContext) {
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
  brandId: V2BrandId,
  context: V2ProviderAdapterContext
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
    context: V2ProviderAdapterContext
  ) => Promise<V2ProviderValidationResult>;
}): V2ProviderAdapter {
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

export const mockProviderAdapter: V2ProviderAdapter = {
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

export const bufferProviderAdapter: V2ProviderAdapter = {
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

    const dueAt = scheduleToUtcIso({
      scheduledDate: submission.scheduledDate,
      scheduledTime: submission.scheduledTime,
      timezone: submission.timezone,
    });
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
      return {
        ok: false,
        status: classifyProviderError({
          status: createResult.response.status,
          message: String(reason),
        }),
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
        providerStateStatus: "cancel-intent-recorded",
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

    if (!deleteResult.response.ok || errors.length || mutationError || !deletedId) {
      const reason = mutationError ?? errors[0]?.message ?? "Buffer deletePost failed.";
      return {
        ok: false,
        status: classifyProviderError({
          status: deleteResult.response.status,
          message: String(reason),
        }),
        providerStateStatus: "cancel-intent-recorded",
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
        credential: "[server-secret-present]",
      }),
    };
  },
};

export const zernioProviderAdapter: V2ProviderAdapter = {
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

export function adapterForProvider(providerId: V2ProviderId): V2ProviderAdapter {
  if (providerId === "mock") return mockProviderAdapter;
  if (providerId === "buffer") return bufferProviderAdapter;
  if (providerId === "zernio") return zernioProviderAdapter;
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

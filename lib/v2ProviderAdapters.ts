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

export const bufferProviderAdapter = baseSocialAdapter({
  providerId: "buffer",
  requiredEnvVar: "BUFFER_API_KEY",
  accountLabel: "Buffer LinkedIn channel",
  validateLiveConnection: validateBufferConnection,
});

export const zernioProviderAdapter = baseSocialAdapter({
  providerId: "zernio",
  requiredEnvVar: "ZERNIO_API_KEY",
  accountLabel: "Zernio Reddit channel",
  validateLiveConnection: validateZernioConnection,
});

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

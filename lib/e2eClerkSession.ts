/**
 * Clerk development-instance session bootstrap for authenticated e2e runs (V4).
 *
 * The minting path is repo-owned: a plain Clerk Backend API call
 * (POST /v1/sign_in_tokens, documented for sign-in tokens and used by the
 * 2026-06-06 authenticated smoke) with an injectable fetch so it unit-tests
 * fully offline. Consumption happens in a real browser context in
 * `e2e/global-setup.ts` via the Clerk `ticket` sign-in strategy, then the
 * session is persisted as a Playwright storageState.
 *
 * Every unmet prerequisite produces a named, explicit reason — nothing here
 * silently degrades to a bypass. Live-instance keys are refused outright:
 * automated sessions may only ever be minted against a development instance.
 */

export type ClerkE2eSessionConfig = {
  /** Dev-instance secret key (sk_test_…). Only sk_test_ keys are accepted. */
  secretKey: string;
  /** Dev-instance publishable key (pk_test_…) the app server must be built with. */
  publishableKey: string;
  /** The Clerk user id (user_…) the session is minted for. */
  userId: string;
  /** Backend API base URL; overridable for tests. */
  apiBaseUrl: string;
  /** Sign-in token lifetime in seconds. Tokens are single-use and short-lived. */
  expiresInSeconds: number;
};

export type ClerkE2eSessionConfigResult =
  | { status: "ready"; config: ClerkE2eSessionConfig }
  | { status: "unavailable"; reason: string };

export const DEFAULT_CLERK_API_BASE_URL = "https://api.clerk.com";
export const DEFAULT_SIGN_IN_TOKEN_EXPIRES_IN_SECONDS = 300;

const DEV_SECRET_PREFIX = "sk_test_";
const DEV_PUBLISHABLE_PREFIX = "pk_test_";

function missing(reason: string): ClerkE2eSessionConfigResult {
  return { status: "unavailable", reason };
}

export function loadClerkE2eSessionConfig(
  env: Record<string, string | undefined>,
): ClerkE2eSessionConfigResult {
  const secretKey = (env.CLERK_SECRET_KEY_DEV ?? env.CLERK_SECRET_KEY ?? "").trim();
  if (!secretKey) {
    return missing(
      "Clerk dev-instance secret key is not configured: set CLERK_SECRET_KEY_DEV (preferred) or CLERK_SECRET_KEY.",
    );
  }
  if (!secretKey.startsWith(DEV_SECRET_PREFIX)) {
    return missing(
      `Refusing Clerk secret key with prefix "${secretKey.slice(0, 8)}…": authenticated e2e may only run against a development instance (sk_test_…).`,
    );
  }

  const publishableKey = (env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim();
  if (!publishableKey) {
    return missing(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set: the production build the e2e server boots must carry the dev-instance publishable key (pk_test_…).",
    );
  }
  if (!publishableKey.startsWith(DEV_PUBLISHABLE_PREFIX)) {
    return missing(
      `Refusing Clerk publishable key with prefix "${publishableKey.slice(0, 8)}…": authenticated e2e may only run against a development instance (pk_test_…).`,
    );
  }

  const userId = (env.E2E_CLERK_USER_ID ?? "").trim();
  if (!userId) {
    return missing(
      "E2E_CLERK_USER_ID is not set: provide the Clerk user id (user_…) of the e2e test user on the dev instance.",
    );
  }
  if (!userId.startsWith("user_")) {
    return missing(
      `E2E_CLERK_USER_ID "${userId}" is not a Clerk user id (expected prefix user_).`,
    );
  }

  const rawExpires = env.E2E_CLERK_TOKEN_EXPIRES_IN_SECONDS?.trim();
  let expiresInSeconds = DEFAULT_SIGN_IN_TOKEN_EXPIRES_IN_SECONDS;
  if (rawExpires) {
    const parsed = Number(rawExpires);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 3600) {
      return missing(
        `E2E_CLERK_TOKEN_EXPIRES_IN_SECONDS "${rawExpires}" is not a positive integer (1–3600).`,
      );
    }
    expiresInSeconds = parsed;
  }

  const apiBaseUrl = (
    env.E2E_CLERK_API_BASE_URL?.trim() || DEFAULT_CLERK_API_BASE_URL
  ).replace(/\/$/, "");

  return {
    status: "ready",
    config: { secretKey, publishableKey, userId, apiBaseUrl, expiresInSeconds },
  };
}

export type MintedSignInToken = {
  /** Sign-in token id (sit_…) as returned by the Backend API. */
  id: string;
  /** The single-use token to consume via the `ticket` sign-in strategy. */
  token: string;
  /** Wall-clock expiry of the token, in ms since epoch (best effort). */
  expiresAt: number;
};

export class ClerkE2eSessionError extends Error {
  readonly code: "CLERK_API_AUTH" | "CLERK_API_ERROR" | "CLERK_API_RESPONSE";

  constructor(code: MintErrorCode, message: string) {
    super(message);
    this.name = "ClerkE2eSessionError";
    this.code = code;
  }
}

type MintErrorCode = "CLERK_API_AUTH" | "CLERK_API_ERROR" | "CLERK_API_RESPONSE";

export type MintClerkSignInTokenDeps = {
  /** Injectable for offline unit tests; defaults to global fetch. */
  fetch?: typeof fetch;
  now?: () => number;
};

/**
 * Mint a single-use sign-in token for the configured dev-instance user via
 * `POST /v1/sign_in_tokens`. Throws a named {@link ClerkE2eSessionError} on
 * any failure so the global-setup never fakes success.
 */
export async function mintClerkSignInToken(
  config: Pick<ClerkE2eSessionConfig, "secretKey" | "userId" | "apiBaseUrl" | "expiresInSeconds">,
  deps: MintClerkSignInTokenDeps = {},
): Promise<MintedSignInToken> {
  const doFetch = deps.fetch ?? fetch;
  const now = deps.now ?? Date.now;

  let response: Response;
  try {
    response = await doFetch(`${config.apiBaseUrl}/v1/sign_in_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: config.userId,
        expires_in_seconds: config.expiresInSeconds,
      }),
    });
  } catch (error) {
    throw new ClerkE2eSessionError(
      "CLERK_API_ERROR",
      `Clerk Backend API request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ClerkE2eSessionError(
      "CLERK_API_AUTH",
      `Clerk Backend API rejected the secret key (HTTP ${response.status}). Check that CLERK_SECRET_KEY_DEV belongs to the dev instance.`,
    );
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 300);
    throw new ClerkE2eSessionError(
      "CLERK_API_ERROR",
      `Clerk Backend API returned HTTP ${response.status} minting a sign-in token for ${config.userId}: ${body}`,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new ClerkE2eSessionError(
      "CLERK_API_RESPONSE",
      `Clerk Backend API returned non-JSON minting a sign-in token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const record = (body as { data?: unknown } | null)?.data ?? body;
  const token =
    typeof record === "object" && record !== null && "token" in record
      ? (record as { token?: unknown }).token
      : undefined;
  if (typeof token !== "string" || token.length === 0) {
    throw new ClerkE2eSessionError(
      "CLERK_API_RESPONSE",
      "Clerk Backend API response carried no sign-in token — is the dev instance's 'Allow sign-in tokens' setting enabled?",
    );
  }
  const id =
    typeof record === "object" && record !== null && "id" in record
      ? (record as { id?: unknown }).id
      : undefined;

  return {
    id: typeof id === "string" ? id : "",
    token,
    expiresAt: now() + config.expiresInSeconds * 1000,
  };
}

/**
 * What the spec layer reads to decide run vs. explicit skip. Written by the
 * global-setup; absent or malformed means the setup never ran.
 */
export type AuthSessionStatus =
  | { status: "ready"; storageStatePath: string; mintedFor: string }
  | { status: "unavailable"; reason: string };

export const AUTH_STATE_DIR = "e2e/.auth";
export const AUTH_STATE_FILE = `${AUTH_STATE_DIR}/state.json`;
export const AUTH_STATUS_FILE = `${AUTH_STATE_DIR}/session-status.json`;

export function parseAuthSessionStatus(raw: unknown): AuthSessionStatus {
  if (typeof raw !== "object" || raw === null) {
    return {
      status: "unavailable",
      reason: "session-status file is malformed — global-setup did not record a usable state",
    };
  }
  const record = raw as Record<string, unknown>;
  if (record.status === "unavailable" && typeof record.reason === "string" && record.reason) {
    return { status: "unavailable", reason: record.reason };
  }
  if (
    record.status === "ready" &&
    typeof record.storageStatePath === "string" &&
    record.storageStatePath &&
    typeof record.mintedFor === "string"
  ) {
    return { status: "ready", storageStatePath: record.storageStatePath, mintedFor: record.mintedFor };
  }
  return {
    status: "unavailable",
    reason: "session-status file is malformed — global-setup did not record a usable state",
  };
}

/** Skip message for the e2e spec when no authenticated session is available. */
export function authSessionSkipReason(status: AuthSessionStatus, bypassAuth: boolean): string | null {
  if (bypassAuth) {
    return (
      "E2E_BYPASS_AUTH=1 is set: real Clerk session assertions cannot run while the auth bypass is enabled. " +
      "Run this spec without the bypass (the verification workflow does)."
    );
  }
  if (status.status === "ready") return null;
  return `Authenticated Clerk session unavailable — global-setup reported: ${status.reason}`;
}

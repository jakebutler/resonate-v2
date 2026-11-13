import { describe, expect, it, vi } from "vitest";

import {
  ClerkE2eSessionError,
  DEFAULT_CLERK_API_BASE_URL,
  DEFAULT_SIGN_IN_TOKEN_EXPIRES_IN_SECONDS,
  authSessionSkipReason,
  loadClerkE2eSessionConfig,
  mintClerkSignInToken,
  parseAuthSessionStatus,
} from "../e2eClerkSession";

const READY_ENV = {
  CLERK_SECRET_KEY_DEV: "sk_test_dev_secret",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dev_pub",
  E2E_CLERK_USER_ID: "user_e2e_test",
};

function fakeFetch(
  handler: (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => { status: number; body?: unknown; text?: string },
): typeof fetch {
  const impl = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of new Headers(init?.headers).entries()) {
      headers[key.toLowerCase()] = value;
    }
    const result = handler(
      String(url),
      {
        method: String(init?.method ?? "GET"),
        headers: headers as Record<string, string>,
        body: typeof init?.body === "string" ? init.body : "",
      },
    );
    const responseInit: ResponseInit = { status: result.status };
    if (result.text !== undefined) {
      return new Response(result.text, responseInit);
    }
    return new Response(JSON.stringify(result.body ?? {}), responseInit);
  });
  return impl as unknown as typeof fetch;
}

describe("loadClerkE2eSessionConfig", () => {
  it("accepts a fully configured dev instance", () => {
    const result = loadClerkE2eSessionConfig(READY_ENV);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.config.secretKey).toBe("sk_test_dev_secret");
    expect(result.config.userId).toBe("user_e2e_test");
    expect(result.config.apiBaseUrl).toBe(DEFAULT_CLERK_API_BASE_URL);
    expect(result.config.expiresInSeconds).toBe(DEFAULT_SIGN_IN_TOKEN_EXPIRES_IN_SECONDS);
  });

  it("prefers CLERK_SECRET_KEY_DEV over CLERK_SECRET_KEY", () => {
    const result = loadClerkE2eSessionConfig({
      ...READY_ENV,
      CLERK_SECRET_KEY: "sk_test_fallback",
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.config.secretKey).toBe("sk_test_dev_secret");
    }
  });

  it("names the missing secret key explicitly", () => {
    const result = loadClerkE2eSessionConfig({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dev_pub",
      E2E_CLERK_USER_ID: "user_e2e_test",
    });
    expect(result).toEqual({ status: "unavailable", reason: expect.stringContaining("CLERK_SECRET_KEY_DEV") });
  });

  it("refuses a live-instance secret key", () => {
    const result = loadClerkE2eSessionConfig({
      ...READY_ENV,
      CLERK_SECRET_KEY_DEV: "sk_live_real_instance",
    });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toContain("sk_test_");
    }
  });

  it("names the missing publishable key explicitly", () => {
    const result = loadClerkE2eSessionConfig({
      CLERK_SECRET_KEY_DEV: "sk_test_dev_secret",
      E2E_CLERK_USER_ID: "user_e2e_test",
    });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    }
  });

  it("refuses a live-instance publishable key", () => {
    const result = loadClerkE2eSessionConfig({
      ...READY_ENV,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_prod",
    });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toContain("pk_test_");
    }
  });

  it("names the missing test user explicitly", () => {
    const result = loadClerkE2eSessionConfig({
      CLERK_SECRET_KEY_DEV: "sk_test_dev_secret",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dev_pub",
    });
    expect(result).toEqual({ status: "unavailable", reason: expect.stringContaining("E2E_CLERK_USER_ID") });
  });

  it("rejects a non-positive token lifetime", () => {
    const result = loadClerkE2eSessionConfig({ ...READY_ENV, E2E_CLERK_TOKEN_EXPIRES_IN_SECONDS: "0" });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toContain("E2E_CLERK_TOKEN_EXPIRES_IN_SECONDS");
    }
  });
});

describe("mintClerkSignInToken", () => {
  const config = {
    secretKey: "sk_test_dev_secret",
    userId: "user_e2e_test",
    apiBaseUrl: "https://api.clerk.com",
    expiresInSeconds: 300,
  };

  it("posts to the Backend API sign_in_tokens endpoint with the bearer key", async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url).toBe("https://api.clerk.com/v1/sign_in_tokens");
      expect(init.method).toBe("POST");
      expect(init.headers["authorization"]).toBe("Bearer sk_test_dev_secret");
      expect(init.headers["content-type"]).toBe("application/json");
      expect(JSON.parse(init.body)).toEqual({
        user_id: "user_e2e_test",
        expires_in_seconds: 300,
      });
      return { status: 200, body: { id: "sit_123", token: "tok.jwt" } };
    });

    const minted = await mintClerkSignInToken(config, { fetch: fetchImpl, now: () => 1_000 });
    expect(minted.token).toBe("tok.jwt");
    expect(minted.id).toBe("sit_123");
  });

  it("computes the token expiry from the configured lifetime", async () => {
    const fetchImpl = fakeFetch(() => ({ status: 200, body: { id: "sit_1", token: "t" } }));
    const minted = await mintClerkSignInToken(config, { fetch: fetchImpl, now: () => 60_000 });
    expect(minted.expiresAt).toBe(60_000 + 300 * 1000);
  });

  it("unwraps a data-envelope response", async () => {
    const fetchImpl = fakeFetch(() => ({ status: 200, body: { data: { id: "sit_9", token: "wrapped" } } }));
    const minted = await mintClerkSignInToken(config, { fetch: fetchImpl });
    expect(minted.token).toBe("wrapped");
  });

  it("throws a named auth error when the key is rejected", async () => {
    const fetchImpl = fakeFetch(() => ({ status: 401, text: "{}" }));
    await expect(mintClerkSignInToken(config, { fetch: fetchImpl })).rejects.toMatchObject({
      name: "ClerkE2eSessionError",
      code: "CLERK_API_AUTH",
    });
  });

  it("throws a named API error with the status for other failures", async () => {
    const fetchImpl = fakeFetch(() => ({ status: 422, text: '{"errors":[{"message":"bad"}]}' }));
    const error = await mintClerkSignInToken(config, { fetch: fetchImpl }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ClerkE2eSessionError);
    expect((error as ClerkE2eSessionError).code).toBe("CLERK_API_ERROR");
    expect((error as ClerkE2eSessionError).message).toContain("422");
  });

  it("throws a named response error when no token comes back", async () => {
    const fetchImpl = fakeFetch(() => ({ status: 200, body: { id: "sit_1" } }));
    await expect(mintClerkSignInToken(config, { fetch: fetchImpl })).rejects.toMatchObject({
      code: "CLERK_API_RESPONSE",
    });
  });

  it("throws a named network error when the request cannot be made", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ENOTFOUND"));
    await expect(mintClerkSignInToken(config, { fetch: fetchImpl as unknown as typeof fetch })).rejects.toMatchObject({
      code: "CLERK_API_ERROR",
    });
  });
});

/**
 * Runs only when the Clerk dev instance is provisioned (secret key + test user
 * present). Skipped explicitly otherwise — never silently green.
 */
const liveClerkReady = Boolean(
  (process.env.CLERK_SECRET_KEY_DEV ?? process.env.CLERK_SECRET_KEY)?.startsWith("sk_test_") &&
    process.env.E2E_CLERK_USER_ID,
);

describe.skipIf(!liveClerkReady)("mintClerkSignInToken — live Clerk dev instance", () => {
  it(
    liveClerkReady
      ? "mints a real sign-in token against the dev instance"
      : "skipped: Clerk dev instance not provisioned",
    async () => {
      const loaded = loadClerkE2eSessionConfig(process.env);
      if (loaded.status !== "ready") {
        throw new Error(`live Clerk env incomplete: ${loaded.reason}`);
      }
      const minted = await mintClerkSignInToken(loaded.config);
      expect(minted.token).toBeTruthy();
      expect(minted.token.split(".").length).toBe(3);
    },
  );
});

describe("authSessionSkipReason", () => {
  const readyStatus = { status: "ready", storageStatePath: "e2e/.auth/state.json", mintedFor: "user_1" } as const;

  it("returns null when a session is ready and the bypass is off", () => {
    expect(authSessionSkipReason(readyStatus, false)).toBeNull();
  });

  it("states the bypass conflict explicitly", () => {
    const reason = authSessionSkipReason(readyStatus, true);
    expect(reason).toContain("E2E_BYPASS_AUTH");
  });

  it("carries the named unavailability reason through", () => {
    const reason = authSessionSkipReason(
      { status: "unavailable", reason: "E2E_CLERK_USER_ID is not set" },
      false,
    );
    expect(reason).toContain("E2E_CLERK_USER_ID is not set");
  });
});

describe("parseAuthSessionStatus", () => {
  it("round-trips a ready status", () => {
    expect(
      parseAuthSessionStatus({ status: "ready", storageStatePath: "e2e/.auth/state.json", mintedFor: "user_1" }),
    ).toEqual({ status: "ready", storageStatePath: "e2e/.auth/state.json", mintedFor: "user_1" });
  });

  it("keeps an unavailable reason verbatim", () => {
    expect(parseAuthSessionStatus({ status: "unavailable", reason: "no keys" })).toEqual({
      status: "unavailable",
      reason: "no keys",
    });
  });

  it("degrades malformed records to an explicit unavailable", () => {
    expect(parseAuthSessionStatus("garbage").status).toBe("unavailable");
    expect(parseAuthSessionStatus({ status: "ready" }).status).toBe("unavailable");
    expect(parseAuthSessionStatus(null).reason).toContain("malformed");
  });
});

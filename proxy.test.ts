import { afterEach, describe, expect, it, vi } from "vitest";

// proxy.ts reads E2E_BYPASS_AUTH at module load and the production signals at
// request time, so every test re-imports the module under freshly stubbed env.
// Clerk is mocked out entirely — the failsafe behavior under test does not
// touch Clerk — and next/server is reduced to distinguishable markers:
// NextResponse.next() -> { kind: "next" }, denials -> real Response objects.
const { nextSpy } = vi.hoisted(() => ({ nextSpy: vi.fn(() => ({ kind: "next" as const })) }));

vi.mock("next/server", () => {
  class NextResponse extends Response {}
  return {
    NextResponse: Object.assign(NextResponse, {
      next: nextSpy,
      json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
    }),
  };
});

vi.mock("@clerk/nextjs/server", () => {
  // Mirrors clerkMiddleware's contract: the returned middleware receives the
  // request and invokes the configured handler with an auth() resolver.
  const fakeAuth = async () => ({
    userId: null as string | null,
    sessionClaims: null,
    redirectToSignIn: () => ({ kind: "redirect-to-sign-in" as const }),
  });
  let handler: ((auth: () => Promise<Record<string, unknown>>, req: Request) => unknown) | null =
    null;
  return {
    clerkMiddleware: (configured: NonNullable<typeof handler>) => {
      handler = configured;
      return async (req: Request) => handler?.(fakeAuth, req);
    },
    createRouteMatcher: () => () => false,
    clerkClient: vi.fn(),
  };
});

async function importProxy() {
  return await import("./proxy");
}

const PROTECTED_REQ = new Request("https://app.example.com/ideas");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("E2E_BYPASS_AUTH production failsafe", () => {
  it("lets the bypass serve requests on dev and CI environments, including a production build", async () => {
    // CI and local E2E run the bypass against `next build` output, where
    // NODE_ENV is "production" — NODE_ENV must not trip the failsafe.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_BYPASS_AUTH", "1");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("CONVEX_CLOUD_URL", "");

    const proxy = await importProxy();
    const result = await proxy.default(PROTECTED_REQ);

    expect(result).toEqual({ kind: "next" });
    expect(nextSpy).toHaveBeenCalled();
  });

  it("lets the bypass serve requests on Vercel preview deployments (dev deployments)", async () => {
    vi.stubEnv("E2E_BYPASS_AUTH", "1");
    vi.stubEnv("VERCEL_ENV", "preview");

    const proxy = await importProxy();
    const result = await proxy.default(PROTECTED_REQ);

    expect(result).toEqual({ kind: "next" });
  });

  it("lets the bypass serve requests when only the NEXT_PUBLIC flag spelling is set", async () => {
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS_AUTH", "1");
    vi.stubEnv("VERCEL_ENV", "");

    const proxy = await importProxy();
    const result = await proxy.default(PROTECTED_REQ);

    expect(result).toEqual({ kind: "next" });
  });

  it("denies requests when VERCEL_ENV is production", async () => {
    vi.stubEnv("E2E_BYPASS_AUTH", "1");
    vi.stubEnv("VERCEL_ENV", "production");

    const proxy = await importProxy();
    const result = (await proxy.default(PROTECTED_REQ)) as Response;

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(503);
    expect(await result.text()).toContain("auth bypass is disabled in production");
  });

  it("denies requests when the server points at the production Convex deployment", async () => {
    vi.stubEnv("E2E_BYPASS_AUTH", "1");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");

    const proxy = await importProxy();
    const result = (await proxy.default(PROTECTED_REQ)) as Response;

    expect(result).toBeInstanceOf(Response);
    expect(result.status).toBe(503);
  });

  it("returns JSON denials for API routes", async () => {
    vi.stubEnv("E2E_BYPASS_AUTH", "1");
    vi.stubEnv("VERCEL_ENV", "production");

    const proxy = await importProxy();
    const result = (await proxy.default(
      new Request("https://app.example.com/api/providers/validate")
    )) as Response;

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({
      error: "Service unavailable: auth bypass is disabled in production.",
    });
  });

  it("uses the real auth proxy when the bypass flag is unset", async () => {
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    vi.stubEnv("VERCEL_ENV", "production");

    const proxy = await importProxy();
    const result = await proxy.default(PROTECTED_REQ);

    expect(result).toEqual({ kind: "redirect-to-sign-in" });
  });
});

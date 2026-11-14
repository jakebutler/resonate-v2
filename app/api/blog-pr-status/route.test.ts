import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));
vi.mock("@/lib/github", () => ({ fetchBlogPrStatus: vi.fn() }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: vi.fn() }));

import { POST } from "@/app/api/blog-pr-status/route";

function postRequest(body: string | undefined) {
  return new Request("https://app.example.com/api/blog-pr-status", {
    method: "POST",
    body,
  }) as never;
}

beforeEach(() => {
  authMock.mockReset();
  vi.stubEnv("E2E_BYPASS_AUTH", "1");
  vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS_AUTH", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("CONVEX_CLOUD_URL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/blog-pr-status E2E_BYPASS_AUTH failsafe", () => {
  it("reaches the handler without Clerk auth when the bypass is enabled in dev", async () => {
    const res = await POST(postRequest(undefined));
    // Past the auth gate; the handler rejects the empty body on its own terms.
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON request body." });
    expect(authMock).not.toHaveBeenCalled();
  });

  it("requires auth when the bypass flag is unset", async () => {
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    authMock.mockResolvedValue({ userId: null });
    const res = await POST(postRequest(undefined));
    expect(res.status).toBe(401);
    expect(authMock).toHaveBeenCalled();
  });

  it("fails closed when VERCEL_ENV is production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    authMock.mockResolvedValue({ userId: null });
    const res = await POST(postRequest(undefined));
    expect(res.status).toBe(401);
    expect(authMock).toHaveBeenCalled();
  });

  it("fails closed when the server points at the production Convex deployment", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");
    authMock.mockResolvedValue({ userId: null });
    const res = await POST(postRequest(undefined));
    expect(res.status).toBe(401);
    expect(authMock).toHaveBeenCalled();
  });
});

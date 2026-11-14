import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/providerAdapters", () => ({
  adapterForProvider: () => ({
    validateConnection: async () => ({ ok: true, platform: "fixture", detail: "" }),
  }),
}));

import { GET } from "@/app/api/providers/validate/route";

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

describe("GET /api/providers/validate E2E_BYPASS_AUTH failsafe", () => {
  it("serves the validation without Clerk auth when the bypass is enabled in dev", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(authMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.platforms).toHaveLength(3);
  });

  it("requires auth when the bypass flag is unset", async () => {
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    authMock.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(authMock).toHaveBeenCalled();
  });

  it("fails closed when VERCEL_ENV is production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    authMock.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(authMock).toHaveBeenCalled();
  });

  it("fails closed when the server points at the production Convex deployment", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");
    authMock.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(authMock).toHaveBeenCalled();
  });
});

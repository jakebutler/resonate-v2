import { afterEach, describe, expect, it, vi } from "vitest";

async function importHelper() {
  return await import("@/lib/e2eAuthBypass");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

function stubBypass(nextPublic = "") {
  vi.stubEnv("E2E_BYPASS_AUTH", "1");
  vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS_AUTH", nextPublic);
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("CONVEX_CLOUD_URL", "");
}

describe("isClientE2eAuthBypassRequested", () => {
  it("mirrors the raw NEXT_PUBLIC read exactly (display gating only)", async () => {
    const helper = await importHelper();
    vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS_AUTH", "1");
    expect(helper.isClientE2eAuthBypassRequested()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS_AUTH", "");
    expect(helper.isClientE2eAuthBypassRequested()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_E2E_BYPASS_AUTH", undefined);
    expect(helper.isClientE2eAuthBypassRequested()).toBe(false);
  });
});

describe("isE2eAuthBypassEnabled", () => {
  it("enables the bypass in dev when requested", async () => {
    stubBypass();
    const helper = await importHelper();
    expect(helper.isE2eAuthBypassEnabled()).toBe(true);
  });

  it("enables the bypass via the NEXT_PUBLIC spelling alone", async () => {
    stubBypass("1");
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    const helper = await importHelper();
    expect(helper.isE2eAuthBypassEnabled()).toBe(true);
  });

  it("enables the bypass on Vercel preview deployments", async () => {
    stubBypass();
    vi.stubEnv("VERCEL_ENV", "preview");
    const helper = await importHelper();
    expect(helper.isE2eAuthBypassEnabled()).toBe(true);
  });

  it("enables the bypass in CI against a production build, where NODE_ENV is production", async () => {
    stubBypass();
    vi.stubEnv("NODE_ENV", "production");
    const helper = await importHelper();
    expect(helper.isE2eAuthBypassEnabled()).toBe(true);
  });

  it("is disabled when neither flag spelling is set", async () => {
    stubBypass();
    vi.stubEnv("E2E_BYPASS_AUTH", "");
    vi.stubEnv("VERCEL_ENV", "production");
    const helper = await importHelper();
    expect(helper.isE2eAuthBypassEnabled()).toBe(false);
  });

  it("refuses and logs when VERCEL_ENV is production", async () => {
    stubBypass();
    vi.stubEnv("VERCEL_ENV", "production");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const helper = await importHelper();
    expect(helper.isE2eAuthBypassEnabled()).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Refusing the auth bypass"));
    errorSpy.mockRestore();
  });

  it("refuses when the server points at the production Convex deployment", async () => {
    stubBypass();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");
    const helper = await importHelper();
    expect(helper.isE2eAuthBypassEnabled()).toBe(false);
  });

  it("refuses when the production host is renamed but the deployment name is unchanged", async () => {
    // Structural compare: a Convex host-suffix rename (or a self-hosted
    // deployment routing through a renamed host) must not disarm the guard.
    stubBypass();
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.site");
    const helper = await importHelper();
    expect(helper.isE2eAuthBypassEnabled()).toBe(false);
    expect(helper.isProductionDeployment()).toBe(true);
  });

  it("stays enabled on dev, preview, and CI deployments that are not production", async () => {
    stubBypass();
    const helper = await importHelper();
    for (const url of [
      "http://127.0.0.1:3210",
      "https://tame-pika-42.convex.cloud",
      "https://proxy.internal/healthy-platypus-553",
      "",
    ]) {
      vi.stubEnv("CONVEX_CLOUD_URL", url);
      expect(helper.isProductionDeployment()).toBe(false);
      expect(helper.isE2eAuthBypassEnabled()).toBe(true);
    }
  });

  it("reports production deployment from either signal", async () => {
    const helper = await importHelper();
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("CONVEX_CLOUD_URL", "");
    expect(helper.isProductionDeployment()).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(helper.isProductionDeployment()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://healthy-platypus-553.convex.cloud");
    expect(helper.isProductionDeployment()).toBe(true);
  });
});

import type { NextRequest } from "next/server";
import { it, expect, vi, afterEach } from "vitest";
import { POST } from "../route";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("retires the legacy secret-only publishing smoke without paid AI or repository writes", async () => {
  vi.stubEnv("V2_OPS_SECRET", "sanitized-secret");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const response = await POST(
    new Request("http://localhost/api/ops/validate-workflow", {
      method: "POST",
      headers: { "x-resonate-v2-ops-secret": "sanitized-secret" },
    }) as NextRequest,
  );
  expect(response.status).toBe(410);
  expect((await response.json()).error).toContain("canonical");
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects unauthenticated requests", async () => {
  vi.stubEnv("V2_OPS_SECRET", "sanitized-secret");
  expect(
    (
      await POST(
        new Request("http://localhost/api/ops/validate-workflow", {
          method: "POST",
        }) as NextRequest,
      )
    ).status,
  ).toBe(401);
});

it.each([
  { authorization: "Bearer sanitized-secret" },
  { authorization: "bearer   sanitized-secret  " },
  { "x-v2-ops-secret": " sanitized-secret " },
])(
  "returns the composer migration response for legacy authenticated operators: %s",
  async (headers) => {
    vi.stubEnv("V2_OPS_SECRET", "sanitized-secret");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const response = await POST(
      new Request("http://localhost/api/ops/validate-workflow", {
        method: "POST",
        headers,
      }) as NextRequest,
    );
    expect(response.status).toBe(410);
    expect((await response.json()).route).toBe("/");
    expect(fetch).not.toHaveBeenCalled();
  },
);

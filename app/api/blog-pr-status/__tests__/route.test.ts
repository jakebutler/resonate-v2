import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { query, action, fetchStatus } = vi.hoisted(() => ({ query: vi.fn(), action: vi.fn(), fetchStatus: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn().mockResolvedValue({ userId: "owner", getToken: vi.fn().mockResolvedValue("test-token") }) }));
vi.mock("convex/browser", () => ({ ConvexHttpClient: vi.fn(function () { return { setAuth: vi.fn(), query, action }; }) }));
vi.mock("@/lib/github", () => ({ fetchBlogPrStatus: fetchStatus }));
import { POST } from "../route";

function request(body: unknown): NextRequest {
  return new Request("http://localhost/api/blog-pr-status", { method: "POST", body: JSON.stringify(body) }) as NextRequest;
}

describe("publication status authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
    query.mockResolvedValue({ hasVisuals: true });
    action.mockResolvedValue({ recorded: true, prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/3", prStatus: "open", prNumber: 3 });
  });

  it("passes only the owned post identity to the server status action", async () => {
    const response = await POST(request({ postId: "owned-post", prUrl: "https://attacker.example/pull/9", prStatus: "merged" }));
    expect(response.status).toBe(200);
    expect(action).toHaveBeenCalledWith(expect.anything(), { postId: "owned-post" });
    expect(fetchStatus).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ recorded: true, prStatus: "open" });
  });

  it("fails closed if the owned publication lookup fails", async () => {
    query.mockRejectedValue(new Error("Not authorized"));
    expect((await POST(request({ postId: "foreign-post", prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/3" }))).status).toBe(403);
    expect(action).not.toHaveBeenCalled();
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it("rejects a non-object body instead of throwing before validation", async () => {
    expect((await POST(request(null))).status).toBe(400);
    expect(query).not.toHaveBeenCalled();
  });
});

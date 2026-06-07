import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/github", () => ({
  createBlogPostPR: vi.fn().mockResolvedValue({
    prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/50",
    branchName:
      "resonate/blog-post-2026-06-05-golden-sets-and-evals-for-trustworthy-claim-validation",
  }),
}));

import { POST } from "@/app/api/ops/validate-workflow/route";
import { createBlogPostPR } from "@/lib/github";

function makeRequest(headers?: Record<string, string>): NextRequest {
  return new Request("http://localhost/api/ops/validate-workflow", {
    method: "POST",
    headers,
  }) as unknown as NextRequest;
}

describe("POST /api/ops/validate-workflow", () => {
  const originalOpsSecret = process.env.V2_OPS_SECRET;
  const originalPioneerKey = process.env.PIONEER_API_KEY;
  const originalModel = process.env.PIONEER_DRAFT_MODEL;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.V2_OPS_SECRET = "test-secret";
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    process.env.PIONEER_DRAFT_MODEL = "claude-opus-4-7";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    "A Pioneer generated draft long enough to satisfy workflow validation. ".repeat(
                      8
                    ),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
  });

  afterEach(() => {
    process.env.V2_OPS_SECRET = originalOpsSecret;
    process.env.PIONEER_API_KEY = originalPioneerKey;
    process.env.PIONEER_DRAFT_MODEL = originalModel;
    vi.unstubAllGlobals();
  });

  it("rejects requests without the ops secret", async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(401);
    expect(createBlogPostPR).not.toHaveBeenCalled();
  });

  it("runs the production validation workflow with a valid ops secret", async () => {
    const res = await POST(makeRequest({ "x-resonate-v2-ops-secret": "test-secret" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.draft.provider).toBe("pioneer");
    expect(data.draft.model).toBe("claude-opus-4-7");
    expect(data.youtube.ok).toBe(true);
    expect(data.blog.prUrl).toBe("https://github.com/jakebutler/corvo-labs-dot-com/pull/50");
    expect(createBlogPostPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Golden sets and evals for trustworthy claim validation",
        status: "scheduled",
      })
    );
  });
});

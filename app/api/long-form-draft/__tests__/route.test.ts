import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/long-form-draft/route";
import { makeClaim, makeEditorialOutline, makeOutlineSection, makeTakeawayRow } from "@/lib/domain";

function makeRequest(body: object): NextRequest {
  return new Request("http://localhost/api/long-form-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const acceptedClaim = {
  ...makeClaim({
    text: "Most patients regain weight after stopping semaglutide.",
    sourceIds: ["src-step4"],
    evidenceLabel: "rct-meta-analysis" as const,
    confidence: "high" as const,
    caveats: "STEP 4 data.",
  }),
  status: "accepted" as const,
};

const outline = {
  ...makeEditorialOutline({
    claimMapId: "cmap-abc",
    brandId: "freshproof",
    thesis: "Weight regain after GLP-1 discontinuation is predictable and manageable.",
    sections: [
      makeOutlineSection({
        heading: "Why Weight Returns",
        notes: "Mechanism explanation",
        claimIds: [acceptedClaim.id],
        evidenceLabels: ["rct-meta-analysis"],
      }),
    ],
    takeawayTable: [
      makeTakeawayRow({
        finding: "Two-thirds weight regain in one year",
        evidenceLabel: "rct-meta-analysis",
        source: "STEP 4 extension (PubMed 2022)",
      }),
    ],
    citationPlan: "Cite STEP 4 for weight regain data.",
  }),
  status: "approved" as const,
};

const validBody = {
  outline,
  acceptedClaims: [acceptedClaim],
  brandId: "freshproof",
  voicePackMarkdown: "# FreshProof Voice\n\nEvidence-first. No hype.",
};

describe("POST /api/long-form-draft", () => {
  const originalApiKey = process.env.PIONEER_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.PIONEER_API_KEY;
  });

  afterEach(() => {
    process.env.PIONEER_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it("returns 400 when outline is missing", async () => {
    const res = await POST(makeRequest({ acceptedClaims: [acceptedClaim] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when acceptedClaims is empty", async () => {
    const res = await POST(makeRequest({ outline, acceptedClaims: [] }));
    expect(res.status).toBe(400);
  });

  it("returns a placeholder draft when Pioneer is not configured", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("mock");
    expect(typeof data.draft).toBe("string");
    expect(data.draft.length).toBeGreaterThan(100);
    expect(data.draft).toContain("Weight regain");
    expect(data.warning).toBeTruthy();
  });

  it("draft preserves thesis from the outline", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.draft).toContain("predictable");
  });

  it("draft includes footnote or citation reference from accepted claims", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    expect(data.draft).toMatch(/\[1\]|\[\^1\]|STEP 4/i);
  });

  it("returns Pioneer draft when configured", async () => {
    process.env.PIONEER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "## The Weight Regain Problem\n\nEvidence-based long-form draft. [^1]\n\n[^1]: STEP 4 extension." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("pioneer");
    expect(data.draft).toContain("Evidence-based");
  });

  it("falls back to mock when Pioneer fails", async () => {
    process.env.PIONEER_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("bad", { status: 502 })));

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(data.provider).toBe("mock");
    expect(data.warning).toBeTruthy();
  });
});

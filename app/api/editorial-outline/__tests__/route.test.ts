import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/editorial-outline/route";
import { makeClaim } from "@/lib/domain";

function makeRequest(body: object): NextRequest {
  return new Request("http://localhost/api/editorial-outline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const acceptedClaim = {
  ...makeClaim({
    text: "Most patients regain weight within one year of stopping semaglutide.",
    sourceIds: ["src-step4"],
    evidenceLabel: "rct-meta-analysis" as const,
    confidence: "high" as const,
    caveats: "STEP 4 extension data.",
  }),
  status: "accepted" as const,
};

const validBody = {
  thesis: "Weight regain after GLP-1 discontinuation is predictable and manageable.",
  claimMapId: "cmap-abc",
  brandId: "freshproof",
  topic: "GLP-1 drug discontinuation and patient weight regain",
  acceptedClaims: [acceptedClaim],
};

describe("POST /api/editorial-outline", () => {
  const originalApiKey = process.env.PIONEER_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.PIONEER_API_KEY;
  });

  afterEach(() => {
    process.env.PIONEER_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it("returns 400 when thesis is missing", async () => {
    const res = await POST(makeRequest({ acceptedClaims: [acceptedClaim] }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when acceptedClaims is empty", async () => {
    const res = await POST(makeRequest({ thesis: "some thesis", acceptedClaims: [] }));
    expect(res.status).toBe(400);
  });

  it("returns a mock outline when Pioneer is not configured", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("mock");
    expect(data.outline).toBeDefined();
    expect(data.outline.thesis).toBeTruthy();
    expect(Array.isArray(data.outline.sections)).toBe(true);
    expect(data.outline.sections.length).toBeGreaterThan(0);
    expect(Array.isArray(data.outline.takeawayTable)).toBe(true);
    expect(data.outline.status).toBe("draft");
  });

  it("returns a Pioneer outline when configured", async () => {
    process.env.PIONEER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    thesis: "Weight regain is predictable.",
                    sections: [
                      {
                        heading: "The Mechanism",
                        notes: "Appetite suppression reverts.",
                        claimIds: [],
                        evidenceLabels: ["mechanism"],
                      },
                    ],
                    takeawayTable: [
                      {
                        finding: "Two-thirds weight regain in one year",
                        evidenceLabel: "rct-meta-analysis",
                        source: "STEP 4",
                      },
                    ],
                    citationPlan: "Cite STEP 4.",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("pioneer");
    expect(data.outline.sections[0].heading).toBe("The Mechanism");
    expect(data.outline.status).toBe("draft");
  });

  it("normalizes object-shaped takeaway sources from Pioneer before returning UI data", async () => {
    process.env.PIONEER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    thesis: "Weight regain evidence needs a real-world section.",
                    sections: [
                      {
                        heading: "Clinical Practice Evidence",
                        notes: "Cover real-world discontinuation patterns.",
                        claimIds: [],
                        evidenceLabels: ["primary-source"],
                      },
                    ],
                    takeawayTable: [
                      {
                        finding: "Patients often restart or switch obesity treatments after discontinuation.",
                        evidenceLabel: "primary-source",
                        source: {
                          primarySources: ["Gasoyan et al. 2026"],
                          secondarySources: ["Cleveland Clinic summary"],
                          citationStrategy: "Use PubMed DOI first.",
                        },
                      },
                    ],
                    citationPlan: "Cite Gasoyan et al. before summaries.",
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(data.provider).toBe("pioneer");
    expect(data.outline.takeawayTable[0].source).toBe(
      "Gasoyan et al. 2026; Cleveland Clinic summary; Use PubMed DOI first."
    );
  });

  it("normalizes object-shaped citation plans from Pioneer before returning UI data", async () => {
    process.env.PIONEER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    thesis: "Weight regain evidence needs citation discipline.",
                    sections: [
                      {
                        heading: "Citation Standards",
                        notes: "Use primary sources before summaries.",
                        claimIds: [],
                        evidenceLabels: ["primary-source"],
                      },
                    ],
                    takeawayTable: [],
                    citationPlan: {
                      primarySources: ["Gasoyan et al. 2026", "STEP 4 extension"],
                      citationStyle: "Markdown footnotes",
                      evidenceHierarchy: "Primary cohort and RCT evidence first",
                      caveatsHandling: "Separate real-world variability from RCT regain averages",
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(data.provider).toBe("pioneer");
    expect(data.outline.citationPlan).toBe(
      "Gasoyan et al. 2026; STEP 4 extension; Markdown footnotes; Primary cohort and RCT evidence first; Separate real-world variability from RCT regain averages"
    );
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

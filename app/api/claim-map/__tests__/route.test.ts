import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/claim-map/route";
import { makeSourceRecord } from "@/lib/domain";

function makeRequest(body: object): NextRequest {
  return new Request("http://localhost/api/claim-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const acceptedSource = makeSourceRecord({
  url: "https://pubmed.ncbi.nlm.nih.gov/35441470/",
  title: "STEP 4 extension: weight regain after semaglutide withdrawal",
  evidenceLabel: "rct-meta-analysis",
  relevanceScore: 5,
  useCase: "Supports claim about weight regain after discontinuation",
});

const validBody = {
  topic: "GLP-1 drug discontinuation and patient weight regain",
  thesis: "Weight regain is predictable and manageable.",
  brandId: "freshproof",
  acceptedSources: [{ ...acceptedSource, status: "accepted" }],
};

describe("POST /api/claim-map", () => {
  const originalApiKey = process.env.PIONEER_API_KEY;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.PIONEER_API_KEY;
  });

  afterEach(() => {
    process.env.PIONEER_API_KEY = originalApiKey;
    vi.unstubAllGlobals();
  });

  it("returns 400 when topic is missing", async () => {
    const res = await POST(makeRequest({ thesis: "some thesis" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when acceptedSources is empty or missing", async () => {
    const res = await POST(makeRequest({ topic: "topic", thesis: "thesis", acceptedSources: [] }));
    expect(res.status).toBe(400);
  });

  it("returns mock claims when Pioneer is not configured", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.provider).toBe("mock");
    expect(Array.isArray(data.claims)).toBe(true);
    expect(data.claims.length).toBeGreaterThan(0);

    for (const claim of data.claims) {
      expect(claim).toHaveProperty("id");
      expect(claim).toHaveProperty("text");
      expect(claim).toHaveProperty("evidenceLabel");
      expect(claim).toHaveProperty("confidence");
      expect(claim).toHaveProperty("sourceIds");
      expect(claim.status).toBe("unreviewed");
    }
  });

  it("attaches sourceIds referencing the passed accepted sources", async () => {
    const res = await POST(makeRequest(validBody));
    const data = await res.json();
    const allSourceIds = data.claims.flatMap((c: { sourceIds: string[] }) => c.sourceIds);
    expect(allSourceIds.some((id: string) => id === acceptedSource.id)).toBe(true);
  });

  it("returns claims from Pioneer when configured", async () => {
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify([
                    {
                      text: "Most patients regain significant weight within one year of stopping semaglutide.",
                      evidenceLabel: "rct-meta-analysis",
                      confidence: "high",
                      caveats: "Based on STEP 4 extension data.",
                      sourceIds: [acceptedSource.id],
                    },
                  ]),
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
    expect(data.claims).toHaveLength(1);
    expect(data.claims[0].status).toBe("unreviewed");
    expect(data.claims[0].evidenceLabel).toBe("rct-meta-analysis");
  });

  it("falls back to mock when Pioneer fails", async () => {
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("error", { status: 502 })));

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(data.provider).toBe("mock");
    expect(data.warning).toBeTruthy();
  });

  it("falls back to mock when Pioneer returns unparseable content", async () => {
    process.env.PIONEER_API_KEY = "test-pioneer-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: "not json" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const res = await POST(makeRequest(validBody));
    const data = await res.json();

    expect(data.provider).toBe("mock");
  });
});

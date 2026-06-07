/**
 * E2E-style integration test: full MVP research pipeline flow.
 *
 * Tests the complete sequence without mocking the route handlers:
 * research-brief → (human accept) → claim-map → (human accept) → editorial-outline → long-form-draft
 *
 * All routes run with no PIONEER_API_KEY so we exercise the deterministic mock path.
 * The sequence validates that the output of each step is compatible as input to the next.
 */
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as researchBriefPOST } from "@/app/api/research-brief/route";
import { POST as claimMapPOST } from "@/app/api/claim-map/route";
import { POST as editorialOutlinePOST } from "@/app/api/editorial-outline/route";
import { POST as longFormDraftPOST } from "@/app/api/long-form-draft/route";
import { POST as generateDraftPOST } from "@/app/api/generate-draft/route";
import type { SourceRecord, Claim, EditorialOutline } from "@/lib/domain";

function makeRequest(url: string, body: object): NextRequest {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

describe("MVP flow: full research pipeline (mock mode)", () => {
  const originalKey = process.env.PIONEER_API_KEY;

  beforeEach(() => {
    delete process.env.PIONEER_API_KEY;
  });

  afterEach(() => {
    process.env.PIONEER_API_KEY = originalKey;
  });

  it("completes source discovery → claim map → outline → long-form draft in sequence", async () => {
    // Step 1: Source discovery
    const step1Res = await researchBriefPOST(
      makeRequest("http://localhost/api/research-brief", {
        topic: "GLP-1 drug discontinuation and weight regain",
        audience: "Health professionals and informed patients",
        thesis: "Weight regain after GLP-1 discontinuation is predictable.",
        depth: "rigorous",
        riskLevel: "high",
        brandId: "freshproof",
      })
    );
    expect(step1Res.status).toBe(200);
    const step1 = await step1Res.json();
    expect(step1.provider).toBe("mock");
    expect(Array.isArray(step1.sources)).toBe(true);
    expect(step1.sources.length).toBeGreaterThan(0);

    // Simulate human: accept all sources
    const acceptedSources: SourceRecord[] = (step1.sources as SourceRecord[]).map((s) => ({
      ...s,
      status: "accepted" as const,
    }));

    // Step 2: Claim map
    const step2Res = await claimMapPOST(
      makeRequest("http://localhost/api/claim-map", {
        topic: "GLP-1 drug discontinuation and weight regain",
        thesis: "Weight regain after GLP-1 discontinuation is predictable.",
        brandId: "freshproof",
        acceptedSources,
      })
    );
    expect(step2Res.status).toBe(200);
    const step2 = await step2Res.json();
    expect(step2.provider).toBe("mock");
    expect(Array.isArray(step2.claims)).toBe(true);
    expect(step2.claims.length).toBeGreaterThan(0);
    // All claims must enter as unreviewed — HITL constraint
    for (const claim of step2.claims as Claim[]) {
      expect(claim.status).toBe("unreviewed");
    }

    // Simulate human: accept all claims
    const acceptedClaims: Claim[] = (step2.claims as Claim[]).map((c) => ({
      ...c,
      status: "accepted" as const,
    }));

    // Step 3: Editorial outline
    const step3Res = await editorialOutlinePOST(
      makeRequest("http://localhost/api/editorial-outline", {
        thesis: "Weight regain after GLP-1 discontinuation is predictable and manageable.",
        claimMapId: "cmap-e2e",
        brandId: "freshproof",
        topic: "GLP-1 drug discontinuation and weight regain",
        acceptedClaims,
      })
    );
    expect(step3Res.status).toBe(200);
    const step3 = await step3Res.json();
    expect(step3.provider).toBe("mock");
    expect(step3.outline).toBeDefined();
    expect(step3.outline.status).toBe("draft");
    expect(step3.outline.sections.length).toBeGreaterThan(0);
    expect(step3.outline.takeawayTable.length).toBeGreaterThan(0);

    // Simulate human: approve outline
    const approvedOutline: EditorialOutline = { ...step3.outline, status: "approved" };

    // Step 4: Long-form draft
    const step4Res = await longFormDraftPOST(
      makeRequest("http://localhost/api/long-form-draft", {
        outline: approvedOutline,
        acceptedClaims,
        brandId: "freshproof",
      })
    );
    expect(step4Res.status).toBe(200);
    const step4 = await step4Res.json();
    expect(step4.provider).toBe("mock");
    expect(typeof step4.draft).toBe("string");
    expect(step4.draft.length).toBeGreaterThan(100);
    // Draft must reference the thesis or topic
    expect(step4.draft.toLowerCase()).toMatch(/weight|regain|glp/i);
    // Draft must include footnote-style citation
    expect(step4.draft).toMatch(/\[/);
  });
});

describe("MVP flow: Corvo Labs idea → blog draft (mock mode)", () => {
  const originalKey = process.env.PIONEER_API_KEY;

  beforeEach(() => {
    delete process.env.PIONEER_API_KEY;
  });

  afterEach(() => {
    process.env.PIONEER_API_KEY = originalKey;
  });

  const corvoIdea = {
    id: "idea-corvo-golden-sets",
    brandId: "corvo",
    title: "Golden sets and evals for trustworthy claim validation",
    entries: [{ id: "e1", content: "Rigorous, human-reviewed golden sets.", createdAt: "2026-06-05T00:00:00.000Z" }],
    tags: ["AI evaluation", "claim validation"],
    status: "draft",
    linkedPostIds: [],
  };

  it("generates a blog variant for the default Corvo Labs idea", async () => {
    const res = await generateDraftPOST(
      makeRequest("http://localhost/api/generate-draft", {
        idea: corvoIdea,
        channel: "corvo-blog",
        voicePackMarkdown: "# Corvo Labs Voice\n\nDirect. Evidence-grounded. No filler.",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.draft).toBe("string");
    expect(data.draft.length).toBeGreaterThan(50);
  });

  it("generates a LinkedIn variant for the default Corvo Labs idea", async () => {
    const res = await generateDraftPOST(
      makeRequest("http://localhost/api/generate-draft", {
        idea: corvoIdea,
        channel: "linkedin",
        voicePackMarkdown: "# Corvo Labs Voice\n\nDirect. Evidence-grounded.",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.draft).toBe("string");
    expect(data.draft.length).toBeGreaterThan(0);
  });
});

describe("Failure mode: missing required fields", () => {
  it("research-brief returns 400 without topic", async () => {
    const res = await researchBriefPOST(
      makeRequest("http://localhost/api/research-brief", { audience: "professionals" })
    );
    expect(res.status).toBe(400);
  });

  it("claim-map returns 400 with empty acceptedSources", async () => {
    const res = await claimMapPOST(
      makeRequest("http://localhost/api/claim-map", {
        topic: "GLP-1",
        acceptedSources: [],
      })
    );
    expect(res.status).toBe(400);
  });

  it("editorial-outline returns 400 without thesis", async () => {
    const res = await editorialOutlinePOST(
      makeRequest("http://localhost/api/editorial-outline", {
        acceptedClaims: [{ id: "c1", text: "a claim", status: "accepted" }],
      })
    );
    expect(res.status).toBe(400);
  });

  it("long-form-draft returns 400 with empty acceptedClaims", async () => {
    const res = await longFormDraftPOST(
      makeRequest("http://localhost/api/long-form-draft", {
        outline: { thesis: "a thesis", sections: [], takeawayTable: [], status: "approved" },
        acceptedClaims: [],
      })
    );
    expect(res.status).toBe(400);
  });
});

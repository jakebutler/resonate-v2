import { describe, expect, it } from "vitest";
import {
  CLAIM_STATUS_LABELS,
  CLAIM_STATUSES,
  makeClaim,
  makeClaimMap,
  makeSourceRecord,
  type Claim,
  type ClaimStatus,
} from "@/lib/domain";

describe("claim map types and helpers", () => {
  const sampleSource = makeSourceRecord({
    url: "https://pubmed.ncbi.nlm.nih.gov/35441470/",
    title: "STEP 4 extension: weight regain after semaglutide withdrawal",
    evidenceLabel: "rct-meta-analysis",
    relevanceScore: 5,
    useCase: "Supports claim about weight regain rate after discontinuation",
  });

  describe("CLAIM_STATUSES", () => {
    it("covers all expected status values", () => {
      const expected: ClaimStatus[] = [
        "unreviewed",
        "accepted",
        "needs-revision",
        "unsupported",
        "too-risky",
        "out-of-scope",
      ];
      expect(CLAIM_STATUSES).toEqual(expect.arrayContaining(expected));
      expect(CLAIM_STATUSES).toHaveLength(expected.length);
    });

    it("has a label for every status", () => {
      for (const status of CLAIM_STATUSES) {
        expect(CLAIM_STATUS_LABELS[status]).toBeTruthy();
      }
    });
  });

  describe("makeClaim", () => {
    it("creates a claim with required fields and defaults", () => {
      const claim = makeClaim({
        text: "Most patients regain weight within one year of stopping semaglutide.",
        sourceIds: [sampleSource.id],
        evidenceLabel: "rct-meta-analysis",
        confidence: "high",
      });

      expect(claim.id).toMatch(/^claim-/);
      expect(claim.status).toBe("unreviewed");
      expect(claim.text).toContain("semaglutide");
      expect(claim.evidenceLabel).toBe("rct-meta-analysis");
      expect(claim.confidence).toBe("high");
      expect(claim.sourceIds).toContain(sampleSource.id);
    });

    it("preserves optional caveats and reviewer notes", () => {
      const claim = makeClaim({
        text: "Structured tapering reduces regain.",
        sourceIds: [],
        evidenceLabel: "practice-principle",
        confidence: "medium",
        caveats: "Limited RCT data; largely expert opinion.",
        reviewerNotes: "Check OMA guideline section 4.2.",
      });

      expect(claim.caveats).toBe("Limited RCT data; largely expert opinion.");
      expect(claim.reviewerNotes).toBe("Check OMA guideline section 4.2.");
    });
  });

  describe("makeClaimMap", () => {
    it("creates a claim map with required fields and empty claims array", () => {
      const map = makeClaimMap({
        brandId: "freshproof",
        topic: "GLP-1 discontinuation and weight regain",
        thesis: "Weight regain is predictable and manageable.",
      });

      expect(map.id).toMatch(/^cmap-/);
      expect(map.claims).toEqual([]);
      expect(map.status).toBe("building");
      expect(map.topic).toBe("GLP-1 discontinuation and weight regain");
      expect(map.thesis).toBe("Weight regain is predictable and manageable.");
    });

    it("sets createdAt and updatedAt to the same ISO string", () => {
      const map = makeClaimMap({
        brandId: "freshproof",
        topic: "topic",
        thesis: "thesis",
      });
      expect(map.createdAt).toBe(map.updatedAt);
    });
  });

  describe("Claim status transitions", () => {
    it("a claim starts as unreviewed and supports all target statuses", () => {
      const base = makeClaim({
        text: "Test claim.",
        sourceIds: [],
        evidenceLabel: "expert-practice",
        confidence: "low",
      });
      expect(base.status).toBe("unreviewed");

      const transitions: ClaimStatus[] = [
        "accepted",
        "needs-revision",
        "unsupported",
        "too-risky",
        "out-of-scope",
      ];
      for (const s of transitions) {
        const updated: Claim = { ...base, status: s };
        expect(updated.status).toBe(s);
      }
    });

    it("only accepted claims should feed into draft generation", () => {
      const claims: Claim[] = [
        { ...makeClaim({ text: "A", sourceIds: [], evidenceLabel: "rct-meta-analysis", confidence: "high" }), status: "accepted" },
        { ...makeClaim({ text: "B", sourceIds: [], evidenceLabel: "mechanism", confidence: "medium" }), status: "unsupported" },
        { ...makeClaim({ text: "C", sourceIds: [], evidenceLabel: "expert-practice", confidence: "low" }), status: "too-risky" },
        { ...makeClaim({ text: "D", sourceIds: [], evidenceLabel: "primary-source", confidence: "high" }), status: "accepted" },
      ];

      const forDraft = claims.filter((c) => c.status === "accepted");
      expect(forDraft).toHaveLength(2);
      expect(forDraft.map((c) => c.text)).toEqual(["A", "D"]);
    });
  });
});

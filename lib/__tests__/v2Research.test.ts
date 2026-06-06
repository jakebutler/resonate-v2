import { describe, expect, it } from "vitest";
import {
  classifySourceQuality,
  EVIDENCE_LABEL_DESCRIPTIONS,
  EVIDENCE_LABELS,
  makeResearchBrief,
  makeSourceRecord,
  type V2EvidenceLabel,
  type V2SourceRecord,
} from "@/lib/v2";

describe("research editorial pipeline types and helpers", () => {
  describe("EVIDENCE_LABELS", () => {
    it("covers all expected evidence label values", () => {
      const expected: V2EvidenceLabel[] = [
        "rct-meta-analysis",
        "mechanism",
        "expert-practice",
        "practice-principle",
        "primary-source",
        "weaker-support",
      ];
      expect(EVIDENCE_LABELS).toEqual(expect.arrayContaining(expected));
      expect(EVIDENCE_LABELS).toHaveLength(expected.length);
    });

    it("has a description entry for every label", () => {
      for (const label of EVIDENCE_LABELS) {
        expect(EVIDENCE_LABEL_DESCRIPTIONS[label]).toBeTruthy();
      }
    });
  });

  describe("classifySourceQuality", () => {
    it("returns strong for RCT/meta-analysis evidence", () => {
      expect(classifySourceQuality("rct-meta-analysis", 5)).toBe("strong");
    });

    it("returns strong for primary-source with high relevance", () => {
      expect(classifySourceQuality("primary-source", 4)).toBe("strong");
    });

    it("returns moderate for expert-practice", () => {
      expect(classifySourceQuality("expert-practice", 3)).toBe("moderate");
    });

    it("returns moderate for mechanism evidence with high relevance", () => {
      expect(classifySourceQuality("mechanism", 4)).toBe("moderate");
    });

    it("returns weak for weaker-support regardless of relevance", () => {
      expect(classifySourceQuality("weaker-support", 5)).toBe("weak");
    });

    it("returns weak for any label with relevance score of 1", () => {
      expect(classifySourceQuality("rct-meta-analysis", 1)).toBe("weak");
    });

    it("returns moderate for practice-principle with moderate relevance", () => {
      expect(classifySourceQuality("practice-principle", 3)).toBe("moderate");
    });
  });

  describe("makeSourceRecord", () => {
    it("creates a source record with defaults and required fields", () => {
      const record = makeSourceRecord({
        url: "https://pubmed.ncbi.nlm.nih.gov/12345",
        title: "GLP-1 Receptor Agonists and Weight Loss Maintenance",
        evidenceLabel: "rct-meta-analysis",
        relevanceScore: 5,
        useCase: "Supports claim about discontinuation-driven weight regain",
      });

      expect(record.id).toMatch(/^src-/);
      expect(record.status).toBe("unvetted");
      expect(record.addedBy).toBe("agent");
      expect(record.evidenceLabel).toBe("rct-meta-analysis");
      expect(record.qualityRating).toBe("strong");
    });

    it("allows user-added sources with reviewer notes", () => {
      const record = makeSourceRecord({
        url: "https://nejm.org/article",
        title: "SCALE trial follow-up",
        evidenceLabel: "rct-meta-analysis",
        relevanceScore: 5,
        useCase: "Primary SCALE trial data",
        addedBy: "user",
        reviewerNotes: "Verified independently via DOI",
      });

      expect(record.addedBy).toBe("user");
      expect(record.reviewerNotes).toBe("Verified independently via DOI");
    });

    it("sets domain from URL when not provided", () => {
      const record = makeSourceRecord({
        url: "https://pubmed.ncbi.nlm.nih.gov/99999",
        title: "Example study",
        evidenceLabel: "mechanism",
        relevanceScore: 3,
        useCase: "Mechanism support",
      });

      expect(record.domain).toBe("pubmed.ncbi.nlm.nih.gov");
    });
  });

  describe("makeResearchBrief", () => {
    const minimal = {
      brandId: "freshproof" as const,
      topic: "GLP-1 drug discontinuation and patient weight regain",
      audience: "Healthcare providers and informed patients",
      thesis: "Weight regain after GLP-1 discontinuation is predictable and manageable with structured tapering",
      depth: "rigorous" as const,
      riskLevel: "high" as const,
      targetOutputs: ["long-form blog", "linkedin post"],
    };

    it("creates a brief with required fields and defaults", () => {
      const brief = makeResearchBrief(minimal);

      expect(brief.id).toMatch(/^brief-/);
      expect(brief.brandId).toBe("freshproof");
      expect(brief.status).toBe("drafting");
      expect(brief.sources).toEqual([]);
      expect(brief.depth).toBe("rigorous");
      expect(brief.riskLevel).toBe("high");
    });

    it("preserves all target outputs", () => {
      const brief = makeResearchBrief(minimal);
      expect(brief.targetOutputs).toEqual(["long-form blog", "linkedin post"]);
    });

    it("sets createdAt and updatedAt to the same ISO string initially", () => {
      const brief = makeResearchBrief(minimal);
      expect(brief.createdAt).toBe(brief.updatedAt);
      expect(new Date(brief.createdAt).getFullYear()).toBe(new Date().getFullYear());
    });
  });

  describe("V2SourceRecord status transitions", () => {
    it("a source starts as unvetted and can be accepted", () => {
      const record = makeSourceRecord({
        url: "https://example.com",
        title: "Test source",
        evidenceLabel: "expert-practice",
        relevanceScore: 3,
        useCase: "Background",
      });

      expect(record.status).toBe("unvetted");

      const accepted: V2SourceRecord = { ...record, status: "accepted" };
      expect(accepted.status).toBe("accepted");

      const rejected: V2SourceRecord = { ...record, status: "rejected" };
      expect(rejected.status).toBe("rejected");

      const flagged: V2SourceRecord = { ...record, status: "flagged" };
      expect(flagged.status).toBe("flagged");
    });
  });
});

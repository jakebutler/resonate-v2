import { describe, expect, it } from "vitest";
import {
  makeClaim,
  makeClaimMap,
  makeEditorialOutline,
  makeOutlineSection,
  makeTakeawayRow,
  type EditorialOutline,
  type OutlineStatus,
} from "@/lib/domain";

describe("editorial outline types and helpers", () => {
  const acceptedClaim = {
    ...makeClaim({
      text: "Most patients regain weight within one year of stopping semaglutide.",
      sourceIds: ["src-abc"],
      evidenceLabel: "rct-meta-analysis" as const,
      confidence: "high" as const,
      caveats: "Based on STEP 4 extension data.",
    }),
    status: "accepted" as const,
  };

  const claimMap = {
    ...makeClaimMap({ brandId: "freshproof", topic: "GLP-1 discontinuation", thesis: "Weight regain is predictable." }),
    claims: [acceptedClaim],
    status: "reviewed" as const,
  };

  describe("makeOutlineSection", () => {
    it("creates a section with required fields", () => {
      const section = makeOutlineSection({
        heading: "Why Weight Returns After Stopping GLP-1",
        notes: "Explain mechanism: appetite suppression reverts.",
        claimIds: [acceptedClaim.id],
        evidenceLabels: ["rct-meta-analysis"],
      });

      expect(section.heading).toBe("Why Weight Returns After Stopping GLP-1");
      expect(section.claimIds).toContain(acceptedClaim.id);
      expect(section.evidenceLabels).toContain("rct-meta-analysis");
    });
  });

  describe("makeTakeawayRow", () => {
    it("creates a takeaway row with required fields", () => {
      const row = makeTakeawayRow({
        finding: "Two-thirds of lost weight is regained within one year",
        evidenceLabel: "rct-meta-analysis",
        source: "STEP 4 extension (PubMed 2022)",
      });

      expect(row.finding).toContain("Two-thirds");
      expect(row.evidenceLabel).toBe("rct-meta-analysis");
      expect(row.source).toContain("STEP 4");
    });
  });

  describe("makeEditorialOutline", () => {
    it("creates an outline with required fields and draft status", () => {
      const outline = makeEditorialOutline({
        claimMapId: claimMap.id,
        brandId: "freshproof",
        thesis: "Weight regain after GLP-1 discontinuation is predictable and manageable.",
        sections: [],
        takeawayTable: [],
        citationPlan: "Cite STEP 4 for weight regain, SELECT for cardiometabolic reversal.",
      });

      expect(outline.id).toMatch(/^outline-/);
      expect(outline.status).toBe("draft");
      expect(outline.thesis).toContain("predictable");
      expect(outline.claimMapId).toBe(claimMap.id);
    });

    it("sets createdAt and updatedAt to the same value", () => {
      const outline = makeEditorialOutline({
        claimMapId: claimMap.id,
        brandId: "freshproof",
        thesis: "Thesis.",
        sections: [],
        takeawayTable: [],
        citationPlan: "Citation plan.",
      });
      expect(outline.createdAt).toBe(outline.updatedAt);
    });

    it("supports outline status transitions", () => {
      const outline = makeEditorialOutline({
        claimMapId: claimMap.id,
        brandId: "freshproof",
        thesis: "Thesis.",
        sections: [],
        takeawayTable: [],
        citationPlan: "Citation plan.",
      });

      expect(outline.status).toBe("draft");

      const statuses: OutlineStatus[] = ["draft", "approved", "generating-draft"];
      for (const s of statuses) {
        const updated: EditorialOutline = { ...outline, status: s };
        expect(updated.status).toBe(s);
      }
    });
  });
});

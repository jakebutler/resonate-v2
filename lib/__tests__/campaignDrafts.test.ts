import { describe, expect, it } from "vitest";
import {
  composeDraftSet,
  composePlaceholderDraft,
  containsPlaceholderTokens,
} from "@/lib/campaignDrafts";
import { CAMPAIGN_PRESETS } from "@/lib/campaignShapes";

const baseSlot = {
  seq: 1,
  role: "pillar" as const,
  channel: "corvo-blog",
  mediaType: "article",
  title: "Acting without observation",
  angle: "Map reasoning→plan onto the publish pipeline",
  ideaText: "An approval gate without observation is acting without ReAct.",
  excerptCitations: ["corpus://corvo/abc#excerpt-1", "corpus://corvo/abc#excerpt-2"],
};

describe("composePlaceholderDraft", () => {
  it("composes visibly placeholder-grade copy with bracketed tokens", () => {
    const draft = composePlaceholderDraft(baseSlot);
    expect(containsPlaceholderTokens(draft.content)).toBe(true);
    expect(draft.content).toMatch(/\[THESIS:/);
    expect(draft.title).toBe("Acting without observation");
  });

  it("cites the corpus excerpts the idea drew from (D-6 provenance)", () => {
    const draft = composePlaceholderDraft(baseSlot);
    expect(draft.content).toContain("[EVIDENCE: corpus://corvo/abc#excerpt-1]");
    expect(draft.content).toContain("corpus://corvo/abc#excerpt-2");
  });

  it("includes the linked idea's text rather than inventing claims", () => {
    const draft = composePlaceholderDraft(baseSlot);
    expect(draft.content).toContain(baseSlot.ideaText!);
  });

  it("renders role-appropriate structures for each role", () => {
    for (const role of ["pillar", "hook", "satellite", "cta", "recap"] as const) {
      const draft = composePlaceholderDraft({ ...baseSlot, role });
      expect(containsPlaceholderTokens(draft.content)).toBe(true);
    }
    const script = composePlaceholderDraft({
      ...baseSlot,
      role: "satellite",
      mediaType: "script",
    });
    expect(script.content).toMatch(/COLD OPEN/);
    const essay = composePlaceholderDraft({
      ...baseSlot,
      role: "satellite",
      mediaType: "essay",
    });
    expect(essay.content).toMatch(/## /);
  });

  it("falls back to explicit tokens when an idea is unlinked-but-titled", () => {
    const draft = composePlaceholderDraft({
      seq: 2,
      role: "cta",
      channel: "linkedin",
      mediaType: "post",
    });
    expect(draft.content).toMatch(/\[CTA:/);
    expect(draft.content).toMatch(/\[EVIDENCE:/);
  });
});

describe("composeDraftSet", () => {
  it("generates the whole set in publishing sequence (D-12 set-level)", () => {
    const standard = CAMPAIGN_PRESETS.standard.slots.map((slot, index) => ({
      seq: index + 1,
      role: slot.role,
      channel: slot.channel,
      mediaType: slot.mediaType,
      ideaText: `Idea ${index + 1}`,
      excerptCitations: [`corpus://corvo/abc#excerpt-${index + 1}`],
    }));
    const drafts = composeDraftSet(standard);
    expect(drafts).toHaveLength(5);
    expect(drafts.every((draft) => containsPlaceholderTokens(draft.content))).toBe(
      true
    );
  });

  it("sorts by seq regardless of input order", () => {
    const drafts = composeDraftSet([
      { seq: 2, role: "hook", channel: "x", mediaType: "post", ideaText: "two" },
      { seq: 1, role: "pillar", channel: "corvo-blog", mediaType: "article", ideaText: "one" },
    ]);
    expect(drafts[0].content).toContain("one");
  });
});

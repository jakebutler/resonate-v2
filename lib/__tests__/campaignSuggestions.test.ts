import { describe, expect, it } from "vitest";
import { suggestCampaignIdeas } from "@/lib/campaignSuggestions";
import { parseCorpusCitation } from "@/lib/campaignGrounding";

const excerpts = [
  {
    seq: 1,
    text: "We explore the use of large language models to generate reasoning traces and task-specific actions in an interleaved manner.",
    provenance: "p.1 · Abstract",
    citation: "corpus://corvo/abc123#excerpt-1",
  },
  {
    seq: 2,
    text: "ReAct outperforms the strongest imitation-learning baseline on HotpotQA.",
    provenance: "p.6 · HotpotQA results",
    citation: "corpus://corvo/abc123#excerpt-2",
  },
  {
    seq: 3,
    text: "Grounding in retrieved evidence reduces hallucination relative to reasoning-only chains of thought.",
    provenance: "p.6 · Analysis",
    citation: "corpus://corvo/abc123#excerpt-3",
  },
];

describe("suggestCampaignIdeas", () => {
  it("returns no suggestions for an empty corpus", () => {
    expect(suggestCampaignIdeas([])).toEqual([]);
  });

  it("produces flavored ideas that cite real corpus excerpts", () => {
    const suggestions = suggestCampaignIdeas(excerpts);
    expect(suggestions.length).toBeGreaterThanOrEqual(4);
    const flavors = new Set(suggestions.map((suggestion) => suggestion.flavor));
    expect(flavors.has("opinion")).toBe(true);
    expect(flavors.has("insight")).toBe(true);
    expect(flavors.has("thought")).toBe(true);

    for (const suggestion of suggestions) {
      expect(suggestion.text.length).toBeGreaterThan(40);
      expect(suggestion.citations.length).toBeGreaterThan(0);
      for (const citation of suggestion.citations) {
        const parsed = parseCorpusCitation(citation);
        expect(parsed).not.toBeNull();
        expect(excerpts.map((excerpt) => excerpt.seq)).toContain(parsed!.seq);
      }
    }
  });

  it("is deterministic for identical corpus input", () => {
    expect(suggestCampaignIdeas(excerpts)).toEqual(suggestCampaignIdeas(excerpts));
  });

  it("recycles excerpts when the corpus is short", () => {
    const single = suggestCampaignIdeas([excerpts[0]]);
    expect(single.length).toBeGreaterThanOrEqual(4);
    for (const suggestion of single) {
      for (const citation of suggestion.citations) {
        expect(parseCorpusCitation(citation)?.seq).toBe(1);
      }
    }
  });
});

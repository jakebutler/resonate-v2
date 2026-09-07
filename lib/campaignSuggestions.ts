import type { GroundingMode } from "@/lib/campaignGrounding";

export type SuggestionExcerptInput = {
  seq: number;
  text: string;
  provenance: string;
  citation: string;
};

export type IdeaFlavor = "opinion" | "insight" | "thought";

export type SuggestedIdea = {
  flavor: IdeaFlavor;
  title: string;
  text: string;
  citations: string[];
};

function firstClause(text: string, maxChars = 120): string {
  const clause = text.replace(/^…/, "").split(/(?<=[.!?])\s/)[0] ?? text;
  const trimmed = clause.trim();
  return trimmed.length > maxChars ? `${trimmed.slice(0, maxChars - 1)}…` : trimmed;
}

function keyPhrase(text: string): string {
  const words = text
    .replace(/^…/, "")
    .split(/\s+/)
    .filter((word) => word.length > 4)
    .slice(0, 4)
    .map((word) => word.replace(/[^a-zA-Z-]/g, ""))
    .filter(Boolean);
  return words.join(" ") || "this finding";
}

/**
 * Deterministic placeholder suggestion engine (gated mock AI).
 * Real inference arrives with the Pioneer wiring (D-21); until then every
 * suggestion is a template over real corpus excerpts — nothing is invented
 * beyond the framing, and every idea cites the excerpts it drew from (D-6).
 */
export function suggestCampaignIdeas(
  excerpts: SuggestionExcerptInput[]
): SuggestedIdea[] {
  if (excerpts.length === 0) return [];

  const suggestions: SuggestedIdea[] = [];
  const primary = excerpts[0];
  const second = excerpts[1] ?? excerpts[0];
  const third = excerpts[2] ?? excerpts[0];
  const fourth = excerpts[3] ?? excerpts[0];
  const fifth = excerpts[4] ?? excerpts[0];

  suggestions.push({
    flavor: "opinion",
    title: `${keyPhrase(firstClause(second.text))} deserves the pillar treatment`,
    text: `The corpus leads with a claim worth anchoring on: "${firstClause(second.text)}" Our take: this is the thesis the whole campaign should hang from, not a footnote.`,
    citations: [second.citation, primary.citation],
  });
  suggestions.push({
    flavor: "insight",
    title: `Pattern worth naming from ${primary.provenance}`,
    text: `Reading "${firstClause(primary.text)}" side by side with "${firstClause(third.text)}" surfaces a pattern: the mechanism matters more than the metric. Name the pattern and the audience carries it away.`,
    citations: [primary.citation, third.citation],
  });
  suggestions.push({
    flavor: "opinion",
    title: `Say the quiet part about ${keyPhrase(fourth.text)}`,
    text: `Most coverage stops at "${firstClause(fourth.text)}" — but the sharper opinion is that this changes how practitioners should act, not just what they measure.`,
    citations: [fourth.citation],
  });
  suggestions.push({
    flavor: "insight",
    title: `An extractable answer hides in ${primary.provenance}`,
    text: `"${firstClause(fifth.text)}" is already phrased the way a search audience would ask it. That makes it an answer-engine fixture, not just prose.`,
    citations: [fifth.citation],
  });
  suggestions.push({
    flavor: "thought",
    title: `Open thread: what would change if ${keyPhrase(third.text)} were true everywhere?`,
    text: `A thought to park in the session: "${firstClause(third.text)}" If that held across the board, the workflow consequences would compound — worth a hook, maybe a follow-up campaign.`,
    citations: [third.citation],
  });

  return suggestions;
}

export type SuggestionGateInput = {
  mode: GroundingMode;
  mockAcknowledged: boolean;
  liveConfigured: boolean;
};

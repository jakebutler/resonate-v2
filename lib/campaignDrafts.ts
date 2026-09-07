import type { SlotRole } from "@/lib/campaignShapes";

export type DraftSlotInput = {
  seq: number;
  role: SlotRole;
  channel: string;
  mediaType: string;
  title?: string;
  angle?: string;
  ideaText?: string;
  excerptCitations?: string[];
};

export type ComposedDraft = {
  title: string;
  content: string;
};

/**
 * Placeholder-grade set composition (D-12): bracketed tokens mark exactly what
 * the real skill pack would fill — no silent fabrication. Ideas and excerpts
 * supply the substance; the templates only frame it.
 */
export function composePlaceholderDraft(
  slot: DraftSlotInput
): ComposedDraft {
  const title =
    slot.title ||
    slot.ideaText?.slice(0, 80) ||
    `${slot.role} — ${slot.mediaType}`;
  const citations = slot.excerptCitations ?? [];
  const evidence =
    citations.length > 0
      ? citations.map((citation) => `[EVIDENCE: ${citation}]`).join(" ")
      : "[EVIDENCE: cite the corpus excerpt this claim draws from]";
  const ideaLine = slot.ideaText
    ? slot.ideaText
    : "[ANGLE: pull the linked idea's claim into this slot]";
  const angle = slot.angle ?? "[ANGLE: sharpen the angle for this slot]";

  switch (slot.role) {
    case "pillar": {
      const sections = [
        `## ${title}`,
        "",
        `${ideaLine}`,
        "",
        "[THESIS: state the campaign's core claim in one sentence — what should the reader believe by the end?]",
        "",
        "### Why it matters",
        "",
        `${angle}`,
        "",
        evidence,
        "",
        "### What to do with it",
        "",
        "[ANGLE: one practical implication per audience segment]",
        "",
        "[CLOSE: restate the thesis and hand off to the satellites' angles]",
      ].join("\n");
      return { title, content: sections };
    }
    case "hook":
      return {
        title,
        content: `${ideaLine} ${angle} [EVIDENCE: one number or receipt only]`.trim(),
      };
    case "cta":
      return {
        title,
        content: `[CTA: one ask — ${angle !== "[ANGLE: sharpen the angle for this slot]" ? angle : "name the single action this campaign drives"}] Grounding: ${evidence}`,
      };
    case "recap":
      return {
        title,
        content: `Recap: ${ideaLine} [ANGLE: restate the pillar claim + the satellite angles in one pass] ${evidence}`,
      };
    case "satellite":
    default: {
      if (slot.mediaType === "essay") {
        return {
          title,
          content: [
            `## ${title}`,
            "",
            ideaLine,
            "",
            "[THESIS: the satellite claim that supports — never repeats — the pillar]",
            "",
            angle,
            "",
            evidence,
          ].join("\n"),
        };
      }
      if (slot.mediaType === "script") {
        return {
          title,
          content: [
            `Script: ${title}`,
            "",
            "[COLD OPEN: 5-second hook on the core tension]",
            "",
            ideaLine,
            "",
            "[DEMO: walk the worked example]",
            "",
            angle,
            "",
            evidence,
            "",
            "[OUTRO: one line pointing to the pillar piece]",
          ].join("\n"),
        };
      }
      return {
        title,
        content: `${ideaLine} ${angle} ${evidence}`.trim(),
      };
    }
  }
}

export function composeDraftSet(slots: DraftSlotInput[]): ComposedDraft[] {
  return slots
    .slice()
    .sort((a, b) => a.seq - b.seq)
    .map(composePlaceholderDraft);
}

export const PLACEHOLDER_TOKEN_PATTERN = /\[[A-Z]+:[^\]]*\]/g;

export function containsPlaceholderTokens(content: string): boolean {
  // A fresh (non-global) regex per call: a global regex's lastIndex would
  // make repeated .test() calls alternate between matches.
  return /\[[A-Z]+:[^\]]*\]/.test(content);
}

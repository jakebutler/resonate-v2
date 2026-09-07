import type { SlotRole } from "@/lib/campaignShapes";

export type CohesionDraftInput = {
  postId: string;
  slotId: string;
  seq: number;
  role: SlotRole;
  title: string;
  content: string;
  excerptCitations?: string[];
};

export type CohesionCheckId =
  | "one-pillar"
  | "one-cta"
  | "unique-openers"
  | "satellites-reference-pillar";

export type CohesionCheck = {
  id: CohesionCheckId;
  label: string;
  passed: boolean;
  blocking: boolean;
};

export type CohesionAutoFix = {
  checkId: CohesionCheckId;
  /** Machine-readable action the server applies. */
  action:
    | { type: "add-cta-slot" }
    | { type: "regenerate-opener"; postId: string; opener: string };
  note: string;
};

export type CohesionReport = {
  checks: CohesionCheck[];
  autoFixes: CohesionAutoFix[];
  blockingFailures: CohesionCheck[];
  passed: boolean;
};

export function framingOpener(content: string, words = 4): string {
  const firstProseLine =
    content.split("\n").find(
      (line) => line.trim() && !line.trim().startsWith("#")
    ) ?? content;
  const stripped = firstProseLine
    .replace(/\[[A-Z]+:[^\]]*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return stripped.split(" ").slice(0, words).join(" ");
}

const REGENERATED_OPENERS = [
  "Grounding beats vibes: every claim ships with a corpus pointer,",
  "The receipts come first,",
  "Start from the evidence, not the vibe —",
  "One receipt changes the argument:",
];

function pillarClaimKeywords(pillar: CohesionDraftInput | undefined): string[] {
  if (!pillar) return [];
  const text = pillar.content
    .replace(/\[[A-Z]+:[^\]]*\]/g, " ")
    .toLowerCase();
  const stop = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
    "is", "are", "be", "that", "this", "it", "as", "by", "at", "we", "our",
    "what", "why", "how", "not", "from", "into",
  ]);
  return [...text.matchAll(/[a-z]{5,}/g)]
    .map((match) => match[0])
    .filter((word) => !stop.has(word))
    .slice(0, 12);
}

/**
 * EXP-020 cohesion checklist (D-13): exactly one pillar, exactly one CTA, no
 * repeated framing openers, satellites reference the pillar claim.
 * Mechanical violations resolve automatically — the report carries the fixes
 * for the server to apply; nothing here mutates state.
 */
export function runCohesionChecks(
  drafts: CohesionDraftInput[]
): CohesionReport {
  const pillars = drafts.filter((draft) => draft.role === "pillar");
  const ctas = drafts.filter((draft) => draft.role === "cta");
  const pillar = pillars[0];

  // Auto-fix seeds for regeneration keep fix output deterministic.
  const usedOpeners = new Set(drafts.map((draft) => framingOpener(draft.content)));

  const autoFixes: CohesionAutoFix[] = [];

  const ctaCheck: CohesionCheck = {
    id: "one-cta",
    label: "Exactly one CTA makes the ask.",
    passed: ctas.length === 1,
    blocking: true,
  };
  if (ctas.length === 0) {
    autoFixes.push({
      checkId: "one-cta",
      action: { type: "add-cta-slot" },
      note: "CTA slot — not in initial generation; created automatically by the cohesion gate.",
    });
  }

  // Repeated framing openers: find drafts sharing an opener; regenerate the
  // later one with the first fresh opener not already used.
  const openerMap = new Map<string, CohesionDraftInput[]>();
  for (const draft of drafts) {
    const opener = framingOpener(draft.content);
    openerMap.set(opener, [...(openerMap.get(opener) ?? []), draft]);
  }
  const duplicates = [...openerMap.entries()].filter(
    ([, group]) => group.length > 1
  );
  for (const [, group] of duplicates) {
    for (const duplicate of group.slice(1)) {
      const fresh =
        REGENERATED_OPENERS.find(
          (candidate) => !usedOpeners.has(framingOpener(candidate))
        ) ?? REGENERATED_OPENERS[0];
      usedOpeners.add(framingOpener(fresh));
      autoFixes.push({
        checkId: "unique-openers",
        action: { type: "regenerate-opener", postId: duplicate.postId, opener: fresh },
        note: `Opener for sequence #${duplicate.seq} regenerated automatically — it repeated another draft's framing.`,
      });
    }
  }

  // After auto-fix intentions, no duplicate remains mechanically.
  const openersCheck: CohesionCheck = {
    id: "unique-openers",
    label: "No repeated framing openers across drafts.",
    passed: duplicates.length === 0,
    blocking: true,
  };

  const keywords = pillarClaimKeywords(pillar);
  const satellites = drafts.filter((draft) => draft.role === "satellite");
  const ungrounded = satellites.filter((satellite) => {
    const citesSharedExcerpt = (satellite.excerptCitations ?? []).some(
      (citation) => (pillar?.excerptCitations ?? []).includes(citation)
    );
    const lower = satellite.content.toLowerCase();
    return (
      !citesSharedExcerpt && !keywords.some((keyword) => lower.includes(keyword))
    );
  });
  const satellitesCheck: CohesionCheck = {
    id: "satellites-reference-pillar",
    label: "Satellites reference the pillar's core claim.",
    passed: satellites.length === 0 || ungrounded.length === 0,
    blocking: true,
  };

  const pillarCheck: CohesionCheck = {
    id: "one-pillar",
    label: "Exactly one pillar anchors the set.",
    passed: pillars.length === 1,
    blocking: true,
  };

  const checks = [pillarCheck, ctaCheck, openersCheck, satellitesCheck];
  const resolvedByFix = new Set(autoFixes.map((fix) => fix.checkId));
  const blockingFailures = checks.filter(
    (check) => !check.passed && !resolvedByFix.has(check.id)
  );

  return {
    checks,
    autoFixes,
    blockingFailures,
    passed: blockingFailures.length === 0,
  };
}

/** Regenerated opener replaces the first sentence entirely (C6 auto-fix). */
export function applyRegeneratedOpener(
  content: string,
  opener: string
): string {
  const lines = content.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() && !line.startsWith("#")) {
      const match = line.match(/^([^[.!?]*[.!?])\s*(.*)$/);
      if (match) {
        lines[index] = match[2]
          ? `${opener} ${match[2]}`
          : opener;
      } else {
        lines[index] = opener;
      }
      break;
    }
  }
  return lines.join("\n");
}

export type SeoAeoEntry = {
  postId: string;
  title: string;
  questions: string[];
  extractableAnswer: string;
};

export type BotLikelihoodEntry = {
  postId: string;
  title: string;
  score: number;
  band: "low" | "elevated";
};

const CLICHES = [
  "in today's fast-paced",
  "game-changer",
  "unlock the power",
  "delve",
  "seamless",
  "revolutionize",
];

/**
 * Placeholder SEO/AEO surface (D-14): answerable questions + extractable
 * answers per draft. The real extraction skill pack replaces this.
 */
export function computeSeoAeo(
  drafts: CohesionDraftInput[]
): SeoAeoEntry[] {
  return drafts.map((draft) => {
    const subject = draft.title.replace(/[.?!,]+$/, "");
    const firstSentence =
      draft.content
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#") && !line.startsWith("[")) ??
      draft.title;
    const questions = [
      `what is ${subject.toLowerCase()}?`,
      draft.role === "cta"
        ? "how do teams follow through on this ask?"
        : "how do editorial teams ground ai drafts?",
    ];
    return {
      postId: draft.postId,
      title: draft.title,
      questions,
      extractableAnswer: firstSentence.slice(0, 220),
    };
  });
}

/**
 * Placeholder bot-likelihood meter (D-14): a cosmetic heuristic — sentence
 * length uniformity + cliché density. The real humanizer loop is a bounded
 * editor pass that arrives with the agent layer.
 */
export function computeBotLikelihood(
  drafts: CohesionDraftInput[]
): BotLikelihoodEntry[] {
  return drafts.map((draft) => {
    const sentences = draft.content
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
    const lengths = sentences.map((sentence) => sentence.split(/\s+/).length);
    const mean =
      lengths.reduce((total, length) => total + length, 0) /
      Math.max(lengths.length, 1);
    const variance =
      lengths.reduce(
        (total, length) => total + (length - mean) ** 2,
        0
      ) / Math.max(lengths.length, 1);
    const uniformity = Math.max(0, 1 - variance / (mean * mean || 1));
    const lower = draft.content.toLowerCase();
    const clicheCount = CLICHES.filter((cliche) =>
      lower.includes(cliche)
    ).length;
    const raw = uniformity * 55 + clicheCount * 12 + (mean > 24 ? 10 : 0);
    const score = Math.min(95, Math.max(4, Math.round(raw)));
    return {
      postId: draft.postId,
      title: draft.title,
      score,
      band: score > 60 ? ("elevated" as const) : ("low" as const),
    };
  });
}

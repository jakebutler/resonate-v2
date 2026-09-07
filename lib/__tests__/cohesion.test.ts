import { describe, expect, it } from "vitest";
import {
  applyRegeneratedOpener,
  computeBotLikelihood,
  computeSeoAeo,
  framingOpener,
  runCohesionChecks,
  type CohesionDraftInput,
} from "@/lib/cohesion";
import { composePlaceholderDraft } from "@/lib/campaignDrafts";

function makeDraft(
  overrides: Partial<CohesionDraftInput> & { seq: number; role: CohesionDraftInput["role"] }
): CohesionDraftInput {
  const composed = composePlaceholderDraft({
    seq: overrides.seq,
    role: overrides.role,
    channel: "linkedin",
    mediaType: "post",
    title: overrides.title ?? `Draft ${overrides.seq}`,
    ideaText: `Idea ${overrides.seq}: grounded claims need receipts and receipts need corpora.`,
    excerptCitations: overrides.excerptCitations ?? [
      `corpus://corvo/c1#excerpt-${overrides.seq}`,
    ],
  });
  return {
    postId: `post_${overrides.seq}`,
    slotId: `slot_${overrides.seq}`,
    title: composed.title,
    content: composed.content,
    ...overrides,
  };
}

const healthySet: CohesionDraftInput[] = [
  makeDraft({ seq: 1, role: "pillar", excerptCitations: ["corpus://corvo/c1#excerpt-1"] }),
  makeDraft({ seq: 2, role: "hook", excerptCitations: ["corpus://corvo/c1#excerpt-1"] }),
  makeDraft({ seq: 3, role: "satellite", excerptCitations: ["corpus://corvo/c1#excerpt-1"] }),
  makeDraft({ seq: 4, role: "satellite", excerptCitations: ["corpus://corvo/c1#excerpt-1"] }),
  makeDraft({ seq: 5, role: "recap", excerptCitations: ["corpus://corvo/c1#excerpt-1"] }),
  makeDraft({ seq: 6, role: "cta", excerptCitations: [] }),
];

describe("runCohesionChecks (EXP-020 / D-13)", () => {
  it("passes a cohesive set with exactly one pillar and one CTA", () => {
    const report = runCohesionChecks(healthySet);
    expect(report.checks.map((check) => check.passed)).not.toContain(false);
    expect(report.passed).toBe(true);
    expect(report.autoFixes).toHaveLength(0);
  });

  it("blocks on zero or multiple pillars with no mechanical fix", () => {
    const noPillar = runCohesionChecks(healthySet.slice(1));
    expect(noPillar.passed).toBe(false);
    const pillarCheck = noPillar.checks.find((check) => check.id === "one-pillar")!;
    expect(pillarCheck.passed).toBe(false);
    expect(noPillar.autoFixes.some((fix) => fix.checkId === "one-pillar")).toBe(false);

    const twoPillars = runCohesionChecks([
      ...healthySet,
      makeDraft({ seq: 7, role: "pillar" }),
    ]);
    expect(twoPillars.checks.find((check) => check.id === "one-pillar")!.passed).toBe(false);
    expect(twoPillars.passed).toBe(false);
  });

  it("auto-fixes a missing CTA by adding a slot (spec §9.1 default)", () => {
    const missingCta = runCohesionChecks(healthySet.slice(0, 5));
    const fix = missingCta.autoFixes.find((fixEntry) => fixEntry.checkId === "one-cta");
    expect(fix?.action.type).toBe("add-cta-slot");
    expect(fix?.note).toMatch(/created automatically/);
    // Resolved by the fix, so the gate does not block on it.
    expect(missingCta.blockingFailures.map((failure) => failure.id)).not.toContain(
      "one-cta"
    );
  });

  it("auto-fixes repeated framing openers by regenerating the later draft", () => {
    const duped = [
      ...healthySet,
      makeDraft({ seq: 7, role: "satellite", excerptCitations: ["corpus://corvo/c1#excerpt-1"] }),
    ];
    // Force a repeated opener by reusing draft 3's first line.
    duped[6] = { ...duped[6], content: duped[2]!.content };
    const report = runCohesionChecks(duped);
    const fix = report.autoFixes.find(
      (fixEntry) => fixEntry.action.type === "regenerate-opener"
    );
    expect(fix).toBeDefined();
    expect(fix!.action.postId).toBe("post_7");
    expect(fix!.note).toMatch(/regenerated automatically/);
    expect(report.blockingFailures.map((failure) => failure.id)).not.toContain(
      "unique-openers"
    );
  });

  it("blocks when satellites do not reference the pillar claim", () => {
    const orphanSatellite: CohesionDraftInput = {
      ...makeDraft({ seq: 3, role: "satellite" }),
      content: "Unrelated vibes content with zero grounding tokens here.",
      excerptCitations: ["corpus://corvo/other#excerpt-99"],
    };
    const report = runCohesionChecks([healthySet[0], orphanSatellite, healthySet[5]!]);
    expect(report.checks.find((check) => check.id === "satellites-reference-pillar")!.passed).toBe(
      false
    );
    expect(report.passed).toBe(false);
  });
});

describe("applyRegeneratedOpener", () => {
  it("replaces the first sentence entirely and keeps the rest", () => {
    const updated = applyRegeneratedOpener(
      "Prompt roulette is what most teams call drafting without grounding. [ANGLE: sharpen it]",
      "Grounding beats vibes: no claim goes out without a corpus pointer."
    );
    expect(updated).toContain(
      "Grounding beats vibes: no claim goes out without a corpus pointer. [ANGLE: sharpen it]"
    );
    expect(updated).not.toContain("Prompt roulette");
  });
});

describe("framingOpener", () => {
  it("extracts a normalized multi-word opener", () => {
    expect(framingOpener("Prompt roulette is action without reasoning.")).toBe(
      "prompt roulette is action"
    );
  });
});

describe("placeholder surfaces (D-14)", () => {
  it("computes answerable questions and extractable answers per draft", () => {
    const entries = computeSeoAeo(healthySet.slice(0, 2));
    expect(entries).toHaveLength(2);
    expect(entries[0]!.questions.length).toBeGreaterThan(0);
    expect(entries[0]!.questions[0]).toMatch(/^what is /);
    expect(entries[0]!.extractableAnswer.length).toBeGreaterThan(0);
  });

  it("computes a bounded bot-likelihood score with bands", () => {
    const entries = computeBotLikelihood(healthySet.slice(0, 3));
    for (const entry of entries) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(95);
      expect(["low", "elevated"]).toContain(entry.band);
    }
  });
});

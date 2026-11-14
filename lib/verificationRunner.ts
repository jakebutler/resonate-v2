import type {
  VerificationCriterion,
  VerificationManifest,
  VerificationRunnerType,
  VerificationTier,
} from "./verificationManifest";

/**
 * Runner core for the feature-verification workflow (spec deliverable V2).
 *
 * The core is a pure orchestration layer over the existing test ladder: it
 * walks a manifest's criteria in order, delegates each one to an injected
 * executor, and aggregates the results into a machine-readable verdict. All
 * side effects (spawning test commands, writing the report) live at the edges
 * — the CLI in `scripts/verify-feature.ts` and the unit tests stub the
 * executor.
 */

export type CriterionOutcome = "PASS" | "FAIL" | "ABSENT" | "UNPROVEN";

export type ExecutorResult =
  | { outcome: "PASS"; evidence: string }
  | { outcome: "FAIL"; details: string }
  | { outcome: "ABSENT"; missingComponent: string; details: string };

/** Runs one criterion. Injected so the core is testable without spawning. */
export type CriterionExecutor = (
  criterion: VerificationCriterion,
) => Promise<ExecutorResult>;

export type CriterionResult = {
  criterionId: string;
  name: string;
  runner: VerificationRunnerType;
  tier: VerificationTier;
  outcome: CriterionOutcome;
  /** Self-observed proof for a PASS (command output, reproduction). Empty for other outcomes. */
  evidence: string;
  /** Named missing component for an ABSENT. */
  missingComponent?: string;
  details: string;
};

export type VerificationRunResult = {
  featureId: string;
  startedAt: string;
  finishedAt: string;
  results: CriterionResult[];
  summary: { pass: number; fail: number; absent: number; unproven: number };
};

/** A run is successful only with zero FAIL and zero UNPROVEN — an explicit ABSENT is tolerated. */
export function isRunSuccessful(result: VerificationRunResult): boolean {
  return result.summary.fail === 0 && result.summary.unproven === 0;
}

/**
 * Runs every criterion in manifest order. A criterion whose dependencies did
 * not PASS is not executed — it reports ABSENT naming the failed dependency,
 * so one broken rung does not cascade into misleading FAILs downstream.
 */
export async function runVerification(
  manifest: VerificationManifest,
  execute: CriterionExecutor,
  options: { startedAt?: string } = {},
): Promise<VerificationRunResult> {
  const startedAt = options.startedAt ?? new Date().toISOString();
  const resultsById = new Map<string, CriterionResult>();
  const results: CriterionResult[] = [];

  for (const criterion of manifest.criteria) {
    const result = await runCriterion(criterion, resultsById, execute);
    resultsById.set(criterion.id, result);
    results.push(result);
  }

  const finishedAt = new Date().toISOString();
  const summary = {
    pass: countBy(results, "PASS"),
    fail: countBy(results, "FAIL"),
    absent: countBy(results, "ABSENT"),
    unproven: countBy(results, "UNPROVEN"),
  };

  return { featureId: manifest.featureId, startedAt, finishedAt, results, summary };
}

async function runCriterion(
  criterion: VerificationCriterion,
  resultsById: Map<string, CriterionResult>,
  execute: CriterionExecutor,
): Promise<CriterionResult> {
  const base = {
    criterionId: criterion.id,
    name: criterion.name,
    runner: criterion.runner,
    tier: criterion.tier,
  };

  const unmet = criterion.dependsOn.filter((depId) => {
    const dependency = resultsById.get(depId);
    return dependency !== undefined && dependency.outcome !== "PASS";
  });
  if (unmet.length > 0) {
    return {
      ...base,
      outcome: "ABSENT",
      evidence: "",
      missingComponent: `criterion "${unmet[0]}" did not pass`,
      details: `Skipped because its dependency "${unmet[0]}" did not pass.`,
    };
  }

  const outcome = await execute(criterion);
  if (outcome.outcome === "PASS") {
    if (outcome.evidence.trim() === "") {
      // T-Stack proof rule: a PASS ships only with proof the runner observed.
      return {
        ...base,
        outcome: "UNPROVEN",
        evidence: "",
        details: "PASS reported without self-observed evidence; evidence is required.",
      };
    }
    return { ...base, outcome: "PASS", evidence: outcome.evidence, details: "Criterion passed." };
  }
  if (outcome.outcome === "FAIL") {
    return { ...base, outcome: "FAIL", evidence: "", details: outcome.details };
  }
  return {
    ...base,
    outcome: "ABSENT",
    missingComponent: outcome.missingComponent,
    evidence: "",
    details: outcome.details,
  };
}

function countBy(results: CriterionResult[], outcome: CriterionOutcome): number {
  return results.filter((result) => result.outcome === outcome).length;
}

/** Renders the durable dated report written to `docs/verification/<featureId>/`. */
export function renderVerificationReport(result: VerificationRunResult): string {
  const lines: string[] = [];
  const overall = isRunSuccessful(result) ? "READY (offline tier)" : "NOT READY";

  lines.push(`# Feature verification: ${result.featureId}`);
  lines.push("");
  lines.push(`- **Run started:** ${result.startedAt}`);
  lines.push(`- **Run finished:** ${result.finishedAt}`);
  lines.push(
    `- **Summary:** ${result.summary.pass} PASS · ${result.summary.fail} FAIL · ` +
      `${result.summary.absent} ABSENT · ${result.summary.unproven} UNPROVEN`,
  );
  lines.push(`- **Verdict:** ${overall}`);
  lines.push("");
  lines.push("| Criterion | Runner | Tier | Outcome | Evidence / missing component |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const r of result.results) {
    lines.push(
      `| ${r.criterionId} (${r.name}) | ${r.runner} | ${r.tier} | ${r.outcome} | ${tableCellDetail(r)} |`,
    );
  }
  lines.push("");
  lines.push("## Per-criterion evidence");
  lines.push("");
  for (const r of result.results) {
    lines.push(`### ${r.criterionId} — ${r.outcome}`);
    lines.push("");
    lines.push(r.details);
    if (r.evidence.trim() !== "") {
      lines.push("");
      lines.push("Self-observed evidence:");
      lines.push("");
      lines.push("```");
      lines.push(r.evidence.trimEnd());
      lines.push("```");
    }
    lines.push("");
  }
  return lines.join("\n");
}

function tableCellDetail(r: CriterionResult): string {
  if (r.outcome === "ABSENT" && r.missingComponent) return `missing: ${r.missingComponent}`;
  if (r.outcome === "PASS") return "evidence recorded below";
  if (r.outcome === "UNPROVEN") return "PASS without evidence rejected";
  return "see details below";
}

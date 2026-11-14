#!/usr/bin/env node
/**
 * Feature-verification runner CLI (spec deliverable V2).
 *
 * Usage: npm run verify:feature -- <featureId>
 *
 * Loads `verification/<featureId>.manifest.json`, executes each criterion on
 * the existing ladder, and writes a dated report to
 * `docs/verification/<featureId>/<date>.md` plus a structured JSON sidecar of
 * the same run (`<date>.json` and `latest.json`) for the /verification route.
 * Exit code 0 only when no
 * criterion FAILED (or was rejected as UNPROVEN); an explicit ABSENT — a
 * missing component feeding the build list, live criteria included — does not
 * fail the run.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  formatManifestIssues,
  parseVerificationManifest,
  type VerificationCriterion,
  type VerificationManifest,
} from "../lib/verificationManifest";
import { z } from "zod";
import {
  isRunSuccessful,
  renderVerificationReport,
  resolveContractCommandTokens,
  runVerification,
  type CriterionExecutor,
  type ExecutorResult,
} from "../lib/verificationRunner";
import { decideCommittedReceipt } from "../lib/verification/committedReceipt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const EVIDENCE_TAIL_CHARS = 4000;

type SpawnResult = { code: number; stdout: string; stderr: string };

function parseArgs(argv: string[]): { featureId: string } {
  const args = argv.filter((arg) => !arg.startsWith("--feature="));
  const featureFlag = argv.find((arg) => arg.startsWith("--feature="));
  const featureId = featureFlag ? featureFlag.slice("--feature=".length) : args[0];
  if (!featureId) {
    throw new Error("Usage: npm run verify:feature -- <featureId>");
  }
  return { featureId };
}

function runCommand(command: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (error) => {
      stderr += `${error.message}\n`;
      resolve({ code: 1, stdout, stderr });
    });
  });
}

function defaultCommand(criterion: VerificationCriterion): string[] | null {
  switch (criterion.runner) {
    case "vitest":
    case "convex-test":
      return ["npx", "vitest", "run", criterion.target];
    case "playwright":
      return ["npx", "playwright", "test", criterion.target];
    // Contract criteria are executed separately (executeContract), so their
    // command is never resolved here.
    case "contract":
      return null;
  }
}

/**
 * Executes a contract criterion's command. `<slug>` placeholders are resolved
 * from operator env vars (see resolveContractCommandTokens); an unresolved
 * placeholder reports ABSENT naming the variable instead of running a literal
 * placeholder string.
 */
async function executeContract(
  criterion: VerificationCriterion,
): Promise<ExecutorResult> {
  if (!criterion.command) {
    return {
      outcome: "ABSENT",
      missingComponent: `command for criterion "${criterion.id}"`,
      details: "Criterion not run: no command available.",
    };
  }
  const resolved = resolveContractCommandTokens(criterion.command, process.env);
  if (!resolved.ok) {
    return {
      outcome: "ABSENT",
      missingComponent: `prerequisite "${resolved.missingEnvVar}" (contract command placeholder not set)`,
      details:
        `Criterion not run: contract command placeholder requires env var "${resolved.missingEnvVar}". ` +
        `Provide it to make this criterion runnable.`,
    };
  }
  const result = await runCommand(resolved.tokens[0], resolved.tokens.slice(1));
  if (result.code === 0) {
    return { outcome: "PASS", evidence: evidenceFor(resolved.tokens, result) };
  }
  return {
    outcome: "FAIL",
    details:
      `\`${resolved.tokens.join(" ")}\` exited ${result.code}.\n` +
      `stderr tail:\n${result.stderr.slice(-1200)}\n` +
      `stdout tail:\n${result.stdout.slice(-1200)}`,
  };
}

function evidenceFor(command: string[], result: SpawnResult): string {
  const output = `${result.stdout}\n${result.stderr}`.trim();
  const tail = output.length > EVIDENCE_TAIL_CHARS
    ? `…(truncated)…\n${output.slice(-EVIDENCE_TAIL_CHARS)}`
    : output;
  return `$ ${command.join(" ")}\nexit code: ${result.code}\n${tail}`;
}

/** The prerequisite semantics: every prerequisite names an env var that must be set. */
function firstMissingPrerequisite(criterion: VerificationCriterion): string | null {
  for (const prerequisite of criterion.prerequisites) {
    if (process.env[prerequisite] === undefined) return prerequisite;
  }
  return null;
}

/** Reads a criterion's declared committed receipt, null when absent/unreadable. */
async function readDeclaredReceipt(
  criterion: VerificationCriterion,
): Promise<string | null> {
  if (criterion.receipt === undefined) return null;
  try {
    return await readFile(path.join(REPO_ROOT, criterion.receipt), "utf8");
  } catch {
    return null;
  }
}

function makeExecutor(): CriterionExecutor {
  return async (criterion): Promise<ExecutorResult> => {
    const missingPrerequisite = firstMissingPrerequisite(criterion);
    if (missingPrerequisite !== null) {
      // A committed dated receipt from an earlier approved live run counts as
      // the criterion's evidence even when the key is not set in this
      // environment (keys rotate; reports are re-run later).
      const receipt = decideCommittedReceipt(
        criterion.receipt,
        await readDeclaredReceipt(criterion),
      );
      if (receipt.kind === "accepted") {
        return { outcome: "PASS", evidence: receipt.evidence };
      }
      const receiptNote = receipt.kind === "receipt-missing"
        ? ` The declared receipt "${receipt.receiptPath}" does not exist in the repo.`
        : receipt.kind === "receipt-undated"
          ? ` The declared receipt "${receipt.receiptPath}" carries no dated execution line.`
          : "";
      return {
        outcome: "ABSENT",
        missingComponent: `prerequisite "${missingPrerequisite}" (env var not set)`,
        details:
          `Criterion not run: prerequisite "${missingPrerequisite}" is not configured. ` +
          `Provision it to make this criterion runnable.${receiptNote}`,
      };
    }

    if (criterion.runner === "playwright") {
      const buildId = path.join(REPO_ROOT, ".next", "BUILD_ID");
      if (!existsSync(buildId)) {
        return {
          outcome: "ABSENT",
          missingComponent: "production build (.next/BUILD_ID)",
          details:
            "Criterion not run: no production build found. Run `npm run build` first — " +
            "e2e criteria run against the production build.",
        };
      }
    }

    if (criterion.runner !== "contract" && !existsSync(path.join(REPO_ROOT, criterion.target))) {
      return {
        outcome: "ABSENT",
        missingComponent: `target file "${criterion.target}"`,
        details: `Criterion not run: target "${criterion.target}" does not exist in the repo.`,
      };
    }

    if (criterion.runner === "contract") {
      return await executeContract(criterion);
    }

    const command = defaultCommand(criterion);
    if (command === null) {
      return {
        outcome: "ABSENT",
        missingComponent: `command for criterion "${criterion.id}"`,
        details: "Criterion not run: no command available.",
      };
    }

    const result = await runCommand(command[0], command.slice(1));
    if (result.code === 0) {
      return { outcome: "PASS", evidence: evidenceFor(command, result) };
    }
    return {
      outcome: "FAIL",
      details:
        `\`${command.join(" ")}\` exited ${result.code}.\n` +
        `stderr tail:\n${result.stderr.slice(-1200)}\n` +
        `stdout tail:\n${result.stdout.slice(-1200)}`,
    };
  };
}

async function main(): Promise<number> {
  let featureId: string;
  try {
    featureId = parseArgs(process.argv.slice(2)).featureId;
  } catch (error) {
    console.error(`[verify:feature] ${(error as Error).message}`);
    return 2;
  }

  const manifestPath = path.join(REPO_ROOT, "verification", `${featureId}.manifest.json`);
  if (!existsSync(manifestPath)) {
    console.error(`[verify:feature] No manifest at ${manifestPath}`);
    console.error(
      `[verify:feature] Expected verification/${featureId}.manifest.json — create it to declare what "ready" means for this feature.`,
    );
    return 2;
  }

  let json: unknown;
  try {
    json = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    console.error(`[verify:feature] Manifest is not valid JSON: ${(error as Error).message}`);
    return 2;
  }

  const parsed = loadManifest(json);
  if (!parsed.ok) {
    console.error(`[verify:feature] Manifest rejected (${manifestPath}):`);
    for (const issue of parsed.issues) console.error(`  - ${issue}`);
    return 2;
  }
  const manifest = parsed.manifest;

  console.log(`==> Verifying feature "${manifest.featureId}" (${manifest.name})`);
  const run = await runVerification(manifest, makeExecutor());

  for (const result of run.results) {
    console.log(`[${result.outcome}] ${result.criterionId}: ${result.details.split("\n")[0]}`);
  }
  console.log(
    `\nSummary: ${run.summary.pass} PASS · ${run.summary.fail} FAIL · ` +
      `${run.summary.absent} ABSENT · ${run.summary.unproven} UNPROVEN`,
  );

  const report = renderVerificationReport(run);
  const reportDate = run.finishedAt.slice(0, 10);
  const reportDir = path.join(REPO_ROOT, "docs", "verification", manifest.featureId);
  const reportPath = path.join(reportDir, `${reportDate}.md`);
  await mkdir(reportDir, { recursive: true });
  await writeFile(reportPath, `${report}\n`);
  console.log(`\nReport: ${path.relative(REPO_ROOT, reportPath)}`);

  // Structured sidecar of the same run, next to the markdown report, plus a
  // stable latest.json the /verification route ingests at build time.
  const runFile = {
    run,
    reportPath: path.relative(REPO_ROOT, reportPath),
  };
  const runJson = `${JSON.stringify(runFile, null, 2)}\n`;
  await writeFile(path.join(reportDir, `${reportDate}.json`), runJson);
  const latestPath = path.join(reportDir, "latest.json");
  await writeFile(latestPath, runJson);
  console.log(`Run file: ${path.relative(REPO_ROOT, latestPath)}`);

  if (!isRunSuccessful(run)) {
    console.error(`\n[verify:feature] Feature "${manifest.featureId}" is NOT READY.`);
    return 1;
  }
  console.log(`\n[verify:feature] Feature "${manifest.featureId}" is READY (offline tier).`);
  return 0;
}

type LoadedManifest =
  | { ok: true; manifest: VerificationManifest }
  | { ok: false; issues: string[] };

function loadManifest(json: unknown): LoadedManifest {
  try {
    return { ok: true, manifest: parseVerificationManifest(json) };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, issues: formatManifestIssues(error) };
    }
    throw error;
  }
}

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: Error) => {
    console.error(`[verify:feature] Unexpected failure: ${error.message}`);
    process.exit(2);
  });

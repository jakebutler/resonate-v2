#!/usr/bin/env node
/**
 * Feature-verification runner CLI (spec deliverable V2).
 *
 * Usage: npm run verify:feature -- <featureId>
 *
 * Loads `verification/<featureId>.manifest.json`, executes each criterion on
 * the existing ladder, and writes a dated report to
 * `docs/verification/<featureId>/<date>.md`. Exit code 0 only when no
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
  runVerification,
  type CriterionExecutor,
  type ExecutorResult,
} from "../lib/verificationRunner";

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
    case "contract":
      // The schema requires an explicit command for contract criteria.
      return criterion.command ? criterion.command.split(/\s+/) : null;
  }
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

function makeExecutor(): CriterionExecutor {
  return async (criterion): Promise<ExecutorResult> => {
    const missingPrerequisite = firstMissingPrerequisite(criterion);
    if (missingPrerequisite !== null) {
      return {
        outcome: "ABSENT",
        missingComponent: `prerequisite "${missingPrerequisite}" (env var not set)`,
        details:
          `Criterion not run: prerequisite "${missingPrerequisite}" is not configured. ` +
          `Provision it to make this criterion runnable.`,
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

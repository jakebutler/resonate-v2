#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEPLOYMENT_BASE = "https://resonate.corvolabs.com";
const RUN_DATE = new Date().toISOString().slice(0, 10);
const REPORT_PATH = path.join(REPO_ROOT, "docs/smoke-runs", `${RUN_DATE}-cutover-readiness.md`);
const SAMPLE_FIXTURE = path.join(REPO_ROOT, "tests/fixtures/resonate-v1-export.sample.json");
const DRY_RUN_OUT = "/tmp/sample-dry-run.json";

/** @typedef {{ name: string; passed: boolean; skipped?: boolean; details: string }} CheckResult */

/** @type {CheckResult[]} */
const checks = [];

function parseArgs(argv) {
  const options = { envFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      options.envFile = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function loadEnvFile(envFilePath) {
  if (!envFilePath || !existsSync(envFilePath)) return;
  const raw = await readFile(envFilePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function recordCheck(name, passed, details, skipped = false) {
  checks.push({ name, passed, details, skipped });
  const label = skipped ? "SKIP" : passed ? "PASS" : "FAIL";
  console.log(`[${label}] ${name}: ${details}`);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runTestCi() {
  console.log("\n==> npm run test:ci");
  const result = await runCommand("npm", ["run", "test:ci"]);
  const passed = result.code === 0;
  recordCheck(
    "CI test suite (npm run test:ci)",
    passed,
    passed
      ? "Vitest coverage run exited 0."
      : `Vitest exited ${result.code}. Tail stderr:\n${result.stderr.slice(-1200)}`
  );
  return passed;
}

async function runSampleMigrationDryRun() {
  console.log("\n==> v2 migration dry-run (sample fixture)");
  const result = await runCommand("node", [
    "scripts/v2-migration-dry-run.mjs",
    "--input",
    SAMPLE_FIXTURE,
    "--out",
    DRY_RUN_OUT,
  ]);
  if (result.code !== 0) {
    recordCheck(
      "Sample v1 migration dry-run",
      false,
      `Dry-run script exited ${result.code}: ${result.stderr.trim() || result.stdout.trim()}`
    );
    return null;
  }

  let plan;
  try {
    plan = JSON.parse(await readFile(DRY_RUN_OUT, "utf8"));
  } catch (error) {
    recordCheck(
      "Sample v1 migration dry-run",
      false,
      `Could not parse ${DRY_RUN_OUT}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }

  const failedCount = Array.isArray(plan.records?.failed) ? plan.records.failed.length : null;
  const passed = failedCount === 0;
  const summary = plan.summary ?? {};
  recordCheck(
    "Sample v1 migration dry-run",
    passed,
    passed
      ? `0 failed rows; imported=${summary.imported ?? "?"}, ambiguous=${summary.ambiguous ?? "?"}, v2PostCandidates=${summary.v2PostCandidates ?? "?"}`
      : `${failedCount} failed migration rows`
  );
  return plan;
}

async function httpPing(label, urlPath) {
  const url = `${DEPLOYMENT_BASE}${urlPath}`;
  console.log(`\n==> HTTP ping ${url}`);
  try {
    const response = await fetch(url, { redirect: "manual" });
    const location = response.headers.get("location") ?? "";
    const isRedirect = response.status === 307 || response.status === 302;
    const clerkRedirect =
      location.includes("/sign-in") ||
      location.includes("clerk") ||
      location.includes("accounts.");
    const passed = isRedirect && clerkRedirect;
    recordCheck(
      `Deployment HTTP ${label}`,
      passed,
      passed
        ? `${response.status} → ${location}`
        : `Expected Clerk redirect (307/302 to sign-in); got ${response.status} location=${location || "(none)"}`
    );
    return passed;
  } catch (error) {
    recordCheck(
      `Deployment HTTP ${label}`,
      false,
      `Fetch failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

async function validateProvider(name, adapter, envKey) {
  const apiKey = process.env[envKey]?.trim();
  if (!apiKey) {
    recordCheck(
      `${name} read-only validation`,
      true,
      `${envKey} not set; skipped.`,
      true
    );
    return true;
  }

  console.log(`\n==> ${name} validateConnection (read-only)`);
  const context = {
    env: { [envKey]: apiKey },
    liveProviderValidationApproved: true,
  };

  try {
    const result = await adapter.validateConnection(context);
    const passed = result.ok === true;
    recordCheck(
      `${name} read-only validation`,
      passed,
      passed
        ? `Connected (${result.accountLabel ?? result.providerId}).`
        : result.reason ?? "Validation returned ok=false."
    );
    return passed;
  } catch (error) {
    recordCheck(
      `${name} read-only validation`,
      false,
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

const ISSUE_19_ACS = [
  {
    id: "19.1",
    text: "Smoke test covers Idea → LinkedIn draft → approve → schedule → filtered calendar → Buffer path.",
    automatedStatus: "needs-human-eyes",
    evidence: "End-to-end Buffer queue path requires authenticated C.2 smoke on preview deployment.",
  },
  {
    id: "19.2",
    text: "Smoke test covers Idea → Reddit draft → approve → schedule → filtered calendar → Zernio path.",
    automatedStatus: "needs-human-eyes",
    evidence: "End-to-end Zernio queue path requires authenticated C.2 smoke on preview deployment.",
  },
  {
    id: "19.3",
    text: "Smoke test covers Idea/research → Corvo Blog draft → approve → schedule/create PR → filtered calendar → PR/provider state.",
    automatedStatus: "needs-human-eyes",
    evidence: "GitHub PR creation and calendar visibility require authenticated C.2 smoke.",
  },
  {
    id: "19.4",
    text: "Smoke test covers rescheduling social and blog Posts.",
    automatedStatus: "automated-pass",
    evidence: "Covered by test:ci (lib/__tests__/domain.test.ts, PersistedPublishingPanel reschedule tests, convex/publishing reschedule).",
  },
  {
    id: "19.5",
    text: "Smoke test covers cancel/unpublish intent.",
    automatedStatus: "automated-pass",
    evidence: "Covered by test:ci (PersistedPublishingPanel cancel intent + lib/v2 provider intent tests).",
  },
  {
    id: "19.6",
    text: "Smoke test verifies scheduled but unapproved Posts do not submit.",
    automatedStatus: "automated-pass",
    evidence: "Covered by test:ci (isEligibleForProviderSubmission + submitMockProvider gate).",
  },
  {
    id: "19.7",
    text: "Smoke test verifies no accidental auto-publish/merge occurs.",
    automatedStatus: "automated-pass",
    evidence: "ADR 0002 human-gated submission; test:ci blocks unapproved and live-without-approval paths.",
  },
  {
    id: "19.8",
    text: "Smoke test verifies Brand, Platform, and Status filters across all four Brands and all Platforms.",
    automatedStatus: "needs-human-eyes",
    evidence: "Unit tests cover filter helpers and panel wiring; four-brand matrix needs C.2 authenticated browser smoke.",
  },
  {
    id: "19.9",
    text: "Smoke test verifies migrated historical posts, scheduled posts, Ideas, and drafts are present or accounted for.",
    automatedStatus: "automated-pass",
    evidence: "Sample migration dry-run in this report; real export review tracked under #16 / B.3.",
  },
  {
    id: "19.10",
    text: "Checklist records deployment mode used for evaluation.",
    automatedStatus: "automated-pass",
    evidence: "Recorded in Deployment mode section below.",
  },
  {
    id: "19.11",
    text: "Checklist ends with explicit go/no-go recommendation and blocker list.",
    automatedStatus: "automated-pass",
    evidence: "Go/no-go section below.",
  },
];

function resolveIssue19Statuses(testCiPassed, dryRunPlan) {
  return ISSUE_19_ACS.map((ac) => {
    if (!testCiPassed && ac.automatedStatus === "automated-pass") {
      return { ...ac, automatedStatus: "automated-fail", evidence: `test:ci failed; ${ac.evidence}` };
    }
    if (ac.id === "19.9" && dryRunPlan) {
      const failed = dryRunPlan.records?.failed?.length ?? 0;
      if (failed > 0) {
        return {
          ...ac,
          automatedStatus: "automated-fail",
          evidence: `Sample dry-run had ${failed} failed rows.`,
        };
      }
    }
    return ac;
  });
}

function buildReport({ gitSha, dryRunPlan, issue19Rows }) {
  const automatedChecks = checks.filter((check) => !check.skipped);
  const passed = automatedChecks.filter((check) => check.passed).length;
  const failed = automatedChecks.filter((check) => !check.passed).length;
  const skipped = checks.filter((check) => check.skipped).length;
  const automatedFailAcs = issue19Rows.filter((row) => row.automatedStatus === "automated-fail");
  const needsHuman = issue19Rows.filter((row) => row.automatedStatus === "needs-human-eyes");
  const allAutomatedGreen = failed === 0 && automatedFailAcs.length === 0;

  const dryRunSummary = dryRunPlan?.summary ?? {};
  const bufferKeyPresent = Boolean(process.env.BUFFER_API_KEY?.trim());
  const zernioKeyPresent = Boolean(process.env.ZERNIO_API_KEY?.trim());

  const checkTable = checks
    .map(
      (check) =>
        `| ${check.name} | ${check.skipped ? "skipped" : check.passed ? "pass" : "fail"} | ${check.details.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`
    )
    .join("\n");

  const issue19Table = issue19Rows
    .map(
      (row) =>
        `| ${row.id} | ${row.text.replace(/\|/g, "\\|")} | ${row.automatedStatus} | ${row.evidence.replace(/\|/g, "\\|")} |`
    )
    .join("\n");

  const blockers = [];
  if (failed > 0) {
    blockers.push(
      ...automatedChecks.filter((check) => !check.passed).map((check) => `Automated check failed: ${check.name}`)
    );
  }
  if (automatedFailAcs.length > 0) {
    blockers.push(...automatedFailAcs.map((row) => `#19 ${row.id}: ${row.text}`));
  }
  for (const row of needsHuman) {
    blockers.push(`Phase C required: #19 ${row.id}`);
  }
  if (!bufferKeyPresent) blockers.push("BUFFER_API_KEY not exercised in this run (skipped).");
  if (!zernioKeyPresent) blockers.push("ZERNIO_API_KEY not exercised in this run (skipped).");

  const recommendation = allAutomatedGreen
    ? "**Conditional go for Phase C** — automated gate green; complete authenticated smoke (C.2) before production cutover."
    : "**No-go for automated gate** — fix automated-fail items before Phase C.";

  return `# Cutover readiness smoke — ${RUN_DATE}

Generated by \`scripts/cutover-smoke.mjs\` on branch \`b6-cutover-smoke\`.

## Summary

| Metric | Count |
|---|---|
| Automated checks passed | ${passed} |
| Automated checks failed | ${failed} |
| Checks skipped (missing env) | ${skipped} |
| Issue #19 ACs automated-pass | ${issue19Rows.filter((row) => row.automatedStatus === "automated-pass").length} |
| Issue #19 ACs automated-fail | ${automatedFailAcs.length} |
| Issue #19 ACs needs-human-eyes | ${needsHuman.length} |

**Overall automated gate:** ${allAutomatedGreen ? "PASS" : "FAIL"}

## Deployment mode

| Field | Value |
|---|---|
| Evaluation URL | ${DEPLOYMENT_BASE} |
| Auth expectation | Unauthenticated HTTP smoke expects Clerk 307 → \`/sign-in\` |
| Git SHA | ${gitSha} |
| Provider keys in run | Buffer=${bufferKeyPresent ? "yes" : "no"}, Zernio=${zernioKeyPresent ? "yes" : "no"} |
| Live submission flags | Not required for this read-only smoke |

## Automated checks

| Check | Result | Details |
|---|---|---|
${checkTable}

## Sample migration dry-run

| Field | Value |
|---|---|
| Input | \`tests/fixtures/resonate-v1-export.sample.json\` |
| Output | \`${DRY_RUN_OUT}\` |
| Imported | ${dryRunSummary.imported ?? "n/a"} |
| Ambiguous | ${dryRunSummary.ambiguous ?? "n/a"} |
| Failed | ${dryRunSummary.failed ?? "n/a"} |
| v2 post candidates | ${dryRunSummary.v2PostCandidates ?? "n/a"} |

## Issue #19 acceptance criteria cross-reference

Parent: https://github.com/jakebutler/resonate-v2/issues/19

| ID | Acceptance criterion | Status | Evidence |
|---|---|---|---|
${issue19Table}

## Blockers and Phase C handoff

${blockers.length === 0 ? "- None recorded." : blockers.map((item) => `- ${item}`).join("\n")}

## Go / no-go recommendation

${recommendation}

---

_Run again with \`node scripts/cutover-smoke.mjs [--env-file path/to/.env.local]\`._
`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await loadEnvFile(options.envFile);

  const gitResult = await runCommand("git", ["rev-parse", "--short", "HEAD"]);
  const gitSha = gitResult.stdout.trim() || "unknown";

  await runTestCi();
  const dryRunPlan = await runSampleMigrationDryRun();
  await httpPing("/", "/");
  await httpPing("/", "/");
  await httpPing("/research", "/research");

  const { bufferProviderAdapter, zernioProviderAdapter } = await import(
    "../lib/providerAdapters.ts"
  );
  await validateProvider("Buffer", bufferProviderAdapter, "BUFFER_API_KEY");
  await validateProvider("Zernio", zernioProviderAdapter, "ZERNIO_API_KEY");

  const testCiPassed = checks.find((check) => check.name.startsWith("CI test"))?.passed ?? false;
  const issue19Rows = resolveIssue19Statuses(testCiPassed, dryRunPlan);

  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  const report = buildReport({ gitSha, dryRunPlan, issue19Rows });
  await writeFile(REPORT_PATH, report);

  console.log(`\nReport written to ${REPORT_PATH}`);

  const automatedChecks = checks.filter((check) => !check.skipped);
  const failedChecks = automatedChecks.filter((check) => !check.passed);
  const automatedFailAcs = issue19Rows.filter((row) => row.automatedStatus === "automated-fail");

  if (failedChecks.length > 0 || automatedFailAcs.length > 0) {
    console.error(
      `\nCutover smoke FAILED (${failedChecks.length} check(s), ${automatedFailAcs.length} #19 AC(s)).`
    );
    process.exit(1);
  }

  console.log("\nCutover smoke PASSED.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

#!/usr/bin/env node
import process from "node:process";
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { evaluateLiveGate } from "../lib/verification/liveGate.ts";
import { writeLiveReceipt } from "../lib/verification/liveReceipt.ts";

/**
 * Generalized gate + runner for a verification workflow's live stage (V7).
 *
 * Usage (CI wiring in .github/workflows/verification-live.yml):
 *
 *   node scripts/verify-live-gate.mjs \
 *     --provider=buffer \
 *     --feature="editorial-visuals live qualification" \
 *     --credentials=BUFFER_API_KEY \
 *     --approval-env=BUFFER_LIVE_SUBMISSION \
 *     --budget-usd=5 \
 *     -- npx --yes tsx scripts/buffer-live-validation.mjs
 *
 * Outcomes (never silent):
 *   unapproved                  -> explicit message on stdout, exit 0 (dry run)
 *   credentials-not-configured  -> explicit message naming the missing
 *                                  secrets, exit 2 (workflow fails loudly)
 *   approved                    -> runs the live command after `--`, records a
 *                                  dated live-receipt, exits with its code
 */

function parseArgs(argv) {
  const sep = argv.indexOf("--");
  const flags = argv.slice(0, sep === -1 ? argv.length : sep);
  const liveCommand = sep === -1 ? [] : argv.slice(sep + 1);

  const parsed = {
    provider: null,
    feature: null,
    credentials: [],
    approvalEnv: null,
    budgetUsd: null,
    docsDir: "docs/verification/receipts",
    liveCommand,
  };
  for (const flag of flags) {
    if (flag.startsWith("--provider=")) parsed.provider = flag.slice("--provider=".length).trim();
    else if (flag.startsWith("--feature=")) parsed.feature = flag.slice("--feature=".length).trim();
    else if (flag.startsWith("--credentials=")) parsed.credentials = flag.slice("--credentials=".length).split(",").map((name) => name.trim()).filter(Boolean);
    else if (flag.startsWith("--approval-env=")) parsed.approvalEnv = flag.slice("--approval-env=".length).trim();
    else if (flag.startsWith("--budget-usd=")) parsed.budgetUsd = Number(flag.slice("--budget-usd=".length).trim());
    else if (flag.startsWith("--docs-dir=")) parsed.docsDir = flag.slice("--docs-dir=".length).trim();
    else {
      console.error(`Unknown flag: ${flag}`);
      process.exit(3);
    }
  }
  if (!parsed.provider) {
    console.error("--provider is required (e.g. --provider=buffer).");
    process.exit(3);
  }
  if (parsed.credentials.length === 0) {
    console.error("--credentials is required (comma-separated env var names).");
    process.exit(3);
  }
  if (!parsed.approvalEnv) {
    parsed.approvalEnv = `${parsed.provider.toUpperCase()}_LIVE_SUBMISSION`;
  }
  return parsed;
}

function emitOutcome(decision) {
  process.stdout.write(`LIVE GATE OUTCOME: ${decision.outcome}\n`);
  process.stdout.write(`LIVE GATE REASON: ${decision.reason}\n`);
  if (process.env.GITHUB_OUTPUT) {
    // Sourced from evaluateLiveGate + flags, never from credential values.
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `outcome=${decision.outcome}\nreason=${decision.reason.replaceAll("\n", " ")}\n`,
      "utf8",
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  const credentials = {};
  for (const name of args.credentials) {
    credentials[name] = process.env[name];
  }

  const decision = evaluateLiveGate({
    approval: process.env[args.approvalEnv],
    credentials,
    budgetUsd: args.budgetUsd,
  });

  if (decision.outcome === "unapproved") {
    emitOutcome(decision);
    console.log(`Live stage skipped — ${decision.reason} This is the expected dry-run outcome; re-run with the submission gate approved to execute the live stage.`);
    process.exit(0);
  }

  if (decision.outcome === "credentials-not-configured") {
    emitOutcome(decision);
    console.error(`CREDENTIALS NOT CONFIGURED — ${decision.reason} The live stage did NOT run. Add the named secrets to the repository environment, then re-run.`);
    process.exit(2);
  }

  if (args.liveCommand.length === 0) {
    console.error("Live stage approved but no live command was provided after `--`.");
    process.exit(3);
  }

  const command = args.liveCommand.join(" ");
  console.log(`Live stage approved — running: ${command}`);
  const startedAt = new Date();
  const result = spawnSync(command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });
  const finishedAt = new Date();

  const exitCode = result.status ?? 1;
  const receiptPath = writeLiveReceipt(args.docsDir, {
    provider: args.provider,
    feature: args.feature ?? "verification-live",
    qualification: "live-receipt",
    executedAt: startedAt.toISOString(),
    command,
    checks: [
      {
        name: "Gate approved",
        passed: true,
        details: decision.reason,
      },
      {
        name: "Live command exit status",
        passed: exitCode === 0,
        details: `exit ${exitCode} in ${Math.round((finishedAt - startedAt) / 1000)}s`,
      },
    ],
    budgetUsd: decision.budgetUsd,
    notes: exitCode === 0
      ? undefined
      : "Live command failed; investigate before treating any provider claim as verified.",
  });
  console.log(`Live receipt recorded: ${receiptPath}`);
  process.exit(exitCode);
}

main();

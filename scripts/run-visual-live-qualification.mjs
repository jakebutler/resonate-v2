#!/usr/bin/env node
import process from "node:process";
import { spawnSync } from "node:child_process";
import { mkdirSync, appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { evaluateVisualLiveGate, VISUAL_PACKET_SEQUENCE_BUDGET_USD } from "../lib/verification/visualLiveGate.ts";
import { writeLiveReceipt } from "../lib/verification/liveReceipt.ts";

/**
 * Gated live-qualification harness for the editorial-visuals functional packet (C6).
 *
 * Workflow-dispatch wiring (.github/workflows/visual-live-qualification.yml):
 *
 *   npx --yes tsx scripts/run-visual-live-qualification.mjs \
 *     --deployment-url <dev deployment url> \
 *     --reference-dir <dir with the two approved reference PNGs> \
 *     [--registration-json <file>]
 *
 * The gate (lib/verification/visualLiveGate.ts) composes the generic V7 gate
 * with the visual preconditions. Outcomes (never silent):
 *
 *   unapproved                  -> explicit message on stdout, exit 0 (dry run)
 *   credentials-not-configured  -> explicit message naming each missing
 *                                  prerequisite, exit 2 (workflow fails loudly;
 *                                  the deployment re-checks its provider keys
 *                                  and reports ABSENT through qualify-visual-routes)
 *   deployment-refused          -> production deployment, exit 3
 *   approved                    -> executes the reviewed two-call functional packet
 *                                  (<= $0.25 per call, <= $0.50 total, inside the $5
 *                                  provider caps) via scripts/qualify-visual-routes.mjs,
 *                                  records a live-receipt and a dated evidence doc
 *                                  under docs/editorial-visuals/providers/qualification-runs/
 */

function parseArgs(argv) {
  const options = { deploymentUrl: null, referenceDir: null, registrationJson: null };
  for (let i = 0; i < argv.length; i++) {
    const valued = { "--deployment-url": "deploymentUrl", "--reference-dir": "referenceDir", "--registration-json": "registrationJson" };
    if (!valued[argv[i]] || !argv[i + 1]) throw new Error(`usage: node scripts/run-visual-live-qualification.mjs --deployment-url <dev-url> --reference-dir <dir> [--registration-json <file>]`);
    options[valued[argv[i++]]] = argv[i];
  }
  return options;
}

function emitOutcome(decision) {
  process.stdout.write(`VISUAL LIVE GATE OUTCOME: ${decision.outcome}\n`);
  process.stdout.write(`VISUAL LIVE GATE REASON: ${decision.reason}\n`);
  if (process.env.GITHUB_OUTPUT) {
    // Sourced from the gate decision, never from credential values.
    appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${decision.outcome}\nreason=${decision.reason.replaceAll("\n", " ")}\n`, "utf8");
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const decision = evaluateVisualLiveGate({
    approval: process.env.VISUAL_LIVE_SUBMISSION,
    operatorToken: process.env.VISUAL_QUALIFICATION_OPERATOR_TOKEN,
    deploymentUrl: args.deploymentUrl,
  });

  if (decision.outcome === "unapproved") {
    emitOutcome(decision);
    console.log(`Live qualification skipped — ${decision.reason} This is the expected dry-run outcome; re-run with visual_live_submission=approved to execute the packet.`);
    process.exit(0);
  }

  if (decision.outcome === "credentials-not-configured") {
    emitOutcome(decision);
    console.error(`CREDENTIALS NOT CONFIGURED — ${decision.reason} The live qualification did NOT run and its criteria stay ABSENT. Add the named prerequisites to the repository environment/inputs, then re-run.`);
    process.exit(2);
  }

  if (decision.outcome === "deployment-refused") {
    emitOutcome(decision);
    console.error(`DEPLOYMENT REFUSED — ${decision.reason} No packet call was made.`);
    process.exit(3);
  }

  const qualificationScript = join(resolve(dirname(fileURLToPath(import.meta.url))), "qualify-visual-routes.mjs");
  const command = [
    "node", qualificationScript,
    "--live",
    "--deployment-url", decision.deploymentUrl,
    "--reference-dir", args.referenceDir ?? "",
    ...(args.registrationJson ? ["--registration-json", args.registrationJson] : []),
  ].map((part) => (/[\s"]/.test(part) ? JSON.stringify(part) : part)).join(" ");

  console.log(`Visual live qualification approved — running: ${command}`);
  const startedAt = new Date();
  const result = spawnSync(command, { stdio: "inherit", shell: true, env: process.env });
  const finishedAt = new Date();
  const exitCode = result.status ?? 1;

  const receiptPath = writeLiveReceipt("docs/verification/receipts", {
    provider: "openai-image",
    feature: "editorial-visuals functional route qualification",
    qualification: "live-receipt",
    executedAt: startedAt.toISOString(),
    command,
    checks: [
      { name: "Gate approved", passed: true, details: decision.reason },
      { name: "Functional packet exit status", passed: exitCode === 0, details: `exit ${exitCode} in ${Math.round((finishedAt - startedAt) / 1000)}s` },
    ],
    budgetUsd: VISUAL_PACKET_SEQUENCE_BUDGET_USD,
    notes: exitCode === 0
      ? undefined
      : "Packet execution failed; investigate before treating any route as qualified. No retry is automatic.",
  });
  console.log(`Live receipt recorded: ${receiptPath}`);

  const runsDir = join(resolve(dirname(fileURLToPath(import.meta.url))), "..", "docs/editorial-visuals/providers/qualification-runs");
  mkdirSync(runsDir, { recursive: true });
  const evidencePath = join(runsDir, `${startedAt.toISOString().slice(0, 10)}-live.md`);
  appendFileSync(evidencePath, [
    "",
    `## Workflow-dispatch live run — ${startedAt.toISOString()}`,
    "",
    `- Gate: approved — ${decision.reason}`,
    `- Packet: reviewed gpt-image-2 two-call functional sequence (caps $0.25/call, $0.50 sequence; $5 provider ledger caps).`,
    `- Exit status: ${exitCode}`,
    `- Receipt: ${receiptPath}`,
    ...(exitCode === 0 ? [] : ["- The packet failed; no route is qualified by this run."]),
    "",
  ].join("\n"), "utf8");
  console.log(`Dated evidence doc updated: ${evidencePath}`);

  process.exit(exitCode);
}

main();

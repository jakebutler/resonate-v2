import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { QualificationLevel } from "./liveGate";

/**
 * Receipts for gated live-provider verification runs (V7).
 *
 * A live run is never trusted without a durable record: every executed live
 * stage writes a dated receipt naming the provider, the qualification level
 * (the offline-fixture | offline-contract | live-receipt vocabulary), what
 * ran, and the cost against its budget cap. Building the markdown is pure;
 * only the writers touch the filesystem.
 */

export type LiveReceiptCheck = {
  name: string;
  passed: boolean;
  details?: string;
};

export type LiveReceiptInput = {
  provider: string;
  feature: string;
  qualification: QualificationLevel;
  executedAt: string;
  command: string;
  checks: LiveReceiptCheck[];
  costUsd?: number | null;
  budgetUsd?: number | null;
  notes?: string;
};

export function buildLiveReceipt(input: LiveReceiptInput): string {
  const lines: string[] = [];
  lines.push(`# Live run receipt — ${input.provider} (${input.feature})`);
  lines.push("");
  lines.push(`- **Qualification:** ${input.qualification}`);
  lines.push(`- **Executed at:** ${input.executedAt}`);
  lines.push(`- **Command:** \`${input.command}\``);
  if (input.budgetUsd != null) {
    const cost =
      input.costUsd != null ? `$${formatUsd(input.costUsd)}` : "not reported";
    lines.push(
      `- **Cost:** ${cost} against a $${formatUsd(input.budgetUsd)} budget cap`,
    );
  } else if (input.costUsd != null) {
    lines.push(`- **Cost:** $${formatUsd(input.costUsd)} (no budget cap configured)`);
  }
  lines.push("");
  lines.push("## Checks");
  lines.push("");
  for (const check of input.checks) {
    const mark = check.passed ? "PASS" : "FAIL";
    lines.push(`- [${mark}] ${check.name}${check.details ? ` — ${check.details}` : ""}`);
  }
  if (input.notes) {
    lines.push("");
    lines.push("## Notes");
    lines.push("");
    lines.push(input.notes);
  }
  lines.push("");
  return lines.join("\n");
}

export function liveReceiptFileName(input: {
  provider: string;
  feature: string;
  executedAt: string;
}): string {
  const day = input.executedAt.slice(0, 10);
  return `${day}-${slug(input.provider)}-${slug(input.feature)}-live-receipt.md`;
}

export function writeLiveReceipt(
  docsDir: string,
  input: LiveReceiptInput,
): string {
  const markdown = buildLiveReceipt(input);
  const target = path.join(docsDir, liveReceiptFileName(input));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, markdown, "utf8");
  return target;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatUsd(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

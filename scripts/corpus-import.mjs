#!/usr/bin/env node
/**
 * resonate corpus import — lab-folder CLI journey (C8, spec §4 Journey B).
 *
 *   node scripts/corpus-import.mjs <folder> --brand <brandId> [--dry-run]
 *
 * Rituals (#64, D-18): dry-run first; md/txt/json/csv accepted; unsupported
 * files skip with a dirty warning; a secret-scan finding hard-fails the
 * import. One import becomes one immutable corpus version.
 *
 * The server-side mutation (corpora.importLabBundle) re-runs classification,
 * the secret scan, and segmentation authoritatively (lib/labImport.ts is the
 * source of truth for the patterns mirrored below).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const ACCEPTED_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".csv",
]);

const SECRET_PATTERNS = [
  { kind: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "api key assignment", pattern: /\b(api[_-]?key|apikey)\b\s*[:=]\s*["']?[A-Za-z0-9_\-]{12,}/i },
  { kind: "bearer token", pattern: /\bBearer\s+[A-Za-z0-9_\-\.]{16,}/ },
  { kind: "aws access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { kind: "password assignment", pattern: /\b(password|passwd|pwd)\b\s*[:=]\s*["']?[^\s"']{6,}/i },
  { kind: "generic secret assignment", pattern: /\b(secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i },
];

function parseArgs(argv) {
  const args = { positional: [], flags: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.flags.dryRun = true;
    else if (arg === "--brand") {
      index += 1;
      args.flags.brand = argv[index];
    } else if (arg.startsWith("--brand=")) {
      args.flags.brand = arg.slice("--brand=".length);
    } else {
      args.positional.push(arg);
    }
  }
  return args;
}

function listFiles(folder) {
  const entries = [];
  for (const entry of readdirSync(folder)) {
    const full = join(folder, entry);
    if (statSync(full).isFile()) entries.push(full);
  }
  return entries.sort();
}

function scanTextForSecrets(text) {
  const findings = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    for (const { kind, pattern } of SECRET_PATTERNS) {
      if (pattern.test(lines[index])) {
        findings.push({ kind, line: index + 1 });
      }
    }
  }
  return findings;
}

function readEnvValue(key) {
  for (const envPath of [".env.local", ".env"]) {
    try {
      const content = readFileSync(envPath, "utf8");
      const match = content.match(
        new RegExp(`^\\s*${key}\\s*=\\s*"?([^"\\n]+)"?`, "m")
      );
      if (match) return match[1].trim();
    } catch {
      // missing env file — ignore
    }
  }
  return process.env[key];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const folder = args.positional[0];
  const brand = args.flags.brand;
  const dryRun = Boolean(args.flags.dryRun);

  if (!folder || !brand) {
    console.error(
      "Usage: node scripts/corpus-import.mjs <folder> --brand <brandId> [--dry-run]"
    );
    process.exit(2);
  }

  const files = listFiles(folder);
  const accepted = [];
  const reportLines = [];
  let skipped = 0;
  let hardFail = null;

  for (const file of files) {
    const name = basename(file);
    const dot = name.lastIndexOf(".");
    const extension = dot >= 0 ? name.slice(dot).toLowerCase() : "";
    if (!ACCEPTED_EXTENSIONS.has(extension)) {
      skipped += 1;
      reportLines.push(`  ⚠ ${name} — SKIPPED — unsupported format (dirty warn)`);
      continue;
    }
    const text = readFileSync(file, "utf8");
    const findings = scanTextForSecrets(text);
    if (findings.length > 0) {
      hardFail = { name, findings };
      break;
    }
    accepted.push({ name, text });
    reportLines.push(`  ✓ ${name}`);
  }

  console.log(`Scanning folder… ${files.length} file(s) found`);
  for (const line of reportLines) {
    console.log(line);
  }
  console.log(
    `Secret scan………… ${hardFail ? "FAILED" : "0 findings"} (hard-fail if any)`
  );

  if (hardFail) {
    console.error(
      `\n✗ Secret scan failed for "${hardFail.name}": ${hardFail.findings
        .map((finding) => `${finding.kind} (line ${finding.line})`)
        .join(", ")}\n  The import is aborted. Remove the secret(s) and retry.`
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log(
      `\nDry-run complete — ${accepted.length}/${files.length} file(s) would import (${skipped} skipped). Re-run without --dry-run to import.`
    );
    return;
  }

  const convexUrl = readEnvValue("NEXT_PUBLIC_CONVEX_URL");
  const opsSecret = readEnvValue("V2_OPS_SECRET");
  if (!convexUrl || !opsSecret) {
    console.error(
      "\n✗ NEXT_PUBLIC_CONVEX_URL and V2_OPS_SECRET are required (set them in .env.local, and on the Convex deployment via `npx convex env set V2_OPS_SECRET`)."
    );
    process.exit(1);
  }

  const client = new ConvexHttpClient(convexUrl);
  try {
    const result = await client.mutation(anyApi.corpora.importLabBundle, {
      brandId: brand,
      opsSecret,
      files: accepted,
    });
    console.log(
      `\n✓ Imported corpus v${result.version} — ${result.excerptCount} excerpt(s) saved as an immutable version on the ${brand} brand corpus.`
    );
    console.log(
      "  Post-import excerpt review (sensitivity, include/exclude) happens on the Campaigns surface."
    );
  } catch (error) {
    console.error(`\n✗ Import failed: ${error.message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

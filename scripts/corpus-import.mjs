#!/usr/bin/env node
/**
 * resonate corpus import — lab-folder CLI journey (C8, spec §4 Journey B).
 *
 *   node scripts/corpus-import.mjs <folder> --brand <brandId> [--dry-run]
 *
 * Rituals (#64, D-18): dry-run first; md/txt/json/csv accepted (recursively —
 * the lab corpus unit is the nested experiment directory); unsupported files
 * skip with a dirty warning; a secret-scan finding hard-fails the import.
 * One import becomes one immutable corpus version.
 *
 * Transport: the CLI POSTs the scanned bundle to the app's
 * /api/ops/lab-import route, which authenticates the ops bearer secret
 * (timing-safe compare), rate-limits, audits rejections, and invokes the
 * internal `corpora.importLabBundle` mutation. The mutation re-runs
 * classification, the secret scan, and segmentation authoritatively
 * (lib/labImport.ts is the source of truth for the patterns mirrored below).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ACCEPTED_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".json",
  ".csv",
]);

// Mirrored from lib/labImport.ts (source of truth). Keyword anchors use
// `(?<![A-Za-z0-9])` instead of `\b`: `_` is a word character, so `\b` never
// matches inside names like OPENAI_API_KEY or AWS_SECRET_ACCESS_KEY.
const SECRET_PATTERNS = [
  { kind: "private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "openai api key", pattern: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{16,}/ },
  { kind: "github token", pattern: /(?<![A-Za-z0-9])gh[pousr]_[A-Za-z0-9]{16,}/ },
  { kind: "slack token", pattern: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { kind: "google api key", pattern: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{30,}/ },
  {
    kind: "jwt",
    pattern: /(?<![A-Za-z0-9])eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
  },
  {
    kind: "url credentials",
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]*:[^\s@/]*@/,
  },
  {
    kind: "api key assignment",
    pattern: /(?<![A-Za-z0-9])(api[_-]?key|apikey)(?![A-Za-z0-9])\s*[:=]\s*["']?[A-Za-z0-9_\-]{12,}/i,
  },
  { kind: "bearer token", pattern: /(?<![A-Za-z0-9])Bearer\s+[A-Za-z0-9_\-\.]{16,}/ },
  { kind: "aws access key", pattern: /(?<![A-Za-z0-9])AKIA[0-9A-Z]{16}(?![0-9A-Z])/ },
  {
    kind: "password assignment",
    pattern: /(?<![A-Za-z0-9])(password|passwd|pwd)(?![A-Za-z0-9])\s*[:=]\s*["']?[^\s"']{6,}/i,
  },
  {
    kind: "aws secret key assignment",
    pattern: /(?<![A-Za-z0-9])(aws[_-]?)?secret[_-]?access[_-]?key(?![A-Za-z0-9])\s*[:=]\s*["']?[A-Za-z0-9/+=]{16,}/i,
  },
  {
    kind: "generic secret assignment",
    pattern: /(?<![A-Za-z0-9])(secret|token)(?![A-Za-z0-9])\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
  },
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

/**
 * Recurse into subdirectories: the lab corpus unit is the nested experiment
 * directory, so a shallow listing sees zero files on a real import.
 */
function listFiles(folder) {
  const entries = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) entries.push(full);
    }
  };
  walk(folder);
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
    // Nested experiment directories are the corpus unit — keep the relative
    // path so same-named files in different folders stay distinguishable.
    const name = relative(folder, file);
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

  if (accepted.length === 0) {
    console.error(
      `\n✗ No importable files (md/markdown/txt/json/csv) found under "${folder}".\n  The lab corpus unit is the nested experiment directory — check the folder path.\n  Nothing was imported.`
    );
    process.exit(1);
  }

  if (dryRun) {
    console.log(
      `\nDry-run complete — ${accepted.length}/${files.length} file(s) would import (${skipped} skipped). Re-run without --dry-run to import.`
    );
    return;
  }

  const appUrl = (
    readEnvValue("RESONATE_APP_URL") ??
    readEnvValue("NEXT_PUBLIC_APP_URL") ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  const opsSecret = readEnvValue("V2_OPS_SECRET");
  if (!opsSecret) {
    console.error(
      "\n✗ V2_OPS_SECRET is required (set it in .env.local, and on the deployment via `npx convex env set V2_OPS_SECRET`)."
    );
    process.exit(1);
  }

  try {
    const response = await fetch(`${appUrl}/api/ops/lab-import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opsSecret}`,
      },
      body: JSON.stringify({ brandId: brand, files: accepted }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `${response.status} ${response.statusText}${payload?.error ? ` — ${payload.error}` : ""}`
      );
    }
    console.log(
      `\n✓ Imported corpus v${payload.version} — ${payload.excerptCount} excerpt(s) saved as an immutable version on the ${brand} brand corpus.`
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

#!/usr/bin/env node
/**
 * Import v1 captured ideas into v2 `capturedIdeas` for the signed-in operator.
 *
 * Usage:
 *   node scripts/convert-convex-export-to-v1-json.mjs --zip ./backup.zip --out ./v1-export.json
 *   node scripts/v2-migration-dry-run.mjs --input ./v1-export.json --out ./migration-plan.json --brand corvo
 *   node scripts/v2-import-ideas.mjs --plan ./migration-plan.json
 *
 * Requires CONVEX_URL and a Clerk JWT or deploy key scoped mutation runner.
 * For operator use, prefer the Convex dashboard "Run function" path documented in docs/v1-ideas-import.md.
 */
import { readFile } from "node:fs/promises";
import process from "node:process";

function parseArgs(argv) {
  const options = { batchSize: 25 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--plan") {
      options.plan = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--batch-size") {
      options.batchSize = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.plan) throw new Error("--plan is required");
  return options;
}

function ideaPayloads(plan) {
  const ideas = Array.isArray(plan.v2Ideas)
    ? plan.v2Ideas
    : Array.isArray(plan.v2Candidates?.ideas)
      ? plan.v2Candidates.ideas
      : [];
  return ideas.map((idea) => ({
    legacyTable: idea.sourceLegacyTable ?? "capturedIdeas",
    legacyId: String(idea.legacyIdeaId),
    brandId: idea.brandId ?? "corvo",
    text: idea.text,
    title: idea.title,
    tags: Array.isArray(idea.tags) ? idea.tags : [],
    sourceUrl: idea.sourceUrl,
    status: idea.status ?? "inbox",
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = JSON.parse(await readFile(options.plan, "utf8"));
  const ideas = ideaPayloads(plan);

  const payload = {
    path: "v2Migration:importV1Ideas",
    args: {
      ideas,
      dryRun: Boolean(options.dryRun),
    },
  };

  console.log(
    JSON.stringify(
      {
        message: options.dryRun
          ? "Dry-run payload ready for Convex mutation"
          : "Import payload ready for Convex mutation",
        ideaCount: ideas.length,
        mutation: payload,
        nextStep:
          "Run v2Migration.importV1Ideas from the Convex dashboard while signed in, or wire this payload into your authenticated Convex client.",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Provision a dev deployment's visual-generation environment (spec deliverable C4):
 * seed the brand monthly budget row, set both rollout flags, and import the
 * approved Corvo seed. Dry-run by default; `--apply` executes every step.
 *
 * Keys themselves are never accepted here — they are minted by Jake and set as
 * Convex deployment env vars (OPENAI_API_KEY, DIGITALOCEAN_INFERENCE_API_KEY,
 * OPENAI_TEXT_API_KEY). This script only prepares what keys need to work.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { validateImportDestination } from "./import-visual-seed.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVER_ROLLOUT_FLAG = "EDITORIAL_VISUALS_ENABLED";
const FRONTEND_ROLLOUT_FLAG = "NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED";
const BRANDS = new Set(["personal", "corvo", "lower-db", "freshproof"]);

const brandError = "Provisioning brand is required and must be one of: personal, corvo, lower-db, freshproof (--brand)";
const budgetError = "Budget limit must be a nonnegative integer number of USD micros (--budget-limit-micros)";
const tokenError = "Applying provisioning requires an authenticated application JWT in RESONATE_VISUAL_IMPORT_TOKEN";
const seedSourceError = "Seed import requires --source-directory holding the approved manifest images (or --skip-seed-import)";
const envFileError = "Frontend flag provisioning requires a writable repository .env.local file";
const seedImportError = "Seed import failed; run scripts/import-visual-seed.mjs directly for its safe diagnostic";
const genericError = "The operation failed or did not return a confirmed result.";
const destinationError = "Import destination must be a canonical HTTPS Convex cloud/site origin or exact HTTP loopback origin, without credentials, query, hash or path.";
const stages = new Set(["argument preparation", "destination validation", "budget seeding", "server rollout flag", "frontend rollout flag", "seed archive import"]);
/** Never echo an untrusted exception, URL fragment, or credential-bearing value. */
const safeMessages = new Set([brandError, budgetError, tokenError, seedSourceError, envFileError, seedImportError, genericError, destinationError]);

export function parseProvisioningArgs(argv, token = process.env.RESONATE_VISUAL_IMPORT_TOKEN) {
  const value = name => {
    const index = argv.indexOf(name);
    if (index === -1) return undefined;
    if (!argv[index + 1] || argv[index + 1].startsWith("--")) throw new Error("Missing required argument value");
    return argv[index + 1];
  };
  const brandId = value("--brand");
  if (typeof brandId !== "string" || !BRANDS.has(brandId)) throw new Error(brandError);
  const budgetLimitMicros = Number(value("--budget-limit-micros"));
  if (!Number.isSafeInteger(budgetLimitMicros) || budgetLimitMicros < 0) throw new Error(budgetError);
  const url = validateImportDestination(value("--url") ?? "");
  const apply = argv.includes("--apply");
  const skipSeedImport = argv.includes("--skip-seed-import");
  const sourceDirectory = value("--source-directory");
  if (apply && !token) throw new Error(tokenError);
  if (apply && !skipSeedImport && !sourceDirectory) throw new Error(seedSourceError);
  return { apply, url, brandId, budgetLimitMicros, skipSeedImport, sourceDirectory };
}

export function buildProvisioningPlan({ apply: _apply, url, brandId, budgetLimitMicros, skipSeedImport, sourceDirectory }) {
  const steps = [
    { id: "budget", stage: "budget seeding", description: `Seed the ${brandId} monthly budget row via visualWorkflow:setMonthlyBudget (limitMicros ${budgetLimitMicros})` },
    { id: "server-flag", stage: "server rollout flag", description: `Set ${SERVER_ROLLOUT_FLAG}=1 on the Convex deployment`, command: ["npx", "convex", "env", "set", SERVER_ROLLOUT_FLAG, "1", `--url=${url}`].join(" ") },
    { id: "frontend-flag", stage: "frontend rollout flag", description: `Set ${FRONTEND_ROLLOUT_FLAG}=1 in the repository .env.local (Next.js build-time flag)` },
  ];
  if (!skipSeedImport) steps.push({
    id: "seed-import", stage: "seed archive import", description: "Import the approved Corvo visual seed via scripts/import-visual-seed.mjs",
    command: ["node", "scripts/import-visual-seed.mjs", "--apply", `--url=${url}`, ...(sourceDirectory ? [`--source-directory=${sourceDirectory}`] : [])].join(" "),
  });
  return steps;
}

/** Upsert KEY=value lines in .env.local contents: replace the first assignment, drop repeats, append when missing. */
export function upsertEnvFileEntries(contents, entries) {
  const keys = Object.keys(entries);
  const seen = new Set();
  const lines = contents.split(/\r?\n/);
  // A single trailing newline is file structure, not a blank line to keep before appended entries.
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const out = lines.map(line => {
    const key = keys.find(k => line.startsWith(`${k}=`));
    if (key === undefined) return line;
    if (seen.has(key)) return null; // collapse repeated assignments to one
    seen.add(key);
    return `${key}=${entries[key]}`;
  }).filter(line => line !== null);
  for (const key of keys) if (!seen.has(key)) out.push(`${key}=${entries[key]}`);
  return `${out.join("\n")}\n`;
}

export function formatProvisioningFailure(error, stage) {
  const message = error instanceof Error && safeMessages.has(error.message) ? error.message : genericError;
  const safeStage = stages.has(stage) ? stage : "argument preparation";
  return `Visual environment provisioning failed during ${safeStage}. ${message} No automatic retry was attempted; fix the named piece and re-run the script.`;
}

async function runProvisioning() {
  const args = process.argv.slice(2);
  let stage = "argument preparation";
  try {
    const parsed = parseProvisioningArgs(args);
    stage = "destination validation";
    const plan = buildProvisioningPlan(parsed);
    console.log(`Visual environment provisioning plan for ${parsed.brandId} at ${parsed.url}:`);
    for (const step of plan) console.log(`  - [${step.id}] ${step.description}${step.command ? `\n      ${step.command}` : ""}`);
    if (!parsed.apply) {
      console.log("Dry run complete. Provisioning requires --apply, --url, --brand, --budget-limit-micros, and RESONATE_VISUAL_IMPORT_TOKEN containing an authenticated application JWT.");
      return;
    }
    stage = "budget seeding";
    const client = new ConvexHttpClient(parsed.url, { skipConvexDeploymentUrlCheck: true, logger: false });
    client.setAuth(process.env.RESONATE_VISUAL_IMPORT_TOKEN);
    await client.mutation(makeFunctionReference("visualWorkflow:setMonthlyBudget"), { brandId: parsed.brandId, limitMicros: parsed.budgetLimitMicros });
    console.log(`Seeded the ${parsed.brandId} monthly budget row (limitMicros ${parsed.budgetLimitMicros}).`);
    stage = "server rollout flag";
    const flagSet = spawnSync("npx", ["convex", "env", "set", SERVER_ROLLOUT_FLAG, "1", `--url=${parsed.url}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "ignore", "ignore"] });
    if (flagSet.error || flagSet.status !== 0) throw new Error(genericError);
    console.log(`Set ${SERVER_ROLLOUT_FLAG}=1 on the deployment.`);
    stage = "frontend rollout flag";
    const envPath = join(root, ".env.local");
    if (!existsSync(envPath) || !statWritable(envPath)) throw new Error(envFileError);
    writeFileSync(envPath, upsertEnvFileEntries(readFileSync(envPath, "utf8"), { [FRONTEND_ROLLOUT_FLAG]: "1" }));
    console.log(`Set ${FRONTEND_ROLLOUT_FLAG}=1 in .env.local (applies on the next build).`);
    if (!parsed.skipSeedImport) {
      stage = "seed archive import";
      const imported = spawnSync("node", ["scripts/import-visual-seed.mjs", "--apply", `--url=${parsed.url}`, `--source-directory=${parsed.sourceDirectory}`], { cwd: root, stdio: "inherit" });
      if (imported.status !== 0) throw new Error(seedImportError);
    }
    console.log("Visual environment provisioned. Provider keys, route qualification and budget caps remain separately gated; no live provider was contacted by this script.");
  } catch (error) {
    console.error(formatProvisioningFailure(error, stage));
    process.exitCode = 1;
  }
}

function statWritable(path) {
  try { accessSync(path, constants.W_OK); return true; } catch { return false; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runProvisioning();

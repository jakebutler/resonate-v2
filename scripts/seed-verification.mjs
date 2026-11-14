#!/usr/bin/env node
/**
 * CI verification seed (V5) — run the seeding mutation against a *dev* Convex
 * deployment with no human identity.
 *
 * Usage (CI):
 *   CONVEX_DEPLOY_KEY=<dev-deploy-key> node scripts/seed-verification.mjs
 * Options:
 *   --subject=user_ci_verification   synthetic owner for seeded rows
 *   --brand=freshproof               target brand for corpus + budget rows
 *   --dry-run                        report what would be created, write nothing
 *   --skip-env-flags                 do not touch EDITORIAL_VISUALS_ENABLED
 *
 * Authorization follows the repo's ops-secret pattern (see /api/ops/lab-import):
 * the caller holds the deployment's deploy key (CONVEX_DEPLOY_KEY) and the
 * mutation is internal-only — unreachable from the internet except through that
 * secret. The mutation itself still refuses the production deployment outright
 * and requires ALLOW_VERIFICATION_SEED=1 on the deployment
 * (`npx convex env set ALLOW_VERIFICATION_SEED 1` on the dev deployment once).
 *
 * Rollout flags: the Convex-side admission flag (EDITORIAL_VISUALS_ENABLED) is
 * set idempotently here unless --skip-env-flags is passed. The browser-side
 * twin (NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED) is a Vercel/Next env var and is
 * provisioned on the deployment platform, not on Convex.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const PROD_CONVEX_DEPLOYMENT_NAME = "healthy-platypus-553";

// Mirrors convexDeploymentName() in lib/convexDeployment.ts (plain JS here:
// this script runs under node before any TypeScript is loaded). The
// deployment name is the first DNS label of the host, so the refusal survives
// a Convex host-suffix rename; never match host substrings.
function convexDeploymentName(cloudUrl) {
  if (!cloudUrl) return null;
  let hostname;
  try {
    hostname = new URL(cloudUrl).hostname;
  } catch {
    return null;
  }
  const name = hostname.split(".")[0]?.toLowerCase() ?? "";
  return name === "" ? null : name;
}

function flag(name, fallback) {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

const subject = flag("subject", "user_ci_verification");
const brand = flag("brand", "freshproof");
const dryRun = process.argv.includes("--dry-run");
const skipEnvFlags = process.argv.includes("--skip-env-flags");

const deployKey = process.env.CONVEX_DEPLOY_KEY?.trim();
if (!deployKey) {
  console.error(
    "seed-verification: CONVEX_DEPLOY_KEY is not set. CI must hold the *dev* deployment's deploy key."
  );
  process.exit(1);
}

// Belt-and-braces local guard: the mutation refuses production regardless, but
// never even point the CLI at prod (the env-flag step below is not mutation-gated).
const cloudUrl = process.env.CONVEX_CLOUD_URL ?? "";
if (convexDeploymentName(cloudUrl) === PROD_CONVEX_DEPLOYMENT_NAME) {
  console.error(
    "seed-verification: CONVEX_CLOUD_URL points at the production deployment; refusing."
  );
  process.exit(1);
}

function run(args, label) {
  console.log(`seed-verification: ${label}`);
  const result = spawnSync(args[0], args.slice(1), {
    stdio: "inherit",
    env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey },
  });
  if (result.error) {
    console.error(`seed-verification: ${label} failed to launch: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`seed-verification: ${label} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

function runCapture(args) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey },
  });
  return { ok: result.status === 0, stdout: (result.stdout ?? "").trim() };
}

if (!dryRun && !skipEnvFlags) {
  // Idempotent: setting an env var to its current value is a no-op on Convex.
  run(
    ["npx", "convex", "env", "set", "EDITORIAL_VISUALS_ENABLED", "1"],
    "ensuring EDITORIAL_VISUALS_ENABLED=1 on the dev deployment"
  );
}

const payload = JSON.stringify({
  subject,
  brandId: brand,
  dryRun,
});

const check = runCapture([
  "npx",
  "convex",
  "env",
  "get",
  "ALLOW_VERIFICATION_SEED",
]);
if (!check.ok || check.stdout !== "1") {
  console.error(
    "seed-verification: ALLOW_VERIFICATION_SEED is not set to 1 on the deployment.\n" +
      "Set it once on the dev deployment: npx convex env set ALLOW_VERIFICATION_SEED 1"
  );
  process.exit(1);
}

run(
  ["npx", "convex", "run", "verificationSeed:seedVerificationWorkspace", payload],
  dryRun ? "dry-running verification seed" : "running verification seed"
);
console.log("seed-verification: done.");

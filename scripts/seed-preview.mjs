#!/usr/bin/env node
/**
 * Build a Convex mutation payload for the preview sandbox seed.
 *
 * Usage:
 *   node scripts/seed-preview.mjs
 *   node scripts/seed-preview.mjs --dry-run
 *
 * Then run against your *dev* Convex deployment (never production):
 *   npx convex run publishing:seedPreviewWorkspace "$(node scripts/seed-preview.mjs)" \
 *     --identity '{"subject":"user_YOUR_CLERK_ID"}'
 *
 * See docs/preview-seed.md
 */
import process from "node:process";

const dryRun = process.argv.includes("--dry-run");

console.log(JSON.stringify({ dryRun }));

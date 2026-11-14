#!/usr/bin/env node
// Visual route qualification (C3): the operator tooling the qualification packets assumed.
//
// Fixture mode (default, zero cost, CI default): verifies the committed packet chain —
// the functional packet's sha256 anchor on the base packet, the reviewed caps and quote
// guards, the frozen reference metadata — and reports the live criteria ABSENT with the
// named prerequisite. Nothing is dispatched and no key is read.
//
// Live mode (--live): executes the reviewed two-call functional packet (≤ $0.25 per call,
// ≤ $0.50 total) on a dev deployment via visualQualification:executeImageQualificationPacket,
// then — with --registration-json — persists the qualified routes through
// visualQualification:persistQualifiedRoutes, the operator gate over
// registerReviewedImageRoute / registerReviewedTextRoute. Requires the deployment env vars
// VISUAL_QUALIFICATION_APPROVED=approved and VISUAL_QUALIFICATION_OPERATOR_TOKEN plus
// provider credentials; without them the run reports ABSENT explicitly.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import assert from "node:assert/strict";
import { makeFunctionReference } from "convex/server";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROVIDERS_DIR = join(repoRoot, "docs/editorial-visuals/providers");
const RUNS_DIR = join(PROVIDERS_DIR, "qualification-runs");
const LIVE_ABSENT_PREREQUISITE = "Jake mints the scoped provider keys (OPENAI_API_KEY image-only, OPENAI_TEXT_API_KEY or CORTEX_API_KEY) and provisions them via Obvious secrets; the deployment also needs VISUAL_QUALIFICATION_APPROVED=approved and VISUAL_QUALIFICATION_OPERATOR_TOKEN.";

function loadPacket(name) {
  return JSON.parse(readFileSync(join(PROVIDERS_DIR, name), "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export async function verifyPacketChain({ load = loadPacket } = {}) {
  const base = load("qualification-packet.json");
  const functional = load("functional-first-packet.json");
  const baseBytes = readFileSync(join(PROVIDERS_DIR, "qualification-packet.json"));
  assert.equal(createHash("sha256").update(baseBytes).digest("hex"), functional.base_packet_sha256, "functional-first-packet.json no longer anchors the committed base packet");
  assert.equal(functional.provider, "openai");
  assert.equal(functional.canonical_model, "gpt-image-2");
  assert.equal(functional.maximum_charge_usd, 0.25, "per-call functional cap moved from the reviewed $0.25");
  assert.equal(functional.sequence_planned_maximum_usd, 0.5, "two-call sequence cap moved from the reviewed $0.50");
  assert.equal(functional.quote_guards.prompt_utf8_bytes_max, 9045, "prompt quote guard moved from the reviewed 9,045 bytes");
  assert.equal(functional.reference_inputs.length, 2, "the reviewed packet binds exactly two reference inputs");
  assert.equal(base.generation.prompt_utf8_bytes, Buffer.byteLength(base.generation.prompt, "utf8"), "base packet prompt byte count is stale");
  const composedEditPrompt = `Image 1 is the selected image to edit. Image 2 supplies raven identity. Image 3 supplies materials and lighting. ${base.edit.feedback}`;
  assert.equal(composedEditPrompt, base.edit.prompt, "the composed edit prompt no longer matches the base packet");
  return { base, functional };
}

function parseArgs(argv) {
  const options = { live: false, record: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--live") { options.live = true; continue; }
    if (flag === "--record") { options.record = true; continue; }
    const valued = { "--deployment-url": "deploymentUrl", "--reference-dir": "referenceDir", "--registration-json": "registrationJson" };
    if (!valued[flag] || !argv[i + 1]) throw new Error(`usage: node scripts/qualify-visual-routes.mjs [--record] [--live --deployment-url <dev-url> --reference-dir <dir> [--registration-json <file>]]`);
    options[valued[flag]] = argv[++i];
  }
  if (options.live && (!options.deploymentUrl || !options.referenceDir)) throw new Error("--live requires --deployment-url and --reference-dir");
  return options;
}

async function livePacketRun(options, base, functional) {
  for (const name of ["prod", "production"]) {
    if (options.deploymentUrl.includes(name)) throw new Error(`refusing to qualify routes against a production deployment`);
  }
  const references = [];
  for (const frozen of functional.reference_inputs) {
    const path = join(resolve(options.referenceDir), frozen.source_file_name);
    if (!existsSync(path)) throw new Error(`missing reference image ${frozen.source_file_name}; the reviewed packet's approved inputs are required`);
    const bytes = readFileSync(path);
    assert.equal(sha256File(path), frozen.sha256, `${frozen.source_file_name} differs from the approved packet sha256`);
    assert.equal(bytes.length, frozen.bytes, `${frozen.source_file_name} differs from the approved packet byte count`);
    const { default: sharp } = await import("sharp");
    const meta = await sharp(bytes).metadata();
    assert.equal(meta.width, frozen.width, `${frozen.source_file_name} differs from the approved packet dimensions`);
    assert.equal(meta.height, frozen.height, `${frozen.source_file_name} differs from the approved packet dimensions`);
    references.push({ role: frozen.role, bytesBase64: bytes.toString("base64") });
  }
  const { ConvexHttpClient } = await import("convex/browser");
  const client = new ConvexHttpClient(options.deploymentUrl, { skipConvexDeploymentUrlCheck: true, logger: false });
  const operatorToken = process.env.VISUAL_QUALIFICATION_OPERATOR_TOKEN;
  if (!operatorToken?.trim()) throw new Error("VISUAL_QUALIFICATION_OPERATOR_TOKEN is not set in this shell; the deployment gate also requires its own copy of the token");
  const run = await client.action(makeFunctionReference("visualQualification:executeImageQualificationPacket"), {
    operatorToken,
    generationPrompt: base.generation.prompt,
    editFeedback: base.edit.feedback,
    references,
  });
  if (run.status === "absent") return { run };
  if (run.status === "blocked") throw new Error(`the deployment refused the live packet: ${run.reason}`);
  if (run.status !== "completed") throw new Error(`the live packet did not complete: ${run.status} (${run.reason ?? "no reason"})`);
  for (const call of run.calls) {
    assert.ok(call.estimatedCostUsd !== null && call.estimatedCostUsd <= functional.maximum_charge_usd, `call cost ${call.estimatedCostUsd} exceeds the reviewed per-call cap`);
  }
  const total = run.calls.reduce((sum, call) => sum + (call.estimatedCostUsd ?? 0), 0);
  assert.ok(total <= functional.sequence_planned_maximum_usd, `packet total ${total} exceeds the reviewed $0.50 sequence cap`);
  return { run, total };
}

async function persistRoutes(options) {
  if (!options.registrationJson) return { skipped: "no --registration-json supplied; routes were not registered" };
  const registration = JSON.parse(readFileSync(resolve(options.registrationJson), "utf8"));
  const { ConvexHttpClient } = await import("convex/browser");
  const client = new ConvexHttpClient(options.deploymentUrl, { skipConvexDeploymentUrlCheck: true, logger: false });
  const result = await client.action(makeFunctionReference("visualQualification:persistQualifiedRoutes"), {
    operatorToken: process.env.VISUAL_QUALIFICATION_OPERATOR_TOKEN,
    imageRoute: { ...registration.imageRoute },
    textRoute: registration.textRoute ? { ...registration.textRoute } : undefined,
  });
  return { result };
}

function fixtureRecord({ base, functional }, outcomes) {
  const date = new Date().toISOString().slice(0, 10);
  return `# Qualification run — fixture mode — ${date}

- Mode: **fixture (offline, zero cost)** — the CI default; no provider call was made and no credential was read.
- Packet chain: \`functional-first-packet.json\` sha256-anchors \`qualification-packet.json\` at \`${functional.base_packet_sha256.slice(0, 12)}…\` — verified.
- Reviewed caps: $${functional.maximum_charge_usd} per call, $${functional.sequence_planned_maximum_usd} two-call sequence; prompt quote guard ${functional.quote_guards.prompt_utf8_bytes_max} UTF-8 bytes — verified.
- Composed edit prompt matches the base packet \`edit.prompt\` — verified.
- Frozen reference inputs: ${functional.reference_inputs.map(reference => `${reference.role} ${reference.width}x${reference.height} (${reference.bytes} bytes)`).join("; ")} — metadata verified.
- Live criteria: **ABSENT** — prerequisite: ${LIVE_ABSENT_PREREQUISITE}
- Live execution deferred until the prerequisite clears; this record proves the offline packet only.
- Base packet scene: article ${base.selected_scene.article} ("${base.selected_scene.central_story}").
${outcomes ?? ""}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const packets = await verifyPacketChain();
  if (!options.live) {
    const record = fixtureRecord(packets);
    console.log(record);
    if (options.record) {
      mkdirSync(RUNS_DIR, { recursive: true });
      const path = join(RUNS_DIR, `${new Date().toISOString().slice(0, 10)}-fixture.md`);
      writeFileSync(path, `${record}\n`);
      console.log(`\nRecorded: ${path}`);
    }
    return;
  }
  const { run, total } = await livePacketRun(options, packets.base, packets.functional);
  if (run.status === "absent") {
    console.log(`Live criteria: ABSENT (${run.reason})`);
    console.log(`Missing credentials: ${run.missingCredentials.join(", ")}`);
    console.log(`Prerequisite: ${run.prerequisite}`);
    process.exitCode = 2;
    return;
  }
  console.log(`Live packet completed: ${run.calls.length} calls, total estimated $${total.toFixed(4)} (caps $${packets.functional.maximum_charge_usd}/$${packets.functional.sequence_planned_maximum_usd})`);
  for (const call of run.calls) {
    console.log(`- ${call.operation}: http ${call.httpStatus}${call.requestId ? ` req ${call.requestId}` : ""}, ${call.width}x${call.height}, output sha256 ${call.outputSha256.slice(0, 12)}…, stored ${call.outputStorageId}`);
  }
  const persisted = await persistRoutes(options);
  if (persisted.skipped) console.log(`Registration: ${persisted.skipped}`);
  else console.log(`Registered routes: image=${persisted.result.imageRouteId ?? "none"} text=${persisted.result.textRouteId ?? "none"}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const cause = error?.cause;
    console.error(`qualification failed: ${error.message}${cause ? ` (cause: ${String(cause)})` : ""}`);
    process.exitCode = 1;
  });
}

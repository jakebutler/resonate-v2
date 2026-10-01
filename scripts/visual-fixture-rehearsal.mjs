#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { FIXTURE_ROOT, FIXTURE_CONVEX_URL, FIXTURE_ISSUER, FIXTURE_NEXT_ORIGIN, FIXTURE_SUBJECT, verifyLocalFixtureTarget, fixtureIssuerSelfTest } from "./visual-fixture-issuer.mjs";

const execute = promisify(execFile);
export const FIXTURE_TITLE = "LOCAL FIXTURE — Editorial visual rehearsal";
export const FIXTURE_CONTENT = "# LOCAL FIXTURE — Editorial visual rehearsal\n\nThis is fictional local test content. It makes no real article claim and is never published.\n\nA raven inspects a fictional machine and chooses to repair the broken gear. A navigator follows a lantern through a doorway and discovers a blocked passage. A builder tests the crossing before trusting the bridge.\n\nThese fictional turning points support three intentionally different rehearsal scenes. Generated pixels are a deterministic labelled test pattern, not an image-model result or aesthetic qualification.";
const FIXTURE_ROUTE = { provider: "offline-fixture", model: "offline-fixture", qualification: "unqualified" };
const INTERNAL_FUNCTIONS = new Set(["visualWorkflow:registerLocalFixtureQuote", "visualWorkflow:reserveAttempt", "visualWorkflow:claimAttempt", "visualWorkflow:completePlan", "visualWorkflow:completeImage", "visualWorkflow:completeReflection", "visualWorkflow:markUncertain"]);

export function parseFixtureArgs(args) {
  const [mode, ...rest] = args;
  if (!["init", "status", "complete-plan", "complete-generation", "complete-edit", "complete-reflection", "--self-test"].includes(mode)) throw new Error("LOCAL_FIXTURE_ARGUMENTS_REJECTED");
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === "--import-seed" && mode === "init" && options.importSeed === undefined) { options.importSeed = true; continue; }
    if (!["--post-id", "--attempt-id"].includes(flag) || options[flag] || !rest[i + 1] || rest[i + 1].startsWith("--")) throw new Error("LOCAL_FIXTURE_ARGUMENTS_REJECTED");
    const value = rest[++i];
    if (!/^[a-zA-Z0-9_-]{10,100}$/.test(value)) throw new Error("LOCAL_FIXTURE_ID_REJECTED");
    options[flag] = value;
  }
  if (["init", "--self-test"].includes(mode) && (options["--post-id"] || options["--attempt-id"])) throw new Error("LOCAL_FIXTURE_ARGUMENTS_REJECTED");
  if (!["init", "--self-test"].includes(mode) && !options["--post-id"]) throw new Error("LOCAL_FIXTURE_POST_REQUIRED");
  if (mode === "status" && options["--attempt-id"]) throw new Error("LOCAL_FIXTURE_ARGUMENTS_REJECTED");
  return { mode, options };
}

export function assertFictionalPost(post) {
  if (!post || post.userId !== FIXTURE_SUBJECT || post.brandId !== "corvo" || post.channelId !== "corvo-blog" || post.title !== FIXTURE_TITLE || post.content !== FIXTURE_CONTENT) throw new Error("LOCAL_FIXTURE_POST_REJECTED");
}

export function parseCliResult(output) {
  const lines = output.trim().split("\n");
  for (let i = 0; i < lines.length; i++) {
    try { return JSON.parse(lines.slice(i).join("\n")); } catch { /* Ignore non-JSON CLI chatter, never echo it. */ }
  }
  throw new Error("LOCAL_FIXTURE_RESULT_UNREADABLE");
}

async function internalCall(name, args) {
  if (!INTERNAL_FUNCTIONS.has(name)) throw new Error("LOCAL_FIXTURE_INTERNAL_FUNCTION_REJECTED");
  await verifyLocalFixtureTarget();
  const { stdout } = await execute(process.execPath, [resolve(FIXTURE_ROOT, "node_modules/convex/bin/main.js"), "run", name, JSON.stringify(args), "--env-file", resolve(FIXTURE_ROOT, ".env.local"), "--codegen", "disable", "--typecheck", "disable"], { cwd: FIXTURE_ROOT, env: { ...process.env, CONVEX_AGENT_MODE: "anonymous", CONVEX_DEPLOYMENT: "anonymous:anonymous-agent" }, maxBuffer: 2 * 1024 * 1024, timeout: 30_000 });
  return parseCliResult(stdout);
}

async function clientForFixture() {
  await verifyLocalFixtureTarget();
  const response = await fetch(`${FIXTURE_ISSUER}/token`, { headers: { Origin: FIXTURE_NEXT_ORIGIN }, redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("LOCAL_FIXTURE_AUTH_UNAVAILABLE");
  const payload = await response.json();
  if (payload.subject !== FIXTURE_SUBJECT || payload.fixture !== true || payload.expiresIn !== 120 || typeof payload.token !== "string") throw new Error("LOCAL_FIXTURE_AUTH_REJECTED");
  const { ConvexHttpClient } = await import("convex/browser");
  const { makeFunctionReference } = await import("convex/server");
  const client = new ConvexHttpClient(FIXTURE_CONVEX_URL);
  client.setAuth(payload.token);
  return { client, ref: makeFunctionReference, token: payload.token };
}

async function initialize({ client, ref, token }, options) {
  await client.mutation(ref("publishing:seedMvpWorkspace"), {});
  if (options.importSeed) {
    // Existing importer verifies all 16 source masters. JWT is child-process env only.
    await verifyLocalFixtureTarget();
    await execute(process.execPath, [resolve(FIXTURE_ROOT, "scripts/import-visual-seed.mjs"), "--apply", "--url", FIXTURE_CONVEX_URL], { cwd: FIXTURE_ROOT, env: { ...process.env, RESONATE_VISUAL_IMPORT_TOKEN: token }, maxBuffer: 1024 * 1024, timeout: 60_000 });
    console.log("Imported hash-verified Corvo references into the fictional local deployment only.");
  }
  const current = await client.query(ref("visualProfiles:getProfile"), { brandId: "corvo" });
  const guidance = current?.revision ?? { artDirection: "Fictional fixture patterns for workflow engineering only", palette: [{ name: "Teal", color: "#2E5B60" }], mascotGuidance: "No visual identity qualification is claimed", compositionGuidance: "Label every fixture clearly", textPolicy: "LOCAL OFFLINE FIXTURE label", heroChartPolicy: "No factual chart values" };
  if (current?.revision.defaultRoute?.provider !== FIXTURE_ROUTE.provider || current.revision.defaultRoute.model !== FIXTURE_ROUTE.model) {
    await client.mutation(ref("visualProfiles:saveRevision"), { brandId: "corvo", expectedRevisionId: current?.revision._id ?? null, guidance: { artDirection: guidance.artDirection, palette: guidance.palette, mascotGuidance: guidance.mascotGuidance, compositionGuidance: guidance.compositionGuidance, textPolicy: guidance.textPolicy, heroChartPolicy: guidance.heroChartPolicy }, referenceBindings: current?.revision.referenceBindings ?? [], defaultRoute: FIXTURE_ROUTE });
  }
  await client.mutation(ref("visualWorkflow:setMonthlyBudget"), { brandId: "corvo", limitMicros: 0 });
  const posts = await client.query(ref("publishing:listPosts"), { brandIds: ["corvo"], platformIds: ["corvo-blog"] });
  const existing = posts.filter(post => post.userId === FIXTURE_SUBJECT && post.title === FIXTURE_TITLE);
  if (existing.length > 1) throw new Error("LOCAL_FIXTURE_DUPLICATES_REQUIRE_INSPECTION");
  const postId = existing[0]?._id ?? (await client.mutation(ref("publishing:createPostWithIntent"), { brandId: "corvo", channelId: "corvo-blog", title: FIXTURE_TITLE, content: FIXTURE_CONTENT, timezone: "UTC" })).postId;
  assertFictionalPost(await client.query(ref("publishing:getPostById"), { postId }));
  console.log(`Fictional local post ready: ${postId}`);
  console.log(`Composer: ${FIXTURE_NEXT_ORIGIN}/?postId=${encodeURIComponent(postId)}`);
  console.log("Use the actual composer for Plan, Generate, and Edit. This script does not approve or publish assets.");
}

function scenesForFictionalArticle() {
  return [
    { title: "Inspect and repair", subject: "raven in a workshop", metaphor: "diagnosis before intervention", action: "raven removes a broken gear from a fictional machine", reveal: "the missing tooth explains its failure", articleConnection: "The fictional inspection finds a cause before repair.", articleAnchor: "repair the broken gear" },
    { title: "Illuminate the choice", subject: "navigator at a stone doorway", metaphor: "evidence guides a decision", action: "navigator follows a lantern beam through the doorway", reveal: "light exposes a blocked passage before entry", articleConnection: "The fictional navigator discovers the obstacle through inspection.", articleAnchor: "follows a lantern through a doorway" },
    { title: "Load the crossing", subject: "bridge builder beside a river", metaphor: "verification before reliance", action: "builder lowers a weighted basket onto the crossing", reveal: "a weak joint bends while the builder stays on the bank", articleConnection: "The fictional builder tests the bridge before trusting it.", articleAnchor: "tests the crossing before trusting the bridge" },
  ];
}

async function uploadPattern({ client, ref }, edited) {
  const sharp = (await import("sharp")).default;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#ECE9E2"/><rect x="128" y="200" width="1280" height="624" rx="32" fill="${edited ? "#C2612C" : "#2E5B60"}"/><circle cx="${edited ? 1000 : 768}" cy="512" r="160" fill="#B7C4B4"/><text x="768" y="120" text-anchor="middle" font-size="48" font-family="sans-serif" fill="#22272B">LOCAL OFFLINE FIXTURE</text><text x="768" y="930" text-anchor="middle" font-size="36" font-family="sans-serif" fill="#22272B">${edited ? "EDITED TEST PATTERN" : "GENERATED TEST PATTERN"} — NO MODEL QUALIFICATION</text></svg>`;
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  if (bytes.length > 2 * 1024 * 1024) throw new Error("LOCAL_FIXTURE_IMAGE_TOO_LARGE");
  await verifyLocalFixtureTarget();
  const { storageId } = await client.action(ref("v2Storage:uploadImage"), { brandId: "corvo", fileName: edited ? "local-fixture-edited.png" : "local-fixture-generated.png", contentType: "image/png", bytes: Uint8Array.from(bytes).buffer });
  if (typeof storageId !== "string") throw new Error("LOCAL_FIXTURE_STORAGE_RESULT_REJECTED");
  return { storageId, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, contentType: "image/png", width: 1536, height: 1024 };
}

async function completeQueued(context, mode, options) {
  const { client, ref } = context;
  const postId = options["--post-id"];
  const post = await client.query(ref("publishing:getPostById"), { postId });
  assertFictionalPost(post);
  const workflow = await client.query(ref("visualWorkflow:get"), { postId });
  if (mode === "status") {
    console.log(JSON.stringify({ fixture: true, postId, approvalState: post.approvalState, selectedVersionId: workflow.state?.selectedVersionId ?? null, attempts: workflow.attempts.map(item => ({ id: item._id, stage: item.stage, status: item.status, pauseReason: item.pauseReason ?? null, provider: item.quotedProvider ?? item.input.provider, model: item.quotedModel ?? item.input.model })), versions: workflow.versions.map(item => ({ id: item._id, parent: item.parentVersionId, provider: item.provider, model: item.model, bytes: item.bytes, exportHash: item.exportHash ?? null, approvedBy: item.approvedBy ?? null })), reflections: workflow.reflections.map(item => ({ id: item._id, attemptId: item.attemptId, candidateStatus: item.validationStatus, lessonCount: item.lessonIds.length })) }, null, 2));
    return;
  }
  const stage = { "complete-plan": "planning", "complete-generation": "generation", "complete-edit": "edit", "complete-reflection": "reflection" }[mode];
  const candidates = workflow.attempts.filter(item => item.stage === stage && item.status === "queued" && (!options["--attempt-id"] || item._id === options["--attempt-id"]));
  if (candidates.length !== 1) throw new Error("LOCAL_FIXTURE_REQUIRES_ONE_EXPLICIT_QUEUED_ATTEMPT");
  const attempt = candidates[0];
  if (attempt.userId !== FIXTURE_SUBJECT || attempt.postId !== postId || attempt.brandId !== "corvo") throw new Error("LOCAL_FIXTURE_ATTEMPT_REJECTED");
  if (["generation", "edit"].includes(stage) && (attempt.input.provider !== "offline-fixture" || attempt.input.model !== "offline-fixture")) throw new Error("LOCAL_FIXTURE_ROUTE_REJECTED");
  const quoteId = await internalCall("visualWorkflow:registerLocalFixtureQuote", { attemptId: attempt._id, maximumMicros: 0, provider: "offline-fixture", model: "offline-fixture" });
  const reservation = await internalCall("visualWorkflow:reserveAttempt", { attemptId: attempt._id, quoteId });
  if (!reservation.admitted) throw new Error("LOCAL_FIXTURE_RESERVATION_REJECTED");
  const claim = await internalCall("visualWorkflow:claimAttempt", { attemptId: attempt._id });
  if (!claim) throw new Error("LOCAL_FIXTURE_ALREADY_CLAIMED_NO_RETRY");
  const common = { attemptId: attempt._id, claimKey: claim.claimKey, actualMicros: 0, usageKind: "estimated", usageReceipt: "LOCAL OFFLINE FIXTURE — deterministic test pattern/fictional text; zero paid requests; no provider qualification" };
  try {
    let result;
    if (stage === "planning") result = await internalCall("visualWorkflow:completePlan", { ...common, scenes: scenesForFictionalArticle() });
    else if (stage === "reflection") result = await internalCall("visualWorkflow:completeReflection", { ...common, candidatePrompt: "UNTESTED LOCAL FIXTURE: retain the fictional scene and accepted pattern composition. This is not an image-model prompt qualification.", lessons: [{ title: "Fictional local pattern observation", instruction: "For this fictional rehearsal post, retain the clearly visible LOCAL OFFLINE FIXTURE label.", role: "image_generator", sceneTags: [], modelSpecific: true, postSpecific: true }], profileChangeProposals: [] });
    else result = await internalCall("visualWorkflow:completeImage", { ...common, ...await uploadPattern(context, stage === "edit") });
    console.log(`Completed fictional ${stage} output: ${result}. No paid provider or human approval was claimed.`);
  } catch {
    try { await internalCall("visualWorkflow:markUncertain", { attemptId: attempt._id, claimKey: claim.claimKey, reason: "LOCAL OFFLINE FIXTURE — interrupted local storage/completion; inspect durable state before any manual repair" }); } catch { /* Completion may already have succeeded; never repeat it blindly. */ }
    throw new Error("LOCAL_FIXTURE_COMPLETION_UNCERTAIN_INSPECT_STATE");
  }
}

export function rehearsalSelfTest() {
  fixtureIssuerSelfTest();
  assert.throws(() => parseFixtureArgs(["init", "--prod"]));
  assert.throws(() => parseFixtureArgs(["complete-plan", "--url", "https://cloud.convex.cloud"]));
  assert.throws(() => parseFixtureArgs(["status"]));
  assert.deepEqual(parseFixtureArgs(["init", "--import-seed"]), { mode: "init", options: { importSeed: true } });
  assert.equal(parseCliResult('CLI chatter\n{"admitted":true}\n').admitted, true);
  assert.equal(parseCliResult('CLI chatter\n"fictional-id"\n'), "fictional-id");
  assert.throws(() => assertFictionalPost({ userId: "real-author", title: FIXTURE_TITLE }));
  assert.doesNotThrow(() => assertFictionalPost({ userId: FIXTURE_SUBJECT, brandId: "corvo", channelId: "corvo-blog", title: FIXTURE_TITLE, content: FIXTURE_CONTENT }));
  assert.equal(scenesForFictionalArticle().length, 3);
  assert.equal(scenesForFictionalArticle().every(scene => FIXTURE_CONTENT.includes(scene.articleAnchor)), true);
  console.log("Rehearsal offline argument, fictional ownership, and receipt parsing tests passed. No network, process, or database mutation ran.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { mode, options } = parseFixtureArgs(process.argv.slice(2));
    if (mode === "--self-test") rehearsalSelfTest();
    else {
      const context = await clientForFixture();
      if (mode === "init") await initialize(context, options);
      else await completeQueued(context, mode, options);
    }
  } catch { console.error("Local fixture rehearsal rejected the target/input or could not complete. No automatic retry, paid request, approval, or publication was attempted; inspect durable local state."); process.exitCode = 1; }
}

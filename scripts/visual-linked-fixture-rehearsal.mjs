#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_ROOT, FIXTURE_CONVEX_URL, FIXTURE_DEPLOYMENT, FIXTURE_ISSUER, FIXTURE_NEXT_ORIGIN, FIXTURE_SUBJECT, assertLocalFixtureTarget, verifyLocalFixtureTarget } from "./visual-fixture-issuer.mjs";

export const LINKED_FIXTURE_TITLE = "LOCAL FIXTURE — Linked evidence rehearsal";
export const LINKED_FIXTURE_TABLE = "| label | value | unit | population | denominator | citation |\n| --- | --- | --- | --- | --- | --- |\n| Fictional copper widgets | 12 | fictional widgets | fictional workshop population | 100 fictional widgets | local-offline-fixture-linked-numeric-v1 |\n| Fictional paper widgets | 24 | fictional widgets | fictional workshop population | 100 fictional widgets | local-offline-fixture-linked-numeric-v1 |";
export const LINKED_FIXTURE_CONTENT = `# ${LINKED_FIXTURE_TITLE}\n\nThis is fictional local test content. Every name and number is invented. It makes no real-world claim and must never be published or scheduled.\n\nThe fictional table is coded rehearsal evidence for a local database-linked import. It is not external research, an image-model result, human approval, or provider qualification.\n\n## Fictional numeric rehearsal data\n\n${LINKED_FIXTURE_TABLE}`;
const sha = value => createHash("sha256").update(value).digest("hex");
export const LINKED_FIXTURE_HASH = sha(LINKED_FIXTURE_CONTENT);
export const LINKED_TABLE_HASH = sha(LINKED_FIXTURE_TABLE);
const fail = code => { throw new Error(code); };
const SOURCE_ID = "local-offline-fixture-linked-numeric-v1";
const WARNING = "LOCAL OFFLINE FICTIONAL FIXTURE — all rows invented; no research, approval, provider call or publication.";
const SOURCE_URL = "https://fictional.invalid/local-offline-fixture-linked-numeric-v1";
export const BRIEF_INPUT = { localBriefId: "local-linked-numeric-rehearsal-v1", brandId: "corvo", topic: LINKED_FIXTURE_TITLE, audience: "Fictional local engineering rehearsal", thesis: WARNING, depth: "light", riskLevel: "low", targetOutputs: ["fictional-linked-evidence-rehearsal"], provider: "offline-fixture", warning: WARNING, sources: [{ id: SOURCE_ID, title: "Fictional numeric rehearsal source", url: SOURCE_URL, domain: "fictional.invalid", evidenceLabel: "fictional-coded-fixture", status: "accepted", reviewerNotes: WARNING, raw: { excerpt: LINKED_FIXTURE_TABLE } }] };
export function claimInput(researchBriefId) { return { localClaimMapId: "local-linked-numeric-rehearsal-v1", researchBriefId, brandId: "corvo", topic: LINKED_FIXTURE_TITLE, thesis: WARNING, provider: "offline-fixture", warning: WARNING, claims: [{ id: "fictional-numeric-table-v1", text: LINKED_FIXTURE_TABLE, sourceIds: [SOURCE_ID], evidenceLabel: "fictional-coded-fixture", confidence: "fictional-fixture-only", caveats: WARNING, reviewerNotes: WARNING, status: "accepted" }] }; }
export function postInput(researchBriefId) { return { brandId: "corvo", channelId: "corvo-blog", title: LINKED_FIXTURE_TITLE, content: LINKED_FIXTURE_CONTENT, timezone: "UTC", sourceResearchBriefId: researchBriefId }; }

export function assertLinkedTarget(target) { assertLocalFixtureTarget(target); return target; }
export function parseLinkedArgs(args) { if (args.length !== 1 || !["init", "status", "--self-test"].includes(args[0])) fail("LINKED_FIXTURE_ARGUMENTS_REJECTED"); return { mode: args[0] }; }
const validId = value => typeof value === "string" && /^[a-z0-9]{10,100}$/.test(value);
export function assertLinkedPost(post) {
  if (!post || !validId(post._id) || !validId(post.sourceResearchBriefId) || post.userId !== FIXTURE_SUBJECT || post.brandId !== "corvo" || post.channelId !== "corvo-blog" || post.platformId !== "corvo-blog" || post.title !== LINKED_FIXTURE_TITLE || post.content !== LINKED_FIXTURE_CONTENT || post.status !== "draft" || post.approvalState !== "unapproved" || post.scheduledDate || post.scheduledTime || post.prUrl || post.branchName || post.sourceIdeaId || post.sourceCampaignId || post.sourceExcerptIds?.length) fail("LINKED_FIXTURE_POST_REJECTED");
  return post;
}
export function assertLinkedCall(kind, name, args) {
  let expected;
  if (kind === "query" && name === "publishing:listPosts") expected = { brandIds: ["corvo"], platformIds: ["corvo-blog"] };
  else if (kind === "query" && ["publishing:getPostById", "visualLinkedEvidence:getSnapshot"].includes(name) && validId(args?.postId)) expected = { postId: args.postId };
  else if (kind === "query" && name === "research:getResearchBrief" && validId(args?.researchBriefId)) expected = { researchBriefId: args.researchBriefId };
  else if (kind === "mutation" && name === "research:saveResearchBrief") expected = BRIEF_INPUT;
  else if (kind === "mutation" && name === "research:saveClaimMap" && validId(args?.researchBriefId)) expected = claimInput(args.researchBriefId);
  else if (kind === "mutation" && name === "publishing:createPostWithIntent" && validId(args?.sourceResearchBriefId)) expected = postInput(args.sourceResearchBriefId);
  else fail("LINKED_FIXTURE_FUNCTION_REJECTED");
  assert.deepEqual(args, expected);
  return { kind, name, args };
}
function assertBrief(snapshot, researchBriefId) {
  const brief = snapshot?.brief; const sources = snapshot?.sources;
  if (!brief || brief._id !== researchBriefId || brief.userId !== FIXTURE_SUBJECT || brief.brandId !== "corvo" || brief.localBriefId !== BRIEF_INPUT.localBriefId || brief.topic !== LINKED_FIXTURE_TITLE || brief.provider !== "offline-fixture" || brief.warning !== WARNING || !Array.isArray(sources) || sources.length !== 1) fail("LINKED_FIXTURE_BRIEF_REJECTED");
  const source = sources[0];
  if (!validId(source._id) || source.researchBriefId !== researchBriefId || source.userId !== FIXTURE_SUBJECT || source.brandId !== "corvo" || source.sourceId !== SOURCE_ID || source.url !== SOURCE_URL || source.status !== "accepted" || source.raw?.excerpt !== LINKED_FIXTURE_TABLE) fail("LINKED_FIXTURE_SOURCE_REJECTED");
}
function assertSnapshot(snapshot, researchBriefId, claimMapId) {
  if (!snapshot || typeof snapshot.content !== "string" || !snapshot.content.includes(LINKED_FIXTURE_TABLE) || Buffer.byteLength(snapshot.content) > 65536 || !Array.isArray(snapshot.records) || snapshot.records.length !== 2 || !Array.isArray(snapshot.reasons) || snapshot.reasons.length) fail("LINKED_FIXTURE_SNAPSHOT_REJECTED");
  const provenanceMatch = snapshot.content.match(/^Stored linked research snapshot; review statuses are preserved\. No new research or approval is inferred\.\n\nProvenance:\n```json\n([^]*?)\n```/);
  if (!provenanceMatch) fail("LINKED_FIXTURE_PROVENANCE_REJECTED");
  const provenance = JSON.parse(provenanceMatch[1]);
  if (provenance.links?.researchBriefId !== researchBriefId || provenance.brief?.id !== researchBriefId || provenance.links?.sourceCampaignId !== null || provenance.links?.sourceExcerptIds?.length || provenance.sources?.length !== 1 || provenance.claimMaps?.length !== 1 || provenance.corpusExcerpts?.length) fail("LINKED_FIXTURE_PROVENANCE_REJECTED");
  const map = provenance.claimMaps[0]; const source = provenance.sources[0];
  if (!validId(map.id) || claimMapId && map.id !== claimMapId || map.status !== "review-ready" || source.sourceId !== SOURCE_ID || source.url !== SOURCE_URL || source.status !== "accepted" || source.sha256 !== LINKED_TABLE_HASH) fail("LINKED_FIXTURE_CHAIN_REJECTED");
  for (const kind of ["claim", "source-excerpt"]) {
    const rows = snapshot.records.filter(record => record.kind === kind);
    if (rows.length !== 1 || !validId(rows[0].id) || rows[0].text !== LINKED_FIXTURE_TABLE || rows[0].sha256 !== LINKED_TABLE_HASH || rows[0].status !== "accepted" || rows[0].eligible !== true || rows[0].reason !== null || JSON.stringify(rows[0].sourceIds) !== JSON.stringify([SOURCE_ID])) fail("LINKED_FIXTURE_RECORD_REJECTED");
    if (kind === "source-excerpt" && source.id !== rows[0].id) fail("LINKED_FIXTURE_CHAIN_REJECTED");
  }
  if (!/^[a-f0-9]{64}$/.test(snapshot.snapshotHash)) fail("LINKED_FIXTURE_SNAPSHOT_REJECTED");
  return map.id;
}
const stages = ["research-brief", "claim-map", "post"];
export function validateFrontier(records) {
  if (!Array.isArray(records) || records.length > 20) fail("LINKED_FIXTURE_FRONTIER_REJECTED");
  let last = null;
  for (const record of records) {
    if (!record || Object.keys(record).some(key => !["v", "fixtureHash", "stage", "status", "researchBriefId", "claimMapId", "postId"].includes(key)) || record.v !== 1 || record.fixtureHash !== LINKED_FIXTURE_HASH || !stages.includes(record.stage) || !["dispatching", "succeeded", "uncertain"].includes(record.status)) fail("LINKED_FIXTURE_FRONTIER_REJECTED");
    for (const key of ["researchBriefId", "claimMapId", "postId"]) if (record[key] !== undefined && !validId(record[key])) fail("LINKED_FIXTURE_FRONTIER_REJECTED");
    if (!last && (record.stage !== "research-brief" || record.status !== "dispatching" || record.researchBriefId || record.claimMapId || record.postId)) fail("LINKED_FIXTURE_FRONTIER_REJECTED");
    if (last) {
      if (last.status === "uncertain" || last.status === "dispatching" && (record.stage !== last.stage || !["succeeded", "uncertain"].includes(record.status)) || last.status === "succeeded" && (stages.indexOf(record.stage) !== stages.indexOf(last.stage) + 1 || record.status !== "dispatching")) fail("LINKED_FIXTURE_FRONTIER_REJECTED");
      for (const key of ["researchBriefId", "claimMapId", "postId"]) if (last[key] && record[key] !== last[key]) fail("LINKED_FIXTURE_FRONTIER_REJECTED");
    }
    if (record.stage !== "research-brief" && !record.researchBriefId || record.stage === "post" && !record.claimMapId || record.status === "succeeded" && !record[{ "research-brief": "researchBriefId", "claim-map": "claimMapId", post: "postId" }[record.stage]]) fail("LINKED_FIXTURE_FRONTIER_REJECTED");
    last = record;
  }
  return last;
}
export async function runLinkedInit(context, mode = "init") {
  const records = await context.journal.read(); const last = validateFrontier(records);
  const posts = await context.query("publishing:listPosts", { brandIds: ["corvo"], platformIds: ["corvo-blog"] });
  if (!Array.isArray(posts) || posts.length > 10000) fail("LINKED_FIXTURE_POST_LIST_REJECTED");
  const matches = posts.filter(post => post.title === LINKED_FIXTURE_TITLE);
  if (matches.length > 1) fail("LINKED_FIXTURE_DUPLICATES_INSPECT_REQUIRED");
  let researchBriefId = last?.researchBriefId; let claimMapId = last?.claimMapId;
  const inspect = async postId => {
    const post = assertLinkedPost(await context.query("publishing:getPostById", { postId }));
    if (post._id !== postId || researchBriefId && post.sourceResearchBriefId !== researchBriefId || last?.postId && last.postId !== postId) fail("LINKED_FIXTURE_IDENTITY_CHANGED");
    assertBrief(await context.query("research:getResearchBrief", { researchBriefId: post.sourceResearchBriefId }), post.sourceResearchBriefId);
    assertSnapshot(await context.query("visualLinkedEvidence:getSnapshot", { postId }), post.sourceResearchBriefId, claimMapId);
    return { postId, sceneUrl: `${FIXTURE_NEXT_ORIGIN}/?postId=${encodeURIComponent(postId)}`, status: "verified-fictional-linked-post" };
  };
  if (matches.length) return inspect(matches[0]._id);
  if (mode === "status") return { status: last ? "incomplete-inspect-frontier" : "not-created" };
  if (last && last.status !== "succeeded" || last?.stage === "post") fail("LINKED_FIXTURE_UNCERTAIN_NO_RETRY_INSPECT_REQUIRED");
  const dispatch = async (stage, name, args, ids) => {
    const frontier = { v: 1, fixtureHash: LINKED_FIXTURE_HASH, stage, status: "dispatching", ...ids };
    assertLinkedCall("mutation", name, args);
    await context.journal.append(frontier); // Durable fsync must finish before this single known mutation.
    try {
      const result = await context.mutate(name, args);
      const key = { "research-brief": "researchBriefId", "claim-map": "claimMapId", post: "postId" }[stage];
      if (!validId(result?.[key]) || stage === "research-brief" && result.sourceCount !== 1 || stage === "claim-map" && result.claimCount !== 1) fail("LINKED_FIXTURE_RESULT_REJECTED");
      await context.journal.append({ ...frontier, status: "succeeded", [key]: result[key] });
      return result[key];
    } catch {
      try { await context.journal.append({ ...frontier, status: "uncertain" }); } catch { /* The pre-dispatch frontier still prevents replay. */ }
      fail("LINKED_FIXTURE_UNCERTAIN_NO_RETRY_INSPECT_REQUIRED");
    }
  };
  if (!researchBriefId) researchBriefId = await dispatch("research-brief", "research:saveResearchBrief", BRIEF_INPUT, {});
  assertBrief(await context.query("research:getResearchBrief", { researchBriefId }), researchBriefId);
  if (!claimMapId) claimMapId = await dispatch("claim-map", "research:saveClaimMap", claimInput(researchBriefId), { researchBriefId });
  const postId = await dispatch("post", "publishing:createPostWithIntent", postInput(researchBriefId), { researchBriefId, claimMapId });
  return inspect(postId);
}
const JOURNAL_DIRECTORY = resolve(FIXTURE_ROOT, ".convex", "visual-linked-fixture-rehearsal");
const JOURNAL_FILE = resolve(JOURNAL_DIRECTORY, "frontier.jsonl");
async function openJournal() {
  for (const path of [FIXTURE_ROOT, resolve(FIXTURE_ROOT, ".convex")]) { const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink()) fail("LINKED_FIXTURE_JOURNAL_PATH_REJECTED"); }
  await mkdir(JOURNAL_DIRECTORY, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
  const directory = await lstat(JOURNAL_DIRECTORY); if (!directory.isDirectory() || directory.isSymbolicLink()) fail("LINKED_FIXTURE_JOURNAL_PATH_REJECTED");
  const lockPath = resolve(JOURNAL_DIRECTORY, "lock");
  const lock = await open(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  await lock.sync();
  const read = async () => {
    let info; try { info = await lstat(JOURNAL_FILE); } catch (error) { if (error.code === "ENOENT") return []; throw error; }
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 64000) fail("LINKED_FIXTURE_JOURNAL_REJECTED");
    const handle = await open(JOURNAL_FILE, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { const stat = await handle.stat(); if (stat.ino !== info.ino || stat.dev !== info.dev || stat.nlink !== 1 || stat.size > 64000) fail("LINKED_FIXTURE_JOURNAL_REJECTED"); const content = await handle.readFile("utf8"); if (content && !content.endsWith("\n")) fail("LINKED_FIXTURE_FRONTIER_TRUNCATED_INSPECT_REQUIRED"); const records = content.trim() ? content.trim().split("\n").map(line => JSON.parse(line)) : []; validateFrontier(records); return records; } finally { await handle.close(); }
  };
  return { read, append: async record => {
    const records = await read(); validateFrontier([...records, record]);
    const handle = await open(JOURNAL_FILE, constants.O_CREAT | constants.O_APPEND | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    try { const info = await handle.stat(); if (!info.isFile() || info.nlink !== 1 || info.size > 64000) fail("LINKED_FIXTURE_JOURNAL_REJECTED"); await handle.writeFile(`${JSON.stringify(record)}\n`); await handle.sync(); } finally { await handle.close(); }
    const directoryHandle = await open(JOURNAL_DIRECTORY, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
    console.log(JSON.stringify({ stage: record.stage, status: record.status }));
  }, close: async () => { await lock.close(); await unlink(lockPath); } };
}
async function readJson(response, maximum = 2_000_000) {
  if (!response.ok || response.redirected) fail("LINKED_FIXTURE_TRANSPORT_REJECTED");
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) { bytes += chunk.length; if (bytes > maximum) { await response.body.cancel().catch(() => {}); fail("LINKED_FIXTURE_RESPONSE_BOUNDED"); } chunks.push(Buffer.from(chunk)); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function localContext(journal) {
  await verifyLocalFixtureTarget();
  const response = await fetch(`${FIXTURE_ISSUER}/token`, { headers: { Origin: FIXTURE_NEXT_ORIGIN }, redirect: "error", signal: AbortSignal.timeout(5000) });
  const auth = await readJson(response, 16000);
  if (auth.subject !== FIXTURE_SUBJECT || auth.fixture !== true || auth.expiresIn !== 120 || typeof auth.token !== "string" || auth.token.length > 10000) fail("LINKED_FIXTURE_AUTH_REJECTED");
  const parts = auth.token.split("."); if (parts.length !== 3) fail("LINKED_FIXTURE_AUTH_REJECTED");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (claims.sub !== FIXTURE_SUBJECT || claims.iss !== FIXTURE_ISSUER || claims.aud !== "convex" || claims.exp - claims.iat !== 120 || claims.exp <= Date.now() / 1000 || claims.iat > Date.now() / 1000 + 30) fail("LINKED_FIXTURE_AUTH_REJECTED");
  const call = async (kind, name, args) => {
    assertLinkedCall(kind, name, args); await verifyLocalFixtureTarget();
    if (claims.exp <= Date.now() / 1000) fail("LINKED_FIXTURE_AUTH_EXPIRED_NO_RETRY");
    const result = await readJson(await fetch(`${FIXTURE_CONVEX_URL}/api/${kind}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ path: name, args: [args], format: "convex_encoded_json" }), redirect: "error", signal: AbortSignal.timeout(10000) }));
    if (result.status !== "success") fail("LINKED_FIXTURE_CALL_FAILED_NO_RETRY");
    return result.value;
  };
  return { journal, query: (name, args) => call("query", name, args), mutate: (name, args) => call("mutation", name, args) };
}
export async function linkedFixtureSelfTest() {
  const target = { deployment: `anonymous:${FIXTURE_DEPLOYMENT}`, url: FIXTURE_CONVEX_URL };
  assert.doesNotThrow(() => assertLinkedTarget(target));
  for (const other of ["https://real.convex.cloud", "http://localhost:3210", "http://127.0.0.1:3211", "http://127.0.0.1:3210/path"]) assert.throws(() => assertLinkedTarget({ ...target, url: other }));
  assert.throws(() => assertLinkedTarget({ ...target, deployment: "prod:anonymous-agent" }));
  assert.throws(() => assertLinkedTarget({ ...target, deployKey: "fictional-rejected-key" }));
  assert.deepEqual(parseLinkedArgs(["init"]), { mode: "init" });
  assert.deepEqual(parseLinkedArgs(["status"]), { mode: "status" });
  for (const args of [[], ["init", "--url", "https://real.convex.cloud"], ["init", "--key", "fictional-value"], ["init", "--reset"], ["--self-test", "--apply"], ["complete-generation"]]) assert.throws(() => parseLinkedArgs(args));
  const post = { _id: "fictionalpost123", userId: FIXTURE_SUBJECT, brandId: "corvo", channelId: "corvo-blog", platformId: "corvo-blog", title: LINKED_FIXTURE_TITLE, content: LINKED_FIXTURE_CONTENT, status: "draft", approvalState: "unapproved", sourceResearchBriefId: "fictionalbrief123" };
  assert.doesNotThrow(() => assertLinkedPost(post));
  for (const other of [{ userId: "real-user" }, { brandId: "personal" }, { channelId: "personal-linkedin" }, { scheduledDate: "2026-10-01" }, { prUrl: "https://github.com/real/repo/pull/1" }, { status: "published" }, { approvalState: "approved" }]) assert.throws(() => assertLinkedPost({ ...post, ...other }));
  for (const other of [{ title: "A real article" }, { content: LINKED_FIXTURE_CONTENT.replace("| 12 |", "| 13 |") }, { content: `${LINKED_FIXTURE_CONTENT}\nReal claim.` }, { content: "" }]) assert.throws(() => assertLinkedPost({ ...post, ...other }));
  assert.doesNotThrow(() => assertLinkedCall("query", "publishing:listPosts", { brandIds: ["corvo"], platformIds: ["corvo-blog"] }));
  for (const [kind, name] of [["action", "visualExports:prepareHero"], ["mutation", "visualWorkflow:requestGeneration"], ["mutation", "publishing:setApproval"], ["mutation", "publishing:reschedule"], ["action", "providers:generate"], ["mutation", "visualLinkedEvidence:importLinkedEvidence"]]) assert.throws(() => assertLinkedCall(kind, name, {}));
  assert.throws(() => assertLinkedCall("query", "publishing:listPosts", { brandIds: ["personal"] }));
  let dispatched = 0;
  await assert.rejects(() => runLinkedInit({ query: async () => [post, { ...post, _id: "duplicatepost123" }], mutate: async () => { dispatched++; }, journal: { read: async () => [], append: async () => {} } }));
  assert.equal(dispatched, 0);
  const uncertain = [{ v: 1, fixtureHash: LINKED_FIXTURE_HASH, stage: "research-brief", status: "dispatching" }];
  await assert.rejects(() => runLinkedInit({ query: async () => [], mutate: async () => { dispatched++; }, journal: { read: async () => uncertain, append: async () => {} } }));
  assert.equal(dispatched, 0);
  let writes = [];
  const lostResponse = { query: async () => [], mutate: async () => { dispatched++; throw new Error("fictional lost response"); }, journal: { read: async () => writes, append: async record => { writes = [...writes, record]; } } };
  await assert.rejects(() => runLinkedInit(lostResponse));
  assert.deepEqual(writes.map(record => record.status), ["dispatching", "uncertain"]);
  await assert.rejects(() => runLinkedInit(lostResponse));
  assert.equal(dispatched, 1);
  assert.throws(() => validateFrontier([{ ...uncertain[0], token: "fictional-rejected-secret" }]));
  assert.throws(() => assertLinkedCall("mutation", "research:saveResearchBrief", { ...BRIEF_INPUT, provider: "openai" }));
  assert.throws(() => assertLinkedCall("mutation", "publishing:createPostWithIntent", { ...postInput("fictionalbrief123"), scheduledDate: "2026-10-01" }));
  const savedBrief = { brief: { ...BRIEF_INPUT, _id: post.sourceResearchBriefId, userId: FIXTURE_SUBJECT }, sources: [{ ...BRIEF_INPUT.sources[0], _id: "fictionalsource123", researchBriefId: post.sourceResearchBriefId, userId: FIXTURE_SUBJECT, brandId: "corvo", sourceId: SOURCE_ID }] };
  const provenance = { links: { researchBriefId: post.sourceResearchBriefId, sourceCampaignId: null, sourceExcerptIds: [] }, brief: { id: post.sourceResearchBriefId }, sources: [{ id: "fictionalsource123", sourceId: SOURCE_ID, url: SOURCE_URL, status: "accepted", sha256: LINKED_TABLE_HASH }], claimMaps: [{ id: "fictionalmap123", status: "review-ready" }], corpusExcerpts: [] };
  const snapshot = { snapshotHash: "a".repeat(64), reasons: [], content: `Stored linked research snapshot; review statuses are preserved. No new research or approval is inferred.\n\nProvenance:\n\`\`\`json\n${JSON.stringify(provenance)}\n\`\`\`\n\n${LINKED_FIXTURE_TABLE}`, records: ["source-excerpt", "claim"].map(kind => ({ kind, id: kind === "claim" ? "fictionalclaim123" : "fictionalsource123", sourceIds: [SOURCE_ID], status: "accepted", eligible: true, text: LINKED_FIXTURE_TABLE, sha256: LINKED_TABLE_HASH, reason: null })) };
  let existing = []; const dispatchNames = []; const records = [];
  const context = { journal: { read: async () => records, append: async record => { validateFrontier([...records, record]); records.push(record); } }, query: async (name, args) => { assertLinkedCall("query", name, args); return name === "publishing:listPosts" ? existing : name === "publishing:getPostById" ? post : name === "research:getResearchBrief" ? savedBrief : snapshot; }, mutate: async (name, args) => { assertLinkedCall("mutation", name, args); dispatchNames.push(name); if (name === "research:saveResearchBrief") return { researchBriefId: post.sourceResearchBriefId, sourceCount: 1 }; if (name === "research:saveClaimMap") return { claimMapId: "fictionalmap123", claimCount: 1 }; existing = [post]; return { postId: post._id }; } };
  const ready = await runLinkedInit(context);
  assert.equal(ready.postId, post._id); assert.equal(records.length, 6);
  assert.deepEqual(dispatchNames, ["research:saveResearchBrief", "research:saveClaimMap", "publishing:createPostWithIntent"]);
  await runLinkedInit(context); assert.equal(dispatchNames.length, 3);
  await assert.rejects(() => runLinkedInit({ ...context, query: async (name, args) => name === "visualLinkedEvidence:getSnapshot" ? { ...snapshot, content: snapshot.content.replace(LINKED_FIXTURE_TABLE, "") } : context.query(name, args) }), /LINKED_FIXTURE_SNAPSHOT_REJECTED/);
  assert.equal(dispatchNames.length, 3);
  await assert.rejects(() => runLinkedInit({ ...context, query: async (name, args) => name === "visualLinkedEvidence:getSnapshot" ? { ...snapshot, records: snapshot.records.map(record => ({ ...record, status: "unreviewed" })) } : context.query(name, args) }));
  assert.equal(dispatchNames.length, 3);
  console.log(JSON.stringify({ stage: "self-test", status: "offline-guards-passed" }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let stage = "arguments";
  try {
    const { mode } = parseLinkedArgs(process.argv.slice(2)); stage = mode === "--self-test" ? "self-test" : mode;
    if (mode === "--self-test") await linkedFixtureSelfTest();
    else {
      await verifyLocalFixtureTarget(); // Existing strict config + actual anonymous instance verifier; no user evidence files.
      const journal = await openJournal();
      try { const result = await runLinkedInit(await localContext(journal), mode); console.log(JSON.stringify({ stage: "linked-post", ...result })); }
      finally { await journal.close(); }
    }
  } catch { console.error(JSON.stringify({ stage, status: "failed-inspect-frontier-no-retry" })); process.exitCode = 1; }
}

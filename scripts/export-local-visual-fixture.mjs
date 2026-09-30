#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURE_ROOT, FIXTURE_SUBJECT, FIXTURE_CONVEX_URL, FIXTURE_ISSUER, FIXTURE_NEXT_ORIGIN, verifyLocalFixtureTarget } from "./visual-fixture-issuer.mjs";
import { FIXTURE_CONTENT, FIXTURE_TITLE } from "./visual-fixture-rehearsal.mjs";

export const READER_ROOT = "/Volumes/rexy/GitHub/codex-worktrees/resonate-visual-reader-current/corvo-labs-dot-com";
export const READER_COMMIT = "c4be2ee4d11fb5e5ee2c36c239aa497a2e2c4c33";
export const FICTIONAL_POST_ID = "nd77g7q41hws09ge4zbp1epe4x8fc3wy";
export const READER_SLUG = "local-fixture-editorial-visual-rehearsal";
export const READER_DATE = "2026-09-30";
export const READER_URL = `http://127.0.0.1:3172/blog/${READER_DATE}-${READER_SLUG}`;
const CONTENT_FILE = `corvo-labs-enhanced/content/blog/${READER_DATE}-${READER_SLUG}.mdx`;
const ASSET_DIRECTORY = `corvo-labs-enhanced/public/images/blog/${READER_DATE}-${READER_SLUG}`;
// Explicit fixture revision; the saved composer must contain this exact body.
export const READER_CONTENT_BASELINE = FIXTURE_CONTENT.replace(`# ${FIXTURE_TITLE}\n\n`, "");
const ownedFailure = Symbol("local-reader-guard-failure");
function reject(code) { throw Object.assign(new Error(code), { fixtureCode: code, [ownedFailure]: true }); }
const sha = value => createHash("sha256").update(value).digest("hex");
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === "string" && /^[a-z0-9]{10,100}$/.test(value);
const positiveRevision = value => Number.isSafeInteger(value) && value > 0;
const execute = promisify(execFile);
let executionStage = "arguments";
let corePromise;
export async function loadPublicationCore() {
  corePromise ??= (async () => {
    const { build } = await import("esbuild");
    const result = await build({ stdin: { contents: 'export { prepareBlogPublication } from "./lib/github.ts"; export { figureSignatures, planFigureCandidates, assertFigureEvidence, buildFigureMarkdownBlock } from "./lib/visualFigures.ts"; export { articleSignature, stableInputSignature } from "./lib/visualWorkflow.ts"; export { fingerprintPostContent } from "./lib/domain.ts"; export { blogEditorialFingerprint } from "./lib/blogContract.ts";', resolveDir: FIXTURE_ROOT, loader: "ts" }, bundle: true, write: false, format: "cjs", platform: "node", target: "node20", packages: "external", logLevel: "silent", define: {
      "process.env.GITHUB_TOKEN": "undefined", "process.env.BLOG_REPO_OWNER": '"local-fixture-only"', "process.env.BLOG_REPO_NAME": '"local-fixture-only"', "process.env.BLOG_APP_ROOT": '"corvo-labs-enhanced"', "process.env.BLOG_CONTENT_PATH": '"corvo-labs-enhanced/content/blog"', "process.env.BLOG_POST_AUTHOR": '"Local fictional engineering rehearsal"', "process.env.BLOG_DEFAULT_CATEGORY": '"engineering-fixture"', "fetch": "__fixtureForbiddenFetch", "globalThis.fetch": "__fixtureForbiddenFetch", "global.fetch": "__fixtureForbiddenFetch",
    } });
    const publicationBundle = { exports: {} };
    new Function("module", "exports", "require", "__fixtureForbiddenFetch", result.outputFiles[0].text)(publicationBundle, publicationBundle.exports, createRequire(import.meta.url), () => reject("PUBLICATION_NETWORK_REJECTED"));
    return publicationBundle.exports;
  })();
  return corePromise;
}

export function assertFictionalPublication(snapshot) {
  const post = snapshot?.post;
  if (!post || post._id !== FICTIONAL_POST_ID || post.userId !== FIXTURE_SUBJECT || post.brandId !== "corvo" || post.channelId !== "corvo-blog" || post.title !== FIXTURE_TITLE || typeof post.content !== "string" || !post.content.startsWith(READER_CONTENT_BASELINE) || post.prUrl || post.branchName || post.scheduledDate || post.scheduledTime) reject("FICTIONAL_POST_REJECTED");
  if (post.approvalState !== "approved" || post.status !== "approved") reject("FINAL_APPROVAL_REQUIRED");
  const hero = snapshot?.visuals?.hero;
  if (!hero || hero.approvedBy !== FIXTURE_SUBJECT || !Number.isSafeInteger(hero.approvedAt) || hero.approvedAt <= 0 || hero.approvedAt > Date.now() + 30_000) reject("HERO_APPROVAL_REJECTED");
  if (hero.provider !== "offline-fixture" || hero.model !== "offline-fixture" || hero.qualification !== "offline-fixture" || typeof hero.quoteProvenance !== "string" || !hero.quoteProvenance.includes("LOCAL OFFLINE FIXTURE") || hero.quoteProvenance.length > 4000) reject("HERO_FIXTURE_PROVENANCE_REJECTED");
  return snapshot;
}

export function assertPreparedPaths(files) {
  if (!Array.isArray(files) || files.length < 2 || files.length > 5) reject("READER_PATH_REJECTED");
  const names = new Set();
  for (const file of files) {
    const asset = typeof file.path === "string" && file.path.startsWith(`${ASSET_DIRECTORY}/`) ? file.path.slice(ASSET_DIRECTORY.length + 1) : "";
    if (names.has(file.path) || file.path !== CONTENT_FILE && !/^(hero\.webp|figure-[a-z0-9-]+\.svg)$/.test(asset)) reject("READER_PATH_REJECTED");
    names.add(file.path);
  }
  if (!names.has(CONTENT_FILE) || !names.has(`${ASSET_DIRECTORY}/hero.webp`)) reject("READER_PATH_REJECTED");
  return files;
}

export function assertReaderState(state) {
  if (state?.root !== READER_ROOT || state.head !== READER_COMMIT || state.detached !== true || !Array.isArray(state.changes) || state.changes.some(change => change.status !== "??" || change.path !== CONTENT_FILE && !(change.path?.startsWith(`${ASSET_DIRECTORY}/`) && /^(hero\.webp|figure-[a-z0-9-]+\.svg)$/.test(change.path.slice(ASSET_DIRECTORY.length + 1))))) reject("READER_WORKTREE_REJECTED");
  return state;
}
export function parseExportArgs(args) {
  if (args.length === 1 && args[0] === "--self-test") return { selfTest: true, apply: false };
  let postId; let apply = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--post-id" && postId === undefined && args[index + 1] === FICTIONAL_POST_ID) { postId = args[++index]; continue; }
    if (args[index] === "--apply" && !apply) { apply = true; continue; }
    reject("ARGUMENTS_REJECTED");
  }
  if (postId !== FICTIONAL_POST_ID) reject("ARGUMENTS_REJECTED");
  return { selfTest: false, postId, apply };
}
export function assertLocalRequest(kind, input, init = {}) {
  const url = new URL(String(input));
  if (url.username || url.password || url.hash || url.href.length > 4096) reject("LOCAL_REQUEST_REJECTED");
  const method = init.method ?? "GET";
  if (kind === "token") {
    if (url.href !== `${FIXTURE_ISSUER}/token` || method !== "GET" || new Headers(init.headers).get("origin") !== FIXTURE_NEXT_ORIGIN || init.body) reject("LOCAL_REQUEST_REJECTED");
  } else if (kind === "asset") {
    if (url.origin !== FIXTURE_CONVEX_URL || !/^\/api\/storage\/[a-zA-Z0-9_-]{10,100}$/.test(url.pathname) || method !== "GET" || init.body) reject("LOCAL_REQUEST_REJECTED");
  } else if (kind === "query") {
    if (url.href !== `${FIXTURE_CONVEX_URL}/api/query` || method !== "POST" || typeof init.body !== "string" || Buffer.byteLength(init.body) > 32_000) reject("LOCAL_REQUEST_REJECTED");
    let body; try { body = JSON.parse(init.body); } catch { reject("LOCAL_REQUEST_REJECTED"); }
    if (body.path !== "publishing:getPostForPublication" || body.format !== "convex_encoded_json" || !Array.isArray(body.args) || body.args.length !== 1 || body.args[0]?.postId !== FICTIONAL_POST_ID || Object.keys(body.args[0]).join() !== "postId" || Object.keys(body).sort().join() !== "args,format,path") reject("LOCAL_REQUEST_REJECTED");
  } else reject("LOCAL_REQUEST_REJECTED");
  return url;
}
const OUTPUT_DIRECTORIES = new Set(["", "corvo-labs-enhanced", "corvo-labs-enhanced/content", "corvo-labs-enhanced/content/blog", "corvo-labs-enhanced/public", "corvo-labs-enhanced/public/images", "corvo-labs-enhanced/public/images/blog", ASSET_DIRECTORY].map(path => resolve(READER_ROOT, path)));
export function assertOutputFilesystem(records) {
  if (!Array.isArray(records) || !records.length || records.length > 100) reject("READER_FILESYSTEM_REJECTED");
  for (const record of records) {
    const relative = typeof record.path === "string" && record.path.startsWith(`${READER_ROOT}/`) ? record.path.slice(READER_ROOT.length + 1) : "";
    const allowedFile = relative === CONTENT_FILE || relative.startsWith(`${ASSET_DIRECTORY}/`) && /^(hero\.webp|figure-[a-z0-9-]+\.svg)$/.test(relative.slice(ASSET_DIRECTORY.length + 1));
    if (record.kind === "directory" ? !OUTPUT_DIRECTORIES.has(record.path) : record.kind !== "file" || !allowedFile) reject("READER_FILESYSTEM_REJECTED");
    if (record.symbolicLink || record.exists && (record.actualKind !== record.kind || record.kind === "file" && record.links !== 1)) reject("READER_FILESYSTEM_REJECTED");
  }
  return records;
}
export function buildReaderWritePlan(files) {
  const plan = assertPreparedPaths(files).map(file => {
    if (typeof file.content !== "string" || !file.content || file.content.length > 1_048_576 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.content)) reject("READER_BYTES_REJECTED");
    const bytes = Buffer.from(file.content, "base64");
    const maximum = file.path === CONTENT_FILE ? 524_288 : file.path.endsWith("hero.webp") ? 149_999 : 262_144;
    if (!bytes.length || bytes.length > maximum || bytes.toString("base64") !== file.content) reject("READER_BYTES_REJECTED");
    return { path: file.path, absolutePath: resolve(READER_ROOT, file.path), bytes, sha256: sha(bytes) };
  }).sort((a, b) => Number(a.path === CONTENT_FILE) - Number(b.path === CONTENT_FILE) || a.path.localeCompare(b.path));
  if (plan.reduce((total, file) => total + file.bytes.length, 0) > 2 * 1024 * 1024) reject("READER_BYTES_REJECTED");
  return plan;
}

async function verifyReaderCheckout() {
  if (await realpath(READER_ROOT) !== READER_ROOT) reject("READER_WORKTREE_REJECTED");
  const git = args => execute("/usr/bin/git", ["-c", "core.fsmonitor=false", "-C", READER_ROOT, ...args], { env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" }, timeout: 5000, maxBuffer: 262_144 });
  const [{ stdout: root }, { stdout: head }, { stdout: status }] = await Promise.all([git(["rev-parse", "--show-toplevel"]), git(["rev-parse", "HEAD"]), git(["status", "--porcelain=v1", "-z", "--untracked-files=all"])]);
  let detached = false;
  try { await git(["symbolic-ref", "-q", "HEAD"]); }
  catch (error) { if (error.code === 1) detached = true; else reject("READER_WORKTREE_REJECTED"); }
  return assertReaderState({ root: root.trim(), head: head.trim(), detached, changes: status.split("\0").filter(Boolean).map(record => ({ status: record.slice(0, 2), path: record.slice(3) })) });
}

async function readBounded(response, maximum) {
  const length = response.headers.get("content-length");
  if (!response.body || length !== null && (!/^\d+$/.test(length) || Number(length) > maximum)) reject("LOCAL_RESPONSE_TOO_LARGE");
  const reader = response.body.getReader(); let total = 0; const chunks = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength; if (total > maximum) { await reader.cancel(); reject("LOCAL_RESPONSE_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, total);
}

async function readPublicationSnapshot() {
  executionStage = "local-target"; await verifyLocalFixtureTarget();
  executionStage = "ephemeral-auth";
  const tokenInit = { headers: { Origin: FIXTURE_NEXT_ORIGIN }, redirect: "error", signal: AbortSignal.timeout(5000) };
  assertLocalRequest("token", `${FIXTURE_ISSUER}/token`, tokenInit);
  const response = await fetch(`${FIXTURE_ISSUER}/token`, tokenInit);
  if (!response.ok) reject("LOCAL_AUTH_REJECTED");
  const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await readBounded(response, 32_768)));
  if (payload.subject !== FIXTURE_SUBJECT || payload.fixture !== true || payload.expiresIn !== 120 || typeof payload.token !== "string" || payload.token.length > 8192) reject("LOCAL_AUTH_REJECTED");
  let claims;
  try { claims = JSON.parse(Buffer.from(payload.token.split(".")[1], "base64url").toString("utf8")); }
  catch { reject("LOCAL_AUTH_REJECTED"); }
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== FIXTURE_ISSUER || claims.sub !== FIXTURE_SUBJECT || claims.aud !== "convex" || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.exp - claims.iat !== 120 || Math.abs(now - claims.iat) > 30 || claims.exp <= now) reject("LOCAL_AUTH_REJECTED");
  const { ConvexHttpClient } = await import("convex/browser");
  const { makeFunctionReference } = await import("convex/server");
  let issued = false;
  const client = new ConvexHttpClient(FIXTURE_CONVEX_URL, { logger: false, fetch: async (input, init) => {
    assertLocalRequest("query", input, init); if (issued) reject("SECOND_SNAPSHOT_REJECTED"); issued = true;
    const result = await fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
    return new Response(await readBounded(result, 2 * 1024 * 1024), { status: result.status, headers: { "Content-Type": "application/json" } });
  } });
  client.setAuth(payload.token);
  executionStage = "publication-snapshot";
  try { return assertFictionalPublication(await client.query(makeFunctionReference("publishing:getPostForPublication"), { postId: FICTIONAL_POST_ID })); }
  finally { client.clearAuth(); }
}

async function readApprovedHero(snapshot) {
  executionStage = "approved-hero-bytes";
  const url = assertLocalRequest("asset", snapshot.visuals.hero.url);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "image/webp") reject("LOCAL_HERO_RESPONSE_REJECTED");
  return readBounded(response, 149_999);
}

function directoriesFor(file) {
  const relative = file.path.split("/"); relative.pop();
  return [READER_ROOT, ...relative.map((_, index) => resolve(READER_ROOT, ...relative.slice(0, index + 1)))];
}
async function inspectFilesystemPath(path, kind) {
  let stats;
  try { stats = await lstat(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
  assertOutputFilesystem([{ path, kind, exists: Boolean(stats), symbolicLink: stats?.isSymbolicLink() ?? false, actualKind: stats?.isDirectory() ? "directory" : stats?.isFile() ? "file" : null, links: stats?.nlink ?? 0 }]);
  return stats;
}
async function inspectOutput(file) {
  for (const directory of directoriesFor(file)) await inspectFilesystemPath(directory, "directory");
  const stats = await inspectFilesystemPath(file.absolutePath, "file");
  if (stats && (stats.size !== file.bytes.length || sha(await readFile(file.absolutePath)) !== file.sha256)) reject("EXISTING_READER_OUTPUT_DIFFERS");
  return Boolean(stats);
}

async function writeReaderFiles(plan) {
  executionStage = "output-preflight";
  await verifyReaderCheckout();
  for (const file of plan) await inspectOutput(file);
  executionStage = "exclusive-output-write";
  for (const file of plan) {
    await verifyReaderCheckout();
    if (!await inspectOutput(file)) {
      for (const directory of directoriesFor(file)) {
        if (!await inspectFilesystemPath(directory, "directory")) await mkdir(directory, { mode: 0o755 });
      }
      await inspectFilesystemPath(file.absolutePath, "file");
      await writeFile(file.absolutePath, file.bytes, { flag: "wx", mode: 0o644 });
    }
    if (sha(await readFile(file.absolutePath)) !== file.sha256) reject("READER_READBACK_REJECTED");
  }
  await verifyReaderCheckout();
}

async function exportLocalFixture(options) {
  executionStage = "detached-reader"; await verifyReaderCheckout();
  const snapshot = await readPublicationSnapshot();
  if (options.apply && (!Array.isArray(snapshot.figures) || snapshot.figures.length < 1)) reject("ACCEPTED_FIGURE_REQUIRED");
  const heroBytes = await readApprovedHero(snapshot);
  executionStage = "actual-publication-preparation";
  const prepared = await prepareFixtureFiles(snapshot, heroBytes);
  const plan = buildReaderWritePlan(prepared.files);
  if (prepared.filePath !== CONTENT_FILE || prepared.fileContent !== prepared.files.find(file => file.path === CONTENT_FILE)?.content) reject("READER_MANIFEST_REJECTED");
  if (options.apply) await writeReaderFiles(plan);
  console.log(JSON.stringify({ fixture: true, mode: options.apply ? "disposable-local-files" : "prepared-without-file-writes", postId: FICTIONAL_POST_ID, readerCommit: READER_COMMIT, readerUrl: READER_URL, files: plan.map(file => ({ path: file.path, bytes: file.bytes.length, sha256: file.sha256 })), paidCalls: 0, databaseWrites: 0, githubCalls: 0 }, null, 2));
}

export async function prepareFixtureFiles(snapshot, heroBytes) {
  snapshot = structuredClone(snapshot); heroBytes = Uint8Array.from(heroBytes);
  assertFictionalPublication(snapshot);
  const core = await loadPublicationCore();
  const hero = snapshot.visuals.hero;
  if (snapshot.visuals.articleSignature !== core.articleSignature(snapshot.post) || snapshot.post.contentFingerprint !== core.blogEditorialFingerprint(snapshot.post)) reject("ARTICLE_PROOF_REJECTED");
  if (!(heroBytes instanceof Uint8Array) || !heroBytes.byteLength || heroBytes.byteLength >= 150_000 || !/^[a-f0-9]{64}$/.test(hero.sha256) || sha(heroBytes) !== hero.sha256 || hero.metadata?.width !== 1600 || hero.metadata.height !== 900 || hero.metadata.format !== "webp" || hero.metadata.bytes !== heroBytes.byteLength || typeof hero.metadata.crop !== "string" || hero.metadata.crop.length > 32_000 || !hero.alt?.trim()) reject("HERO_BYTES_REJECTED");
  if (!Array.isArray(snapshot.figures) || snapshot.figures.length > 3) reject("FIGURE_PROOF_REJECTED");
  const images = [{ sourceUrl: hero.url, alt: hero.alt, isCover: true, export: { bytes: heroBytes, sha256: hero.sha256, fileName: "hero.webp", contentType: "image/webp", hero: { provider: hero.provider, model: hero.model, qualification: hero.qualification, quoteProvenance: hero.quoteProvenance, approvedBy: hero.approvedBy, approvedAt: hero.approvedAt } } }];
  const candidateIds = new Set();
  let plainContent = snapshot.post.content;
  for (const figure of snapshot.figures) {
    if (!id(figure.candidateId) || candidateIds.has(figure.candidateId) || figure.postId !== snapshot.post._id || figure.postContentSha256 !== sha(snapshot.post.content) || figure.postContentFingerprint !== core.fingerprintPostContent(snapshot.post) || figure.acceptedBy !== FIXTURE_SUBJECT || !positiveRevision(figure.acceptedAt) || figure.acceptedAt > Date.now() + 30_000 || figure.url !== `resonate-figure://${figure.candidateId}` || !Array.isArray(figure.evidenceSources) || !figure.spec) reject("FIGURE_PROOF_REJECTED");
    candidateIds.add(figure.candidateId);
    const required = new Map();
    for (const [bindings, purpose] of [[figure.spec.evidence, "article"], [figure.spec.claimTraceEvidence, "claim-trace"]]) {
      if (!Array.isArray(bindings)) reject("FIGURE_PROOF_REJECTED");
      for (const binding of bindings) {
        if (required.has(binding.sourceId) && required.get(binding.sourceId) !== purpose) reject("FIGURE_PROOF_REJECTED");
        required.set(binding.sourceId, purpose);
      }
    }
    if (!required.size || new Set(figure.evidenceSources.map(source => source.sourceId)).size !== required.size || figure.evidenceSources.length !== required.size) reject("FIGURE_PROOF_REJECTED");
    for (const source of figure.evidenceSources) {
      if (!id(source.sourceId) || !hex(source.sha256) || !positiveRevision(source.revision) || source.purpose !== required.get(source.sourceId) || !hex(source.currentSha256)) reject("FIGURE_PROOF_REJECTED");
      if (source.purpose === "article") {
        if (source.currentSha256 !== figure.postContentSha256 || (source.currentSourceId === null ? source.currentRevision !== null : !id(source.currentSourceId) || !positiveRevision(source.currentRevision))) reject("FIGURE_PROOF_REJECTED");
      } else if (source.currentSourceId !== source.sourceId || source.currentSha256 !== source.sha256 || source.currentRevision !== source.revision) reject("FIGURE_PROOF_REJECTED");
    }
    if (["bars", "lines"].includes(figure.spec.family) && !figure.spec.claimTraceEvidence.length) reject("FIGURE_PROOF_REJECTED");
    const articleSource = figure.evidenceSources.find(source => source.purpose === "article");
    if (!articleSource) reject("FIGURE_PROOF_REJECTED");
    try { core.assertFigureEvidence({ ...figure.spec, claimTraceEvidence: [] }, [{ id: articleSource.sourceId, name: "Fictional rehearsal article", format: "markdown", purpose: "article", content: snapshot.post.content }], false); }
    catch { reject("FIGURE_ARTICLE_EVIDENCE_REJECTED"); }
    const rendered = await core.figureSignatures(figure.spec);
    if (rendered.svg !== figure.svg || rendered.svgSha256 !== figure.svgSha256 || rendered.rendererVersion !== figure.rendererVersion || rendered.dataSignature !== figure.dataSignature || rendered.presentationSignature !== figure.presentationSignature || figure.caption !== figure.spec.presentation.caption || figure.sourceNote !== figure.spec.presentation.sourceNote || figure.alt !== figure.spec.presentation.alt) reject("FIGURE_RENDERING_REJECTED");
    const block = core.buildFigureMarkdownBlock(figure.candidateId, figure.spec);
    if (plainContent.split(block).length !== 2) reject("FIGURE_PLACEMENT_REJECTED");
    plainContent = plainContent.replace(block, "");
    images.push({ sourceUrl: figure.url, alt: figure.alt, isCover: false, export: { bytes: new TextEncoder().encode(figure.svg), sha256: figure.svgSha256, fileName: `figure-${figure.candidateId}.svg`, contentType: "image/svg+xml", figure: { spec: figure.spec, rendererVersion: figure.rendererVersion, dataSignature: figure.dataSignature, presentationSignature: figure.presentationSignature,
      postId: figure.postId, postContentSha256: figure.postContentSha256, postContentFingerprint: figure.postContentFingerprint, acceptedBy: figure.acceptedBy, acceptedAt: figure.acceptedAt, evidenceSources: figure.evidenceSources } } });
  }
  if (!plainContent.startsWith(READER_CONTENT_BASELINE) || Buffer.byteLength(plainContent) > 200_000) reject("FICTIONAL_CONTENT_REJECTED");
  const additions = plainContent.slice(READER_CONTENT_BASELINE.length);
  const knownInventedRehearsalLines = new Set([
    "Every value below is invented solely for this local engineering rehearsal.",
    "These arrows describe an invented rehearsal workflow.",
    "These dates and events are invented test data.",
  ]);
  if (/[<>{}`]/.test(additions) || /https?:\/\/|javascript:|data:|resonate-figure:\/\//i.test(additions) || additions.split("\n").some(line => line.trim() && !/^\s*\|.*\|\s*$/.test(line) && !/\bfictional\b/i.test(line) && !knownInventedRehearsalLines.has(line.trim()))) reject("FICTIONAL_CONTENT_REJECTED");
  const prepared = await core.prepareBlogPublication({ postId: snapshot.post._id, title: FIXTURE_TITLE, content: snapshot.post.content, linkedinFirstComment: snapshot.post.linkedinFirstComment, scheduledDate: READER_DATE, status: "published", slug: READER_SLUG, author: snapshot.post.blogAuthor, tags: snapshot.post.blogTags, category: snapshot.post.blogCategory, featured: false,
    excerpt: snapshot.post.blogExcerpt, images,
  }, { allowFixture: true });
  return { ...prepared, files: assertPreparedPaths(prepared.files) };
}

export async function readerSelfTest() {
  const snapshot = { post: { _id: FICTIONAL_POST_ID, userId: FIXTURE_SUBJECT, brandId: "corvo", channelId: "corvo-blog", title: FIXTURE_TITLE, content: READER_CONTENT_BASELINE, blogExcerpt: "Fictional local engineering rehearsal. No real publication is implied.", blogAuthor: "Local fictional engineering rehearsal", blogTags: ["local-fixture", "fictional", "rehearsal"], blogCategory: "engineering-fixture", blogSlug: READER_SLUG, blogPublicationIntent: "draft", approvalState: "approved", status: "approved" }, visuals: { hero: { provider: "offline-fixture", model: "offline-fixture", qualification: "offline-fixture", quoteProvenance: "LOCAL OFFLINE FIXTURE — literal offline self-test", approvedBy: FIXTURE_SUBJECT, approvedAt: 1 } }, figures: [] };
  assert.doesNotThrow(() => assertFictionalPublication(snapshot));
  for (const change of [{ _id: "realpostid01" }, { userId: "real-author" }, { title: "Real article" }, { brandId: "other" }, { channelId: "other" }, { scheduledDate: READER_DATE }, { branchName: "main" }]) assert.throws(() => assertFictionalPublication({ ...snapshot, post: { ...snapshot.post, ...change } }), /FICTIONAL_POST_REJECTED/);
  assert.throws(() => assertFictionalPublication({ ...snapshot, post: { ...snapshot.post, approvalState: "draft" } }), /FINAL_APPROVAL_REQUIRED/);
  assert.throws(() => assertFictionalPublication({ ...snapshot, visuals: { hero: { ...snapshot.visuals.hero, approvedBy: "real-author" } } }), /HERO_APPROVAL_REJECTED/);
  assert.throws(() => assertFictionalPublication({ ...snapshot, visuals: { hero: { ...snapshot.visuals.hero, qualification: "live-receipt" } } }), /HERO_FIXTURE_PROVENANCE_REJECTED/);
  const files = [{ path: CONTENT_FILE, content: "ZmljdGlvbmFs" }, { path: `${ASSET_DIRECTORY}/hero.webp`, content: "ZmljdGlvbmFs" }];
  assert.deepEqual(assertPreparedPaths(files), files);
  assert.throws(() => assertPreparedPaths([...files, { path: "../corvo-labs-enhanced/content/blog/real-post.mdx", content: "ZmljdGlvbmFs" }]), /READER_PATH_REJECTED/);
  assert.throws(() => assertPreparedPaths([...files, files[0]]), /READER_PATH_REJECTED/);
  const reader = { root: READER_ROOT, head: READER_COMMIT, detached: true, changes: [] };
  assert.doesNotThrow(() => assertReaderState(reader));
  assert.throws(() => assertReaderState({ ...reader, head: "b8b6e44baab1d728f6a2267e043acc64b03bec66" }), /READER_WORKTREE_REJECTED/);
  for (const change of [{ detached: false }, { root: FIXTURE_ROOT }, { changes: [{ status: " M", path: CONTENT_FILE }] }, { changes: [{ status: "??", path: "unrelated.txt" }] }]) assert.throws(() => assertReaderState({ ...reader, ...change }), /READER_WORKTREE_REJECTED/);
  assert.deepEqual(parseExportArgs(["--post-id", FICTIONAL_POST_ID]), { selfTest: false, postId: FICTIONAL_POST_ID, apply: false });
  assert.throws(() => parseExportArgs(["--post-id", FICTIONAL_POST_ID, "--url", "https://cloud.convex.cloud"]), /ARGUMENTS_REJECTED/);
  for (const args of [["--post-id", "realpostid01"], ["--post-id", FICTIONAL_POST_ID, "--apply", "--apply"], ["--post-id", FICTIONAL_POST_ID, "--post-id", FICTIONAL_POST_ID], ["--self-test", "--apply"]]) assert.throws(() => parseExportArgs(args), /ARGUMENTS_REJECTED/);
  const queryInit = { method: "POST", body: JSON.stringify({ path: "publishing:getPostForPublication", format: "convex_encoded_json", args: [{ postId: FICTIONAL_POST_ID }] }) };
  assert.doesNotThrow(() => assertLocalRequest("query", `${FIXTURE_CONVEX_URL}/api/query`, queryInit));
  assert.throws(() => assertLocalRequest("query", "https://cloud.convex.cloud/api/query", queryInit), /LOCAL_REQUEST_REJECTED/);
  assert.throws(() => assertLocalRequest("query", `${FIXTURE_CONVEX_URL}/api/mutation`, queryInit), /LOCAL_REQUEST_REJECTED/);
  assert.throws(() => assertLocalRequest("query", `${FIXTURE_CONVEX_URL}/api/query`, { ...queryInit, body: queryInit.body.replace("publishing:getPostForPublication", "publishing:publish") }), /LOCAL_REQUEST_REJECTED/);
  assert.throws(() => assertLocalRequest("asset", "https://remote.test/api/storage/fictional-storage-id"), /LOCAL_REQUEST_REJECTED/);
  const assetDirectory = { path: resolve(READER_ROOT, ASSET_DIRECTORY), kind: "directory", exists: true, symbolicLink: false, actualKind: "directory", links: 1 };
  assert.doesNotThrow(() => assertOutputFilesystem([assetDirectory]));
  assert.throws(() => assertOutputFilesystem([{ ...assetDirectory, symbolicLink: true }]), /READER_FILESYSTEM_REJECTED/);
  assert.throws(() => assertOutputFilesystem([{ path: resolve(READER_ROOT, CONTENT_FILE), kind: "file", exists: true, symbolicLink: false, actualKind: "file", links: 2 }]), /READER_FILESYSTEM_REJECTED/);
  assert.throws(() => assertOutputFilesystem([{ ...assetDirectory, path: resolve(READER_ROOT, "../escape") }]), /READER_FILESYSTEM_REJECTED/);
  assert.equal(buildReaderWritePlan(files).at(-1).path, CONTENT_FILE);
  assert.throws(() => buildReaderWritePlan([{ ...files[0], content: "invalid?" }, files[1]]), /READER_BYTES_REJECTED/);
  const sharp = (await import("sharp")).default;
  const heroBytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2E5B60" } }).webp().toBuffer();
  const core = await loadPublicationCore();
  const complete = { ...snapshot, post: { ...snapshot.post, contentFingerprint: core.blogEditorialFingerprint(snapshot.post) }, visuals: { articleSignature: core.articleSignature(snapshot.post), hero: { ...snapshot.visuals.hero, url: "http://127.0.0.1:3210/api/storage/fictional-storage-id", sha256: sha(heroBytes), alt: "A plainly fictional local engineering color pattern.", metadata: { width: 1600, height: 900, bytes: heroBytes.length, format: "webp", crop: JSON.stringify({ crop: null }) } } } };
  const prepared = await prepareFixtureFiles(complete, heroBytes);
  for (const metadataChange of [{ blogAuthor: "Different fictional author" }, { blogExcerpt: "Different fictional excerpt" }, { blogCategory: "research" }, { blogTags: ["changed-fictional-tag"] }, { blogPublicationIntent: "published" }]) await assert.rejects(() => prepareFixtureFiles({ ...complete, post: { ...complete.post, ...metadataChange } }, heroBytes), /ARTICLE_PROOF_REJECTED/);
  await assert.rejects(() => prepareFixtureFiles({ ...complete, post: { ...complete.post, content: FIXTURE_CONTENT } }, heroBytes), /FICTIONAL_POST_REJECTED/);
  await assert.rejects(() => core.prepareBlogPublication({ title: FIXTURE_TITLE, content: READER_CONTENT_BASELINE, scheduledDate: READER_DATE, status: "published", slug: READER_SLUG, images: [{ sourceUrl: complete.visuals.hero.url, alt: complete.visuals.hero.alt, isCover: true, export: { bytes: heroBytes, sha256: sha(heroBytes), fileName: "hero.webp", contentType: "image/webp", hero: snapshot.visuals.hero } }] }), /Offline engineering visuals cannot be published/);
  assert.equal(prepared.files.length, 2);
  const inventedContent = `${READER_CONTENT_BASELINE}\n\nEvery value below is invented solely for this local engineering rehearsal.\n\nThese arrows describe an invented rehearsal workflow.\n\nThese dates and events are invented test data.`;
  const inventedPost = { ...complete.post, content: inventedContent };
  inventedPost.contentFingerprint = core.blogEditorialFingerprint(inventedPost);
  assert.equal((await prepareFixtureFiles({ ...complete, post: inventedPost, visuals: { ...complete.visuals, articleSignature: core.articleSignature(inventedPost) } }, heroBytes)).files.length, 2);
  for (const addition of ["Unmarked ordinary claims are not rehearsal data.", "Fictional https://remote.example/image", "```fictional\nexecutable\n```", "Invented but unrecognized prose."]) {
    const rejectedPost = { ...complete.post, content: `${READER_CONTENT_BASELINE}\n\n${addition}` };
    rejectedPost.contentFingerprint = core.blogEditorialFingerprint(rejectedPost);
    await assert.rejects(() => prepareFixtureFiles({ ...complete, post: rejectedPost, visuals: { ...complete.visuals, articleSignature: core.articleSignature(rejectedPost) } }, heroBytes), /FICTIONAL_CONTENT_REJECTED/);
  }
  assert.match(Buffer.from(prepared.fileContent, "base64").toString("utf8"), /status: "published"/);
  await assert.rejects(() => prepareFixtureFiles({ ...complete, visuals: { ...complete.visuals, articleSignature: "stale article" } }, heroBytes), /ARTICLE_PROOF_REJECTED/);
  for (const heroChange of [{ sha256: "0".repeat(64) }, { metadata: { ...complete.visuals.hero.metadata, width: 1599 } }, { metadata: { ...complete.visuals.hero.metadata, bytes: heroBytes.length + 1 } }]) await assert.rejects(() => prepareFixtureFiles({ ...complete, visuals: { ...complete.visuals, hero: { ...complete.visuals.hero, ...heroChange } } }, heroBytes), /HERO_BYTES_REJECTED/);
  const sourceContent = `${READER_CONTENT_BASELINE}\n\n## Fictional workflow table (local rehearsal only)\n\n| from | to | relation |\n| --- | --- | --- |\n| Fictional inspection | Fictional repair | checks broken gear |\n| Fictional repair | Fictional test | retries repaired machine |`;
  const source = { id: "articlefixture01", name: "Fictional rehearsal article", format: "markdown", purpose: "article", content: sourceContent };
  const spec = core.planFigureCandidates(source, [], { requireClaimTrace: false }).candidates[0];
  const rendered = await core.figureSignatures(spec);
  const candidateId = "figurefixture01", url = `resonate-figure://${candidateId}`;
  const p = spec.presentation;
  const block = core.buildFigureMarkdownBlock(candidateId, spec);
  const content = sourceContent.replace(spec.insertionAnchor, `${spec.insertionAnchor}\n\n${block}`);
  const figurePost = { ...complete.post, content };
  figurePost.contentFingerprint = core.blogEditorialFingerprint(figurePost);
  const figure = { candidateId, postId: FICTIONAL_POST_ID, postContentSha256: sha(content), postContentFingerprint: core.fingerprintPostContent(figurePost), acceptedBy: FIXTURE_SUBJECT, acceptedAt: 1,
    evidenceSources: [{ sourceId: source.id, sha256: sha(sourceContent), revision: 1, purpose: "article", currentSourceId: null, currentSha256: sha(content), currentRevision: null }], spec, ...rendered, url, caption: p.caption, sourceNote: p.sourceNote, alt: p.alt };
  const withFigure = { ...complete, post: figurePost, visuals: { ...complete.visuals, articleSignature: core.articleSignature(figurePost) }, figures: [figure] };
  const figurePrepared = await prepareFixtureFiles(withFigure, heroBytes);
  assert.equal(figurePrepared.files.length, 3);
  assert.equal(figurePrepared.files.find(file => file.path.endsWith(".svg")).content, Buffer.from(rendered.svg).toString("base64"));
  await assert.rejects(() => prepareFixtureFiles({ ...withFigure, figures: [{ ...figure, acceptedBy: "real-author" }] }, heroBytes), /FIGURE_PROOF_REJECTED/);
  await assert.rejects(() => prepareFixtureFiles({ ...withFigure, figures: [{ ...figure, postContentSha256: "0".repeat(64) }] }, heroBytes), /FIGURE_PROOF_REJECTED/);
  await assert.rejects(() => prepareFixtureFiles({ ...withFigure, figures: [{ ...figure, evidenceSources: [{ ...figure.evidenceSources[0], currentSha256: "0".repeat(64) }] }] }, heroBytes), /FIGURE_PROOF_REJECTED/);
  await assert.rejects(() => prepareFixtureFiles({ ...withFigure, figures: [{ ...figure, svgSha256: "0".repeat(64) }] }, heroBytes), /FIGURE_RENDERING_REJECTED/);
  const literalSource = { ...source, content: sourceContent.replace("Fictional inspection", "Fictional inspection + test").replace("checks broken gear", "checks gear = ready") };
  const literalSpec = core.planFigureCandidates(literalSource, [], { requireClaimTrace: false }).candidates[0];
  const literalContent = literalSource.content.replace(literalSpec.insertionAnchor, `${literalSpec.insertionAnchor}\n\n${core.buildFigureMarkdownBlock(candidateId, literalSpec)}`);
  const literalPost = { ...figurePost, content: literalContent };
  literalPost.contentFingerprint = core.blogEditorialFingerprint(literalPost);
  const literalFigure = { ...figure, spec: literalSpec, ...await core.figureSignatures(literalSpec), caption: literalSpec.presentation.caption, alt: literalSpec.presentation.alt, sourceNote: literalSpec.presentation.sourceNote, postContentSha256: sha(literalContent), postContentFingerprint: core.fingerprintPostContent(literalPost), evidenceSources: [{ ...figure.evidenceSources[0], sha256: sha(literalSource.content), currentSha256: sha(literalContent) }] };
  assert.equal((await prepareFixtureFiles({ ...withFigure, post: literalPost, visuals: { ...withFigure.visuals, articleSignature: core.articleSignature(literalPost) }, figures: [literalFigure] }, heroBytes)).files.length, 3);
  console.log("Offline fictional snapshot, exact publication preparation, path, detached checkout, local transport, symlink and binary-write-plan checks passed. No database, network or reader-file write ran.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseExportArgs(process.argv.slice(2));
    if (options.selfTest) { executionStage = "offline-self-test"; await readerSelfTest(); }
    else await exportLocalFixture(options);
  } catch (error) {
    console.error(`Local reader export blocked at ${executionStage} (${error[ownedFailure] ? error.fixtureCode : "CHECK_FAILED"}). No automatic retry was attempted. Inspect any retained local files before retrying.`);
    process.exitCode = 1;
  }
}

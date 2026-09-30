import { convexTest } from "convex-test";
import { createHash } from "node:crypto";
import { anyApi, getFunctionName } from "convex/server";
import sharp from "sharp";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { stableInputSignature } from "../../lib/visualWorkflow";

const modules = import.meta.glob("../**/*.ts");
const api = anyApi;
const credentials = vi.hoisted(() => ({ key: "fictional-test-key" as string | null }));
vi.mock("../../lib/visualProviderRuntime", async (original) => ({ ...await original<typeof import("../../lib/visualProviderRuntime")>(), visualProviderCredential: () => credentials.key }));
const article = { title: "An inspection finds the fault", content: "The raven inspects a machine and chooses to repair the broken gear." };

async function setup(brandId: "corvo" | "lower-db" = "corvo", owner = "author") {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "author" });
  // Test callers use the same explicitly viewed snapshot fields as the composer. Explicit stale fields override these defaults.
  const rawMutation = user.mutation.bind(user);
  user.mutation = async (fn, args) => {
    const name = getFunctionName(fn);
    if (name === "visualWorkflow:requestGeneration" || name === "visualWorkflow:requestEdit") {
      const snapshot = await user.query(api.visualWorkflow.get, { postId: (args as { postId: string }).postId });
      return rawMutation(fn, { expectedArticleSignature: snapshot.articleSignature, expectedPlanId: snapshot.state?.selectedPlanId, expectedSceneIndex: snapshot.state?.selectedSceneIndex, expectedRefinedSceneSignature: stableInputSignature(snapshot.state?.refinedScene ?? null), ...(name.endsWith("requestEdit") ? { expectedParentVersionId: snapshot.state?.selectedVersionId } : {}), ...args } as never);
    }
    return rawMutation(fn, args);
  };
  const postId = await t.run(async (ctx) => {
    await ctx.db.insert("v2BrandMemberships", {
      userId: "author", brandId: "corvo", role: "owner", createdAt: 1, updatedAt: 1,
    });
    return ctx.db.insert("v2Posts", {
      userId: owner, brandId, channelId: "corvo-blog", platformId: "corvo-blog",
      ...article,
      contentFingerprint: "saved", status: "draft", approvalState: "unapproved", timezone: "UTC",
      createdAt: 1, updatedAt: 1,
    });
  });
  return { t, user, postId };
}

async function configureProfile(user: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  return user.mutation(api.visualProfiles.saveRevision, {
    brandId: "corvo", expectedRevisionId: null,
    guidance: { artDirection: "Narrative raven scenes", palette: [{ name: "Dark teal", color: "#123456" }], mascotGuidance: "One raven", compositionGuidance: "Visible action", textPolicy: "No text", heroChartPolicy: "No charts" },
    referenceBindings: [], defaultRoute: { provider: "digitalocean", model: "gpt-image-2", qualification: "unqualified" },
  });
}

const scenes = [
  { title: "Find the fault", subject: "raven in a workshop", metaphor: "inspection before action", action: "raven removes a broken gear", reveal: "repair exposes the cause of failure", articleConnection: "Inspection identifies a cause before committing to repair.", articleAnchor: "repair the broken gear" },
  { title: "Choose a path", subject: "navigator at a fork in a stone passage", metaphor: "evidence guides decisions", action: "navigator follows a lantern beam through the correct doorway", reveal: "the unlit passage ends abruptly", articleConnection: "Evidence makes the decision consequential.", articleAnchor: "chooses to repair" },
  { title: "Test under load", subject: "bridge builder beside a river", metaphor: "verification before trust", action: "builder lowers a weighted basket onto a newly repaired crossing", reveal: "one weak joint bends visibly", articleConnection: "Testing reveals failure before users depend on it.", articleAnchor: "inspects a machine" },
];

async function reserve(t: ReturnType<typeof convexTest>, args: { attemptId: string; maximumMicros: number; provider: string; model: string; quoteProvenance: string }) {
  const { quoteProvenance: _label, ...quote } = args;
  void _label;
  const quoteId = await t.run(async ctx => {
    const attempt = (await ctx.db.get(ctx.db.normalizeId("v2VisualAttempts", quote.attemptId)!))!;
    return ctx.db.insert("v2VisualDispatchQuotes", { ...quote, attemptId: attempt._id, inputSignature: attempt.inputSignature, stage: attempt.stage, qualification: "offline-contract", boundVerified: true, capabilityReceiptIds: [], provenance: "IN-PROCESS OFFLINE CONTRACT — no live provider qualification", createdAt: 1 });
  });
  return t.mutation(api.visualWorkflow.reserveAttempt, { attemptId: args.attemptId, quoteId });
}

async function claim(t: ReturnType<typeof convexTest>, attemptId: string, maximumMicros = 10) {
  await reserve(t, { attemptId, maximumMicros, provider: "offline-test", model: "fixture", quoteProvenance: "test trusted boundary" });
  return t.mutation(api.visualWorkflow.claimAttempt, { attemptId });
}

async function selectedPlan(withReference = false) {
  const result = await setup();
  const revision = await configureProfile(result.user);
  const referenceId = withReference ? await result.t.run(async ctx => {
    const referenceBytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#456789" } }).webp().toBuffer();
    const storageId = await ctx.storage.store(new Blob([Uint8Array.from(referenceBytes).buffer], { type: "image/webp" }));
    const id = await ctx.db.insert("v2VisualReferences", { brandId: "corvo", storageId, sha256: createHash("sha256").update(referenceBytes).digest("hex"), byteLength: referenceBytes.length, contentType: "image/webp", fileName: "SPECULATIVE-reference.webp", kind: "upload", seedAssetKey: null, article: null, approvalProvenance: null, sourceDocumentSha256: null, sourceRecord: "offline fixture", historicalProvider: null, historicalModelId: null, uploadedBy: "author", createdAt: 1 });
    await ctx.db.patch(revision.profileRevisionId, { referenceBindings: [{ referenceId: id, role: "identity" }] });
    return id;
  }) : undefined;
  await result.user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1000 });
  const attemptId = await result.user.mutation(api.visualWorkflow.requestPlan, { postId: result.postId, operationKey: "plan" });
  const claimed = await claim(result.t, attemptId);
  const planId = await result.t.mutation(api.visualWorkflow.completePlan, { attemptId, claimKey: claimed.claimKey, scenes, actualMicros: 8, usageKind: "reported", usageReceipt: "offline fixture" });
  await result.user.mutation(api.visualWorkflow.selectScene, { planId, sceneIndex: 0 });
  return { ...result, planId, referenceId };
}


beforeEach(() => { credentials.key = "fictional-test-key"; vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "1"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function reviewedTestRoute(t: ReturnType<typeof convexTest>) {
  // SPECULATIVE CONTRACT DOUBLE ONLY: these are fictional review/capability receipts, never production qualification.
  return t.mutation(api.visualProviderConfig.registerReviewedImageRoute, {
    provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2-2026-04-21",
    operations: ["generate", "edit"], referenceInputs: true, maxInputImages: 16,
    size: "1536x1024", outputFormat: "webp", quality: "medium", maximumMicros: 100000,
    maxPromptBytes: 100000, maxInputBytes: 20 * 1024 * 1024,
    capabilityReceiptIds: ["SPECULATIVE-test-capability"], boundReceiptId: "SPECULATIVE-test-bound",
    reviewedBy: "SPECULATIVE offline tester", provenance: "SPECULATIVE CONTRACT DOUBLE — no production qualification",
    expiresAt: Date.now() + 60_000,
  });
}
async function queued() {
  const result = await selectedPlan();
  await result.user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1_000_000 });
  const current = await result.user.query(api.visualWorkflow.get, { postId: result.postId });
  const attemptId = await result.user.mutation(api.visualWorkflow.requestGeneration, {
    postId: result.postId, operationKey: "public-image-dispatch", providerOverride: "openai",
    expectedArticleSignature: current.articleSignature, expectedPlanId: current.state.selectedPlanId,
    expectedSceneIndex: current.state.selectedSceneIndex, expectedRefinedSceneSignature: stableInputSignature(current.state.refinedScene ?? null),
  });
  return { ...result, attemptId };
}
async function successResponse() {
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#123456" } }).webp().toBuffer();
  return new Response(JSON.stringify({ model: "gpt-image-2-2026-04-21", data: [{ b64_json: bytes.toString("base64"), revised_prompt: "Fictional raven repairs a gear" }], usage: { input_tokens_details: { text_tokens: 10, image_tokens: 20 }, output_tokens: 30 } }), { status: 200, headers: { "x-request-id": "req_fictional" } });
}
describe("actual server image execution (SPECULATIVE offline contract doubles)", () => {
  it("rejects public scheduler flags and refuses a trusted scheduler for image stages", async () => {
    const { t, user, attemptId } = await queued(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(user.action(api.visualProviderActions.executeImageAttempt, { attemptId, trustedReflectionScheduler: true, userId: "author" })).rejects.toThrow();
    await expect(t.query(api.visualWorkflow.getAttemptForDispatch, { userId: "author", attemptId, expectedStages: ["reflection"], trustedReflectionScheduler: true })).rejects.toThrow("Trusted scheduler only accepts");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("schedules one automatic reflection for a newly approved real edited lineage and does not duplicate it on repeated approval", async () => {
    const { t, user, postId, attemptId } = await queued(); await reviewedTestRoute(t);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(successResponse));
    await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    const editId = await user.mutation(api.visualWorkflow.requestEdit, { postId, operationKey: "scheduled-reflection-edit", feedback: "Move the raven closer to the gear." });
    const edited = await user.action(api.visualProviderActions.executeImageAttempt, { attemptId: editId });
    const exported = await user.action(api.visualExports.prepareHero, { versionId: edited.versionId });
    const snapshot = await user.query(api.visualWorkflow.get, { postId });
    const approval = { postId, versionId: edited.versionId, alt: "A fictional raven moves a gear", expectedExportHash: exported.exportHash, expectedExportMetadataSignature: stableInputSignature(exported.metadata), expectedArticleSignature: snapshot.articleSignature };
    await user.mutation(api.visualWorkflow.approveHero, approval);
    await user.mutation(api.visualWorkflow.approveHero, approval);
    const saved = await user.query(api.visualWorkflow.get, { postId }); expect(saved.reflections).toHaveLength(1);
    const jobs = await t.run(ctx => ctx.db.system.query("_scheduled_functions").take(20));
    expect(jobs.filter(job => job.name === "visualTextActions:executeQueuedReflection")).toHaveLength(1);
    expect(jobs.find(job => job.name === "visualTextActions:executeQueuedReflection")!.args[0]).toMatchObject({ attemptId: saved.reflections[0].attemptId, userId: "author" });
    await t.finishInProgressScheduledFunctions();
  });

  it("atomically shares the provider cap across two brands while a dispatch is in flight", async () => {
    const { t, user, postId, attemptId } = await queued();
    await user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 5_000_000 });
    const lowerPostId = await t.run(async ctx => {
      await ctx.db.insert("v2BrandMemberships", { userId: "author", brandId: "lower-db", role: "owner", createdAt: 1, updatedAt: 1 });
      const post = (await ctx.db.get(postId))!;
      const { _id, _creationTime, ...fields } = post; void _id; void _creationTime;
      return ctx.db.insert("v2Posts", { ...fields, brandId: "lower-db", approvalState: "unapproved" });
    });
    await user.mutation(api.visualProfiles.saveRevision, { brandId: "lower-db", expectedRevisionId: null, guidance: { artDirection: "SPECULATIVE raven", palette: [{ name: "Teal", color: "#123456" }], mascotGuidance: "One raven", compositionGuidance: "Visible action", textPolicy: "No text", heroChartPolicy: "No charts" }, referenceBindings: [], defaultRoute: { provider: "openai", model: "gpt-image-2", qualification: "unqualified" } });
    await user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "lower-db", limitMicros: 5_000_000 });
    const planAttemptId = await user.mutation(api.visualWorkflow.requestPlan, { postId: lowerPostId, operationKey: "lower-plan" }); const planClaim = await claim(t, planAttemptId);
    const planId = await t.mutation(api.visualWorkflow.completePlan, { attemptId: planAttemptId, claimKey: planClaim.claimKey, scenes, actualMicros: 8, usageKind: "reported", usageReceipt: "SPECULATIVE fixture" }); await user.mutation(api.visualWorkflow.selectScene, { planId, sceneIndex: 0 });
    const lowerAttempt = await user.mutation(api.visualWorkflow.requestGeneration, { postId: lowerPostId, operationKey: "lower-image" });
    const routeId = await reviewedTestRoute(t); await t.run(ctx => ctx.db.patch(routeId, { maximumMicros: 3_000_000 }));
    let release!: (response: Response) => void;
    let started!: () => void; const dispatched = new Promise<void>(resolve => { started = resolve; });
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { release = resolve; started(); })); vi.stubGlobal("fetch", fetchMock);
    const pending = [user.action(api.visualProviderActions.executeImageAttempt, { attemptId }), user.action(api.visualProviderActions.executeImageAttempt, { attemptId: lowerAttempt })];
    const denied = await Promise.race(pending);
    expect(denied).toMatchObject({ status: "blocked", reason: "cumulative-provider-allowance-exhausted" });
    await dispatched;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await t.run(ctx => ctx.db.query("v2VisualProviderAllowances").first())).toMatchObject({ reservedMicros: 3_000_000, spentMicros: 0 });
    release(await successResponse());
    const completed = await Promise.all(pending); expect(completed.filter(r => r.status === "completed")).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("v2VisualProviderAllowances").first())).toMatchObject({ reservedMicros: 0, spentMicros: 1110 });
  });
  it("retains a shared allowance reservation under rollout pause, then releases only undispatched cancellation", async () => {
    const { t, user, attemptId } = await queued(); const routeId = await reviewedTestRoute(t);
    const quoteId = await t.mutation(api.visualProviderConfig.registerImageDispatchQuote, { attemptId, routeId, requestSha256: "a".repeat(64) });
    await t.mutation(api.visualWorkflow.reserveAttempt, { attemptId, quoteId });
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    await expect(user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).rejects.toThrow("Editorial visual admissions are paused");
    expect(await t.run(ctx => ctx.db.query("v2VisualProviderAllowances").first())).toMatchObject({ reservedMicros: 100000, spentMicros: 0 });
    await user.mutation(api.visualWorkflow.cancelQueuedAttempt, { attemptId });
    await user.mutation(api.visualWorkflow.cancelQueuedAttempt, { attemptId });
    expect(await t.run(ctx => ctx.db.query("v2VisualProviderAllowances").first())).toMatchObject({ reservedMicros: 0, spentMicros: 0 });
  });
  it("keeps distinct qualified qualities available and never promotes probes", async () => {
    const { t, user, postId } = await queued(); const medium = await reviewedTestRoute(t);
    const route = await t.run(ctx => ctx.db.get(medium));
    const { _id, _creationTime, enabled, createdAt, ...fields } = route!; void _id; void _creationTime; void enabled; void createdAt;
    await t.mutation(api.visualProviderConfig.registerReviewedImageRoute, { ...fields, quality: "low" });
    await t.mutation(api.visualProviderConfig.registerReviewedImageRoute, { ...fields, quality: "high" });
    expect((await user.query(api.visualProviderConfig.getAvailability, { postId })).imageRoutes.map((r: { quality: string }) => r.quality).sort()).toEqual(["high", "low", "medium"]);
  });

  it("sends actual ordered identity references for generation, then selected parent first followed by the same reference", async () => {
    const { t, user, postId, referenceId } = await selectedPlan(true);
    await user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1_000_000 }); await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockImplementation(successResponse); vi.stubGlobal("fetch", fetchMock);
    const attemptId = await user.mutation(api.visualWorkflow.requestGeneration, { postId, operationKey: "owned-ref", providerOverride: "openai" });
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "completed" });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    const referenceBytes = await t.run(async ctx => (await ctx.storage.get((await ctx.db.get(referenceId!))!.storageId))!.arrayBuffer());
    expect(Buffer.from(await (form.getAll("image[]")[0] as Blob).arrayBuffer())).toEqual(Buffer.from(referenceBytes));
    const editId = await user.mutation(api.visualWorkflow.requestEdit, { postId, operationKey: "owned-ref-edit", feedback: "Move the raven closer to the gear." });
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId: editId })).toMatchObject({ status: "completed" });
    const editForm = fetchMock.mock.calls[1][1].body as FormData;
    expect(editForm.getAll("image[]")).toHaveLength(2);
    expect(Buffer.from(await (editForm.getAll("image[]")[1] as Blob).arrayBuffer())).toEqual(Buffer.from(referenceBytes));
    const saved = await user.query(api.visualWorkflow.get, { postId });
    const receipt = JSON.parse(saved.attempts.find((a: { _id: string }) => a._id === editId).usageReceipt);
    expect(receipt.inputImages.map((i: { role: string }) => i.role)).toEqual(["edit-parent", "identity"]);
    expect(receipt.parentVersionId).toBe(saved.versions[0].parentVersionId);
  });
  it("keeps the provider allowance held during uncertainty and adjusts it once for a late receipt after owner reconciliation", async () => {
    const { t, user, postId, attemptId } = await queued(); await reviewedTestRoute(t);
    const body = await (await successResponse()).json(); delete body.usage;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })));
    await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    const saved = await user.query(api.visualWorkflow.get, { postId }); const attempt = saved.attempts.find((a: { _id: string }) => a._id === attemptId);
    expect(await t.run(ctx => ctx.db.query("v2VisualProviderAllowances").first())).toMatchObject({ reservedMicros: 100000, spentMicros: 0 });
    await user.mutation(api.visualWorkflow.reconcileUncertain, { attemptId, expectedUpdatedAt: attempt.updatedAt, reason: "SPECULATIVE owner verified billed usage", actualMicros: 500, usageKind: "estimated", usageReceipt: "SPECULATIVE owner attestation" });
    expect(await t.run(ctx => ctx.db.query("v2VisualProviderAllowances").first())).toMatchObject({ reservedMicros: 0, spentMicros: 500 });
    const raw = await t.run(ctx => ctx.db.get(attemptId));
    const bytes = Buffer.from(await t.run(async ctx => (await ctx.storage.get(raw!.pendingOutputStorageId!))!.arrayBuffer()));
    const completion = { attemptId, claimKey: raw!.claimKey, storageId: raw!.pendingOutputStorageId, sha256: createHash("sha256").update(bytes).digest("hex"), contentType: "image/webp", width: 32, height: 24, bytes: bytes.length, actualMicros: 1110, usageKind: "estimated", usageReceipt: "SPECULATIVE late trusted usage" };
    expect(await t.mutation(api.visualWorkflow.completeImage, completion)).toBeNull();
    expect(await t.mutation(api.visualWorkflow.completeImage, completion)).toBeNull();
    expect(await t.run(ctx => ctx.db.query("v2VisualProviderAllowances").first())).toMatchObject({ reservedMicros: 0, spentMicros: 1110 });
    expect((await user.query(api.visualWorkflow.get, { postId })).versions).toHaveLength(0);
  });

  it("blocks unknown qualification and absent key before reservation, claim or HTTP", async () => {
    const { t, user, postId, attemptId } = await queued();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "blocked", reason: "no-qualified-route-and-cost-bound" });
    await reviewedTestRoute(t); credentials.key = null;
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "blocked", reason: "provider-credential-unavailable" });
    const saved = await user.query(api.visualWorkflow.get, { postId });
    expect(saved.attempts.find((a: { _id: string }) => a._id === attemptId)).toMatchObject({ status: "queued" });
    expect(saved.attempts.find((a: { _id: string }) => a._id === attemptId).reservedMicros).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("permits one dispatch under concurrent public action calls and blocks subsequent replay", async () => {
    const { t, user, attemptId } = await queued(); await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockImplementation(successResponse); vi.stubGlobal("fetch", fetchMock);
    const results = await Promise.all([user.action(api.visualProviderActions.executeImageAttempt, { attemptId }), user.action(api.visualProviderActions.executeImageAttempt, { attemptId })]);
    expect(results.filter(r => r.status === "completed")).toHaveLength(1); expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "blocked" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["http", "missing-usage", "timeout", "invalid-image"])("retains the reservation and sanitized receipt for %s without retry", async failure => {
    const { t, user, postId, attemptId } = await queued(); await reviewedTestRoute(t);
    const response = await successResponse(); const body = await response.json();
    if (failure === "missing-usage") delete body.usage;
    if (failure === "invalid-image") body.data[0].b64_json = Buffer.from("RIFFbad-WEBP-corrupt").toString("base64");
    const fetchMock = failure === "timeout" ? vi.fn().mockRejectedValue(new DOMException("SPECULATIVE timeout", "AbortError")) : vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...body, secret: "fictional-secret-must-not-persist" }), { status: failure === "http" ? 503 : 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "uncertain", versionId: null });
    const saved = await user.query(api.visualWorkflow.get, { postId }); const attempt = saved.attempts.find((a: { _id: string }) => a._id === attemptId);
    expect(attempt).toMatchObject({ status: "uncertain", reservedMicros: 100000 }); expect(saved.month.reservedMicros).toBe(100000); expect(saved.versions).toHaveLength(0);
    expect(attempt.usageReceipt ?? "").not.toContain("fictional-secret");
    if (failure === "missing-usage") { expect(attempt.pendingOutputStorageId).toBeTruthy(); expect(JSON.parse(attempt.usageReceipt).usage).toBeNull(); }
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "blocked", reason: "reconciliation-required" }); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("denies anonymous/foreign callers and substituted pinned parent bytes before HTTP", async () => {
    const { t, user, postId, attemptId } = await queued(); await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockImplementation(successResponse); vi.stubGlobal("fetch", fetchMock);
    await expect(t.action(api.visualProviderActions.executeImageAttempt, { attemptId })).rejects.toThrow("Unauthorized");
    await expect(t.withIdentity({ subject: "intruder" }).action(api.visualProviderActions.executeImageAttempt, { attemptId })).rejects.toThrow("Attempt not found"); expect(fetchMock).not.toHaveBeenCalled();
    await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    const editId = await user.mutation(api.visualWorkflow.requestEdit, { postId, operationKey: "tampered-parent", feedback: "Bring gear closer." });
    await t.run(async ctx => { const version = (await ctx.db.query("v2VisualVersions").first())!; await ctx.db.patch(version._id, { sha256: "f".repeat(64) }); });
    await expect(user.action(api.visualProviderActions.executeImageAttempt, { attemptId: editId })).rejects.toThrow("Pinned image parent bytes changed"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("allows an exact operator qualification probe without inventing a live receipt and keeps probe unavailable to composer", async () => {
    const { t, user, postId, attemptId } = await queued();
    await t.mutation(api.visualProviderConfig.registerReviewedImageRoute, { provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2-2026-04-21", operations: ["generate"], referenceInputs: true, maxInputImages: 16, size: "1536x1024", outputFormat: "webp", quality: "medium", maximumMicros: 100000, maxPromptBytes: 100000, maxInputBytes: 20*1024*1024, capabilityReceiptIds: [], boundReceiptId: "SPECULATIVE-probe-bound", reviewedBy: "offline tester", provenance: "SPECULATIVE PROBE PACKET ONLY", expiresAt: Date.now()+60000, qualification: "qualification-probe", operatorUserId: "author", probeAttemptId: attemptId, reviewedPacketId: "SPECULATIVE-exact-packet" });
    expect(await user.query(api.visualProviderConfig.getAvailability, { postId })).toMatchObject({ imageRoutes: [] });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(successResponse));
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "completed" });
    const saved = await user.query(api.visualWorkflow.get, { postId }); const attempt = saved.attempts.find((a: { _id: string }) => a._id === attemptId);
    expect(JSON.parse(attempt.usageReceipt)).toMatchObject({ evidence: "authorized-probe", qualifiesRoute: false });
    expect(await t.run(async ctx => (await ctx.db.get(attempt.quoteId))!.qualification)).toBe("qualification-probe");
  });
  it("does not reset cumulative provider allowance when new routes are registered", async () => {
    const { t, user, attemptId } = await queued(); await reviewedTestRoute(t);
    await t.run(ctx => ctx.db.insert("v2VisualProviderAllowances", { provider: "openai", spentMicros: 4_950_000, reservedMicros: 0, updatedAt: 1 }));
    await reviewedTestRoute(t); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "blocked", reason: "cumulative-provider-allowance-exhausted" }); expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["gpt-image-1-mini", "gpt-image-1"])("pins explicit%s low quality/fidelity and retains it through a local edit", async model => {
    const result = await selectedPlan();
    await result.user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1_000_000 });
    await result.t.mutation(api.visualProviderConfig.registerReviewedImageRoute, { provider: "openai", model: model, apiModelId: model, operations: ["generate", "edit"], referenceInputs: true, maxInputImages: 16, size: "1536x1024", outputFormat: "webp", quality: "low", maximumMicros: 100000, maxPromptBytes: 100000, maxInputBytes: 20 * 1024 * 1024, capabilityReceiptIds: ["SPECULATIVE-mini-capability"], boundReceiptId: "SPECULATIVE-mini-bound", reviewedBy: "offline tester", provenance: "SPECULATIVE MINI CONTRACT ONLY", expiresAt: Date.now() + 60_000 });
    const lowRoute = await result.t.run(ctx => ctx.db.query("v2VisualImageRoutes").first());
    const { _id: lowId, _creationTime: lowTime, enabled: lowEnabled, createdAt: lowCreated, ...highFidelity } = lowRoute!; void lowId; void lowTime; void lowEnabled; void lowCreated;
    await result.t.mutation(api.visualProviderConfig.registerReviewedImageRoute, { ...highFidelity, inputFidelity: "high" });
    const attemptId = await result.user.mutation(api.visualWorkflow.requestGeneration, { postId: result.postId, operationKey: "cheap-model", providerOverride: "openai", modelOverride: model, quality: "low" });
    const response = await successResponse();
    const body = await response.json(); body.model = model;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    expect(await result.user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "completed" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: model, quality: "low", input_fidelity: "low" });
    const editId = await result.user.mutation(api.visualWorkflow.requestEdit, { postId: result.postId, operationKey: "cheap-edit", feedback: "Move the gear closer to the raven." });
    expect(await result.user.action(api.visualProviderActions.executeImageAttempt, { attemptId: editId })).toMatchObject({ status: "completed" });
    const form = fetchMock.mock.calls[1][1].body as FormData;
    expect(form.get("model")).toBe(model); expect(form.get("quality")).toBe("low"); expect(form.get("input_fidelity")).toBe("low");
    const saved = await result.user.query(api.visualWorkflow.get, { postId: result.postId });
    expect(saved.versions[0]).toMatchObject({ parentVersionId: saved.versions[1]._id, model: model, feedback: "Move the gear closer to the raven." });
    expect(Buffer.from(await (form.getAll("image[]")[0] as Blob).arrayBuffer())).toEqual(Buffer.from(await result.t.run(async ctx => (await ctx.storage.get(saved.versions[1].storageId))!.arrayBuffer())));
  });

  it("executes the public action once and persists decoded image bytes, lineage and usage", async () => {
    const { t, user, postId, attemptId } = await queued();
    await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockResolvedValue(await successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const result = await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    expect(result).toMatchObject({ status: "completed", reason: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const saved = await user.query(api.visualWorkflow.get, { postId });
    expect(saved.versions[0]).toMatchObject({ _id: result.versionId, width: 32, height: 24, provider: "openai", model: "gpt-image-2", parentVersionId: null });
    expect(saved.attempts.find((a: { _id: string }) => a._id === attemptId)).toMatchObject({ status: "completed", estimatedActualMicros: 1110 });
    expect(saved.month.reservedMicros).toBe(0);
  });
});

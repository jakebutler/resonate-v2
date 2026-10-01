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

async function selectedPlan(withReference: boolean | { width: number; height: number } = false) {
  const result = await setup();
  const revision = await configureProfile(result.user);
  const referenceId = withReference ? await result.t.run(async ctx => {
    const referenceBytes = await sharp({ create: { width: typeof withReference === "object" ? withReference.width : 32, height: typeof withReference === "object" ? withReference.height : 24, channels: 3, background: "#456789" } }).webp().toBuffer();
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
async function queued(referenceSize?: { width: number; height: number }) {
  const result = await selectedPlan(referenceSize ?? false);
  await result.user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1_000_000 });
  const current = await result.user.query(api.visualWorkflow.get, { postId: result.postId });
  const attemptId = await result.user.mutation(api.visualWorkflow.requestGeneration, {
    postId: result.postId, operationKey: "public-image-dispatch", providerOverride: "openai",
    expectedArticleSignature: current.articleSignature, expectedPlanId: current.state.selectedPlanId,
    expectedSceneIndex: current.state.selectedSceneIndex, expectedRefinedSceneSignature: stableInputSignature(current.state.refinedScene ?? null),
  });
  return { ...result, attemptId };
}
async function successResponse(width = 1536, height = 1024) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: "#123456" } }).webp().toBuffer();
  return new Response(JSON.stringify({ model: "gpt-image-2-2026-04-21", data: [{ b64_json: bytes.toString("base64"), revised_prompt: "Fictional raven repairs a gear" }], usage: { input_tokens_details: { text_tokens: 10, image_tokens: 20 }, output_tokens: 30 } }), { status: 200, headers: { "x-request-id": "req_fictional" } });
}
describe("actual server image execution (SPECULATIVE offline contract doubles)", () => {
  it.each([{ width: 2000, height: 1000 }, { width: 1701, height: 900 }, { width: 1600, height: 1001 }])("blocks a compressed oversized Image2 reference $width×$height before quote, reservation, claim or HTTP", async dimensions => {
    const { t, user, postId, attemptId } = await queued(dimensions);
    await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockImplementation(() => successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const envelope = () => t.run(async ctx => ({
      attempt: await ctx.db.get(attemptId),
      quotes: await ctx.db.query("v2VisualDispatchQuotes").withIndex("by_attempt", q => q.eq("attemptId", attemptId)).collect(),
      month: await ctx.db.query("v2VisualBudgetMonths").first(),
      allowance: await ctx.db.query("v2VisualProviderAllowances").first(),
    }));
    const before = await envelope();
    expect(before.attempt!.input.references).toHaveLength(1);
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toEqual({ status: "blocked", versionId: null, reason: "gpt-image-2-input-dimensions-exceed-reviewed-envelope" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await envelope()).toEqual(before);
    expect((await user.query(api.visualWorkflow.get, { postId })).versions).toHaveLength(0);
  });

  it("blocks Image2 edit aggregate bytes exceeding the reviewed bound even when each parent/reference fits", async () => {
    const { t, user, postId, attemptId } = await queued({ width: 32, height: 24 });
    const routeId = await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockImplementation(() => successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const generated = await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    expect(generated.status).toBe("completed");
    const bound = await t.run(async ctx => {
      const parent = (await ctx.db.get(generated.versionId!))!;
      const reference = (await ctx.db.query("v2VisualReferences").first())!;
      const actualBytes = [(await ctx.storage.get(parent.storageId))!.size, (await ctx.storage.get(reference.storageId))!.size];
      const maxInputBytes = Math.max(...actualBytes);
      await ctx.db.patch(routeId, { maxInputBytes });
      return { actualBytes, maxInputBytes };
    });
    expect(bound.actualBytes.every(bytes => bytes <= bound.maxInputBytes)).toBe(true);
    expect(bound.actualBytes.reduce((sum, bytes) => sum + bytes, 0)).toBeGreaterThan(bound.maxInputBytes);
    const editId = await user.mutation(api.visualWorkflow.requestEdit, { postId, operationKey: "aggregate-bound", feedback: "Move the gear closer." });
    fetchMock.mockClear();
    const envelope = () => t.run(async ctx => ({
      attempt: await ctx.db.get(editId),
      quotes: await ctx.db.query("v2VisualDispatchQuotes").withIndex("by_attempt", q => q.eq("attemptId", editId)).collect(),
      month: await ctx.db.query("v2VisualBudgetMonths").first(),
      allowance: await ctx.db.query("v2VisualProviderAllowances").first(),
    }));
    const before = await envelope();
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId: editId })).toEqual({ status: "blocked", versionId: null, reason: "reviewed-input-bound-exceeded" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await envelope()).toEqual(before);
  });

  it("blocks an oversized decoded Image2 edit parent even when its persisted output contract matches", async () => {
    const { t, user, postId, attemptId } = await queued();
    const routeId = await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockImplementation(() => successResponse());
    vi.stubGlobal("fetch", fetchMock);
    const generated = await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    expect(generated.status).toBe("completed");
    const bytes = await sharp({ create: { width: 1701, height: 900, channels: 3, background: "#456789" } }).webp().toBuffer();
    await t.run(async ctx => {
      const parent = (await ctx.db.get(generated.versionId!))!;
      const storageId = await ctx.storage.store(new Blob([Uint8Array.from(bytes).buffer], { type: "image/webp" }));
      await ctx.db.patch(parent._id, { storageId, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length, width: 1701, height: 900, input: { ...parent.input, size: "1701x900" } });
      await ctx.db.patch(routeId, { size: "1701x900" });
    });
    const editId = await user.mutation(api.visualWorkflow.requestEdit, { postId, operationKey: "oversized-parent", feedback: "Move the gear closer." });
    fetchMock.mockClear();
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId: editId })).toEqual({ status: "blocked", versionId: null, reason: "gpt-image-2-input-dimensions-exceed-reviewed-envelope" });
    expect(fetchMock).not.toHaveBeenCalled();
    const saved = await user.query(api.visualWorkflow.get, { postId });
    expect(saved.attempts.find((attempt: { _id: string }) => attempt._id === editId)).toMatchObject({ status: "queued" });
    expect(saved.month.reservedMicros).toBe(0);
    expect(await t.run(ctx => ctx.db.query("v2VisualDispatchQuotes").withIndex("by_attempt", q => q.eq("attemptId", editId)).collect())).toEqual([]);
  });

  it("preserves the broader decoded reference envelope for other image models", async () => {
    const { t, user, postId } = await selectedPlan({ width: 2000, height: 1000 });
    await user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1_000_000 });
    const routeId = await reviewedTestRoute(t);
    await t.run(ctx => ctx.db.patch(routeId, { model: "gpt-image-1-mini", apiModelId: "gpt-image-1-mini", quality: "low", inputFidelity: "low" }));
    const attemptId = await user.mutation(api.visualWorkflow.requestGeneration, { postId, operationKey: "other-model-envelope", providerOverride: "openai", modelOverride: "gpt-image-1-mini", quality: "low" });
    const body = await (await successResponse()).json();
    body.model = "gpt-image-1-mini";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "completed" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("cancels an oversized declared provider response while retaining the uncertain hold", async () => {
    const f = await queued(); await reviewedTestRoute(f.t);
    const cancelled = vi.fn();
    const stream = new ReadableStream({ cancel: cancelled });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { "content-length": "999999999" } })));
    expect(await f.user.action(api.visualProviderActions.executeImageAttempt, { attemptId: f.attemptId })).toMatchObject({ status: "uncertain" });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const state = await f.user.query(api.visualWorkflow.get, { postId: f.postId });
    expect(state.attempts.find((a: { _id: string }) => a._id === f.attemptId).status).toBe("uncertain");
    expect(state.month.reservedMicros).toBeGreaterThan(0);
  });

  it("rejects public scheduler flags and refuses a trusted scheduler for image stages", async () => {
    const { t, user, attemptId } = await queued(); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(user.action(api.visualProviderActions.executeImageAttempt, { attemptId, trustedReflectionScheduler: true, userId: "author" })).rejects.toThrow();
    await expect(t.query(api.visualWorkflow.getAttemptForDispatch, { userId: "author", attemptId, expectedStages: ["reflection"], trustedReflectionScheduler: true })).rejects.toThrow("Trusted scheduler only accepts");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("schedules one automatic reflection for a newly approved real edited lineage and does not duplicate it on repeated approval", async () => {
    const { t, user, postId, attemptId } = await queued(); await reviewedTestRoute(t);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => successResponse()));
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

  it("keeps qualified edit capability when a newer same-settings route only generates", async () => {
    const { t, user, postId } = await queued();
    const edit = await reviewedTestRoute(t);
    await t.run(ctx => ctx.db.patch(edit, { operations: ["edit"] }));
    const generation = await reviewedTestRoute(t);
    await t.run(ctx => ctx.db.patch(generation, { operations: ["generate"] }));
    const available = (await user.query(api.visualProviderConfig.getAvailability, { postId })).imageRoutes;
    expect(available.some((route: { edit: boolean }) => route.edit)).toBe(true);
    expect(available.some((route: { generation: boolean }) => route.generation)).toBe(true);
  });

  it("returns a controlled block for a legacy corrupt reference before quote, hold or HTTP", async () => {
    const f = await selectedPlan(true);
    await f.user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1_000_000 });
    await reviewedTestRoute(f.t);
    await f.t.run(async ctx => {
      const bytes = Uint8Array.from([0xff, 0xd8, 0xff]);
      const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/jpeg" }));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await ctx.db.patch(f.referenceId!, { storageId, sha256, byteLength: bytes.length, contentType: "image/jpeg" });
      const plan = (await ctx.db.get(f.planId))!;
      await ctx.db.patch(plan._id, { input: { ...plan.input, references: plan.input.references.map(reference => ({ ...reference, storageId, sha256 })) } });
    });
    const attemptId = await f.user.mutation(api.visualWorkflow.requestGeneration, { postId: f.postId, operationKey: "legacy-corrupt", providerOverride: "openai" });
    vi.stubGlobal("fetch", vi.fn());
    expect(await f.user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "blocked", reason: "reference-image-unavailable-or-invalid" });
    const state = await f.user.query(api.visualWorkflow.get, { postId: f.postId });
    expect(state.month).toMatchObject({ reservedMicros: 0, spentMicros: 8 });
    expect(state.attempts.find((a: { _id: string }) => a._id === attemptId)).toMatchObject({ status: "queued" });
    expect(await f.t.run(ctx => ctx.db.query("v2VisualDispatchQuotes").withIndex("by_attempt", q => q.eq("attemptId", attemptId)).collect())).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ width: 1448, height: 1086 }, { width: 1672, height: 941 }, { width: 1600, height: 1000 }, { width: 1700, height: 941 }])("admits Image2 reference $width×$height and its 1536×1024 parent at the exact aggregate byte bound", async dimensions => {
    const { t, user, postId, referenceId } = await selectedPlan(dimensions);
    await user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1_000_000 }); const routeId = await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockImplementation(() => successResponse()); vi.stubGlobal("fetch", fetchMock);
    const attemptId = await user.mutation(api.visualWorkflow.requestGeneration, { postId, operationKey: "owned-ref", providerOverride: "openai" });
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "completed" });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    const referenceBytes = await t.run(async ctx => (await ctx.storage.get((await ctx.db.get(referenceId!))!.storageId))!.arrayBuffer());
    expect(Buffer.from(await (form.getAll("image[]")[0] as Blob).arrayBuffer())).toEqual(Buffer.from(referenceBytes));
    await t.run(async ctx => {
      const parent = (await ctx.db.query("v2VisualVersions").first())!;
      expect(parent).toMatchObject({ width: 1536, height: 1024 });
      const parentBytes = (await ctx.storage.get(parent.storageId))!.size;
      await ctx.db.patch(routeId, { maxInputBytes: parentBytes + referenceBytes.byteLength });
    });
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
    const completion = { attemptId, claimKey: raw!.claimKey, storageId: raw!.pendingOutputStorageId, sha256: createHash("sha256").update(bytes).digest("hex"), contentType: "image/webp", width: 1536, height: 1024, bytes: bytes.length, actualMicros: 1110, usageKind: "estimated", usageReceipt: "SPECULATIVE late trusted usage" };
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
    const fetchMock = vi.fn().mockImplementation(() => successResponse()); vi.stubGlobal("fetch", fetchMock);
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
    const fetchMock = vi.fn().mockImplementation(() => successResponse()); vi.stubGlobal("fetch", fetchMock);
    await expect(t.action(api.visualProviderActions.executeImageAttempt, { attemptId })).rejects.toThrow("Unauthorized");
    await expect(t.withIdentity({ subject: "intruder" }).action(api.visualProviderActions.executeImageAttempt, { attemptId })).rejects.toThrow("Attempt not found"); expect(fetchMock).not.toHaveBeenCalled();
    await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    const editId = await user.mutation(api.visualWorkflow.requestEdit, { postId, operationKey: "tampered-parent", feedback: "Bring gear closer." });
    await t.run(async ctx => { const version = (await ctx.db.query("v2VisualVersions").first())!; await ctx.db.patch(version._id, { sha256: "f".repeat(64) }); });
    await expect(user.action(api.visualProviderActions.executeImageAttempt, { attemptId: editId })).rejects.toThrow("Pinned image parent bytes changed"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["dimensions", "format", "metadata-mime", "storage-mime"] as const)("blocks a historical selected parent with mismatched %s before any reservation or HTTP", async mismatch => {
    const { t, user, postId, attemptId } = await queued(); await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockImplementation(() => successResponse()); vi.stubGlobal("fetch", fetchMock);
    const completed = await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    expect(completed.status).toBe("completed");
    const height = mismatch === "dimensions" ? 512 : 1024;
    const native = sharp({ create: { width: 1536, height, channels: 3, background: "#456789" } });
    const legacyBytes = await (["format", "storage-mime"].includes(mismatch) ? native.png() : native.webp()).toBuffer();
    const contentType = mismatch === "format" ? "image/png" : "image/webp";
    await t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob([Uint8Array.from(legacyBytes).buffer], { type: contentType }));
      await ctx.db.patch(completed.versionId!, { storageId, sha256: createHash("sha256").update(legacyBytes).digest("hex"), bytes: legacyBytes.length, contentType: mismatch === "metadata-mime" ? "image/png" : contentType, width: 1536, height });
    });
    const editId = await user.mutation(api.visualWorkflow.requestEdit, { postId, operationKey: "historical-parent-mismatch", feedback: "Bring the gear closer." });
    fetchMock.mockClear();
    const envelope = () => t.run(async ctx => ({ parent: await ctx.db.get(completed.versionId!), attempt: await ctx.db.get(editId), month: await ctx.db.query("v2VisualBudgetMonths").first(), allowance: await ctx.db.query("v2VisualProviderAllowances").first(), quotes: await ctx.db.query("v2VisualDispatchQuotes").withIndex("by_attempt", q => q.eq("attemptId", editId)).collect(), versions: await ctx.db.query("v2VisualVersions").collect() }));
    const before = await envelope();
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId: editId })).toEqual({ status: "blocked", versionId: null, reason: "edit-parent-output-contract-mismatch" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await envelope()).toEqual(before);
    const retained = await t.run(async ctx => Array.from(new Uint8Array(await (await ctx.storage.get(before.parent!.storageId))!.arrayBuffer())));
    expect(Buffer.from(retained)).toEqual(legacyBytes);
  });

  it("allows an exact operator qualification probe without inventing a live receipt and keeps probe unavailable to composer", async () => {
    const { t, user, postId, attemptId } = await queued();
    await t.mutation(api.visualProviderConfig.registerReviewedImageRoute, { provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2-2026-04-21", operations: ["generate"], referenceInputs: true, maxInputImages: 16, size: "1536x1024", outputFormat: "webp", quality: "medium", maximumMicros: 100000, maxPromptBytes: 100000, maxInputBytes: 20*1024*1024, capabilityReceiptIds: [], boundReceiptId: "SPECULATIVE-probe-bound", reviewedBy: "offline tester", provenance: "SPECULATIVE PROBE PACKET ONLY", expiresAt: Date.now()+60000, qualification: "qualification-probe", operatorUserId: "author", probeAttemptId: attemptId, reviewedPacketId: "SPECULATIVE-exact-packet" });
    expect(await user.query(api.visualProviderConfig.getAvailability, { postId })).toMatchObject({ imageRoutes: [] });
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => successResponse()));
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

  it("refuses a redirect at the public dispatch boundary and holds the reservation without a second destination request", async () => {
    const { t, user, postId, attemptId } = await queued(); await reviewedTestRoute(t);
    let redirectedRequests = 0;
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.redirect === "error") throw new TypeError("SPECULATIVE redirect rejected");
      redirectedRequests++;
      return successResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "uncertain", reason: "provider-transport-uncertain" });
    expect(redirectedRequests).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
    const saved = await user.query(api.visualWorkflow.get, { postId });
    expect(saved.versions).toHaveLength(0);
    expect(saved.month.reservedMicros).toBe(100000);
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "blocked" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retains a decoded output with wrong requested dimensions as uncertain without creating a selectable version or retry", async () => {
    const { t, user, postId, attemptId } = await queued();
    await reviewedTestRoute(t);
    const fetchMock = vi.fn().mockResolvedValue(await successResponse(32, 24)); vi.stubGlobal("fetch", fetchMock);
    const result = await user.action(api.visualProviderActions.executeImageAttempt, { attemptId });
    expect(result).toMatchObject({ status: "uncertain", versionId: null, reason: "provider-output-contract-mismatch" });
    const saved = await user.query(api.visualWorkflow.get, { postId });
    expect(saved.versions).toHaveLength(0);
    const raw = await t.run(ctx => ctx.db.get(attemptId));
    expect(raw).toMatchObject({ status: "uncertain", reservedMicros: 100000, providerAllowanceReserved: true });
    expect(raw!.pendingOutputStorageId).toBeDefined();
    const bytes = await t.run(async ctx => Array.from(new Uint8Array(await (await ctx.storage.get(raw!.pendingOutputStorageId!))!.arrayBuffer())));
    expect(await sharp(Buffer.from(bytes)).metadata()).toMatchObject({ width: 32, height: 24, format: "webp" });
    expect(await user.action(api.visualProviderActions.executeImageAttempt, { attemptId })).toMatchObject({ status: "blocked" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const allowance = await t.run(ctx => ctx.db.query("v2VisualProviderAllowances").first());
    expect(allowance).toMatchObject({ reservedMicros: 100000, spentMicros: 0 });
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
    expect(saved.versions[0]).toMatchObject({ _id: result.versionId, width: 1536, height: 1024, provider: "openai", model: "gpt-image-2", parentVersionId: null });
    expect(saved.attempts.find((a: { _id: string }) => a._id === attemptId)).toMatchObject({ status: "completed", estimatedActualMicros: 1110 });
    expect(saved.month.reservedMicros).toBe(0);
  });
});

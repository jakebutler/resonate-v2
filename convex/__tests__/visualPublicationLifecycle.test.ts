// @vitest-environment node
/// <reference types="vite/client" />
// Public-interface regressions derived from the independent frozen-candidate review.
// All bytes/quotes are synthetic offline doubles; transport and network are forbidden.
import { convexTest } from "convex-test";
import { createHash } from "node:crypto";
import { anyApi, getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import schema from "../schema";
import { articleSignature, stableInputSignature } from "../../lib/visualWorkflow";
import { approvalArticleSignature, resolvePublicationSchedule } from "../../lib/publicationReview";

const modules = import.meta.glob("../**/*.ts");
const api = anyApi;
const fixtureExportMetadata = { width: 1600, height: 900, bytes: 22, format: "webp", crop: "center" };
const article = { title: "An inspection finds the fault", content: "The raven inspects a machine and chooses to repair the broken gear." };

async function setup(brandId: "corvo" | "lower-db" = "corvo") {
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
  await user.mutation(api.publishing.seedMvpWorkspace, {});
  const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId, channelId: "corvo-blog", ...article, timezone: "UTC", scheduledDate: "2026-10-01" });
  await user.mutation(api.publishing.updateBlogMetadata, { postId, metadata: { blogSlug: "review-fictional-schedule",blogTags:["fictional"],blogExcerpt:"Fictional inspection workflow for independent review.",blogAuthor:"Fictional Reviewer",blogCategory:"Fictional Category" } });
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
    const storageId = await ctx.storage.store(new Blob(["owned fixture reference"], { type: "image/png" }));
    const id = await ctx.db.insert("v2VisualReferences", { brandId: "corvo", storageId, sha256: createHash("sha256").update("owned fixture reference").digest("hex"), byteLength: 23, contentType: "image/png", fileName: "fixture.png", kind: "upload", seedAssetKey: null, article: null, approvalProvenance: null, sourceDocumentSha256: null, sourceRecord: "offline fixture", historicalProvider: null, historicalModelId: null, uploadedBy: "author", createdAt: 1 });
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

async function finishImage(t: ReturnType<typeof convexTest>, attemptId: string, provider = "digitalocean", model = "gpt-image-2", revisedPrompt?: string) {
  await reserve(t, { attemptId, maximumMicros: 50, provider, model, quoteProvenance: "test trusted boundary" });
  const claimed = await t.mutation(api.visualWorkflow.claimAttempt, { attemptId });
  const asset = await t.run(async ctx => {
    const storageId = await ctx.storage.store(new Blob(["offline image fixture"], { type: "image/png" }));
    const metadata = await ctx.db.system.get(storageId);
    return { storageId, sha256: createHash("sha256").update("offline image fixture").digest("hex"), bytes: metadata!.size };
  });
  const versionId = await t.mutation(api.visualWorkflow.completeImage, { attemptId, claimKey: claimed.claimKey, ...asset, contentType: "image/png", width: 1600, height: 900, ...(revisedPrompt !== undefined ? { revisedPrompt } : {}), actualMicros: 35, usageKind: "reported", usageReceipt: "offline fixture" });
  return { versionId, asset };
}

async function prepareFixtureExport(t: ReturnType<typeof convexTest>, versionId: string, sourceSha256: string) {
  const bytes = await sharp({create:{width:1600,height:900,channels:3,background:"#224455"}}).webp().toBuffer();
  fixtureExportMetadata.bytes = bytes.byteLength;
  const storageId = await t.run(ctx => ctx.storage.store(new Blob([bytes], { type: "image/webp" })));
  const hash = createHash("sha256").update(bytes).digest("hex");
  await t.withIdentity({ subject: "author" }).mutation(api.visualWorkflow.recordHeroExport, { userId: "author", versionId, sourceSha256, exportStorageId: storageId, exportHash: hash, exportMetadata: fixtureExportMetadata });
  return { storageId, hash };
}

async function approvedEdited(withReference = false) {
  const result = await selectedPlan(withReference);
  await finishImage(result.t, await result.user.mutation(api.visualWorkflow.requestGeneration, { postId: result.postId, operationKey: "generate" }));
  const edited = await finishImage(result.t, await result.user.mutation(api.visualWorkflow.requestEdit, { postId: result.postId, operationKey: "edit", feedback: "Bring the gear into focus." }));
  const exported = await prepareFixtureExport(result.t, edited.versionId, edited.asset.sha256);
  await result.user.mutation(api.visualWorkflow.approveHero, { postId: result.postId, versionId: edited.versionId, alt: "A raven removes a broken gear.", expectedArticleSignature: articleSignature(article), expectedExportMetadataSignature: stableInputSignature(fixtureExportMetadata), expectedExportHash: exported.hash });
  const reflection = (await result.user.query(api.visualWorkflow.get, { postId: result.postId })).reflections[0];
  return { ...result, edited, exported, reflection };
}



beforeEach(() => { vi.stubEnv("BLOG_REPO_OWNER", "fictional-owner"); vi.stubEnv("BLOG_REPO_NAME", "fictional-reader"); vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "1"); vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("INDEPENDENT REVIEW forbids all network"); })); });
afterEach(() => {vi.unstubAllEnvs();vi.unstubAllGlobals();});

it("blocks a new approved visual publication after legacy rescheduling retained merged state", async () => {
 const {t,user,postId}=await approvedEdited();
 const review=await user.query(api.publishing.getApprovalReview,{postId});
 await user.mutation(api.publishing.setApproval,{postId,approvalState:"approved",expectedArticleSignature:review.articleSignature,expectedVisualSignature:review.visualSignature});
 await t.run(ctx=>ctx.db.patch(postId,{status:"published",blogPrStatus:"merged",prUrl:"https://github.com/fictional-owner/fictional-reader/pull/987654",branchName:"blog/fictional-retained-merged"}));
 await t.run(async ctx => { for (const state of await ctx.db.query("v2ProviderStates").collect()) await ctx.db.delete(state._id); });
 await user.mutation(api.publishing.reschedule,{postId,scheduledDate:"2026-10-02",scheduledTime:"12:30",timezone:"America/Los_Angeles"});
 const current=await user.query(api.publishing.getPostById,{postId});
 expect(current).toMatchObject({status:"scheduled",blogPrStatus:"merged",approvalState:"approved"});
 await expect(user.query(api.publishing.getPostForPublication,{postId})).rejects.toThrow(/lifecycle|publishing transition|merged/i);
});

it("requires a publishing transition before final visual approval on retained merged state", async () => {
 const {t,user,postId}=await approvedEdited();
 const review=await user.query(api.publishing.getApprovalReview,{postId});
 await t.run(ctx=>ctx.db.patch(postId,{status:"draft",blogPrStatus:"merged"}));
 await expect(user.mutation(api.publishing.setApproval,{postId,approvalState:"approved",expectedArticleSignature:review.articleSignature,expectedVisualSignature:review.visualSignature})).rejects.toThrow(/lifecycle|publishing transition|merged/i);
});

vi.mock("../../lib/github", async importOriginal => {
 const actual = await importOriginal();
 return {...actual, updatePrFrontmatter:vi.fn(async()=>({ok:true,filePath:"fictional.mdx"})),createBlogPostPR:vi.fn(async()=>({prUrl:"https://github.com/fictional-owner/fictional-reader/pull/987654",branchName:"blog/fictional-new-merged",sanitizedResponse:{repo:"fictional-owner/fictional-reader",prUrl:"https://github.com/fictional-owner/fictional-reader/pull/987654",branchName:"blog/fictional-new-merged",number:987654,state:"open",scheduleTrigger:"pr-body",scheduledDate:"2026-10-02",scheduledTime:"12:30",timezone:"America/Los_Angeles"}})) };
});

it("stops opted-on new visual PR transport after actual merged-post legacy reschedule",async()=>{
 const {t,user,postId,edited}=await approvedEdited();
 // Synthetic trust fields are an offline contract double, never qualification evidence.
 await t.run(async ctx=>{const version=await ctx.db.get(edited.versionId);const attempt=await ctx.db.get(version.attemptId);const quote=await ctx.db.get(attempt.quoteId);await ctx.db.patch(quote._id,{qualification:"live-receipt",provenance:"SYNTHETIC QUALIFIED DOUBLE"});await ctx.db.patch(attempt._id,{quoteProvenance:"SYNTHETIC QUALIFIED DOUBLE"});});
 const review=await user.query(api.publishing.getApprovalReview,{postId});
 await user.mutation(api.publishing.setApproval,{postId,approvalState:"approved",expectedArticleSignature:review.articleSignature,expectedVisualSignature:review.visualSignature});
 await t.run(ctx=>ctx.db.patch(postId,{status:"published",blogPrStatus:"merged",prUrl:"https://github.com/fictional-owner/fictional-reader/pull/123456",branchName:"blog/fictional-retained-merged"}));
 await t.run(async ctx => { for (const state of await ctx.db.query("v2ProviderStates").collect()) await ctx.db.delete(state._id); });
 await user.mutation(api.publishing.reschedule,{postId,scheduledDate:"2026-10-02",scheduledTime:"12:30",timezone:"America/Los_Angeles"});
 const github=await import("../../lib/github");vi.mocked(github.createBlogPostPR).mockClear();
 const result=await user.action(api.visualPublication.createPr,{postId}).catch(error=>error);
 expect(github.createBlogPostPR).not.toHaveBeenCalled();
 expect(result.message).toMatch(/lifecycle|publishing transition|merged/i);
 expect((await user.query(api.publishing.getPostById,{postId})).blogPrStatus).toBe("merged");
 expect(await t.run(ctx => ctx.db.query("v2PublishAttempts").collect())).toEqual([]);
});

it.each(["submitted", "merged"] as const)("preserves terminal %s state across snapshot, final review and trusted recording denials", async terminal => {
  const { t, user, postId } = await approvedEdited();
  const review = await user.query(api.publishing.getApprovalReview, { postId });
  await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature: review.articleSignature, expectedVisualSignature: review.visualSignature });
  const sent = await user.query(api.publishing.getPostForPublication, { postId });
  await t.run(ctx => ctx.db.patch(postId, terminal === "submitted" ? { status: "submitted" } : { status: "draft", blogPrStatus: "merged", prUrl: "https://github.com/fictional-owner/fictional-reader/pull/123456" }));
  const envelope = () => t.run(async ctx => ({ post: await ctx.db.get(postId), intent: await ctx.db.get(sent.intent._id), attempts: await ctx.db.query("v2PublishAttempts").collect() }));
  const before = await envelope();
  await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toThrow("separate publishing transition");
  expect((await user.query(api.publishing.getApprovalReview, { postId })).blockedReason).toContain("separate publishing transition");
  await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature: review.articleSignature, expectedVisualSignature: review.visualSignature })).rejects.toThrow("separate publishing transition");
  await expect(user.mutation(api.publishing.recordVisualPublicationPr, {
    postId, expectedArticleSignature: approvalArticleSignature(sent.post), expectedVisualSignature: sent.reviewSignature, expectedIntentId: sent.intent._id, expectedSchedule: resolvePublicationSchedule(sent.post, sent.intent, "2026-10-01"),
    result: { prUrl: "https://github.com/fictional-owner/fictional-reader/pull/987654", branchName: "blog/fictional-terminal", prNumber: 987654, prStatus: "open", sanitizedResponse: {} },
  })).rejects.toThrow("separate publishing transition");
  expect(await envelope()).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
});

it("retains the new remote PR receipt without replacing a merged marker that arrived during transport", async () => {
  const { t, user, postId, edited } = await approvedEdited();
  // Synthetic fields exercise transport integration; no provider or image is qualified by this test.
  await t.run(async ctx => {
    const version = await ctx.db.get(edited.versionId);
    const attempt = await ctx.db.get(version.attemptId);
    await ctx.db.patch(attempt.quoteId, { qualification: "live-receipt", provenance: "SYNTHETIC QUALIFIED DOUBLE" });
    await ctx.db.patch(attempt._id, { quoteProvenance: "SYNTHETIC QUALIFIED DOUBLE" });
  });
  const review = await user.query(api.publishing.getApprovalReview, { postId });
  await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature: review.articleSignature, expectedVisualSignature: review.visualSignature });
  const github = await import("../../lib/github");
  vi.mocked(github.createBlogPostPR).mockClear();
  const created = { prUrl: "https://github.com/fictional-owner/fictional-reader/pull/987654", branchName: "blog/fictional-inflight", sanitizedResponse: { repo: "fictional-owner/fictional-reader", prUrl: "https://github.com/fictional-owner/fictional-reader/pull/987654", branchName: "blog/fictional-inflight", number: 987654, state: "open", scheduleTrigger: "pr-body" as const, scheduledDate: "2026-10-01", timezone: "UTC" } };
  vi.mocked(github.createBlogPostPR).mockImplementationOnce(async () => {
    await t.run(ctx => ctx.db.patch(postId, { status: "scheduled", blogPrStatus: "merged", prUrl: "https://github.com/fictional-owner/fictional-reader/pull/123456", branchName: "blog/fictional-retained" }));
    return created;
  });
  await expect(user.action(api.visualPublication.createPr, { postId })).rejects.toMatchObject({ data: {
    code: "VISUAL_PR_RECORDING_REQUIRES_REVIEW", prUrl: created.prUrl, branchName: created.branchName, sanitizedResponse: created.sanitizedResponse,
  } });
  expect(github.createBlogPostPR).toHaveBeenCalledTimes(1);
  expect(await user.query(api.publishing.getPostById, { postId })).toMatchObject({ blogPrStatus: "merged", prUrl: "https://github.com/fictional-owner/fictional-reader/pull/123456", branchName: "blog/fictional-retained" });
  expect(await t.run(ctx => ctx.db.query("v2PublishAttempts").collect())).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["open", "draft", "closed"] as const)("keeps recorded %s PR identity authoritative after reschedule and metadata edits", async prStatus => {
  const { t, user, postId, edited } = await approvedEdited();
  await t.run(async ctx => {
    const version = await ctx.db.get(edited.versionId);
    const attempt = await ctx.db.get(version.attemptId);
    await ctx.db.patch(attempt.quoteId, { qualification: "live-receipt", provenance: "SYNTHETIC QUALIFIED DOUBLE" });
    await ctx.db.patch(attempt._id, { quoteProvenance: "SYNTHETIC QUALIFIED DOUBLE" });
  });
  const review = await user.query(api.publishing.getApprovalReview, { postId });
  await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature: review.articleSignature, expectedVisualSignature: review.visualSignature });
  const sent = await user.query(api.publishing.getPostForPublication, { postId });
  const prUrl = "https://github.com/fictional-owner/fictional-reader/pull/123456";
  await user.mutation(api.publishing.claimBlogExport, { postId, fingerprint: sent.post.contentFingerprint, schedule: JSON.stringify([sent.post.scheduledDate, sent.post.scheduledTime, sent.post.timezone]), key: "SPECULATIVE-recorded-pr-export-claim", expectedVisualSignature: sent.reviewSignature, expectedIntentId: sent.intent._id, expectedSchedule: resolvePublicationSchedule(sent.post, sent.intent, "2026-10-01") });
  await user.mutation(api.publishing.recordVisualPublicationPr, {
    postId, expectedArticleSignature: approvalArticleSignature(sent.post), expectedVisualSignature: sent.reviewSignature, expectedIntentId: sent.intent._id, expectedSchedule: resolvePublicationSchedule(sent.post, sent.intent, "2026-10-01"),
    result: { artifact: { repository: "fictional-owner/fictional-reader", branchName: "blog/fictional-recorded", prNumber: 123456, mdxPath: "apps/blog/blog/2026-10-01-review-fictional-schedule.mdx", canonicalUrl: "https://fictional-reader.invalid/blog/review-fictional-schedule", editorialFingerprint: sent.post.contentFingerprint }, exportClaimKey: "SPECULATIVE-recorded-pr-export-claim", prUrl, branchName: "blog/fictional-recorded", prNumber: 123456, prStatus: "open", sanitizedResponse: {} },
  });
  await user.mutation(api.publishing.recordVisualPublicationPrStatus, { postId, expectedPrUrl: prUrl, prStatus, prNumber: 123456 });
  await t.run(async ctx => { for (const state of await ctx.db.query("v2ProviderStates").collect()) await ctx.db.delete(state._id); });
  await user.mutation(api.publishing.reschedule, { postId, scheduledDate: "2026-10-02", scheduledTime: "12:30", timezone: "America/Los_Angeles" });
  expect(await user.query(api.publishing.getPostById, { postId })).toMatchObject({ status: "scheduled", blogPrStatus: prStatus, prUrl, branchName: "blog/fictional-recorded", approvalState: "approved" });
  const envelope = () => t.run(async ctx => ({ post: await ctx.db.get(postId), intent: await ctx.db.get(sent.intent._id), attempts: await ctx.db.query("v2PublishAttempts").collect(), visualAttempts: await ctx.db.query("v2VisualAttempts").collect(), figures: await ctx.db.query("v2FigureCandidates").collect(), sources: await ctx.db.query("v2FigureSources").collect() }));
  const before = await envelope();
  const github = await import("../../lib/github");
  vi.mocked(github.createBlogPostPR).mockClear();
  await user.action(api.visualPublication.createPr, { postId }).catch(() => undefined);
  expect(github.createBlogPostPR).not.toHaveBeenCalled();
  for (const call of [
    () => user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "forbidden-recorded-pr-plan" }),
    () => user.mutation(api.visualFigures.planFigures, { postId }),
    () => user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: "a".repeat(64), expectedSourceId: null }),
  ]) await expect(call()).rejects.toThrow(/[Ss]eparate publishing transition/);
  expect(await envelope()).toEqual(before);
  await user.mutation(api.publishing.updateBlogMetadata, { postId, metadata: { blogSlug: "fictional-replacement-slug" } });
  const changed = await envelope();
  expect(changed.post).toMatchObject({ status: "draft", approvalState: "unapproved", blogPrStatus: prStatus, prUrl });
  await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toThrow("separate publishing transition");
  expect((await user.query(api.publishing.getApprovalReview, { postId })).blockedReason).toContain("separate publishing transition");
  await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature: review.articleSignature, expectedVisualSignature: review.visualSignature })).rejects.toThrow("separate publishing transition");
  expect(await envelope()).toEqual(changed);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["prUrl", "branchName", "blogPrStatus"] as const)("keeps historical partial %s identity from reopening publication", async field => {
  const { t, user, postId } = await approvedEdited();
  const review = await user.query(api.publishing.getApprovalReview, { postId });
  await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature: review.articleSignature, expectedVisualSignature: review.visualSignature });
  const values = { prUrl: "https://github.com/fictional-owner/fictional-reader/pull/123456", branchName: "blog/fictional-historical", blogPrStatus: "open" };
  await t.run(ctx => ctx.db.patch(postId, { [field]: values[field] }));
  const before = await user.query(api.publishing.getPostById, { postId });
  await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toThrow("separate publishing transition");
  await expect(user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "forbidden-historical-plan" })).rejects.toThrow("Separate publishing transition");
  await expect(user.mutation(api.visualFigures.planFigures, { postId })).rejects.toThrow("Separate publishing transition");
  await expect(user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: "a".repeat(64), expectedSourceId: null })).rejects.toThrow("Separate publishing transition");
  expect(await user.query(api.publishing.getPostById, { postId })).toEqual(before);
  expect(fetch).not.toHaveBeenCalled();
});


it("atomically pins the exact visual snapshot before export and freezes authoring while retaining readable reconciliation", async () => {
  const { user, postId } = await approvedEdited();
  const review = await user.query(api.publishing.getApprovalReview, { postId });
  await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature: review.articleSignature, expectedVisualSignature: review.visualSignature });
  const sent = await user.query(api.publishing.getPostForPublication, { postId });
  const base = { postId, fingerprint: sent.post.contentFingerprint, schedule: JSON.stringify([sent.post.scheduledDate, sent.post.scheduledTime, sent.post.timezone]), key: "SPECULATIVE-exact-claim" };
  await expect(user.mutation(api.publishing.claimBlogExport, base)).rejects.toThrow("Reviewed visuals changed");
  const pins = { expectedVisualSignature: sent.reviewSignature, expectedIntentId: sent.intent._id, expectedSchedule: resolvePublicationSchedule(sent.post, sent.intent, "2026-10-01") };
  await expect(user.mutation(api.publishing.claimBlogExport, { ...base, ...pins, expectedVisualSignature: "stale visual snapshot" })).rejects.toThrow("Reviewed visuals changed");
  await expect(user.mutation(api.publishing.claimBlogExport, { ...base, ...pins, expectedSchedule: { ...pins.expectedSchedule, scheduledDate: "2026-10-02" } })).rejects.toThrow("intent or schedule changed");
  expect((await user.query(api.publishing.getPostById, { postId })).blogExportClaimKey).toBeUndefined();
  expect(await user.mutation(api.publishing.claimBlogExport, { ...base, ...pins })).toBe(base.key);
  expect(await user.mutation(api.publishing.claimBlogExport, { ...base, ...pins })).toBe(base.key);
  expect((await user.query(api.publishing.getPostForPublication, { postId })).reviewSignature).toBe(sent.reviewSignature);
  expect((await user.query(api.publishing.getApprovalReview, { postId })).blockedReason).toContain("export is pending");
  await expect(user.mutation(api.visualWorkflow.requestGeneration, { postId, operationKey: "claim-authoring-denied" })).rejects.toThrow("Separate publishing transition");
  await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature: review.articleSignature, expectedVisualSignature: review.visualSignature })).rejects.toThrow("export is pending");
});

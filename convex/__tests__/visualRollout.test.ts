// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");
const api = anyApi;
const owner = "rollout-owner";
const guidance = { artDirection: "Narrative raven scenes", palette: [{ name: "Teal", color: "#123456" }], mascotGuidance: "One raven", compositionGuidance: "Visible action", textPolicy: "No text", heroChartPolicy: "No hero charts" };
const article = "## Inspection\n\nThe raven inspects a machine and chooses to repair the broken gear.\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |";

async function setup(subject = owner) {
  const t = convexTest(schema, modules);
  await t.run(ctx => ctx.db.insert("v2BrandMemberships", { userId: subject, brandId: "corvo", role: "owner", createdAt: 1, updatedAt: 1 }));
  const user = t.withIdentity({ subject });
  const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "LOCAL FIXTURE — Rollout boundary", content: article });
  const profile = await user.mutation(api.visualProfiles.saveRevision, { brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null });
  await t.run(async ctx => {
    await ctx.db.patch(postId, { approvalState: "approved" });
    const intent = await ctx.db.query("v2PublishingIntents").withIndex("by_post", q => q.eq("postId", postId)).first();
    await ctx.db.patch(intent!._id, { approvalState: "approved" });
  });
  return { t, user, postId, profile };
}

async function reservedAttempt() {
  const result = await setup();
  await result.user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 1000 });
  const attemptId = await result.user.mutation(api.visualWorkflow.requestPlan, { postId: result.postId, operationKey: "held-plan" });
  const quoteId = await result.t.run(async ctx => {
    const attempt = (await ctx.db.get(ctx.db.normalizeId("v2VisualAttempts", attemptId)!))!;
    return ctx.db.insert("v2VisualDispatchQuotes", { attemptId: attempt._id, inputSignature: attempt.inputSignature, stage: attempt.stage, provider: "offline-test", model: "fixture", maximumMicros: 80, qualification: "offline-contract", boundVerified: true, capabilityReceiptIds: [], provenance: "IN-PROCESS OFFLINE CONTRACT — no live qualification", createdAt: 1 });
  });
  expect(await result.t.mutation(api.visualWorkflow.reserveAttempt, { attemptId, quoteId })).toEqual({ admitted: true, reason: null });
  return { ...result, attemptId, quoteId };
}

function localFixtureEnv() {
  vi.stubEnv("RESONATE_VISUAL_FIXTURE_MODE", "local-offline");
  vi.stubEnv("RESONATE_VISUAL_FIXTURE_DEPLOYMENT", "anonymous-agent");
  vi.stubEnv("RESONATE_VISUAL_FIXTURE_CONVEX_URL", "http://127.0.0.1:3210");
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211");
}

afterEach(() => vi.unstubAllEnvs());

describe("server visual rollout admission", () => {
  it.each([undefined, "0"])("pauses planning without state, attempts or approval changes when flag is %s", async flag => {
    const { t, user, postId } = await setup();
    const before = await t.run(async ctx => ({ post: await ctx.db.get(postId), intents: await ctx.db.query("v2PublishingIntents").withIndex("by_post", q => q.eq("postId", postId)).take(4) }));
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", flag);
    await expect(user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "paused-plan" })).rejects.toThrow("Editorial visual admissions are paused");
    expect(await user.query(api.visualWorkflow.get, { postId })).toMatchObject({ state: null, attempts: [], plans: [], versions: [] });
    expect(await t.run(async ctx => ({ post: await ctx.db.get(postId), intents: await ctx.db.query("v2PublishingIntents").withIndex("by_post", q => q.eq("postId", postId)).take(4) }))).toEqual(before);
  });

  it("pauses figure attachment and planning while retaining evidence and workspace inspection", async () => {
    const { user, postId } = await setup();
    const evidence = { postId, key: "rollout-evidence", expectedSourceId: null, name: "evidence.md", format: "markdown", purpose: "claim-trace", content: article };
    const saved = await user.mutation(api.visualFigures.attachEvidence, evidence);
    await user.mutation(api.visualFigures.planFigures, { postId });
    const before = await user.query(api.visualFigures.getWorkspace, { postId });
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    await expect(user.mutation(api.visualFigures.attachEvidence, { ...evidence, expectedSourceId: saved.sourceId, content: article + "\n\nA new stored passage." })).rejects.toThrow("Editorial visual admissions are paused");
    await expect(user.mutation(api.visualFigures.planFigures, { postId })).rejects.toThrow("Editorial visual admissions are paused");
    expect(await user.query(api.visualFigures.getSource, { sourceId: saved.sourceId })).toMatchObject({ content: article });
    expect(await user.query(api.visualFigures.getWorkspace, { postId })).toEqual(before);
  });

  it("pauses profile revision and exception writes while preserving immutable profile reads", async () => {
    const { user, postId, profile } = await setup();
    const before = await user.query(api.visualProfiles.getProfile, { brandId: "corvo" });
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    await expect(user.mutation(api.visualProfiles.saveRevision, { brandId: "corvo", expectedRevisionId: profile.profileRevisionId, guidance: { ...guidance, artDirection: "Changed direction" }, referenceBindings: [], defaultRoute: null })).rejects.toThrow("Editorial visual admissions are paused");
    await expect(user.mutation(api.visualProfiles.setPostException, { postId, expectedExceptionId: null, guidance: "Explicit changed exception", expectedPostContext: { title: "LOCAL FIXTURE — Rollout boundary", channelId: "corvo-blog" } })).rejects.toThrow("Editorial visual admissions are paused");
    expect(await user.query(api.visualProfiles.getProfile, { brandId: "corvo" })).toEqual(before);
    expect(await user.query(api.visualProfiles.resolveForPost, { postId })).toMatchObject({ profileRevisionId: profile.profileRevisionId, lessonIds: [], postExceptionId: null });
    expect(await user.query(api.visualProfiles.resolveFromPin, { postId, pin: { profileRevisionId: profile.profileRevisionId, referenceIds: [], lessonIds: [], postExceptionId: null } })).toMatchObject({ profileRevisionId: profile.profileRevisionId });
  });

  it("pauses new reference bytes before storage and preserves owned immutable reference inspection", async () => {
    const { t, user } = await setup();
    const bytes = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64")).buffer;
    const uploaded = await user.action(api.visualProfiles.uploadReference, { brandId: "corvo", fileName: "fixture.png", contentType: "image/png", bytes });
    const before = await user.query(api.visualProfiles.getReference, uploaded);
    const stored = await t.run(ctx => ctx.db.system.query("_storage").take(4));
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    await expect(user.action(api.visualProfiles.uploadReference, { brandId: "corvo", fileName: "second-fixture.png", contentType: "image/png", bytes })).rejects.toThrow("Editorial visual admissions are paused");
    expect(await user.query(api.visualProfiles.getReference, uploaded)).toEqual(before);
    expect(await t.run(ctx => ctx.db.system.query("_storage").take(4))).toEqual(stored);
    expect(await t.run(ctx => ctx.db.query("v2VisualReferences").take(4))).toHaveLength(1);
  });

  it("authenticates ownership and writer role before exposing the rollout admission decision", async () => {
    const { t, user, postId, profile } = await setup();
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    await expect(t.withIdentity({ subject: "foreign-rollout-actor" }).mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "foreign" })).rejects.toThrow("Post not found");
    await expect(t.withIdentity({ subject: "foreign-rollout-actor" }).query(api.visualProfiles.getProfile, { brandId: "corvo" })).rejects.toThrow(/access denied/);
    await t.run(async ctx => {
      await ctx.db.insert("v2BrandMemberships", { userId: "rollout-viewer", brandId: "corvo", role: "viewer", createdAt: 1, updatedAt: 1 });
      await ctx.db.patch(postId, { userId: "rollout-viewer" });
    });
    const viewer = t.withIdentity({ subject: "rollout-viewer" });
    await expect(viewer.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "viewer" })).rejects.toThrow("Brand edit access denied");
    await expect(viewer.mutation(api.visualProfiles.saveRevision, { brandId: "corvo", expectedRevisionId: profile.profileRevisionId, guidance, referenceBindings: [], defaultRoute: null })).rejects.toThrow("Visual profile write access denied");
    expect((await viewer.query(api.visualWorkflow.get, { postId })).attempts).toEqual([]);
    expect(await user.query(api.visualProfiles.getProfile, { brandId: "corvo" })).toMatchObject({ revision: { _id: profile.profileRevisionId } });
  });

  it("pauses linked import while retaining exact authorized linked snapshot inspection", async () => {
    const { t, user, postId } = await setup();
    const brief = await user.mutation(api.research.saveResearchBrief, { brandId: "corvo", topic: "Fictional workflow", audience: "Fixture readers", thesis: "Retain exact stored flow", depth: "standard", riskLevel: "low", targetOutputs: ["blog"], provider: "offline-fixture", sources: [{ id: "fixture-report", title: "Fictional report", url: "https://fictional.invalid/report", evidenceLabel: "primary-source", status: "accepted", raw: { excerpt: article } }] });
    await t.run(ctx => ctx.db.patch(postId, { sourceResearchBriefId: brief.researchBriefId }));
    const before = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    expect(before).not.toBeNull();
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    await expect(user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: before.snapshotHash, expectedSourceId: null })).rejects.toThrow("Editorial visual admissions are paused");
    expect(await user.query(api.visualLinkedEvidence.getSnapshot, { postId })).toEqual(before);
    expect(await user.query(api.visualLinkedEvidence.getCurrentImport, { postId })).toBeNull();
  });

  it.each(["reserve", "claim"] as const)("pauses %s without cancelling queued work or releasing held reservations", async operation => {
    const { t, user, postId, attemptId, quoteId } = await reservedAttempt();
    const before = await user.query(api.visualWorkflow.get, { postId });
    expect(before.month).toMatchObject({ reservedMicros: 80, spentMicros: 0 });
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    const action = operation === "reserve" ? () => t.mutation(api.visualWorkflow.reserveAttempt, { attemptId, quoteId }) : () => t.mutation(api.visualWorkflow.claimAttempt, { attemptId });
    await expect(action()).rejects.toThrow("Editorial visual admissions are paused");
    expect(await user.query(api.visualWorkflow.get, { postId })).toEqual(before);
    expect(await user.query(api.visualWorkflow.getAttemptRecovery, { attemptId })).toMatchObject({ status: "queued", reservedMicros: 80 });
  });

  it("preserves explicit queued cancellation while paused without spending or dispatching", async () => {
    const { user, postId, attemptId } = await reservedAttempt();
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    await user.mutation(api.visualWorkflow.cancelQueuedAttempt, { attemptId });
    const state = await user.query(api.visualWorkflow.get, { postId });
    expect(state.month).toMatchObject({ reservedMicros: 0, spentMicros: 0 });
    expect(state.attempts[0]).toMatchObject({ status: "failed", reservedMicros: 80, error: "Cancelled before dispatch" });
    expect(state.attempts[0].dispatchedAt).toBeUndefined();
  });

  it("preserves expired running recovery, uncertain reservation and late usage reconciliation while paused", async () => {
    const { t, user, postId, attemptId } = await reservedAttempt();
    const claim = await t.mutation(api.visualWorkflow.claimAttempt, { attemptId });
    expect(claim).not.toBeNull();
    await t.run(ctx => ctx.db.patch(ctx.db.normalizeId("v2VisualAttempts", attemptId)!, { dispatchedAt: Date.now() - 16 * 60_000 }));
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    const running = await user.query(api.visualWorkflow.getAttemptRecovery, { attemptId });
    await user.mutation(api.visualWorkflow.recoverRunning, { attemptId, expectedUpdatedAt: running.updatedAt, reason: "Offline owner inspected the expired fixture lease" });
    const uncertain = await user.query(api.visualWorkflow.getAttemptRecovery, { attemptId });
    expect(uncertain).toMatchObject({ status: "uncertain", reservedMicros: 80 });
    expect((await user.query(api.visualWorkflow.get, { postId })).month).toMatchObject({ reservedMicros: 80, spentMicros: 0 });
    await expect(user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "no-new-work-after-recovery" })).rejects.toThrow("Editorial visual admissions are paused");
    await user.mutation(api.visualWorkflow.reconcileUncertain, { attemptId, expectedUpdatedAt: uncertain.updatedAt, reason: "Offline owner attestation", actualMicros: 20, usageKind: "estimated", usageReceipt: "Offline owner estimate" });
    const completion = { attemptId, claimKey: claim.claimKey, scenes: [], actualMicros: 25, usageKind: "reported", usageReceipt: "Offline late trusted receipt" };
    expect(await t.mutation(api.visualWorkflow.completePlan, completion)).toBeNull();
    expect(await t.mutation(api.visualWorkflow.completePlan, completion)).toBeNull();
    const final = await user.query(api.visualWorkflow.get, { postId });
    expect(final.month).toMatchObject({ reservedMicros: 0, spentMicros: 25 });
    expect(final.budget).toMatchObject({ unacknowledgedLateChargeMicros: 5 });
    expect(final.attempts[0]).toMatchObject({ status: "failed", lateActualMicros: 25, lateUsageDeltaMicros: 5 });
    expect(final.plans).toEqual([]);
    expect(final.versions).toEqual([]);
    expect(final.state.selectedPlanId).toBeUndefined();
  });

  it("admits planning with explicit server opt-in", async () => {
    const { user, postId } = await setup();
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "1");
    const attemptId = await user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "enabled-plan" });
    const state = await user.query(api.visualWorkflow.get, { postId });
    expect(state.state).toMatchObject({ postId });
    expect(state.attempts).toHaveLength(1);
    expect(state.attempts[0]).toMatchObject({ _id: attemptId, status: "queued", pauseReason: "planning-route-unqualified" });
    expect((await user.query(api.publishing.getPostById, { postId })).approvalState).toBe("unapproved");
  });

  it("permits only the exact absent-flag local anonymous zero-cost fixture boundary", async () => {
    const { t, user, postId } = await setup("visual-rehearsal-only");
    await user.mutation(api.visualWorkflow.setMonthlyBudget, { brandId: "corvo", limitMicros: 0 });
    localFixtureEnv();
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", undefined);
    const attemptId = await user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "exact-local-fixture" });
    const quoteId = await t.mutation(api.visualWorkflow.registerLocalFixtureQuote, { attemptId, provider: "offline-fixture", model: "offline-fixture", maximumMicros: 0 });
    expect(await t.mutation(api.visualWorkflow.reserveAttempt, { attemptId, quoteId })).toEqual({ admitted: true, reason: null });
    const quote = await t.run(ctx => ctx.db.get(ctx.db.normalizeId("v2VisualDispatchQuotes", quoteId)!));
    expect(quote).toMatchObject({ qualification: "offline-fixture", maximumMicros: 0, capabilityReceiptIds: [] });
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    const before = await user.query(api.visualWorkflow.get, { postId });
    await expect(user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "explicit-local-pause" })).rejects.toThrow("Editorial visual admissions are paused");
    await expect(t.mutation(api.visualWorkflow.registerLocalFixtureQuote, { attemptId, provider: "offline-fixture", model: "offline-fixture", maximumMicros: 0 })).rejects.toThrow("Editorial visual admissions are paused");
    await expect(t.mutation(api.visualWorkflow.claimAttempt, { attemptId })).rejects.toThrow("Editorial visual admissions are paused");
    expect(await user.query(api.visualWorkflow.get, { postId })).toEqual(before);
    expect(await t.run(ctx => ctx.db.query("v2VisualDispatchQuotes").take(4))).toHaveLength(1);
  });

  it.each([
    ["RESONATE_VISUAL_FIXTURE_MODE", "live"],
    ["RESONATE_VISUAL_FIXTURE_DEPLOYMENT", "production"],
    ["RESONATE_VISUAL_FIXTURE_CONVEX_URL", "https://fictional.convex.cloud"],
    ["CONVEX_CLOUD_URL", "https://fictional.convex.cloud"],
    ["CONVEX_SITE_URL", "https://fictional.convex.site"],
  ])("rejects absent-flag fixture admission when %s differs from the exact local boundary", async (key, value) => {
    const { user, postId } = await setup("visual-rehearsal-only");
    localFixtureEnv();
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", undefined);
    vi.stubEnv(key, value);
    await expect(user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "invalid-fixture-boundary" })).rejects.toThrow("Editorial visual admissions are paused");
    expect((await user.query(api.visualWorkflow.get, { postId })).attempts).toEqual([]);
  });

  it("rejects absent-flag fixtures for ordinary actors and unsupported flag values", async () => {
    const { user, postId } = await setup();
    localFixtureEnv();
    for (const flag of [undefined, "true", "", "2"]) {
      vi.stubEnv("EDITORIAL_VISUALS_ENABLED", flag);
      await expect(user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "no-actor-bypass" })).rejects.toThrow("Editorial visual admissions are paused");
    }
  });

  it.each(["hero", "linked"] as const)("preserves the merged PR freeze for %s writes after legacy rescheduling", async feature => {
    const { t, user, postId } = await setup();
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "1");
    const brief = await user.mutation(api.research.saveResearchBrief, { brandId: "corvo", topic: "Fictional merged workflow", audience: "Fixture readers", thesis: "Retain stored flow", depth: "standard", riskLevel: "low", targetOutputs: ["blog"], provider: "offline-fixture", sources: [{ id: "fixture-report", title: "Fictional report", url: "https://fictional.invalid/report", evidenceLabel: "primary-source", status: "accepted", raw: { excerpt: article } }] });
    await t.run(async ctx => {
      await ctx.db.patch(postId, { sourceResearchBriefId: brief.researchBriefId, status: "published", blogPrStatus: "merged", prUrl: "https://github.com/fictional/fixture/pull/1", branchName: "blog/fictional-merged" });
      // A legacy fixture retains its PR markers without an outgoing provider transport.
      // Rescheduling must exercise stored lifecycle semantics without scheduling GitHub I/O.
      const intent = (await ctx.db.query("v2PublishingIntents").withIndex("by_post", q => q.eq("postId", postId)).first())!;
      const transport = await ctx.db.query("v2ProviderStates").withIndex("by_intent", q => q.eq("intentId", intent._id)).first();
      if (transport) await ctx.db.delete(transport._id);
    });
    await user.mutation(api.publishing.reschedule, { postId, scheduledDate: "2026-10-02", scheduledTime: "12:30", timezone: "America/Los_Angeles" });
    expect(await t.run(ctx => ctx.db.system.query("_scheduled_functions").take(4))).toEqual([]);
    const before = await user.query(api.publishing.getPostById, { postId });
    expect(before).toMatchObject({ status: "scheduled", blogPrStatus: "merged", approvalState: "approved" });
    const snapshot = await user.query(api.visualLinkedEvidence.getSnapshot, { postId });
    const action = feature === "hero" ? () => user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "merged-reschedule-plan" }) : () => user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: null });
    await expect(action()).rejects.toThrow("Separate publishing transition required");
    expect(await user.query(api.publishing.getPostById, { postId })).toEqual(before);
    expect(await user.query(api.visualWorkflow.get, { postId })).toMatchObject({ state: null, attempts: [] });
    expect(await user.query(api.visualLinkedEvidence.getSnapshot, { postId })).toEqual(snapshot);
    expect(await user.query(api.visualLinkedEvidence.getCurrentImport, { postId })).toBeNull();
  });
});

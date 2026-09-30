import { v } from "convex/values";
import { mutation, query, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id, Doc } from "./_generated/dataModel";
import { brandIdValidator, requireBrandAccess, requireUserId, audit } from "./campaignAccess";
import { resolveVisualProfileForPost, resolveVisualProfileFromPin } from "./visualProfiles";
import { hashVisualBytes } from "../lib/visualProfile";
import { articleSignature, stableInputSignature, validateScenePlan, composeScenePrompt, relevanceSignature, serializedUtf8Bytes, assertSerializedBound, canIssueLocalFixtureQuote, isOfflineContractRuntime } from "../lib/visualWorkflow";
import { attemptInputValidator, sceneValidator, exportMetadataValidator, publicationVisualsValidator, visualVersionDocValidator, visualAttemptDocValidator, visualPlanDocValidator, visualStateDocValidator, visualReflectionDocValidator, visualBudgetDocValidator, visualBudgetMonthDocValidator } from "./visualWorkflowTables";

type Input = Doc<"v2VisualAttempts">["input"];
type Stage = Doc<"v2VisualAttempts">["stage"];

function profileInstructions(revision: Doc<"v2VisualProfileRevisions">, exception: Doc<"v2VisualPostExceptions"> | null, lessons: Doc<"v2VisualLessons">[]) {
  return `Brand visual guidance: ${stableInputSignature({ artDirection: revision.artDirection, palette: revision.palette, mascotGuidance: revision.mascotGuidance, compositionGuidance: revision.compositionGuidance, textPolicy: revision.textPolicy, heroChartPolicy: revision.heroChartPolicy })}${exception ? `\nExplicit post exception: ${exception.guidance}` : ""}\nApplicable prompting lessons:\n${lessons.map(lesson => stableInputSignature({ key: lesson.key, revision: lesson.revision, title: lesson.title, instruction: lesson.instruction, role: lesson.role, sceneTags: lesson.sceneTags, modelScope: lesson.modelScope })).join("\n")}`;
}

function sceneTags(scene: Input["scene"], referenceCount: number, exception: boolean) {
  const tags = ["wide_hero", "thumbnail_crop", "composition"];
  if (referenceCount > 1) tags.push("multiple_reference_images");
  if (exception) tags.push("post_exception");
  const text = `${scene?.subject ?? ""} ${scene?.action ?? ""} ${scene?.reveal ?? ""}`;
  if (/raven|person|human|character|navigator|builder/i.test(text)) tags.push("character_scene", "character_object_interaction");
  if (/gear|machine|mechanism|engine|lever/i.test(text)) tags.push("mechanism_scene", "process_metaphor");
  if (/hidden|occluded|conceal/i.test(text)) tags.push("hidden_reveal", "occlusion_risk");
  if (/test|inspect|evaluate|check/i.test(text)) tags.push("evaluation_scene");
  return tags;
}

async function instructionsForPins(ctx: MutationCtx, userId: string, postId: Id<"v2Posts">, input: Input) {
  const resolved = await resolveVisualProfileFromPin(ctx, userId, postId, input.pins);
  return profileInstructions(resolved.revision, resolved.postException, resolved.lessons);
}

async function validatePinnedInput(ctx: QueryCtx | MutationCtx, attempt: Doc<"v2VisualAttempts">) {
  if (stableInputSignature(attempt.input) !== attempt.inputSignature || articleSignature(attempt.input.article) !== attempt.input.article.signature) throw new Error("Stored attempt inputs changed");
  const resolved = await resolveVisualProfileFromPin(ctx, attempt.userId, attempt.postId, attempt.input.pins);
  if (attempt.input.references.length !== resolved.references.length) throw new Error("Pinned visual reference changed");
  for (const [i, expected] of attempt.input.references.entries()) {
    const actual = resolved.references[i];
    if (actual.referenceId !== expected.referenceId || actual.storageId !== expected.storageId || actual.role !== expected.role || actual.sha256 !== expected.sha256) throw new Error("Pinned visual reference changed");
    const storage = await ctx.db.system.get(expected.storageId);
    if (!storage || !storageHashMatches(storage.sha256, expected.sha256) || storage.size !== actual.reference.byteLength || (storage.contentType !== undefined && storage.contentType !== actual.reference.contentType)) throw new Error("Pinned visual reference bytes changed");
  }
  if (attempt.input.parentVersionId) {
    const parent = await ctx.db.get(attempt.input.parentVersionId);
    if (!parent || parent.postId !== attempt.postId || parent.brandId !== attempt.brandId || parent.userId !== attempt.userId) throw new Error("Pinned image parent is unavailable");
    const reflection = attempt.stage === "reflection";
    const storageId = reflection ? parent.exportStorageId : parent.storageId;
    const hash = reflection ? parent.exportHash : parent.sha256;
    const bytes = reflection ? parent.exportMetadata?.bytes : parent.bytes;
    if (!storageId || !hash || attempt.input.parentStorageId !== storageId) throw new Error("Pinned image parent bytes changed");
    const storage = await ctx.db.system.get(storageId);
    if (!storage || !storageHashMatches(storage.sha256, hash) || storage.size !== bytes) throw new Error("Pinned image parent bytes changed");
  }
  if (attempt.input.planId) {
    const plan = await ctx.db.get(attempt.input.planId);
    if (!plan || plan.postId !== attempt.postId || plan.brandId !== attempt.brandId || plan.userId !== attempt.userId || plan.status !== "complete") throw new Error("Pinned scene plan is unavailable");
  }
}

async function ownedPost(ctx: MutationCtx | QueryCtx, userId: string, postId: Id<"v2Posts">, write = true) {
  const post = await ctx.db.get(postId);
  if (!post || post.userId !== userId) throw new Error("Post not found");
  const membership = await requireBrandAccess(ctx, userId, post.brandId);
  if (write && membership.role !== "owner" && membership.role !== "editor") throw new Error("Brand edit access denied");
  if (write && ["published", "submitted", "pr-created"].includes(post.status)) throw new Error("Separate publishing transition required before visual changes");
  if (post.channelId !== "corvo-blog") throw new Error("Visuals require a saved blog post");
  return post;
}

async function visualState(ctx: QueryCtx | MutationCtx, postId: Id<"v2Posts">) {
  return ctx.db.query("v2VisualStates").withIndex("by_post", q => q.eq("postId", postId)).unique();
}

async function stageBlocker(ctx: QueryCtx | MutationCtx, postId: Id<"v2Posts">, stage: Stage, except?: Id<"v2VisualAttempts">) {
  const stages: Stage[] = stage === "generation" || stage === "edit" ? ["generation", "edit"] : [stage];
  for (const lane of stages) for (const status of ["uncertain", "running"] as const) {
    const rows = await ctx.db.query("v2VisualAttempts").withIndex("by_post_and_stage_and_status", q => q.eq("postId", postId).eq("stage", lane).eq("status", status)).take(2);
    const blocker = rows.find(row => row._id !== except);
    if (blocker) return blocker;
  }
  return null;
}

async function imageSlotCurrent(ctx: QueryCtx | MutationCtx, attempt: Doc<"v2VisualAttempts">) {
  return !["generation", "edit"].includes(attempt.stage) || (await visualState(ctx, attempt.postId))?.activeImageAttemptId === attempt._id;
}

async function clearFinalApproval(ctx: MutationCtx, postId: Id<"v2Posts">, alreadyReadIntents?: Doc<"v2PublishingIntents">[]) {
  const post = await ctx.db.get(postId);
  if (!post) return;
  const intents = alreadyReadIntents ?? await ctx.db.query("v2PublishingIntents").withIndex("by_post_and_approval_state", q => q.eq("postId", postId).eq("approvalState", "approved")).take(513);
  if (intents.length > 512) throw new Error("Too many approved intents for an atomic visual transition; reconcile publishing intents first");
  await ctx.db.patch(postId, { approvalState: "unapproved", status: post.status === "approved" ? "draft" : post.status, updatedAt: Date.now() });
  for (const intent of intents) await ctx.db.patch(intent._id, { approvalState: "unapproved", updatedAt: Date.now() });
  if (post.approvalState === "approved" || intents.length) await audit(ctx, { userId: post.userId, brandId: post.brandId, postId, action: "visual-approval-invalidated", summary: "Visual selection, presentation, or reviewed context changed; final approval cleared", metadata: { invalidatedIntentIds: intents.map(intent => intent._id), retainedStatus: post.status === "approved" ? "draft" : post.status } });
}

function monthNow() { return new Date(Date.now()).toISOString().slice(0, 7); }
function micros(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Cost must be nonnegative integer USD micros");
}
function requireCanonicalHash(hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Canonical lowercase SHA-256 required");
}
function storageHashMatches(stored: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  if (stored === expected) return true;
  return stored === btoa(String.fromCharCode(...expected.match(/../g)!.map(hex => parseInt(hex, 16))));
}

export const setMonthlyBudget = mutation({
  args: { brandId: brandIdValidator, limitMicros: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const member = await requireBrandAccess(ctx, userId, args.brandId);
    if (member.role !== "owner") throw new Error("Brand owner access required");
    micros(args.limitMicros);
    const budget = await ctx.db.query("v2VisualBudgets").withIndex("by_brand", q => q.eq("brandId", args.brandId)).unique();
    const fields = { limitMicros: args.limitMicros, updatedBy: userId, updatedAt: Date.now() };
    if (budget) await ctx.db.patch(budget._id, fields);
    else await ctx.db.insert("v2VisualBudgets", { brandId: args.brandId, ...fields });
    return null;
  },
});

export const acknowledgeCostOverrun = mutation({
  args: { brandId: brandIdValidator, expectedOverrunMicros: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const membership = await requireBrandAccess(ctx, userId, args.brandId);
    if (membership.role !== "owner") throw new Error("Brand owner access required");
    micros(args.expectedOverrunMicros);
    const budget = await ctx.db.query("v2VisualBudgets").withIndex("by_brand", q => q.eq("brandId", args.brandId)).unique();
    if (!budget || !(budget.unacknowledgedOverrunMicros || budget.unacknowledgedLateChargeMicros) || (budget.unacknowledgedOverrunMicros ?? 0) + (budget.unacknowledgedLateChargeMicros ?? 0) !== args.expectedOverrunMicros) throw new Error("Overrun changed; review the current amount");
    await ctx.db.patch(budget._id, { unacknowledgedOverrunMicros: 0, unacknowledgedLateChargeMicros: 0, updatedBy: userId, updatedAt: Date.now() });
    await audit(ctx, { userId, brandId: args.brandId, action: "visual-cost-overrun-acknowledged", summary: "Brand owner reviewed the recorded excess charge and resumed admissions", metadata: { acknowledgedOverrunMicros: args.expectedOverrunMicros } });
    return null;
  },
});

/** Fixtures never confer live qualification. No live route currently has a verified cost bound. */
export const registerLocalFixtureQuote = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), provider: v.string(), model: v.string(), maximumMicros: v.number() }, returns: v.id("v2VisualDispatchQuotes"),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Attempt not found");
    micros(args.maximumMicros);
    if (!canIssueLocalFixtureQuote(process.env, attempt.userId, args)) throw new Error("Only verified local offline fixtures can issue fixture quotes");
    if (!args.provider.trim() || args.provider.length > 80 || !args.model.trim() || args.model.length > 120) throw new Error("Invalid fixture route");
    return ctx.db.insert("v2VisualDispatchQuotes", { attemptId: attempt._id, inputSignature: attempt.inputSignature, stage: attempt.stage, provider: args.provider, model: args.model, maximumMicros: args.maximumMicros, qualification: "offline-fixture", boundVerified: true, capabilityReceiptIds: [], provenance: "LOCAL OFFLINE FIXTURE — no live provider qualification", createdAt: Date.now() });
  },
});

async function qualifiedQuote(ctx: QueryCtx | MutationCtx, attempt: Doc<"v2VisualAttempts">, quoteId: Id<"v2VisualDispatchQuotes">) {
  const quote = await ctx.db.get(quoteId);
  if (!quote || quote.attemptId !== attempt._id || quote.inputSignature !== attempt.inputSignature || quote.stage !== attempt.stage || !quote.boundVerified) throw new Error("Quote does not bind the exact stored attempt");
  // The capability ledger has no qualified live image or text route with a reliable maximum.
  const fixture = quote.qualification === "offline-fixture" && canIssueLocalFixtureQuote(process.env, attempt.userId, quote);
  const contract = quote.qualification === "offline-contract" && isOfflineContractRuntime(process.env);
  if (!fixture && !contract) throw new Error("No qualified live route and verified cost bound");
  micros(quote.maximumMicros);
  return quote;
}

/** Authoritative admission reads immutable evidence; caller costs or provenance are never accepted. */
export const reserveAttempt = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), quoteId: v.id("v2VisualDispatchQuotes") },
  returns: v.object({ admitted: v.boolean(), reason: v.union(v.null(), v.string()) }),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.status !== "queued") return { admitted: false, reason: "attempt-not-queued" };
    let quote: Doc<"v2VisualDispatchQuotes">;
    try {
      quote = await qualifiedQuote(ctx, attempt, args.quoteId);
    } catch (error) {
      if (attempt.reservedMicros === undefined) throw error;
      const reason = "Previously reserved quote is no longer qualified";
      await cancelBeforeDispatch(ctx, attempt, reason);
      return { admitted: false, reason };
    }
    if (attempt.stage === "reflection") {
      const deferred = await ctx.db.query("v2VisualReflections").withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
      if (deferred?.deferredReason) { if (attempt.reservedMicros !== undefined) await cancelBeforeDispatch(ctx, attempt, deferred.deferredReason); return { admitted: false, reason: deferred.deferredReason }; }
    }
    try {
      const post = await ownedPost(ctx, attempt.userId, attempt.postId);
      await validatePinnedInput(ctx, attempt);
      if (attempt.stage !== "reflection" && articleSignature(post) !== attempt.input.article.signature) throw new Error("Article changed before dispatch; request a new attempt");
    } catch (error) {
      const reason = `Cancelled before dispatch: ${error instanceof Error ? error.message.slice(0, 2000) : "Stored inputs or permissions changed"}`;
      await cancelBeforeDispatch(ctx, attempt, reason);
      return { admitted: false, reason };
    }
    if (!await imageSlotCurrent(ctx, attempt)) { await cancelBeforeDispatch(ctx, attempt, "Image attempt was superseded before dispatch"); return { admitted: false, reason: "Image attempt was superseded before dispatch" }; }
    if (attempt.stage === "reflection") {
      const reflection = await ctx.db.query("v2VisualReflections").withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
      if (reflection?.deferredReason) { if (attempt.reservedMicros !== undefined) await cancelBeforeDispatch(ctx, attempt, reflection.deferredReason); return { admitted: false, reason: reflection.deferredReason }; }
      if (!await reflectionCurrent(ctx, attempt)) { await cancelBeforeDispatch(ctx, attempt, "Reflection approval is stale"); return { admitted: false, reason: "Reflection approval is stale" }; }
      if (!await verifiedReflectionContext(ctx, attempt)) { await cancelBeforeDispatch(ctx, attempt, "Reflection lineage context is unavailable or unverified"); return { admitted: false, reason: "Reflection lineage context is unavailable or unverified" }; }
    }
    if (await stageBlocker(ctx, attempt.postId, attempt.stage, attempt._id)) return { admitted: false, reason: "reconciliation-required-or-stage-running" };
    const budget = await ctx.db.query("v2VisualBudgets").withIndex("by_brand", q => q.eq("brandId", attempt.brandId)).unique();
    if (budget?.unacknowledgedOverrunMicros || budget?.unacknowledgedLateChargeMicros) {
      await ctx.db.patch(attempt._id, { pauseReason: "cost-overrun-owner-review-required", updatedAt: Date.now() });
      return { admitted: false, reason: "cost-overrun-owner-review-required" };
    }
    if (attempt.reservedMicros !== undefined) {
      if (attempt.reservedMicros !== quote.maximumMicros || attempt.quotedProvider !== quote.provider || attempt.quotedModel !== quote.model || attempt.quoteProvenance !== quote.provenance) throw new Error("Reservation already bound to a different quote");
      return { admitted: attempt.status === "queued", reason: attempt.status === "queued" ? null : "already-dispatched" };
    }
    if (attempt.status !== "queued") return { admitted: false, reason: "attempt-not-queued" };
    if (attempt.input.model !== null && attempt.input.model !== quote.model) throw new Error("Quote changes pinned model");
    if (attempt.input.provider !== null && attempt.input.provider !== quote.provider) throw new Error("Quote changes pinned provider");
    const month = monthNow();
    const usage = await ctx.db.query("v2VisualBudgetMonths").withIndex("by_brand_and_month", q => q.eq("brandId", attempt.brandId).eq("month", month)).unique();
    if (!budget || (usage?.spentMicros ?? 0) + (usage?.reservedMicros ?? 0) + quote.maximumMicros > budget.limitMicros) {
      await ctx.db.patch(attempt._id, { pauseReason: "monthly-budget-exhausted", updatedAt: Date.now() });
      return { admitted: false, reason: "monthly-budget-exhausted" };
    }
    const now = Date.now();
    if (usage) await ctx.db.patch(usage._id, { reservedMicros: usage.reservedMicros + quote.maximumMicros, updatedAt: now });
    else await ctx.db.insert("v2VisualBudgetMonths", { brandId: attempt.brandId, month, reservedMicros: quote.maximumMicros, spentMicros: 0, updatedAt: now });
    await ctx.db.patch(attempt._id, { quoteId: quote._id, reservedMicros: quote.maximumMicros, reservationMonth: month, quotedProvider: quote.provider, quotedModel: quote.model, quoteProvenance: quote.provenance, pauseReason: undefined, updatedAt: now });
    return { admitted: true, reason: null };
  },
});

async function reflectionCurrent(ctx: QueryCtx | MutationCtx, attempt: Doc<"v2VisualAttempts">) {
  const reflection = await ctx.db.query("v2VisualReflections").withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
  if (!reflection) return false;
  const final = await ctx.db.get(reflection.versionId);
  const post = await ctx.db.get(attempt.postId);
  const state = await visualState(ctx, attempt.postId);
  return !!(final?.approvedAt && reflection.approvedAlt && final.approvedAlt === reflection.approvedAlt && post && state?.selectedVersionId === final._id && final.exportStorageId === reflection.approvedExportStorageId && final.approvedExportHash === reflection.approvedExportHash && (!reflection.approvedArticleSignature || final.approvedArticleSignature === reflection.approvedArticleSignature) && final.exportHash === reflection.approvedExportHash && final.approvedExportMetadataSignature === stableInputSignature(final.exportMetadata) && (!reflection.approvedExportMetadataSignature || reflection.approvedExportMetadataSignature === final.approvedExportMetadataSignature) && final.approvedRelevanceSignature === relevanceSignature(post));
}

async function cancelBeforeDispatch(ctx: MutationCtx, attempt: Doc<"v2VisualAttempts">, reason: string) {
  if (attempt.status !== "queued" || attempt.claimKey) return;
  if (attempt.reservedMicros !== undefined && attempt.reservationMonth) {
    const month = await ctx.db.query("v2VisualBudgetMonths").withIndex("by_brand_and_month", q => q.eq("brandId", attempt.brandId).eq("month", attempt.reservationMonth!)).unique();
    if (!month || month.reservedMicros < attempt.reservedMicros) throw new Error("Reservation ledger is inconsistent");
    await ctx.db.patch(month._id, { reservedMicros: month.reservedMicros - attempt.reservedMicros, updatedAt: Date.now() });
  }
  await ctx.db.patch(attempt._id, { status: "failed", error: reason, pauseReason: undefined, updatedAt: Date.now() });
  const state = await visualState(ctx, attempt.postId);
  if (state?.activeImageAttemptId === attempt._id) await ctx.db.patch(state._id, { activeImageAttemptId: undefined, updatedAt: Date.now() });
}

export const claimAttempt = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts") },
  returns: v.union(v.null(), v.object({ attemptId: v.id("v2VisualAttempts"), claimKey: v.string(), input: attemptInputValidator, provider: v.string(), model: v.string(), maximumMicros: v.number(), reflectionContext: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.status !== "queued" || attempt.reservedMicros === undefined || attempt.claimKey || !attempt.quotedProvider || !attempt.quotedModel) return null;
    if (!await imageSlotCurrent(ctx, attempt)) { await cancelBeforeDispatch(ctx, attempt, "Image attempt was superseded before dispatch"); return null; }
    if (await stageBlocker(ctx, attempt.postId, attempt.stage, attempt._id)) return null;
    if (attempt.stage === "reflection") {
      const reflection = await ctx.db.query("v2VisualReflections").withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
      if (reflection?.deferredReason) { await cancelBeforeDispatch(ctx, attempt, reflection.deferredReason); return null; }
    }
    if (attempt.stage === "reflection" && !await reflectionCurrent(ctx, attempt)) {
      await cancelBeforeDispatch(ctx, attempt, "Reflection approval is stale");
      return null;
    }
    const reflectionContext = attempt.stage === "reflection" ? await verifiedReflectionContext(ctx, attempt) : null;
    if (attempt.stage === "reflection" && !reflectionContext) { await cancelBeforeDispatch(ctx, attempt, "Reflection lineage context is unavailable or unverified"); return null; }
    if (!attempt.quoteId) { await cancelBeforeDispatch(ctx, attempt, "Previously reserved quote is unavailable"); return null; }
    try {
      await qualifiedQuote(ctx, attempt, attempt.quoteId);
      await validatePinnedInput(ctx, attempt);
      const post = await ownedPost(ctx, attempt.userId, attempt.postId);
      if (attempt.stage !== "reflection" && articleSignature(post) !== attempt.input.article.signature) throw new Error("Article changed before dispatch; request a new attempt");
    } catch (error) {
      await cancelBeforeDispatch(ctx, attempt, `Cancelled before dispatch: ${error instanceof Error ? error.message.slice(0,2000) : "Stored inputs or permissions changed"}`);
      return null;
    }
    const budget = await ctx.db.query("v2VisualBudgets").withIndex("by_brand", q => q.eq("brandId", attempt.brandId)).unique();
    if (budget?.unacknowledgedOverrunMicros || budget?.unacknowledgedLateChargeMicros) return null;
    const now = Date.now();
    const claimKey = `${attempt._id}:${now}`;
    await ctx.db.patch(attempt._id, { status: "running", claimKey, dispatchedAt: now, updatedAt: now });
    return { attemptId: attempt._id, claimKey, input: attempt.input, provider: attempt.quotedProvider, model: attempt.quotedModel, maximumMicros: attempt.reservedMicros, ...(reflectionContext ? { reflectionContext: reflectionContext.context } : {}) };
  },
});

async function claimedAttempt(ctx: MutationCtx, attemptId: Id<"v2VisualAttempts">, claimKey: string) {
  const attempt = await ctx.db.get(attemptId);
  if (!attempt || attempt.claimKey !== claimKey || (attempt.status !== "running" && attempt.status !== "uncertain")) throw new Error("Attempt claim is not active");
  return attempt;
}

export const markUncertain = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), claimKey: v.string(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await claimedAttempt(ctx, args.attemptId, args.claimKey);
    assertSerializedBound(args.reason, 4000, "Uncertain outcome reason");
    await ctx.db.patch(attempt._id, { status: "uncertain", error: args.reason, updatedAt: Date.now() });
    return null;
  },
});

export const cancelQueuedAttempt = mutation({
  args: { attemptId: v.id("v2VisualAttempts") }, returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Attempt not found");
    const userId = await requireUserId(ctx);
    const member = await requireBrandAccess(ctx, userId, attempt.brandId);
    if (member.role !== "owner" && !(attempt.userId === userId && ["editor", "viewer"].includes(member.role))) throw new Error("Brand owner or request author release access required");
    if (attempt.status === "failed") return null;
    if (attempt.status !== "queued" || attempt.claimKey) throw new Error("Only work not yet dispatched can be cancelled");
    await cancelBeforeDispatch(ctx, attempt, "Cancelled before dispatch");
    await audit(ctx, { userId, brandId: attempt.brandId, postId: attempt.postId, action: "visual-queued-attempt-cancelled", summary: "Undispatched reservation released without changing article lifecycle", metadata: { attemptId: attempt._id } });
    return null;
  },
});

const usageArgs = { actualMicros: v.number(), usageKind: v.union(v.literal("reported"), v.literal("estimated")), usageReceipt: v.string() };
type Usage = { actualMicros: number; usageKind: "reported" | "estimated"; usageReceipt: string };

async function settleCharge(ctx: MutationCtx, attempt: Doc<"v2VisualAttempts">, usage: Usage, status: "completed" | "failed", completionSignature: string) {
  micros(usage.actualMicros);
  if (!usage.usageReceipt.trim()) throw new Error("Usage receipt required for reconciliation");
  assertSerializedBound(usage.usageReceipt, 16_000, "Usage receipt");
  assertSerializedBound({ ...attempt, completionSignature, usageReceipt: usage.usageReceipt }, 750_000, "Serialized reconciled attempt");
  if (attempt.reservedMicros === undefined || !attempt.reservationMonth) throw new Error("Attempt has no reservation");
  const month = await ctx.db.query("v2VisualBudgetMonths").withIndex("by_brand_and_month", q => q.eq("brandId", attempt.brandId).eq("month", attempt.reservationMonth!)).unique();
  if (!month || month.reservedMicros < attempt.reservedMicros) throw new Error("Reservation ledger is inconsistent");
  const costOverrunMicros = Math.max(0, usage.actualMicros - attempt.reservedMicros);
  await ctx.db.patch(month._id, { reservedMicros: month.reservedMicros - attempt.reservedMicros, spentMicros: month.spentMicros + usage.actualMicros, ...(costOverrunMicros ? { overrunMicros: (month.overrunMicros ?? 0) + costOverrunMicros } : {}), updatedAt: Date.now() });
  if (costOverrunMicros) {
    const budget = await ctx.db.query("v2VisualBudgets").withIndex("by_brand", q => q.eq("brandId", attempt.brandId)).unique();
    if (!budget) throw new Error("Reservation budget is missing");
    await ctx.db.patch(budget._id, { unacknowledgedOverrunMicros: (budget.unacknowledgedOverrunMicros ?? 0) + costOverrunMicros, updatedAt: Date.now() });
  }
  await ctx.db.patch(attempt._id, { status, ...(costOverrunMicros ? { costOverrunMicros } : {}), ...(usage.usageKind === "reported" ? { reportedActualMicros: usage.actualMicros } : { estimatedActualMicros: usage.actualMicros }), usageReceipt: usage.usageReceipt, completionSignature, updatedAt: Date.now() });
}

async function completionAttempt(ctx: MutationCtx, attemptId: Id<"v2VisualAttempts">, claimKey: string, signature: string) {
  const attempt = await ctx.db.get(attemptId);
  if (!attempt || attempt.claimKey !== claimKey) throw new Error("Attempt claim is not active");
  if (attempt.ownerReconciliationSignature) {
    if (attempt.lateCompletionSignature && attempt.lateCompletionSignature !== signature) throw new Error("Completion already bound to a different late result");
    return { attempt, duplicate: !!attempt.lateCompletionSignature, ownerReconciled: true };
  }
  if (attempt.completionSignature) {
    if (attempt.completionSignature !== signature) throw new Error("Completion already bound to a different result");
    return { attempt, duplicate: true };
  }
  await claimedAttempt(ctx, attemptId, claimKey);
  return { attempt, duplicate: false };
}

async function settleLateReceipt(ctx: MutationCtx, attempt: Doc<"v2VisualAttempts">, usage: Usage, signature: string, outputStorageId?: Id<"_storage">) {
  if (attempt.lateCompletionSignature) return;
  micros(usage.actualMicros);
  if (!usage.usageReceipt.trim()) throw new Error("Usage receipt required for reconciliation");
  assertSerializedBound(usage.usageReceipt, 16_000, "Late usage receipt");
  const attested = attempt.reportedActualMicros ?? attempt.estimatedActualMicros;
  if (attested === undefined || !attempt.reservationMonth || attempt.reservedMicros === undefined) throw new Error("Owner reconciliation ledger is incomplete");
  const delta = usage.actualMicros - attested;
  const additionalOverrun = Math.max(0, usage.actualMicros - attempt.reservedMicros - (attempt.costOverrunMicros ?? 0));
  const month = await ctx.db.query("v2VisualBudgetMonths").withIndex("by_brand_and_month", q => q.eq("brandId", attempt.brandId).eq("month", attempt.reservationMonth!)).unique();
  const budget = await ctx.db.query("v2VisualBudgets").withIndex("by_brand", q => q.eq("brandId", attempt.brandId)).unique();
  if (!month || !budget || month.spentMicros + delta < 0) throw new Error("Owner reconciliation ledger is inconsistent");
  await ctx.db.patch(month._id, { spentMicros: month.spentMicros + delta, ...(additionalOverrun ? { overrunMicros: (month.overrunMicros ?? 0) + additionalOverrun } : {}), updatedAt: Date.now() });
  if (delta > 0) await ctx.db.patch(budget._id, { unacknowledgedOverrunMicros: (budget.unacknowledgedOverrunMicros ?? 0) + additionalOverrun, unacknowledgedLateChargeMicros: (budget.unacknowledgedLateChargeMicros ?? 0) + Math.max(0, delta - additionalOverrun), updatedAt: Date.now() });
  const late = { lateCompletionSignature: signature, lateUsageReceipt: usage.usageReceipt, lateActualMicros: usage.actualMicros, lateUsageKind: usage.usageKind, lateUsageDeltaMicros: delta, lateCostOverrunMicros: additionalOverrun, ...(outputStorageId ? { lateOutputStorageId: outputStorageId } : {}), error: "Late trusted receipt reconciled after owner attestation; no selectable output created", updatedAt: Date.now() };
  assertSerializedBound({ ...attempt, ...late }, 750_000, "Serialized late reconciliation");
  await ctx.db.patch(attempt._id, late);
  await audit(ctx, { userId: attempt.userId, brandId: attempt.brandId, postId: attempt.postId, action: "visual-late-usage-reconciled", summary: "Late trusted receipt adjusted existing owner-attested usage without dispatch or selection", metadata: { attemptId: attempt._id, attestedMicros: attested, lateActualMicros: usage.actualMicros, deltaMicros: delta, additionalOverrunMicros: additionalOverrun, selectableOutput: false } });
}

const dispatchLeaseMs = 15 * 60_000;

export const recoverRunning = mutation({
  args: { attemptId: v.id("v2VisualAttempts"), expectedUpdatedAt: v.number(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Attempt not found");
    if ((await requireBrandAccess(ctx, userId, attempt.brandId)).role !== "owner") throw new Error("Brand owner access required");
    if (!args.reason.trim()) throw new Error("Owner recovery reason required");
    assertSerializedBound(args, 6000, "Owner running recovery");
    const signature = stableInputSignature({ ...args, owner: userId });
    if (attempt.runningRecoverySignature) {
      if (attempt.runningRecoverySignature !== signature) throw new Error("Running recovery already bound to a different attestation");
      return null;
    }
    if (attempt.status !== "running" || attempt.updatedAt !== args.expectedUpdatedAt) throw new Error("Running outcome changed; review current state");
    if (!attempt.dispatchedAt || Date.now() < attempt.dispatchedAt + dispatchLeaseMs) throw new Error("Dispatch lease has not expired");
    await ctx.db.patch(attempt._id, { status: "uncertain", error: `Owner inspected expired dispatch lease: ${args.reason.trim()}`, runningRecoverySignature: signature, runningRecoveredBy: userId, updatedAt: Date.now() });
    await audit(ctx, { userId, brandId: attempt.brandId, postId: attempt.postId, action: "visual-running-owner-marked-uncertain", summary: "Owner marked an expired dispatch lease uncertain; reservation retained and no redispatch", metadata: { attemptId: attempt._id, dispatchedAt: attempt.dispatchedAt, leaseMs: dispatchLeaseMs } });
    return null;
  },
});

export const reconcileUncertain = mutation({
  args: { attemptId: v.id("v2VisualAttempts"), expectedUpdatedAt: v.number(), reason: v.string(), ...usageArgs }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Attempt not found");
    const member = await requireBrandAccess(ctx, userId, attempt.brandId);
    if (member.role !== "owner") throw new Error("Brand owner access required");
    if (!args.reason.trim() || args.reason.length > 4000) throw new Error("Owner reconciliation reason required and bounded");
    assertSerializedBound(args, 24_000, "Owner reconciliation");
    const signature = stableInputSignature({ ...args, owner: userId, evidence: "owner-attested" });
    if (attempt.ownerReconciliationSignature) {
      if (attempt.ownerReconciliationSignature !== signature) throw new Error("Reconciliation already bound to a different owner attestation");
      return null;
    }
    if (attempt.status !== "uncertain" || attempt.updatedAt !== args.expectedUpdatedAt) throw new Error("Uncertain outcome changed; review current state");
    await settleCharge(ctx, attempt, args, "failed", signature);
    await ctx.db.patch(attempt._id, { ownerReconciledBy: userId, ownerReconciliationSignature: signature, error: `Owner-attested reconciliation: ${args.reason.trim()}` });
    const state = await visualState(ctx, attempt.postId);
    if (state?.activeImageAttemptId === attempt._id) await ctx.db.patch(state._id, { activeImageAttemptId: undefined, updatedAt: Date.now() });
    await audit(ctx, { userId, brandId: attempt.brandId, postId: attempt.postId, action: "visual-uncertain-owner-reconciled", summary: "Owner attested existing uncertain usage and released the reservation without redispatch", metadata: { attemptId: attempt._id, actualMicros: args.actualMicros, usageKind: args.usageKind, evidence: "owner-attested" } });
    return null;
  },
});

export const getAttemptRecovery = query({
  args: { attemptId: v.id("v2VisualAttempts") }, returns: v.object({ attemptId: v.id("v2VisualAttempts"), postId: v.id("v2Posts"), brandId: brandIdValidator, status: visualAttemptDocValidator.fields.status, stage: visualAttemptDocValidator.fields.stage, userId: v.string(), updatedAt: v.number(), reservedMicros: v.optional(v.number()), dispatchedAt: v.optional(v.number()), runningLeaseExpiresAt: v.optional(v.number()), usageReceipt: v.optional(v.string()), error: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Attempt not found");
    const member = await requireBrandAccess(ctx, await requireUserId(ctx), attempt.brandId);
    if (member.role !== "owner") throw new Error("Brand owner access required");
    return { attemptId: attempt._id, postId: attempt.postId, brandId: attempt.brandId, status: attempt.status, stage: attempt.stage, userId: attempt.userId, updatedAt: attempt.updatedAt, ...(attempt.reservedMicros !== undefined ? { reservedMicros: attempt.reservedMicros } : {}), ...(attempt.dispatchedAt !== undefined ? { dispatchedAt: attempt.dispatchedAt, runningLeaseExpiresAt: attempt.dispatchedAt + dispatchLeaseMs } : {}), ...(attempt.usageReceipt !== undefined ? { usageReceipt: attempt.usageReceipt } : {}), ...(attempt.error !== undefined ? { error: attempt.error } : {}) };
  },
});

export const completePlan = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), claimKey: v.string(), scenes: v.array(sceneValidator), ...usageArgs },
  returns: v.union(v.null(), v.id("v2VisualPlans")),
  handler: async (ctx, args) => {
    assertSerializedBound(args, 100_000, "Serialized completion");
    const signature = stableInputSignature(args);
    const { attempt, duplicate, ownerReconciled } = await completionAttempt(ctx, args.attemptId, args.claimKey, signature);
    if (attempt.stage !== "planning") throw new Error("Attempt is not planning");
    if (ownerReconciled) { if (!duplicate) await settleLateReceipt(ctx, attempt, args, signature); return null; }
    if (duplicate) return attempt.resultPlanId!;
    const validation = validateScenePlan(args.scenes, attempt.input.article.content);
    const planId = await ctx.db.insert("v2VisualPlans", { userId: attempt.userId, brandId: attempt.brandId, postId: attempt.postId, attemptId: attempt._id, input: attempt.input, scenes: args.scenes, status: validation.valid ? "complete" : "incomplete", reasons: validation.reasons, createdAt: Date.now() });
    await settleCharge(ctx, attempt, args, "completed", signature);
    await ctx.db.patch(attempt._id, { resultPlanId: planId });
    return planId;
  },
});

export const failAttempt = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), claimKey: v.string(), reason: v.string(), ...usageArgs }, returns: v.null(),
  handler: async (ctx, args) => {
    assertSerializedBound(args, 100_000, "Serialized completion");
    const signature = stableInputSignature(args);
    const { attempt, duplicate, ownerReconciled } = await completionAttempt(ctx, args.attemptId, args.claimKey, signature);
    if (ownerReconciled) { if (!duplicate) await settleLateReceipt(ctx, attempt, args, signature); return null; }
    if (duplicate) return null;
    await settleCharge(ctx, attempt, args, "failed", signature);
    await ctx.db.patch(attempt._id, { error: args.reason });
    const state = await visualState(ctx, attempt.postId);
    if (state?.activeImageAttemptId === attempt._id) await ctx.db.patch(state._id, { activeImageAttemptId: undefined });
    return null;
  },
});

export const selectScene = mutation({
  args: { planId: v.id("v2VisualPlans"), sceneIndex: v.number(), refinedScene: v.optional(sceneValidator) }, returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    await ownedPost(ctx, await requireUserId(ctx), plan.postId);
    if (plan.status !== "complete") throw new Error("Plan is incomplete");
    if (!Number.isInteger(args.sceneIndex) || !plan.scenes[args.sceneIndex]) throw new Error("Invalid scene selection");
    if (args.refinedScene && !validateScenePlan([args.refinedScene, ...plan.scenes.filter((_, i) => i !== args.sceneIndex)], plan.input.article.content).valid) throw new Error("Refinement is incomplete or duplicates another story");
    const state = await visualState(ctx, plan.postId);
    const fields = { selectedPlanId: plan._id, selectedSceneIndex: args.sceneIndex, refinedScene: args.refinedScene, updatedAt: Date.now() };
    if (state?.selectedPlanId !== plan._id || state.selectedSceneIndex !== args.sceneIndex || stableInputSignature(state.refinedScene) !== stableInputSignature(args.refinedScene)) {
      await clearFinalApproval(ctx, plan.postId);
      const active = state?.activeImageAttemptId ? await ctx.db.get(state.activeImageAttemptId) : null;
      if (active) await cancelBeforeDispatch(ctx, active, "Selected scene changed before dispatch");
    }
    if (state) await ctx.db.patch(state._id, fields);
    else await ctx.db.insert("v2VisualStates", { userId: plan.userId, brandId: plan.brandId, postId: plan.postId, ...fields });
    return null;
  },
});

async function queueImage(ctx: MutationCtx, post: Doc<"v2Posts">, stage: "generation" | "edit", operationKey: string, input: Input) {
  const attemptId = await queueAttempt(ctx, post, stage, operationKey, input, "provider-route-unqualified");
  const state = await visualState(ctx, post._id);
  if (!state) throw new Error("Select a scene before generation");
  if (state.activeImageAttemptId && state.activeImageAttemptId !== attemptId) {
    const active = await ctx.db.get(state.activeImageAttemptId);
    if (active && ["queued", "running", "uncertain"].includes(active.status)) throw new Error(active.status === "uncertain" ? "Reconciliation required before another image attempt" : "An image attempt is already active");
  }
  const attempt = await ctx.db.get(attemptId);
  if (attempt?.status === "queued") await ctx.db.patch(state._id, { activeImageAttemptId: attemptId, updatedAt: Date.now() });
  return attemptId;
}

const viewedSelectionArgs = { expectedArticleSignature: v.string(), expectedPlanId: v.id("v2VisualPlans"), expectedSceneIndex: v.number(), expectedRefinedSceneSignature: v.string() };
function assertViewedSelection(post: Doc<"v2Posts">, state: Doc<"v2VisualStates"> | null, args: { expectedArticleSignature: string; expectedPlanId: Id<"v2VisualPlans">; expectedSceneIndex: number; expectedRefinedSceneSignature: string }) {
  assertSerializedBound(args.expectedArticleSignature, 75_000, "Viewed article signature");
  if (articleSignature(post) !== args.expectedArticleSignature) throw new Error("Viewed article changed; refresh before requesting images");
  if (!state || state.selectedPlanId !== args.expectedPlanId || state.selectedSceneIndex !== args.expectedSceneIndex || stableInputSignature(state.refinedScene ?? null) !== args.expectedRefinedSceneSignature) throw new Error("Viewed visual selection changed; refresh before requesting images");
}

export const requestGeneration = mutation({
  args: { postId: v.id("v2Posts"), operationKey: v.string(), ...viewedSelectionArgs, prompt: v.optional(v.string()), modelOverride: v.optional(v.string()), providerOverride: v.optional(v.string()) },
  returns: v.id("v2VisualAttempts"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedPost(ctx, userId, args.postId);
    const state = await visualState(ctx, post._id);
    assertViewedSelection(post, state, args);
    if (!state?.selectedPlanId || state.selectedSceneIndex === undefined) throw new Error("Select a scene before generation");
    const plan = await ctx.db.get(state.selectedPlanId);
    if (!plan || plan.status !== "complete") throw new Error("Selected plan is unavailable");
    if (relevanceSignature(post) !== relevanceSignature(plan.input.article)) throw new Error("Article changed; plan scenes for its current revision");
    const scene = state.refinedScene ?? plan.scenes[state.selectedSceneIndex];
    const revision = await ctx.db.get(plan.input.pins.profileRevisionId);
    if (!revision) throw new Error("Pinned visual profile is unavailable");
    const model = args.modelOverride ?? revision.defaultRoute?.model;
    const provider = args.providerOverride ?? revision.defaultRoute?.provider;
    if (!model || !provider) throw new Error("Choose a provider and model before generation");
    const profile = await resolveVisualProfileForPost(ctx, userId, post._id, { profileRevisionId: revision._id, role: "image_generator", model, provider, sceneTags: sceneTags(scene, plan.input.references.length, plan.input.pins.postExceptionId !== null) });
    if (!profile) throw new Error("Pinned visual profile is unavailable");
    if ((args.prompt?.length ?? 0) > 20_000) throw new Error("Production instructions are too long");
    const input: Input = { ...plan.input,
      article: { title: post.title, content: post.content, signature: articleSignature(post) },
      pins: { ...plan.input.pins, lessonIds: profile.lessonIds },
      scene, planId: plan._id, selectionAtQueue: { planId: state.selectedPlanId, sceneIndex: state.selectedSceneIndex, refinedSceneSignature: stableInputSignature(state.refinedScene ?? null) }, selectedVersionIdAtQueue: state.selectedVersionId ?? null, authorProductionInstructions: args.prompt?.trim() ?? "", previousFeedback: [], prompt: composeScenePrompt(scene, args.prompt), provider, model,
    };
    input.prompt += `\n${await instructionsForPins(ctx, userId, post._id, input)}`;
    return queueImage(ctx, post, "generation", args.operationKey, input);
  },
});

async function editInstructionHistory(ctx: MutationCtx, post: Doc<"v2Posts">, parent: Doc<"v2VisualVersions">) {
  if (parent.input.authorProductionInstructions !== undefined && parent.input.previousFeedback !== undefined) return { authorProductionInstructions: parent.input.authorProductionInstructions, previousFeedback: [...parent.input.previousFeedback, ...(parent.feedback ? [parent.feedback] : [])] };
  const feedback: string[] = [];
  const seen = new Set<string>();
  let cursor: Doc<"v2VisualVersions"> | null = parent;
  let bytes = 0;
  while (cursor) {
    bytes += serializedUtf8Bytes(cursor);
    if (seen.has(cursor._id) || seen.size >= 64 || bytes > 4_000_000 || cursor.postId !== post._id || cursor.userId !== post.userId || cursor.brandId !== post.brandId) throw new Error("Original edit instructions are unavailable; select a complete owned lineage");
    seen.add(cursor._id);
    if (cursor.feedback) feedback.unshift(cursor.feedback);
    if (!cursor.parentVersionId) return { authorProductionInstructions: cursor.input.authorProductionInstructions ?? cursor.input.prompt, previousFeedback: feedback };
    cursor = await ctx.db.get(cursor.parentVersionId);
  }
  throw new Error("Original edit instructions are unavailable; select a complete owned lineage");
}

export const requestEdit = mutation({
  args: { postId: v.id("v2Posts"), operationKey: v.string(), ...viewedSelectionArgs, expectedParentVersionId: v.id("v2VisualVersions"), feedback: v.string(), modelOverride: v.optional(v.string()), providerOverride: v.optional(v.string()) },
  returns: v.id("v2VisualAttempts"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedPost(ctx, userId, args.postId);
    const state = await visualState(ctx, post._id);
    assertViewedSelection(post, state, args);
    if (state?.selectedVersionId !== args.expectedParentVersionId) throw new Error("Viewed image parent changed; refresh before requesting an edit");
    const parent = state?.selectedVersionId ? await ctx.db.get(state.selectedVersionId) : null;
    if (!parent || parent.postId !== post._id) throw new Error("Select an image version before editing");
    if (!args.feedback.trim() || args.feedback.length > 20_000) throw new Error("Feedback is required and must be bounded");
    if (relevanceSignature(post) !== relevanceSignature(parent.input.article) && parent.relevanceConfirmedSignature !== relevanceSignature(post)) throw new Error("Article changed; confirm relevance before editing");
    const model = args.modelOverride ?? parent.model;
    const provider = args.providerOverride ?? parent.provider;
    const lessonIds: Id<"v2VisualLessons">[] = [];
    for (const lessonId of parent.input.pins.lessonIds) {
      const lesson = await ctx.db.get(lessonId);
      if (!lesson) throw new Error("Pinned prompting lesson is unavailable");
      if (!lesson.modelScope || lesson.modelScope.model === model && (lesson.modelScope.provider === null || lesson.modelScope.provider === provider)) lessonIds.push(lessonId);
    }
    const history = await editInstructionHistory(ctx, post, parent);
    const input: Input = { ...parent.input, ...history, article: { title: post.title, content: post.content, signature: articleSignature(post) },
      pins: { ...parent.input.pins, lessonIds },
      parentVersionId: parent._id, parentStorageId: parent.storageId, selectionAtQueue: state?.selectedPlanId && state.selectedSceneIndex !== undefined ? { planId: state.selectedPlanId, sceneIndex: state.selectedSceneIndex, refinedSceneSignature: stableInputSignature(state.refinedScene ?? null) } : undefined, selectedVersionIdAtQueue: parent._id, feedback: args.feedback.trim(),
      prompt: "", provider, model,
    };
    input.prompt = `${composeScenePrompt(input.scene!, input.authorProductionInstructions)}\n${await instructionsForPins(ctx, userId, post._id, input)}\nEdit the supplied selected image. Retain its central story.\nEarlier author feedback (historical context; latest instructions take precedence): ${stableInputSignature(input.previousFeedback)}\nAuthor feedback: ${args.feedback.trim()}`;
    return queueImage(ctx, post, "edit", args.operationKey, input);
  },
});

async function assertUnboundBlob(ctx: QueryCtx | MutationCtx, storageId: Id<"_storage">, owner: { userId: string; brandId: Doc<"v2Posts">["brandId"] }, sameExportVersionId?: Id<"v2VisualVersions">) {
  const [raw, exported, reference, upload] = await Promise.all([
    ctx.db.query("v2VisualVersions").withIndex("by_storageId", q => q.eq("storageId", storageId)).first(),
    ctx.db.query("v2VisualVersions").withIndex("by_exportStorageId", q => q.eq("exportStorageId", storageId)).take(2),
    ctx.db.query("v2VisualReferences").withIndex("by_storageId", q => q.eq("storageId", storageId)).first(),
    ctx.db.query("v2StorageUploads").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique(),
  ]);
  if (upload && (upload.userId !== owner.userId || upload.brandId !== null && upload.brandId !== owner.brandId)) throw new Error("Storage upload ownership does not match visual asset");
  if (raw || reference || exported.some(version => version._id !== sameExportVersionId)) throw new Error("Storage blob is already bound to another visual asset");
}

export const completeImage = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), claimKey: v.string(), storageId: v.id("_storage"), sha256: v.string(), contentType: v.string(), width: v.number(), height: v.number(), bytes: v.number(), revisedPrompt: v.optional(v.string()), ...usageArgs },
  returns: v.union(v.null(), v.id("v2VisualVersions")),
  handler: async (ctx, args) => {
    assertSerializedBound(args, 100_000, "Serialized completion");
    const signature = stableInputSignature(args);
    const { attempt, duplicate, ownerReconciled } = await completionAttempt(ctx, args.attemptId, args.claimKey, signature);
    if (attempt.stage !== "generation" && attempt.stage !== "edit") throw new Error("Attempt is not image work");
    if (ownerReconciled) { if (!duplicate) await settleLateReceipt(ctx, attempt, args, signature, args.storageId); return null; }
    if (duplicate) return attempt.resultVersionId!;
    if (!attempt.input.planId || !attempt.input.scene || !attempt.quotedProvider || !attempt.quotedModel) throw new Error("Image attempt inputs are incomplete");
    requireCanonicalHash(args.sha256);
    await assertUnboundBlob(ctx, args.storageId, attempt);
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata || !storageHashMatches(metadata.sha256, args.sha256) || metadata.size !== args.bytes || (metadata.contentType !== undefined && metadata.contentType !== args.contentType) || !["image/png", "image/jpeg", "image/webp"].includes(args.contentType)) throw new Error("Image bytes do not match completion metadata");
    if (!Number.isInteger(args.width) || !Number.isInteger(args.height) || args.width < 1 || args.height < 1 || args.width > 16_384 || args.height > 16_384) throw new Error("Invalid image dimensions");
    const versionId = await ctx.db.insert("v2VisualVersions", {
      userId: attempt.userId, brandId: attempt.brandId, postId: attempt.postId, attemptId: attempt._id,
      planId: attempt.input.planId, parentVersionId: attempt.input.parentVersionId, feedback: attempt.input.feedback,
      input: attempt.input, storageId: args.storageId, sha256: args.sha256, contentType: args.contentType, width: args.width, height: args.height, bytes: args.bytes,
      provider: attempt.quotedProvider, model: attempt.quotedModel, ...(args.revisedPrompt !== undefined ? { revisedPrompt: args.revisedPrompt } : {}), createdAt: Date.now(),
    });
    await settleCharge(ctx, attempt, args, "completed", signature);
    await ctx.db.patch(attempt._id, { resultVersionId: versionId });
    const state = await visualState(ctx, attempt.postId);
    const post = await ctx.db.get(attempt.postId);
    if (state?.activeImageAttemptId === attempt._id) await ctx.db.patch(state._id, { activeImageAttemptId: undefined, updatedAt: Date.now() });
    const selectedWhenQueued = attempt.input.selectedVersionIdAtQueue ?? attempt.input.parentVersionId;
    let authorCanSelect = false;
    try { await ownedPost(ctx, attempt.userId, attempt.postId); authorCanSelect = true; } catch { /* Cost and bytes are retained; revoked actors do not select results. */ }
    const selection = attempt.input.selectionAtQueue;
    const sceneCurrent = !!(selection && state?.selectedPlanId === selection.planId && state.selectedSceneIndex === selection.sceneIndex && stableInputSignature(state.refinedScene ?? null) === selection.refinedSceneSignature);
    if (authorCanSelect && sceneCurrent && state?.activeImageAttemptId === attempt._id && (state.selectedVersionId ?? null) === selectedWhenQueued && post && articleSignature(post) === attempt.input.article.signature && !["published", "submitted", "pr-created"].includes(post.status)) {
      // Cost and immutable bytes are authoritative even when bounded selection invalidation is deferred.
      const intents = await ctx.db.query("v2PublishingIntents").withIndex("by_post_and_approval_state", q => q.eq("postId", attempt.postId).eq("approvalState", "approved")).take(513);
      if (intents.length > 512) {
        await ctx.db.patch(attempt._id, { error: "Result retained without selection: too many approved publishing intents; reconcile intents before selecting" });
        await ctx.db.patch(state._id, { activeImageAttemptId: undefined, updatedAt: Date.now() });
      } else {
        await clearFinalApproval(ctx, attempt.postId, intents);
        await ctx.db.patch(state._id, { selectedVersionId: versionId, activeImageAttemptId: undefined, relevanceReason: undefined, updatedAt: Date.now() });
      }
    }
    return versionId;
  },
});

export const selectVersion = mutation({
  args: { postId: v.id("v2Posts"), versionId: v.id("v2VisualVersions") }, returns: v.null(),
  handler: async (ctx, args) => {
    const post = await ownedPost(ctx, await requireUserId(ctx), args.postId);
    const version = await ctx.db.get(args.versionId);
    if (!version || version.postId !== post._id || version.userId !== post.userId) throw new Error("Version not found");
    const state = await visualState(ctx, post._id);
    if (!state) throw new Error("Visual state not found");
    if (state.selectedVersionId !== version._id) await clearFinalApproval(ctx, post._id);
    await ctx.db.patch(state._id, { selectedVersionId: version._id, relevanceReason: relevanceSignature(post) === relevanceSignature(version.input.article) ? undefined : "The selected version was created for a different article revision", updatedAt: Date.now() });
    return null;
  },
});

export const getVersionForExport = internalQuery({
  args: { userId: v.string(), versionId: v.id("v2VisualVersions") }, returns: visualVersionDocValidator,
  handler: async (ctx, args) => {
    if (await requireUserId(ctx) !== args.userId) throw new Error("Export actor does not match authenticated identity");
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Version not found");
    await ownedPost(ctx, args.userId, version.postId);
    return version;
  },
});

export const recordHeroExport = internalMutation({
  args: { userId: v.string(), versionId: v.id("v2VisualVersions"), sourceSha256: v.string(), exportStorageId: v.id("_storage"), exportHash: v.string(), exportMetadata: exportMetadataValidator }, returns: v.object({ exportStorageId: v.id("_storage"), exportHash: v.string(), exportMetadata: exportMetadataValidator, reused: v.boolean() }),
  handler: async (ctx, args) => {
    if (await requireUserId(ctx) !== args.userId) throw new Error("Export actor does not match authenticated identity");
    const version = await ctx.db.get(args.versionId);
    if (!version) throw new Error("Version not found");
    await ownedPost(ctx, args.userId, version.postId);
    requireCanonicalHash(args.sourceSha256);
    requireCanonicalHash(args.exportHash);
    if (version.sha256 !== args.sourceSha256) throw new Error("Hero export source has changed");
    await assertUnboundBlob(ctx, args.exportStorageId, version, version._id);
    assertSerializedBound(args.exportMetadata, 4000, "Hero export metadata");
    const metadata = await ctx.db.system.get(args.exportStorageId);
    if (!metadata || !storageHashMatches(metadata.sha256, args.exportHash) || metadata.size !== args.exportMetadata.bytes || (metadata.contentType !== undefined && metadata.contentType !== "image/webp")) throw new Error("Hero export bytes do not match metadata");
    if (args.exportMetadata.width !== 1600 || args.exportMetadata.height !== 900 || args.exportMetadata.bytes >= 150_000 || args.exportMetadata.bytes < 1 || !args.exportMetadata.crop.trim()) throw new Error("Hero export must be 1600×900 WebP under 150 KB with a recorded crop");
    const changed = version.exportHash !== args.exportHash || stableInputSignature(version.exportMetadata) !== stableInputSignature(args.exportMetadata);
    if (!changed && version.exportStorageId && version.exportHash && version.exportMetadata) {
      const retained = await ctx.db.system.get(version.exportStorageId);
      if (retained && storageHashMatches(retained.sha256, version.exportHash) && retained.size === version.exportMetadata.bytes && (retained.contentType === undefined || retained.contentType === "image/webp")) return { exportStorageId: version.exportStorageId, exportHash: version.exportHash, exportMetadata: version.exportMetadata, reused: true };
      await audit(ctx, { userId: args.userId, brandId: version.brandId, postId: version.postId, action: "visual-export-bytes-restored", summary: "Identical verified export bytes restored at a new storage ID; reviewed bytes and presentation remain approved", metadata: { versionId: version._id, previousStorageId: version.exportStorageId, restoredStorageId: args.exportStorageId, exportHash: args.exportHash } });
    }
    if (changed && (await visualState(ctx, version.postId))?.selectedVersionId === version._id) await clearFinalApproval(ctx, version.postId);
    await ctx.db.patch(version._id, { exportStorageId: args.exportStorageId, exportHash: args.exportHash, exportMetadata: args.exportMetadata,
      ...(changed ? { approvedAt: undefined, approvedBy: undefined, approvedAlt: undefined, approvedExportHash: undefined, approvedExportMetadataSignature: undefined, approvedArticleSignature: undefined, approvedRelevanceSignature: undefined } : {}),
    });
    return { exportStorageId: args.exportStorageId, exportHash: args.exportHash, exportMetadata: args.exportMetadata, reused: false };
  },
});

function reflectionContext(lineage: Doc<"v2VisualVersions">[], finalPresentation: { exportStorageId: Id<"_storage">; exportHash: string; exportMetadata: Doc<"v2VisualVersions">["exportMetadata"]; alt: string }, approvedArticle: Input["article"]) {
  return { approvedArticle, originalInput: lineage[0].input, lineage: lineage.map(item => ({ versionId: item._id, parentVersionId: item.parentVersionId, input: item.input, prompt: item.input.prompt, revisedPrompt: item.revisedPrompt ?? null, feedback: item.feedback, provider: item.provider, model: item.model, storageId: item.storageId, sha256: item.sha256 })), finalPresentation };
}

async function verifiedReflectionContext(ctx: QueryCtx | MutationCtx, attempt: Doc<"v2VisualAttempts">) {
  const reflection = await ctx.db.query("v2VisualReflections").withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
  if (!reflection || reflection.deferredReason || reflection.lineageComplete !== true || !reflection.originalVersionId || !reflection.contextBytes || !reflection.approvedAlt || reflection.lineageVersionIds.length < 2 || reflection.lineageVersionIds.length > 64) return null;
  if (!await reflectionCurrent(ctx, attempt)) return null;
  const lineage: Doc<"v2VisualVersions">[] = [];
  let documentBytes = 0;
  for (const versionId of reflection.lineageVersionIds) {
    const version = await ctx.db.get(versionId);
    if (!version || version.postId !== attempt.postId || version.userId !== attempt.userId || version.brandId !== attempt.brandId) return null;
    if ((!lineage.length && (version.parentVersionId !== null || version._id !== reflection.originalVersionId)) || (lineage.length && version.parentVersionId !== lineage[lineage.length - 1]._id)) return null;
    documentBytes += serializedUtf8Bytes(version);
    if (documentBytes > 4_000_000) return null;
    lineage.push(version);
  }
  const final = lineage[lineage.length - 1];
  if (final._id !== reflection.versionId || final.exportStorageId !== reflection.approvedExportStorageId || final.exportHash !== reflection.approvedExportHash || final.approvedAlt !== reflection.approvedAlt || stableInputSignature(final.exportMetadata) !== reflection.approvedExportMetadataSignature) return null;
  const context = stableInputSignature(reflectionContext(lineage, { exportStorageId: reflection.approvedExportStorageId, exportHash: reflection.approvedExportHash, exportMetadata: final.exportMetadata, alt: reflection.approvedAlt }, attempt.input.article));
  const contextBytes = new TextEncoder().encode(context).byteLength;
  if (contextBytes > 200_000 || contextBytes !== reflection.contextBytes) return null;
  return { context, contextBytes };
}

async function cancelStaleReflectionBatch(ctx: MutationCtx, postId: Id<"v2Posts">): Promise<void> {
  const queued = await ctx.db.query("v2VisualAttempts").withIndex("by_post_and_stage_and_status", q => q.eq("postId", postId).eq("stage", "reflection").eq("status", "queued")).take(9);
  let cancelled = 0;
  for (const attempt of queued.slice(0, 8)) if (!await reflectionCurrent(ctx, attempt)) { await cancelBeforeDispatch(ctx, attempt, "Reflection approval is stale"); cancelled++; }
  if (queued.length > 8 && cancelled) await ctx.scheduler.runAfter(0, internal.visualWorkflow.cancelStaleReflections, { postId });
}

/** Bounded release-only maintenance; never claims or dispatches provider work. */
export const cancelStaleReflections = internalMutation({
  args: { postId: v.id("v2Posts") }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => { await cancelStaleReflectionBatch(ctx, args.postId); return null; },
});

async function queueReflection(ctx: MutationCtx, post: Doc<"v2Posts">, version: Doc<"v2VisualVersions">) {
  const previous = await ctx.db.query("v2VisualReflections").withIndex("by_version", q => q.eq("versionId", version._id)).order("desc").take(8);
  const reviewedArticleSignature = articleSignature(post);
  const approvalSignature = await hashVisualBytes(new TextEncoder().encode(stableInputSignature({ versionId: version._id, exportStorageId: version.exportStorageId, exportHash: version.exportHash, exportMetadata: version.exportMetadata, alt: version.approvedAlt, articleSignature: reviewedArticleSignature })).buffer);
  const exactHistory = await ctx.db.query("v2VisualReflections").withIndex("by_version_and_approval_signature", q => q.eq("versionId", version._id).eq("approvalSignature", approvalSignature)).order("desc").take(2);
  // The digest index finds old exact approvals without an unbounded history scan.
  // Compare the full stored context too; legacy records retain the bounded recent fallback.
  for (const reflection of [...exactHistory, ...previous]) {
    if (reflection.approvedExportStorageId === version.exportStorageId && reflection.approvedExportHash === version.exportHash && reflection.approvedArticleSignature === reviewedArticleSignature && reflection.approvedAlt === version.approvedAlt && reflection.approvedExportMetadataSignature === stableInputSignature(version.exportMetadata)) {
      const attempt = await ctx.db.get(reflection.attemptId);
      if (attempt && ["queued", "running", "uncertain", "completed"].includes(attempt.status)) return;
    }
  }
  if (previous[0]) {
    const oldAttempt = await ctx.db.get(previous[0].attemptId);
    if (oldAttempt && !await reflectionCurrent(ctx, oldAttempt)) await cancelBeforeDispatch(ctx, oldAttempt, "Reflection approval is stale");
  }
  const lineage: Doc<"v2VisualVersions">[] = [];
  let cursor: Doc<"v2VisualVersions"> | null = version;
  const seen = new Set<string>();
  let deferredReason: string | undefined;
  let lineageDocumentBytes = 0;
  while (cursor) {
    if (seen.has(cursor._id) || cursor.postId !== post._id || cursor.userId !== post.userId || cursor.brandId !== post.brandId) { deferredReason = "invalid-reflection-lineage"; break; }
    lineageDocumentBytes += serializedUtf8Bytes(cursor);
    if (lineageDocumentBytes > 4_000_000) { deferredReason = "reflection-lineage-read-limit"; break; }
    if (lineage.length >= 64) { deferredReason = "reflection-lineage-too-long"; break; }
    seen.add(cursor._id);
    lineage.unshift(cursor);
    const parentId: Id<"v2VisualVersions"> | null = cursor.parentVersionId;
    cursor = parentId ? await ctx.db.get(parentId) : null;
    if (parentId && !cursor) deferredReason = "missing-reflection-lineage";
  }
  if (!lineage.some(item => item.feedback !== null)) return;
  const original = lineage[0];
  const reviewedArticle = { title: post.title, content: post.content, signature: reviewedArticleSignature };
  const contextBytes = new TextEncoder().encode(stableInputSignature(reflectionContext(lineage, { exportStorageId: version.exportStorageId!, exportHash: version.exportHash!, exportMetadata: version.exportMetadata, alt: version.approvedAlt! }, reviewedArticle))).byteLength;
  deferredReason ??= contextBytes > 200_000 ? "reflection-context-too-large" : undefined;
  // Prompts/feedback remain on immutable versions. Never duplicate or silently summarize the full lineage here.
  let input: Input = { ...original.input, article: reviewedArticle, provider: null, model: null, feedback: null,
    parentVersionId: version._id, parentStorageId: version.exportStorageId!,
    prompt: "Reflect on the exact immutable original input and ordered version lineage resolved through this reflection record. Distinguish missing original instructions from new preferences. Candidate prompts remain untested; lessons default to this post and profile changes remain proposals.",
  };
  if (serializedUtf8Bytes(input) > 200_000) {
    deferredReason = "reflection-input-too-large";
    // The exact reviewed article/presentation and full original input remain pinned on the record and versions.
    const placeholder = { title: "Deferred immutable reflection context", content: "" };
    input = { article: { ...placeholder, signature: articleSignature(placeholder) }, pins: { profileRevisionId: original.input.pins.profileRevisionId, referenceIds: [], lessonIds: [], postExceptionId: null }, references: [], scene: null, planId: original.planId, parentVersionId: version._id, parentStorageId: version.exportStorageId!, prompt: "Reflection deferred: resolve the exact original input, reviewed article signature, and full owned lineage from this immutable reflection record. No dispatch while deferred.", feedback: null, provider: null, model: null, size: original.input.size, outputFormat: original.input.outputFormat };
  }
  const attemptId = await queueAttempt(ctx, post, "reflection", `reflection:${version._id}:${version.exportStorageId}:${previous[0]?._id ?? "first"}`, input, deferredReason ?? "reflection-route-unqualified");
  const existing = await ctx.db.query("v2VisualReflections").withIndex("by_attempt", q => q.eq("attemptId", attemptId)).unique();
  if (!existing) await ctx.db.insert("v2VisualReflections", { userId: post.userId, brandId: post.brandId, postId: post._id, versionId: version._id, attemptId, approvalSignature, approvedExportStorageId: version.exportStorageId!, approvedExportHash: version.exportHash!, approvedAlt: version.approvedAlt!, approvedArticleSignature: reviewedArticleSignature, approvedExportMetadataSignature: stableInputSignature(version.exportMetadata), lineageVersionIds: lineage.map(item => item._id), ...(!deferredReason || ["reflection-context-too-large", "reflection-input-too-large"].includes(deferredReason) ? { originalVersionId: original._id } : {}), lineageComplete: !cursor && (!deferredReason || ["reflection-context-too-large", "reflection-input-too-large"].includes(deferredReason)), ...(cursor && ["reflection-lineage-read-limit", "reflection-lineage-too-long"].includes(deferredReason ?? "") ? { lineageResumeVersionId: cursor._id } : {}), contextBytes, ...(deferredReason ? { deferredReason } : {}), validationStatus: "untested", lessonIds: [], profileChangeProposals: [], createdAt: Date.now() });
}

export const getReflectionContext = internalQuery({
  args: { attemptId: v.id("v2VisualAttempts") }, returns: v.union(v.null(), v.object({ context: v.string(), contextBytes: v.number() })),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt || attempt.stage !== "reflection" || !await reflectionCurrent(ctx, attempt)) return null;
    return verifiedReflectionContext(ctx, attempt);
  },
});

const reflectedLessonValidator = v.object({
  title: v.string(), instruction: v.string(), role: v.union(v.literal("creative_director"), v.literal("image_generator")),
  sceneTags: v.array(v.string()), modelSpecific: v.boolean(), postSpecific: v.optional(v.boolean()),
});

export const completeReflection = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), claimKey: v.string(), candidatePrompt: v.string(), lessons: v.array(reflectedLessonValidator), profileChangeProposals: v.array(v.string()), ...usageArgs },
  returns: v.id("v2VisualReflections"),
  handler: async (ctx, args) => {
    assertSerializedBound(args, 100_000, "Serialized completion");
    const signature = stableInputSignature(args);
    const { attempt, duplicate, ownerReconciled } = await completionAttempt(ctx, args.attemptId, args.claimKey, signature);
    const reflection = await ctx.db.query("v2VisualReflections").withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).unique();
    if (attempt.stage !== "reflection" || !reflection) throw new Error("Attempt is not an approved lineage reflection");
    if (ownerReconciled) { if (!duplicate) await settleLateReceipt(ctx, attempt, args, signature); return reflection._id; }
    if (duplicate) return reflection._id;
    const final = await ctx.db.get(reflection.versionId);
    if (!await reflectionCurrent(ctx, attempt)) {
      await settleCharge(ctx, attempt, args, "failed", signature);
      await ctx.db.patch(attempt._id, { error: "Reflection approval is stale; charged outcome reconciled" });
      return reflection._id;
    }
    if (!final) throw new Error("Reflection version is unavailable");
    if (!args.candidatePrompt.trim() || args.candidatePrompt.length > 20_000 || args.lessons.length > 10 || args.profileChangeProposals.length > 10 || args.profileChangeProposals.some(proposal => !proposal.trim() || proposal.length > 4000)) throw new Error("Reflection output is incomplete or oversized");
    const lessonIds: Id<"v2VisualLessons">[] = [];
    for (const [i, lesson] of args.lessons.entries()) {
      if (!lesson.title.trim() || !lesson.instruction.trim() || lesson.title.length > 200 || lesson.instruction.length > 4000 || lesson.sceneTags.length > 20 || lesson.sceneTags.some(tag => !tag.trim() || tag.length > 80)) throw new Error("Reflection lesson is incomplete or oversized");
      lessonIds.push(await ctx.db.insert("v2VisualLessons", {
        brandId: reflection.brandId, key: `reflection:${reflection._id}:${i}`, revision: 1,
        role: lesson.role, sceneTags: lesson.sceneTags, modelScope: lesson.modelSpecific ? { provider: final.provider, model: final.model } : null,
        postId: reflection.postId, title: lesson.title.trim(), instruction: lesson.instruction.trim(),
        provenance: "reflection", sourceDocumentSha256: null, sourceRecord: `Reflection ${reflection._id}; approved export ${reflection.approvedExportHash}; lineage ${reflection.lineageVersionIds.join(",")}`,
        exampleArticles: [], evidence: [], validation: "untested", oneShotValidation: "not_tested", changesBrandProfile: false,
        createdBy: reflection.userId, createdAt: Date.now(),
      }));
    }
    await ctx.db.patch(reflection._id, { candidatePrompt: args.candidatePrompt.trim(), lessonIds, profileChangeProposals: args.profileChangeProposals });
    await settleCharge(ctx, attempt, args, "completed", signature);
    return reflection._id;
  },
});

export const approveHero = mutation({
  args: { postId: v.id("v2Posts"), versionId: v.id("v2VisualVersions"), alt: v.string(), expectedExportHash: v.string(), expectedExportMetadataSignature: v.string(), expectedArticleSignature: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedPost(ctx, userId, args.postId);
    if (articleSignature(post) !== args.expectedArticleSignature) throw new Error("Article changed; review the current revision");
    assertSerializedBound(args.expectedArticleSignature, 75_000, "Reviewed article signature");
    const state = await visualState(ctx, post._id);
    const version = await ctx.db.get(args.versionId);
    if (!version || version.postId !== post._id || state?.selectedVersionId !== version._id) throw new Error("Approve the currently selected hero version");
    if (!version.exportStorageId || !version.exportHash || !version.exportMetadata) throw new Error("Prepare the hero export before approval");
    if (version.exportHash !== args.expectedExportHash) throw new Error("Hero export changed; review the current preview");
    if (stableInputSignature(version.exportMetadata) !== args.expectedExportMetadataSignature) throw new Error("Hero presentation changed; review the current preview");
    if (args.alt.trim().length < 5 || args.alt.length > 1000) throw new Error("Descriptive hero alt text is required");
    const signature = relevanceSignature(post);
    if (signature !== relevanceSignature(version.input.article) && version.relevanceConfirmedSignature !== signature) throw new Error("Hero relevance review required");
    if (version.approvedAlt !== args.alt.trim() || version.approvedExportHash !== version.exportHash || version.approvedArticleSignature !== args.expectedArticleSignature) await clearFinalApproval(ctx, post._id);
    const approval = { approvedBy: userId, approvedAt: Date.now(), approvedAlt: args.alt.trim(), approvedExportHash: version.exportHash, approvedExportMetadataSignature: args.expectedExportMetadataSignature, approvedArticleSignature: args.expectedArticleSignature, approvedRelevanceSignature: signature };
    assertSerializedBound({ ...version, ...approval }, 750_000, "Serialized approved version");
    await ctx.db.patch(version._id, approval);
    await ctx.db.patch(state._id, { relevanceReason: undefined, updatedAt: Date.now() });
    await cancelStaleReflectionBatch(ctx, post._id);
    await queueReflection(ctx, post, { ...version, ...approval });
    return null;
  },
});

export const confirmRelevance = mutation({
  args: { postId: v.id("v2Posts"), versionId: v.id("v2VisualVersions"), expectedArticleSignature: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedPost(ctx, userId, args.postId);
    if (articleSignature(post) !== args.expectedArticleSignature) throw new Error("Article changed; review the current revision");
    assertSerializedBound(args.expectedArticleSignature, 75_000, "Reviewed article signature");
    const state = await visualState(ctx, post._id);
    const version = await ctx.db.get(args.versionId);
    if (!version || version.postId !== post._id || state?.selectedVersionId !== version._id) throw new Error("Confirm relevance of the selected hero version");
    if (version.relevanceConfirmedSignature !== relevanceSignature(post)) await clearFinalApproval(ctx, post._id);
    const confirmation = { relevanceConfirmedSignature: relevanceSignature(post), relevanceConfirmedBy: userId, relevanceReviewedArticleSignature: args.expectedArticleSignature };
    assertSerializedBound({ ...version, ...confirmation }, 750_000, "Serialized reviewed version");
    await ctx.db.patch(version._id, confirmation);
    await ctx.db.patch(state._id, { relevanceReason: undefined, updatedAt: Date.now() });
    return null;
  },
});

/** Called by final post approval and again when deriving the publication bytes. */
export async function assertCurrentVisuals(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">) {
  const state = await visualState(ctx, post._id);
  if (!state) return null; // Additive migration: legacy posts remain on the existing metadata path.
  const version = state.selectedVersionId ? await ctx.db.get(state.selectedVersionId) : null;
  if (!version || version.postId !== post._id) throw new Error("Select a hero before final post approval");
  if (!version.approvedAt || !version.approvedBy || !version.approvedAlt || !version.exportStorageId || !version.exportHash || version.approvedExportHash !== version.exportHash || !version.exportMetadata || version.approvedExportMetadataSignature !== stableInputSignature(version.exportMetadata)) throw new Error("Selected hero version is not approved");
  const signature = relevanceSignature(post);
  if (version.approvedRelevanceSignature !== signature && version.relevanceConfirmedSignature !== signature) throw new Error("Hero relevance review required");
  const storage = await ctx.db.system.get(version.exportStorageId);
  if (!storage || !storageHashMatches(storage.sha256, version.exportHash) || storage.size !== version.exportMetadata.bytes) throw new Error("Approved hero bytes are missing or changed");
  return version;
}

/** Publishing owns content edits; use this after it computes the new title/content. */
export async function onArticleChange(ctx: MutationCtx, post: Doc<"v2Posts">, after: { title: string; content: string }) {
  const state = await visualState(ctx, post._id);
  if (!state?.selectedVersionId) return;
  const version = await ctx.db.get(state.selectedVersionId);
  if (!version) return;
  const signature = relevanceSignature(after);
  const current = signature === (version.approvedRelevanceSignature ?? relevanceSignature(version.input.article)) || signature === version.relevanceConfirmedSignature;
  await ctx.db.patch(state._id, { relevanceReason: current ? undefined : "The article thesis, metaphor, key claims, or another unclassified content change requires hero relevance review", updatedAt: Date.now() });
}

export async function buildPublicationVisuals(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">) {
  const version = await assertCurrentVisuals(ctx, post);
  if (!version) return null;
  const attempt = await ctx.db.get(version.attemptId);
  const quote = attempt?.quoteId ? await ctx.db.get(attempt.quoteId) : null;
  if (!attempt || !quote || attempt.status !== "completed" || attempt.resultVersionId !== version._id || attempt.userId !== version.userId || attempt.brandId !== version.brandId || attempt.postId !== version.postId || stableInputSignature(version.input) !== attempt.inputSignature || quote.attemptId !== attempt._id || quote.inputSignature !== attempt.inputSignature || quote.provider !== version.provider || quote.model !== version.model || quote.provenance !== attempt.quoteProvenance || !quote.boundVerified) throw new Error("Approved hero provider provenance is unavailable or inconsistent");
  const url = await ctx.storage.getUrl(version.exportStorageId!);
  if (!url) throw new Error("Approved hero bytes are missing");
  return { hero: { versionId: version._id, storageId: version.exportStorageId!, sha256: version.exportHash!, alt: version.approvedAlt!, metadata: version.exportMetadata!, approvedBy: version.approvedBy!, approvedAt: version.approvedAt!, provider: version.provider, model: version.model, quoteProvenance: quote.provenance, qualification: quote.qualification, url }, articleSignature: articleSignature(post) };
}

export const getPublicationVisuals = query({
  args: { postId: v.id("v2Posts") }, returns: publicationVisualsValidator,
  handler: async (ctx, args) => {
    const post = await ownedPost(ctx, await requireUserId(ctx), args.postId, false);
    return buildPublicationVisuals(ctx, post);
  },
});

async function queueAttempt(ctx: MutationCtx, post: Doc<"v2Posts">, stage: Stage, operationKey: string, input: Input, pauseReason: string) {
  if (!operationKey.trim() || operationKey.length > (stage === "reflection" ? 512 : 120)) throw new Error("Invalid operation key");
  assertSerializedBound(input, 200_000, "Serialized visual input");
  const inputSignature = stableInputSignature(input);
  const previous = await ctx.db.query("v2VisualAttempts").withIndex("by_post_and_stage_and_operation_key", q => q.eq("postId", post._id).eq("stage", stage).eq("operationKey", operationKey)).unique();
  if (previous) {
    if (previous.inputSignature !== inputSignature) throw new Error("Operation key already used with different inputs");
    return previous._id;
  }
  const blocker = await stageBlocker(ctx, post._id, stage);
  if (blocker && stage !== "reflection") throw new Error(blocker.status === "uncertain" ? "Reconciliation required before another stage attempt" : "This workflow stage is already running");
  if (blocker) pauseReason = "reconciliation-required-or-stage-running";
  const now = Date.now();
  const fields = { userId: post.userId, brandId: post.brandId, postId: post._id, stage, operationKey, inputSignature, input, status: "queued" as const, pauseReason, createdAt: now, updatedAt: now };
  assertSerializedBound(fields, 750_000, "Serialized visual attempt");
  return ctx.db.insert("v2VisualAttempts", fields);
}

async function planningInput(ctx: MutationCtx, userId: string, post: Doc<"v2Posts">): Promise<Input> {
  const profile = await resolveVisualProfileForPost(ctx, userId, post._id, { role: "creative_director", sceneTags: ["scene_selection"] });
  if (!profile) throw new Error("Configure a visual profile before planning");
  return {
    article: { title: post.title, content: post.content, signature: articleSignature(post) },
    pins: { profileRevisionId: profile.profileRevisionId, referenceIds: profile.referenceIds, lessonIds: profile.lessonIds, postExceptionId: profile.postExceptionId },
    references: profile.references.map(ref => ({ referenceId: ref.referenceId, storageId: ref.storageId, role: ref.role, sha256: ref.sha256 })),
    scene: null, planId: null, parentVersionId: null, parentStorageId: null,
    prompt: `Propose exactly three materially distinct visible stories grounded in this saved article.\n${profileInstructions(profile.revision, profile.postException, profile.lessons)}\nTitle: ${post.title}\nArticle:\n${post.content}`,
    feedback: null, provider: null, model: null, size: "1536x1024", outputFormat: "webp",
  };
}

export const requestPlan = mutation({
  args: { postId: v.id("v2Posts"), operationKey: v.string() },
  returns: v.id("v2VisualAttempts"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedPost(ctx, userId, args.postId);
    const attemptId = await queueAttempt(ctx, post, "planning", args.operationKey, await planningInput(ctx, userId, post), "planning-route-unqualified");
    if (!await visualState(ctx, post._id)) {
      await ctx.db.insert("v2VisualStates", { userId: post.userId, brandId: post.brandId, postId: post._id, updatedAt: Date.now() });
      await clearFinalApproval(ctx, post._id);
    }
    return attemptId;
  },
});

const versionWithUrlsValidator = v.object({ ...visualVersionDocValidator.fields, url: v.union(v.null(), v.string()), exportUrl: v.union(v.null(), v.string()) });
async function versionWithUrls(ctx: QueryCtx, version: Doc<"v2VisualVersions">) {
  return { ...version, url: await ctx.storage.getUrl(version.storageId), exportUrl: version.exportStorageId ? await ctx.storage.getUrl(version.exportStorageId) : null };
}

export const getVersionHistory = query({
  args: { postId: v.id("v2Posts"), cursor: v.union(v.null(), v.string()) }, returns: v.object({ page: v.array(versionWithUrlsValidator), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const post = await ownedPost(ctx, await requireUserId(ctx), args.postId, false);
    const page = await ctx.db.query("v2VisualVersions").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").paginate({ cursor: args.cursor, numItems: 10 });
    return { isDone: page.isDone, continueCursor: page.continueCursor, page: await Promise.all(page.page.map(version => versionWithUrls(ctx, version))) };
  },
});

export const get = query({
  args: { postId: v.id("v2Posts") },
  returns: v.object({ articleSignature: v.string(), state: v.union(v.null(), visualStateDocValidator), attempts: v.array(visualAttemptDocValidator), plans: v.array(visualPlanDocValidator), versions: v.array(versionWithUrlsValidator), reflections: v.array(visualReflectionDocValidator), budget: v.union(v.null(), visualBudgetDocValidator), month: v.union(v.null(), visualBudgetMonthDocValidator) }),
  handler: async (ctx, args) => {
    const post = await ownedPost(ctx, await requireUserId(ctx), args.postId, false);
    const state = await visualState(ctx, post._id);
    const [attempts, plans, versions, reflections, budget] = await Promise.all([
      ctx.db.query("v2VisualAttempts").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").take(8),
      ctx.db.query("v2VisualPlans").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").take(4),
      ctx.db.query("v2VisualVersions").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").take(8),
      ctx.db.query("v2VisualReflections").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").take(4),
      ctx.db.query("v2VisualBudgets").withIndex("by_brand", q => q.eq("brandId", post.brandId)).unique(),
    ]);
    const month = await ctx.db.query("v2VisualBudgetMonths").withIndex("by_brand_and_month", q => q.eq("brandId", post.brandId).eq("month", monthNow())).unique();
    if (state?.selectedVersionId && !versions.some(version => version._id === state.selectedVersionId)) {
      const selected = await ctx.db.get(state.selectedVersionId);
      if (!selected || selected.postId !== post._id || selected.userId !== post.userId || selected.brandId !== post.brandId) throw new Error("Selected hero is unavailable");
      versions.push(selected);
    }
    if (state?.activeImageAttemptId && !attempts.some(attempt => attempt._id === state.activeImageAttemptId)) {
      const active = await ctx.db.get(state.activeImageAttemptId);
      if (!active || active.postId !== post._id || active.userId !== post.userId || active.brandId !== post.brandId) throw new Error("Active visual attempt is unavailable");
      attempts.push(active);
    }
    const withUrls = await Promise.all(versions.map(version => versionWithUrls(ctx, version)));
    return { articleSignature: articleSignature(post), state, attempts: attempts.map(attempt => { const safe = { ...attempt }; delete safe.claimKey; return safe; }), plans, versions: withUrls, reflections, budget, month };
  },
});

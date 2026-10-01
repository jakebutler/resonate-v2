"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./campaignAccess";
import type { Doc, Id } from "./_generated/dataModel";
import { prepareTextRequest, dispatchTextRequest, visualTextCredential, parsePlanningOutput, parseReflectionOutput, type ApprovedReflectionImage } from "../lib/visualTextRuntime";

import { verifyVisualOutput } from "../lib/visualProviderRuntime";

type Result = { status: "completed" | "blocked" | "uncertain"; planId: Id<"v2VisualPlans"> | null; reflectionId: Id<"v2VisualReflections"> | null; reason: string | null };
const blocked = (reason: string): Result => ({ status: "blocked", planId: null, reflectionId: null, reason });

const resultValidator = v.object({ status: v.union(v.literal("completed"), v.literal("blocked"), v.literal("uncertain")), planId: v.union(v.null(), v.id("v2VisualPlans")), reflectionId: v.union(v.null(), v.id("v2VisualReflections")), reason: v.union(v.null(), v.string()) });

async function execute(ctx: ActionCtx, args: { attemptId: Id<"v2VisualAttempts"> }, userId: string, trustedReflectionScheduler = false): Promise<Result> {
    let attempt: Doc<"v2VisualAttempts">;
    try { attempt = await ctx.runQuery(internal.visualWorkflow.getAttemptForDispatch, { userId, attemptId: args.attemptId, expectedStages: trustedReflectionScheduler ? ["reflection"] : ["planning", "reflection"], ...(trustedReflectionScheduler ? { trustedReflectionScheduler: true } : {}) }); }
    catch (error) {
      if (error instanceof Error && error.message === "Pinned image parent bytes changed") return blocked("approved-reflection-image-unavailable-or-invalid");
      throw error;
    }
    if (attempt.stage !== "planning" && attempt.stage !== "reflection") return blocked("unsupported-text-stage");
    if (attempt.status !== "queued") return blocked(attempt.status === "uncertain" ? "reconciliation-required" : "attempt-not-queued");
    const routes: Doc<"v2VisualTextRoutes">[] = await ctx.runQuery(internal.visualTextConfig.getReviewedTextRoutes, { stage: attempt.stage });
    if (!routes.length) return blocked("no-qualified-text-route-and-cost-bound");
    const eligible = routes.map(route => ({ route, key: visualTextCredential(route.provider) })).find(item => item.key);
    if (!eligible) return blocked("text-credential-unavailable");
    const { route, key } = eligible;
    const reflectionContext: { context: string; approvedImage: ApprovedReflectionImage } | null = attempt.stage === "reflection" ? await ctx.runQuery(internal.visualWorkflow.getReflectionContext, { attemptId: attempt._id }) : null;
    let pixels: Uint8Array | undefined;
    if (attempt.stage === "reflection") {
      if (!reflectionContext) return blocked("approved-reflection-context-unavailable-or-stale");
      try {
        const image = reflectionContext.approvedImage;
        const blob = await ctx.storage.get(image.storageId as Id<"_storage">);
        if (!blob || blob.type !== image.contentType || blob.size !== image.bytes || blob.size >= 150_000) throw new Error("Approved export missing or changed");
        pixels = new Uint8Array(await blob.arrayBuffer());
        const verified = await verifyVisualOutput(pixels, blob.type);
        if (verified.sha256 !== image.sha256 || verified.bytes !== image.bytes || verified.width !== image.width || verified.height !== image.height) throw new Error("Approved export decode changed");
      } catch { return blocked("approved-reflection-image-unavailable-or-invalid"); }
    }
    let prepared;
    try { prepared = await prepareTextRequest({ ...attempt, stage: attempt.stage }, route, reflectionContext?.context, reflectionContext ? { identity: reflectionContext.approvedImage, bytes: pixels } : undefined); }
    catch { return blocked("reviewed-text-input-or-context-bound-exceeded"); }
    const quoteId = await ctx.runMutation(internal.visualTextConfig.registerTextDispatchQuote, { attemptId: attempt._id, routeId: route._id, requestSha256: prepared.requestSha256, userId, ...(trustedReflectionScheduler ? { trustedReflectionScheduler: true } : {}) });
    if (!quoteId) return blocked("attempt-already-claimed-or-stale");
    const reservation = await ctx.runMutation(internal.visualWorkflow.reserveAttempt, { attemptId: attempt._id, quoteId });
    if (!reservation.admitted) return blocked(reservation.reason ?? "budget-admission-denied");
    const claim = await ctx.runMutation(internal.visualWorkflow.claimAttempt, { attemptId: attempt._id, expectedRequestSha256: prepared.requestSha256 });
    if (!claim) return blocked("attempt-already-claimed-or-stale");
    let receipt: string | undefined;
    try {
      const claimed = await prepareTextRequest({ _id: claim.attemptId, stage: attempt.stage, input: claim.input }, route, claim.reflectionContext, claim.approvedReflectionImage ? { identity: claim.approvedReflectionImage, bytes: pixels } : undefined);
      if (claimed.requestSha256 !== prepared.requestSha256) throw new Error("Claimed text context changed");
      const result = await dispatchTextRequest(claimed, claim, key!, bytes => verifyVisualOutput(bytes, "image/webp"));
      receipt = result.receipt;
      if (result.status === "uncertain") {
        await ctx.runMutation(internal.visualWorkflow.markUncertain, { attemptId: attempt._id, claimKey: claim.claimKey, reason: result.reason, ...(receipt ? { usageReceipt: receipt } : {}) });
        return { status: "uncertain", planId: null, reflectionId: null, reason: result.reason };
      }
      const usage = { actualMicros: result.actualMicros, usageKind: "estimated" as const, usageReceipt: result.receipt };
      if (attempt.stage === "planning") {
        let scenes;
        try { scenes = parsePlanningOutput(result.output); } catch {
          await ctx.runMutation(internal.visualWorkflow.failAttempt, { attemptId: attempt._id, claimKey: claim.claimKey, reason: "Text plan output failed strict schema validation", ...usage });
          return { status: "completed", planId: null, reflectionId: null, reason: "text-plan-schema-invalid" };
        }
        const planId: Id<"v2VisualPlans"> | null = await ctx.runMutation(internal.visualWorkflow.completePlan, { attemptId: attempt._id, claimKey: claim.claimKey, scenes, ...usage });
        return { status: "completed", planId, reflectionId: null, reason: null };
      }
      let reflection;
      try { reflection = parseReflectionOutput(result.output); } catch {
        await ctx.runMutation(internal.visualWorkflow.failAttempt, { attemptId: attempt._id, claimKey: claim.claimKey, reason: "Text reflection output failed strict schema validation", ...usage });
        return { status: "completed", planId: null, reflectionId: null, reason: "text-reflection-schema-invalid" };
      }
      const reflectionId: Id<"v2VisualReflections"> = await ctx.runMutation(internal.visualWorkflow.completeReflection, { attemptId: attempt._id, claimKey: claim.claimKey, ...reflection, ...usage });
      return { status: "completed", planId: null, reflectionId, reason: null };
    } catch {
      try { await ctx.runMutation(internal.visualWorkflow.markUncertain, { attemptId: attempt._id, claimKey: claim.claimKey, reason: "text-completion-requires-reconciliation", ...(receipt ? { usageReceipt: receipt } : {}) }); } catch { /* Completion may already have committed; no automatic retry. */ }
      return { status: "uncertain", planId: null, reflectionId: null, reason: "text-completion-requires-reconciliation" };
    }
}

export const executeTextAttempt = action({
  args: { attemptId: v.id("v2VisualAttempts") }, returns: resultValidator,
  handler: async (ctx, args): Promise<Result> => execute(ctx, args, await requireUserId(ctx)),
});

/** Only the trusted approval mutation schedules this exact owned reflection actor/attempt. */
export const executeQueuedReflection = internalAction({
  args: { attemptId: v.id("v2VisualAttempts"), userId: v.string() }, returns: resultValidator,
  handler: async (ctx, args): Promise<Result> => execute(ctx, args, args.userId, true),
});

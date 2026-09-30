"use node";

import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./campaignAccess";
import type { Doc, Id } from "./_generated/dataModel";
import { prepareTextRequest, dispatchTextRequest, visualTextCredential, parsePlanningOutput, parseReflectionOutput } from "../lib/visualTextRuntime";

type Result = { status: "completed" | "blocked" | "uncertain"; planId: Id<"v2VisualPlans"> | null; reflectionId: Id<"v2VisualReflections"> | null; reason: string | null };
const blocked = (reason: string): Result => ({ status: "blocked", planId: null, reflectionId: null, reason });

const resultValidator = v.object({ status: v.union(v.literal("completed"), v.literal("blocked"), v.literal("uncertain")), planId: v.union(v.null(), v.id("v2VisualPlans")), reflectionId: v.union(v.null(), v.id("v2VisualReflections")), reason: v.union(v.null(), v.string()) });

async function execute(ctx: ActionCtx, args: { attemptId: Id<"v2VisualAttempts"> }, userId: string, trustedReflectionScheduler = false): Promise<Result> {
    const attempt: Doc<"v2VisualAttempts"> = await ctx.runQuery(internal.visualWorkflow.getAttemptForDispatch, { userId, attemptId: args.attemptId, expectedStages: trustedReflectionScheduler ? ["reflection"] : ["planning", "reflection"], ...(trustedReflectionScheduler ? { trustedReflectionScheduler: true } : {}) });
    if (attempt.stage !== "planning" && attempt.stage !== "reflection") return blocked("unsupported-text-stage");
    if (attempt.status !== "queued") return blocked(attempt.status === "uncertain" ? "reconciliation-required" : "attempt-not-queued");
    const routes: Doc<"v2VisualTextRoutes">[] = await ctx.runQuery(internal.visualTextConfig.getReviewedTextRoutes, { stage: attempt.stage });
    if (!routes.length) return blocked("no-qualified-text-route-and-cost-bound");
    const eligible = routes.map(route => ({ route, key: visualTextCredential(route.provider) })).find(item => item.key);
    if (!eligible) return blocked("text-credential-unavailable");
    const { route, key } = eligible;
    const reflectionContext: { context: string } | null = attempt.stage === "reflection" ? await ctx.runQuery(internal.visualWorkflow.getReflectionContext, { attemptId: attempt._id }) : null;
    let prepared;
    try { prepared = await prepareTextRequest({ ...attempt, stage: attempt.stage }, route, reflectionContext?.context); }
    catch { return blocked("reviewed-text-input-or-context-bound-exceeded"); }
    const quoteId = await ctx.runMutation(internal.visualTextConfig.registerTextDispatchQuote, { attemptId: attempt._id, routeId: route._id, requestSha256: prepared.requestSha256, userId, ...(trustedReflectionScheduler ? { trustedReflectionScheduler: true } : {}) });
    const reservation = await ctx.runMutation(internal.visualWorkflow.reserveAttempt, { attemptId: attempt._id, quoteId });
    if (!reservation.admitted) return blocked(reservation.reason ?? "budget-admission-denied");
    const claim = await ctx.runMutation(internal.visualWorkflow.claimAttempt, { attemptId: attempt._id, expectedRequestSha256: prepared.requestSha256 });
    if (!claim) return blocked("attempt-already-claimed-or-stale");
    let receipt: string | undefined;
    try {
      const claimed = await prepareTextRequest({ _id: claim.attemptId, stage: attempt.stage, input: claim.input }, route, claim.reflectionContext);
      if (claimed.requestSha256 !== prepared.requestSha256) throw new Error("Claimed text context changed");
      const result = await dispatchTextRequest(claimed, claim, key!);
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

"use node";

import type {Id} from "./_generated/dataModel";
import { v } from "convex/values";
import { type BufferRequestBudget, BufferRequestBudgetError } from "../lib/bufferContracts";
import { brandIdValidator } from "./campaignAccess";
import {readBufferQueue} from "../lib/readBufferQueue";
import {destinationHold,destinationIdentity,type BufferDestination} from "../lib/bufferContracts";
import { resolveBufferLinkedInChannelId } from "../lib/providerAdapters";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import {
  bufferProviderAdapter,
  type ProviderResult,
} from "../lib/providerAdapters";
import { requireUserId as requireActionUserId } from "./campaignAccess";

function isFlagApproved(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "approved" || normalized === "true" || normalized === "1";
}

function bufferAdapterContext(requestBudget?:BufferRequestBudget) {
  return {
    requestBudget,
    env: {
      BUFFER_API_KEY: process.env.BUFFER_API_KEY,
      BUFFER_LIVE_SUBMISSION: process.env.BUFFER_LIVE_SUBMISSION,
      LIVE_PROVIDER_VALIDATION_APPROVED: process.env.LIVE_PROVIDER_VALIDATION_APPROVED,
    },
    liveProviderValidationApproved: isFlagApproved(
      process.env.LIVE_PROVIDER_VALIDATION_APPROVED
    ),
  };
}

function isBufferLiveGateOn() {
  return process.env.BUFFER_LIVE_SUBMISSION === "approved";
}

function providerFailureFromError(_error: unknown): ProviderResult {
  if (_error instanceof BufferRequestBudgetError) return {ok:false,status:"retryable-failure",providerStateStatus:"needs-review",reason:"Provider request budget reached before dispatch; refresh and review again.",sanitizedResponse:{providerId:"buffer",phase:"preflight",dispatched:false}};
  return {ok:false,status:"ambiguous",providerStateStatus:"needs-review",reason:"Provider call did not return a definitive receipt; reconcile before retrying.",sanitizedResponse:{providerId:"buffer",outcome:"uncertain"}};
}

type SubmitResult = {
  submitted: boolean;
  liveGateOff: boolean;
  reason?: string;
  attemptId?: string;
  providerPostId?: string;
  deliveryStatus?: ProviderResult["providerStateStatus"];
};
export async function executeBufferSubmit(
  ctx: ActionCtx,
  args: {
    postId: Id<"v2Posts">;
    retry?: boolean;
    reviewRowId?: Id<"queueReleaseRows">;
    runId?: string;
  },
  userId: string,
  budget: BufferRequestBudget = { remaining: 20 },
): Promise<SubmitResult> {
  if (!isBufferLiveGateOn()) {
    return {
      submitted: false,
      liveGateOff: true,
      reason:
        "Buffer live submission requires BUFFER_LIVE_SUBMISSION=approved.",
    };
  }

  if (
    !isFlagApproved(process.env.LIVE_PROVIDER_VALIDATION_APPROVED) ||
    !process.env.BUFFER_API_KEY?.trim()
  )
    return {
      submitted: false,
      liveGateOff: true,
      reason:
        "Live provider validation approval and configured server credential are required.",
    };
  const control = await ctx.runQuery(internal.bufferDelivery.control, {});
  if ((control?.backoffUntil ?? 0) > Date.now())
    return {
      submitted: false,
      liveGateOff: false,
      reason: "Buffer API backoff is active; wait and prepare a fresh review.",
    };
  const claimed = await ctx.runMutation(
    internal.publishing.claimBufferSubmission,
    {
      postId: args.postId,
      userId,
      retry: args.retry,
      reviewRowId: args.reviewRowId,
      runId: args.runId,
    },
  );

  if (!claimed.eligible) {
    if ("brandId" in claimed && claimed.brandId) {
      await ctx.runMutation(internal.publishing.auditBufferSkip, {
        postId: args.postId,
        userId,
        brandId: claimed.brandId,
        intentId: "intentId" in claimed ? claimed.intentId : undefined,
        reason: claimed.reason,
      });
    }
    return {
      submitted: false,
      liveGateOff: false,
      reason: claimed.reason,
    };
  }

  let result: ProviderResult;
  try {
    result = await bufferProviderAdapter.submit(claimed.submission, {
      ...bufferAdapterContext(budget),
      beforeCreate: () =>
        ctx.runMutation(internal.publishing.revalidateBufferClaim, {
          attemptId: claimed.attemptId,
          userId,
        }),
    });
  } catch (error) {
    result = providerFailureFromError(error);
  }

  if (result.providerPostId?.startsWith("mock-"))
    result = {
      ...result,
      ok: false,
      status: "ambiguous",
      providerStateStatus: "needs-review",
      reason:
        "Provider identifier is simulated; no real queued delivery is verified.",
    };
  if (budget.backoffUntil)
    await ctx.runMutation(internal.bufferDelivery.recordBackoff, {
      backoffUntil: budget.backoffUntil,
    });
  let recorded;
  try {
    recorded = await ctx.runMutation(
      internal.publishing.recordBufferSubmitResult,
      {
        postId: args.postId,
        userId,
        intentId: claimed.intentId,
        brandId: claimed.brandId,
        attemptId: claimed.attemptId,
        idempotencyKey: claimed.idempotencyKey,
        retryCount: claimed.retryCount,
        submissionSnapshot: {
          postId: claimed.submission.postId,
          brandId: claimed.submission.brandId,
          channelId: claimed.submission.channelId,
          title: claimed.submission.title,
          content: claimed.submission.content,
          firstComment: claimed.submission.firstComment,
          scheduledDate: claimed.submission.scheduledDate,
          scheduledTime: claimed.submission.scheduledTime,
          timezone: claimed.submission.timezone,
        },
        ok: result.ok,
        status: result.status,
        providerStateStatus: result.providerStateStatus,
        providerPostId: result.providerPostId,
        reason: result.reason,
        sanitizedResponse: result.sanitizedResponse,
      },
    );
  } catch {
    try {
      await ctx.runMutation(internal.publishing.markDispatchUncertain, {
        attemptId: claimed.attemptId,
        userId,
        providerPostId: result.providerPostId,
        receipt: result.sanitizedResponse,
      });
    } catch {
      /* The initial pending claim remains durable; never replay the create. */
    }
    return {
      submitted: false,
      liveGateOff: false,
      attemptId: claimed.attemptId,
      providerPostId: result.providerPostId,
      reason:
        "Receipt persistence is uncertain; reconcile the retained attempt before retrying.",
    };
  }

  return {
    submitted: recorded.submitted,
    liveGateOff: false,
    attemptId: recorded.attemptId,
    providerPostId: result.providerPostId,
    deliveryStatus: result.providerStateStatus,
    reason: recorded.submitted
      ? undefined
      : recorded.stale
        ? "Approval or content changed while Buffer submission was in flight."
        : result.reason,
  };
}
export const submit = action({
  args: { postId: v.id("v2Posts"), retry: v.optional(v.boolean()) },
  returns: v.object({
    submitted: v.boolean(),
    liveGateOff: v.boolean(),
    reason: v.optional(v.string()),
    attemptId: v.optional(v.string()),
    providerPostId: v.optional(v.string()),
    deliveryStatus: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<SubmitResult> =>
    executeBufferSubmit(ctx, args, await requireActionUserId(ctx)),
});

export const cancelOrUnpublish = action({
  args: {
    postId: v.id("v2Posts"),
    intentType: v.union(v.literal("cancel"), v.literal("unpublish")),
  },
  handler: async (ctx, args): Promise<{
    recorded: boolean;
    liveGateOff: boolean;
    ok?: boolean;
    reason?: string;
  }> => {
    const userId = await requireActionUserId(ctx);

    if (!isBufferLiveGateOn()) {
      return {
        recorded: false,
        liveGateOff: true,
        reason: "Buffer live submission requires BUFFER_LIVE_SUBMISSION=approved.",
      };
    }

    const prepared = await ctx.runQuery(internal.publishing.getBufferCancelContext, {
      postId: args.postId,
      userId,
    });

    if (!prepared.eligible) {
      return {
        recorded: false,
        liveGateOff: false,
        reason: prepared.reason,
      };
    }

    let result: ProviderResult;
    try {
      result = await bufferProviderAdapter.recordCancelOrUnpublishIntent(
        {
          postId: String(args.postId),
          brandId: prepared.brandId,
          channelId: prepared.channelId,
          title: prepared.title,
          content: prepared.content,
          scheduledDate: prepared.scheduledDate,
          scheduledTime: prepared.scheduledTime,
          timezone: prepared.timezone,
          idempotencyKey: `${prepared.intentId}:buffer:${args.intentType}`,
          providerPostId: prepared.providerPostId,
        },
        args.intentType,
        bufferAdapterContext()
      );
    } catch (error) {
      result = providerFailureFromError(error);
    }

    const receipt=await ctx.runMutation(internal.publishing.recordBufferCancelResult, {
      postId: args.postId,
      userId,
      intentId: prepared.intentId,
      brandId: prepared.brandId,
      intentType: args.intentType,
      ok: result.ok,
      providerStateStatus: result.providerStateStatus,
      providerPostId: result.providerPostId ?? prepared.providerPostId,
      reason: result.reason,
      sanitizedResponse: result.sanitizedResponse,
    });

    return {
      recorded: true,
      ok: receipt.ok,
      liveGateOff: false,
      reason: result.ok ? undefined : result.reason,
    };
  },
});

/** Existing hourly cron target: oldest checked first; request budget and persisted backoff. */
export const refreshSubmittedStatuses = internalAction({
  args:{},returns:v.object({refreshed:v.number()}),handler:async(ctx):Promise<{refreshed:number}>=>{
    if(!isBufferLiveGateOn()||!await ctx.runMutation(internal.bufferDelivery.claimPoll,{}))return {refreshed:0};
    const budget:BufferRequestBudget={remaining:Math.min(20,Math.max(1,Number(process.env.BUFFER_POLL_REQUEST_BUDGET)||6))};const context=bufferAdapterContext(budget);let refreshed=0;
    try {
      const states=await ctx.runQuery(internal.bufferDelivery.oldestActive,{limit:Math.min(50,budget.remaining)});
      for(const state of states){if(budget.remaining<=0||(budget.backoffUntil??0)>Date.now())break;
        if(state.status==="cancel-intent-recorded"){await ctx.runMutation(internal.bufferDelivery.reconcileLegacyCancellation,{providerStateId:state._id});continue;}
        const checkedAt=Date.now();let result:ProviderResult;
        try{result=await bufferProviderAdapter.refreshStatus(state.providerPostId!,context);}catch(error){if(error instanceof BufferRequestBudgetError)break;result=providerFailureFromError(error);}
        await ctx.runMutation(internal.publishing.recordBufferStatusRefresh,{providerStateId:state._id,postId:state.postId,providerStateStatus:result.providerStateStatus,providerPostId:state.providerPostId,expectedAttemptId:state.lastAttemptId,checkedAt,ok:result.ok,sanitizedResponse:result.sanitizedResponse});if(result.ok)refreshed++;
      }
    }finally{await ctx.runMutation(internal.bufferDelivery.finishPoll,{backoffUntil:budget.backoffUntil});}
    return {refreshed};
  },
});
export const refreshStatus = action({args:{postId:v.id("v2Posts")},returns:v.any(),handler:async(ctx,args):Promise<{updated:boolean;reason?:string}>=>{
  const userId=await requireActionUserId(ctx);const state: import("./_generated/dataModel").Doc<"v2ProviderStates"> = await ctx.runQuery(internal.bufferDelivery.refreshContext,{...args,userId});
  if(!isBufferLiveGateOn())return {updated:false,reason:"Live provider gate is off."};
  if(!await ctx.runMutation(internal.bufferDelivery.claimPoll,{}))return {updated:false,reason:"Provider check is already running or rate limited; wait before checking again."};
  const budget:BufferRequestBudget={remaining:1};try{
    if(state.status==="cancel-intent-recorded")return {updated:await ctx.runMutation(internal.bufferDelivery.reconcileLegacyCancellation,{providerStateId:state._id})};
    const checkedAt=Date.now();let result:ProviderResult;try{result=await bufferProviderAdapter.refreshStatus(state.providerPostId!,bufferAdapterContext(budget));}catch(error){result=providerFailureFromError(error);}
    return await ctx.runMutation(internal.publishing.recordBufferStatusRefresh,{providerStateId:state._id,postId:state.postId,providerStateStatus:result.providerStateStatus,providerPostId:state.providerPostId,expectedAttemptId:state.lastAttemptId,checkedAt,ok:result.ok,sanitizedResponse:result.sanitizedResponse});
  }finally{await ctx.runMutation(internal.bufferDelivery.finishPoll,{backoffUntil:budget.backoffUntil});}
}});
export const refreshDestination=action({args:{brandId:brandIdValidator},returns:v.any(),handler:async(ctx,args):Promise<{verified:boolean;reason?:string}>=>{
  const userId=await requireActionUserId(ctx);await ctx.runQuery(internal.bufferDestinations.authorized,{...args,userId});
  const context=bufferAdapterContext({remaining:22});if(!context.liveProviderValidationApproved||!context.env.BUFFER_API_KEY)return {verified:false,reason:"Read-only provider validation requires the configured approval gate and credential."};
  const control=await ctx.runQuery(internal.bufferDelivery.control,{});if((control?.backoffUntil??0)>Date.now())return {verified:false,reason:"Provider rate limited; wait before checking."};
  try{const result=await resolveBufferLinkedInChannelId(args.brandId,context);await ctx.runMutation(internal.bufferDestinations.record,{...args,userId,...(result.ok?{destination:result.destination}:{error:result.reason})});return {verified:result.ok,...(!result.ok?{reason:result.reason}:{})};}catch{await ctx.runMutation(internal.bufferDestinations.record,{...args,userId,error:"Destination lookup failed; review the connection."});return {verified:false,reason:"Destination lookup failed; review the connection."};}finally{if(context.requestBudget?.backoffUntil)await ctx.runMutation(internal.bufferDelivery.recordBackoff,{backoffUntil:context.requestBudget.backoffUntil});}
}});

/** Read-only capacity observation. The same provider budget/backoff applies. */
export const refreshCapacity=action({args:{brandId:brandIdValidator},returns:v.any(),handler:async(ctx,args):Promise<{complete:boolean;reason?:string}>=>{
 const userId=await requireActionUserId(ctx);const saved: {destination?:BufferDestination}|null=await ctx.runQuery(internal.queuePlanning.context,{...args,userId});
 const hold=destinationHold(saved?.destination,false);if(hold)return {complete:false,reason:hold};
 const context=bufferAdapterContext({remaining:22});if(!context.liveProviderValidationApproved||!context.env.BUFFER_API_KEY)return {complete:false,reason:"Read-only provider validation requires the configured approval gate and credential."};
 const control=await ctx.runQuery(internal.bufferDelivery.control,{});if((control?.backoffUntil??0)>Date.now())return {complete:false,reason:"Provider rate limited; wait before checking."};
 try {
  const resolved=await resolveBufferLinkedInChannelId(args.brandId,context);if(!resolved.ok||destinationIdentity(resolved.destination)!==destinationIdentity(saved!.destination!))return {complete:false,reason:"Destination changed; refresh Connections before planning."};
  const observation=await readBufferQueue(resolved.destination,context);await ctx.runMutation(internal.queuePlanning.record,{...args,userId,observation});return {complete:observation.complete,reason:observation.error};
 }catch{return {complete:false,reason:"Capacity check failed; capacity remains unknown."};}
 finally{if(context.requestBudget?.backoffUntil)await ctx.runMutation(internal.bufferDelivery.recordBackoff,{backoffUntil:context.requestBudget.backoffUntil});}
}});

export const queueSelected = action({
  args: { reviewId: v.id("queueReleaseReviews") },
  returns: v.any(),
  handler: async (
    ctx,
    args,
  ): Promise<{ started: boolean; reason?: string }> => {
    const userId = await requireActionUserId(ctx);
    if (
      !isBufferLiveGateOn() ||
      !isFlagApproved(process.env.LIVE_PROVIDER_VALIDATION_APPROVED) ||
      !process.env.BUFFER_API_KEY?.trim()
    )
      return {
        started: false,
        reason:
          "Live Buffer submission, provider validation approval and configured server credential are required.",
      };
    const runId = crypto.randomUUID();
    const begin = await ctx.runMutation(internal.queueRelease.begin, {
      ...args,
      userId,
      runId,
    });
    if (!begin.execute) return { started: false, reason: begin.reason };
    const packet = await ctx.runQuery(internal.queueRelease.read, {
      ...args,
      userId,
    });
    const budget: BufferRequestBudget = {
      remaining: Math.min(
        30,
        ...(packet.observation?.observation.apiWindows ?? [])
          .filter((w: { resetsAt: number }) => w.resetsAt > Date.now())
          .map((w: { remaining: number }) => w.remaining),
      ),
    };
    let reason: string | undefined;
    try {
      for (const rowId of begin.rowIds ?? []) {
        const row = packet.rows.find(
          (r: { _id: Id<"queueReleaseRows"> }) => r._id === rowId,
        );
        if (!row) continue;
        if (budget.remaining < 3 || (budget.backoffUntil ?? 0) > Date.now()) {
          reason =
            "Provider request budget or backoff reached; refresh and review remaining posts.";
          await ctx.runMutation(internal.queueRelease.hold, {
            rowId,
            userId,
            reason,
          });
          break;
        }
        const result = await executeBufferSubmit(
          ctx,
          { postId: row.postId, reviewRowId: row._id, runId, retry: row.retry },
          userId,
          budget,
        );
        if (
          !result.submitted ||
          !["queued", "publishing", "published"].includes(
            result.deliveryStatus ?? "",
          )
        ) {
          reason =
            result.reason ??
            "Submission held; inspect its receipt and review remaining posts.";
          await ctx.runMutation(internal.queueRelease.hold, {
            rowId,
            userId,
            reason,
          });
          break;
        }
      }
    } catch {
      reason =
        "Execution interrupted; inspect retained attempts and receipts before reviewing remaining posts.";
    } finally {
      if (budget.backoffUntil)
        await ctx.runMutation(internal.bufferDelivery.recordBackoff, {
          backoffUntil: budget.backoffUntil,
        });
      await ctx.runMutation(internal.queueRelease.finish, {
        ...args,
        userId,
        runId,
        reason,
      });
    }
    return { started: true, reason };
  },
});

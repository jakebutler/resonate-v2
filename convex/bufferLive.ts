"use node";

import { v } from "convex/values";
import { type BufferRequestBudget, BufferRequestBudgetError } from "../lib/bufferContracts";
import { brandIdValidator } from "./campaignAccess";
import { resolveBufferLinkedInChannelId } from "../lib/providerAdapters";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
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
  return {ok:false,status:"ambiguous",providerStateStatus:"needs-review",reason:"Provider call did not return a definitive receipt; reconcile before retrying.",sanitizedResponse:{providerId:"buffer",outcome:"uncertain"}};
}

export const submit = action({
  args: {
    postId: v.id("v2Posts"),
    retry: v.optional(v.boolean()),
  },
  returns: v.object({
    submitted: v.boolean(),
    liveGateOff: v.boolean(),
    reason: v.optional(v.string()),
    attemptId: v.optional(v.string()),
    providerPostId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    submitted: boolean;
    liveGateOff: boolean;
    reason?: string;
    attemptId?: string;
    providerPostId?: string;
  }> => {
    const userId = await requireActionUserId(ctx);

    if (!isBufferLiveGateOn()) {
      return {
        submitted: false,
        liveGateOff: true,
        reason: "Buffer live submission requires BUFFER_LIVE_SUBMISSION=approved.",
      };
    }

    const claimed = await ctx.runMutation(internal.publishing.claimBufferSubmission, {
      postId: args.postId,
      userId,
      retry: args.retry,
    });

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
      result = await bufferProviderAdapter.submit(claimed.submission, bufferAdapterContext());
    } catch (error) {
      result = providerFailureFromError(error);
    }

    const recorded = await ctx.runMutation(internal.publishing.recordBufferSubmitResult, {
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
    });

    return {
      submitted: recorded.submitted,
      liveGateOff: false,
      attemptId: recorded.attemptId,
      providerPostId: result.providerPostId,
      reason: recorded.submitted
        ? undefined
        : recorded.stale
          ? "Approval or content changed while Buffer submission was in flight."
          : result.reason,
    };
  },
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

"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import {
  bufferProviderAdapter,
  type ProviderResult,
} from "../lib/providerAdapters";

function isFlagApproved(value: string | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "approved" || normalized === "true" || normalized === "1";
}

function bufferAdapterContext() {
  return {
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

async function requireActionUserId(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) throw new Error("Unauthorized");
  return identity.subject;
}

export const submit = action({
  args: {
    postId: v.id("v2Posts"),
    retry: v.optional(v.boolean()),
  },
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

    const prepared = await ctx.runQuery(internal.publishing.getBufferSubmissionContext, {
      postId: args.postId,
      userId,
      retry: args.retry,
    });

    if (!prepared.eligible) {
      if ("brandId" in prepared && prepared.brandId) {
        await ctx.runMutation(internal.publishing.auditBufferSkip, {
          postId: args.postId,
          userId,
          brandId: prepared.brandId,
          intentId: "intentId" in prepared ? prepared.intentId : undefined,
          reason: prepared.reason,
        });
      }
      return {
        submitted: false,
        liveGateOff: false,
        reason: prepared.reason,
      };
    }

    // Approval and channel eligibility already enforced above — never call Buffer otherwise.
    const result: ProviderResult = await bufferProviderAdapter.submit(
      prepared.submission,
      bufferAdapterContext()
    );

    const recorded = await ctx.runMutation(internal.publishing.recordBufferSubmitResult, {
      postId: args.postId,
      userId,
      intentId: prepared.intentId,
      brandId: prepared.brandId,
      idempotencyKey: prepared.idempotencyKey,
      retryCount: prepared.retryCount,
      submissionSnapshot: {
        postId: prepared.submission.postId,
        brandId: prepared.submission.brandId,
        channelId: prepared.submission.channelId,
        title: prepared.submission.title,
        content: prepared.submission.content,
        scheduledDate: prepared.submission.scheduledDate,
        scheduledTime: prepared.submission.scheduledTime,
        timezone: prepared.submission.timezone,
      },
      ok: result.ok,
      status: result.status,
      providerStateStatus: result.providerStateStatus,
      providerPostId: result.providerPostId,
      reason: result.reason,
      sanitizedResponse: result.sanitizedResponse,
    });

    return {
      submitted: result.ok,
      liveGateOff: false,
      attemptId: recorded.attemptId,
      providerPostId: result.providerPostId,
      reason: result.ok ? undefined : result.reason,
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

    const result: ProviderResult = await bufferProviderAdapter.recordCancelOrUnpublishIntent(
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

    await ctx.runMutation(internal.publishing.recordBufferCancelResult, {
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
      ok: result.ok,
      liveGateOff: false,
      reason: result.ok ? undefined : result.reason,
    };
  },
});

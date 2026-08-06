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

function providerFailureFromError(error: unknown): ProviderResult {
  const message = error instanceof Error ? error.message : "Buffer provider call failed.";
  return {
    ok: false,
    status: "retryable-failure",
    providerStateStatus: "failed",
    reason: message,
    sanitizedResponse: {
      providerId: "buffer",
      error: message,
    },
  };
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

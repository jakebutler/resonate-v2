"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { updatePrFrontmatter } from "../lib/github";

export const syncFrontmatterAfterReschedule = internalAction({
  args: {
    postId: v.id("v2Posts"),
    userId: v.string(),
    brandId: v.union(
      v.literal("personal"),
      v.literal("corvo"),
      v.literal("lower-db"),
      v.literal("freshproof")
    ),
    intentId: v.id("v2PublishingIntents"),
    branchName: v.string(),
    prUrl: v.string(),
    scheduledDate: v.string(),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const result = await updatePrFrontmatter({
      branchName: args.branchName,
      prUrl: args.prUrl,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      timezone: args.timezone,
    });

    if (result.ok) {
      await ctx.runMutation(internal.publishing.recordGithubPrFrontmatterSynced, {
        postId: args.postId,
        userId: args.userId,
        brandId: args.brandId,
        intentId: args.intentId,
        filePath: result.filePath,
        scheduledDate: args.scheduledDate,
        scheduledTime: args.scheduledTime,
        timezone: args.timezone,
      });
      return { synced: true as const };
    }

    await ctx.runMutation(internal.publishing.markGithubPrRescheduleNeedsReview, {
      postId: args.postId,
      userId: args.userId,
      brandId: args.brandId,
      intentId: args.intentId,
      reason: result.reason,
      prUrl: args.prUrl,
      branchName: args.branchName,
    });
    return { synced: false as const, reason: result.reason };
  },
});

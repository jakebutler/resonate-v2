"use node";

import { blogArtifactValidator } from "./blogValidators";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { updatePrFrontmatter } from "../lib/github";

export const syncFrontmatterAfterReschedule = internalAction({
  args: {
    syncKey: v.optional(v.string()),
    artifact: v.optional(blogArtifactValidator),
    expectedTitle: v.optional(v.string()),
    expectedSlug: v.optional(v.string()),
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
  returns: v.any(),
  handler: async (ctx, args) => {
    if (!args.syncKey || !await ctx.runQuery(internal.publishing.isCurrentBlogSync, {postId: args.postId, userId: args.userId, syncKey: args.syncKey})) return {synced: false as const, reason: "stale-schedule"};
    const result = await updatePrFrontmatter({
      artifact: args.artifact, expectedTitle: args.expectedTitle, expectedSlug: args.expectedSlug,
      branchName: args.branchName,
      prUrl: args.prUrl,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      timezone: args.timezone,
    }).catch(() => ({ok: false as const, reason: "head-conflict" as const}));

    if (result.ok) {
      await ctx.runMutation(internal.publishing.recordGithubPrFrontmatterSynced, {
        syncKey: args.syncKey, artifact: result.artifact,
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
      syncKey: args.syncKey,
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

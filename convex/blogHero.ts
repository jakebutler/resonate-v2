"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./campaignAccess";
import { prepareBlogHero } from "../lib/prepareBlogHero";
import { blogEditorialFingerprint } from "../lib/blogContract";
import type { Doc } from "./_generated/dataModel";

export const prepare = action({
  args: {postId: v.id("v2Posts"), crop: v.union(v.literal("centre"), v.literal("north"), v.literal("south"))},
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post: Doc<"v2Posts"> = await ctx.runQuery(internal.publishing.getHeroPreparationContext, {postId: args.postId, userId});
    if (post.preparedHero && post.preparedHero.sourceStorageId === post.heroImageStorageId && post.preparedHero.crop === args.crop) return null;
    const source = await ctx.storage.get(post.heroImageStorageId!);
    if (!source) throw new Error("Original hero is unavailable.");
    if (source.size > 10 * 1024 * 1024) throw new Error("Hero input must be under 10 MB.");
    const {bytes, ...receipt} = await prepareBlogHero(new Uint8Array(await source.arrayBuffer()), args.crop);
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(bytes)], {type: "image/webp"}));
    try {
      await ctx.runMutation(internal.publishing.recordPreparedHero, {postId: post._id, userId, hero: {...receipt, sourceStorageId: post.heroImageStorageId!, storageId}});
    } catch (error) { await ctx.storage.delete(storageId); throw error; }
    return null;
  },
});

export const getApprovedBytes = action({
  args: {postId: v.id("v2Posts")}, returns: v.object({base64: v.string(), sha256: v.string()}),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post: Doc<"v2Posts"> = await ctx.runQuery(internal.publishing.getHeroPreparationContext, {postId: args.postId, userId});
    if (post.approvalState !== "approved" || post.contentFingerprint !== blogEditorialFingerprint(post) || !post.preparedHero) throw new Error("Approve the prepared hero export version first.");
    const blob = await ctx.storage.get(post.preparedHero.storageId);
    if (!blob) throw new Error("Prepared hero unavailable.");
    return {base64: Buffer.from(await blob.arrayBuffer()).toString("base64"), sha256: post.preparedHero.sha256};
  },
});

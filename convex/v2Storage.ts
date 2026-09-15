import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireUserId } from "./campaignAccess";

/**
 * Storage ownership for the v2 composer (2026-09-14 architecture review §b1
 * carve-out). The legacy `posts` module keeps its equivalents only until the
 * ADR 0004 cutover deletes the legacy surface; v2 surfaces use this module.
 */
export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { fileId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireUserId(ctx);
    return await ctx.storage.getUrl(args.fileId);
  },
});

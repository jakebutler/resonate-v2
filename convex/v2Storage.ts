import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { brandIdValidator, requireBrandAccess, requireUserId } from "./campaignAccess";
import { assertEditorialStorageAccess } from "./visualStorageAccess";
import { assertVisualImage, hashVisualBytes } from "../lib/visualProfile";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/** Older open composers retain a safe, explicit reload boundary during deployment. */
export const generateUploadUrl = mutation({
  args: {}, returns: v.string(),
  handler: async ctx => {
    await requireUserId(ctx);
    throw new ConvexError("Reload the updated composer before uploading an image");
  },
});

export const authorizeUpload = internalQuery({
  args: { brandId: v.optional(brandIdValidator) }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.brandId) {
      const member = await requireBrandAccess(ctx, userId, args.brandId);
      if (!["owner", "editor"].includes(member.role)) throw new Error("Brand edit access denied");
    }
    return null;
  },
});

export const recordUpload = internalMutation({
  args: { storageId: v.id("_storage"), brandId: v.optional(brandIdValidator), sha256: v.string(), bytes: v.number(), contentType: v.string(), fileName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (args.brandId) {
      const member = await requireBrandAccess(ctx, userId, args.brandId);
      if (!["owner", "editor"].includes(member.role)) throw new Error("Brand edit access denied");
    }
    const metadata = await ctx.db.system.get(args.storageId);
    const base64 = btoa(String.fromCharCode(...args.sha256.match(/../g)!.map(hex => parseInt(hex,16))));
    if (!metadata || metadata.size !== args.bytes || ![args.sha256, base64].includes(metadata.sha256) || (metadata.contentType !== undefined && metadata.contentType !== args.contentType)) throw new Error("Uploaded bytes are missing or changed");
    await ctx.db.insert("v2StorageUploads", { ...args, userId, brandId: args.brandId ?? null, createdAt: Date.now() });
    return null;
  },
});

/** Actual bytes and magic are checked before server-owned registration; native exports also decode them. */
export const uploadImage = action({
  args: { brandId: v.optional(brandIdValidator), bytes: v.bytes(), contentType: v.string(), fileName: v.string() },
  returns: v.object({ storageId: v.id("_storage") }),
  handler: async (ctx, args): Promise<{ storageId: Id<"_storage"> }> => {
    await ctx.runQuery(internal.v2Storage.authorizeUpload, { brandId: args.brandId });
    assertVisualImage(args.bytes, args.contentType);
    if (!args.fileName.trim() || args.fileName.length > 160 || /[\\/\u0000]/.test(args.fileName)) throw new Error("Image needs a safe file name");
    const sha256 = await hashVisualBytes(args.bytes);
    const storageId = await ctx.storage.store(new Blob([args.bytes], { type: args.contentType }));
    // An uncertain registration leaves inaccessible bytes, never a client ID.
    await ctx.runMutation(internal.v2Storage.recordUpload, { storageId, brandId: args.brandId, sha256, bytes: args.bytes.byteLength, contentType: args.contentType, fileName: args.fileName.trim() });
    return { storageId };
  },
});

export const getFileUrl = query({
  args: { fileId: v.id("_storage"), postId: v.optional(v.id("v2Posts")) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await assertEditorialStorageAccess(ctx, userId, args.fileId, args.postId === undefined ? { allowOwnedHistoricalLookup: true } : { postId: args.postId });
    return await ctx.storage.getUrl(args.fileId);
  },
});

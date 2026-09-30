import type { Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { requireBrandAccess } from "./campaignAccess";

/** No bare storage ID grants access. Historical attachment context is explicit. */
export async function assertEditorialStorageAccess(ctx: QueryCtx | MutationCtx, userId: string, fileId: Id<"_storage">, context?: { legacyPostId?: Id<"posts">; postId?: Id<"v2Posts"> }) {
    // Existing composers retain their legacy storage path. New visual assets
    // carry indexed ownership, which must also apply to this older endpoint.
    const [references, rawVersions, exports] = await Promise.all([
      ctx.db.query("v2VisualReferences").withIndex("by_storageId", q => q.eq("storageId", fileId)).take(3),
      ctx.db.query("v2VisualVersions").withIndex("by_storageId", q => q.eq("storageId", fileId)).take(3),
      ctx.db.query("v2VisualVersions").withIndex("by_exportStorageId", q => q.eq("exportStorageId", fileId)).take(3),
    ]);
    if ([references, rawVersions, exports].some(owners => owners.length > 2)) throw new Error("Ambiguous storage ownership");
    for (const reference of references) {
      const member = await requireBrandAccess(ctx, userId, reference.brandId);
      if (member.role !== "owner" && member.role !== "editor") throw new Error("Visual reference access denied");
    }
    for (const version of [...rawVersions, ...exports]) {
      if (version.userId !== userId) throw new Error("Post not found");
      await requireBrandAccess(ctx, userId, version.brandId);
    }
    if (references.length || rawVersions.length || exports.length) return;
    const upload = await ctx.db.query("v2StorageUploads").withIndex("by_storageId", q => q.eq("storageId", fileId)).unique();
    if (upload) {
      if (upload.userId !== userId) throw new Error("Storage asset not found or access denied");
      if (upload.brandId) await requireBrandAccess(ctx, userId, upload.brandId);
      return;
    }
    if (context?.legacyPostId) {
      const post = await ctx.db.get(context.legacyPostId);
      // ADR0004 historical legacy posts are a shared authenticated workspace.
      // New attachments must pass the owned-byte guard before entering it.
      // New owned uploads remain author-owned even on a shared legacy post.
      if (post && (post.heroImageId === fileId || post.fileIds?.includes(fileId))) return;
    }
    if (context?.postId) {
      const post = await ctx.db.get(context.postId);
      if (post?.userId === userId && post.heroImageStorageId === fileId) {
        await requireBrandAccess(ctx, userId, post.brandId);
        return;
      }
    }
    throw new Error("Storage asset not found or access denied");
}

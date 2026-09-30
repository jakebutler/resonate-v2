"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { prepareHeroExport } from "../lib/visualExport";
import type { Doc, Id } from "./_generated/dataModel";
import { requireUserId } from "./campaignAccess";
import { createHash } from "node:crypto";

type PreparedHero = { versionId: Id<"v2VisualVersions">; exportHash: string; exportStorageId: Id<"_storage">; url: string;
  metadata: { width: number; height: number; bytes: number; format: "webp"; crop: string } };

/** Prepare and persist the presentation the author will actually approve. */
export const prepareHero = action({
  args: { versionId: v.id("v2VisualVersions"), crop: v.optional(v.object({ left: v.number(), top: v.number(), width: v.number(), height: v.number() })) },
  returns: v.object({ versionId: v.id("v2VisualVersions"), exportHash: v.string(), exportStorageId: v.id("_storage"), url: v.string(), metadata: v.object({ width: v.number(), height: v.number(), bytes: v.number(), format: v.literal("webp"), crop: v.string() }) }),
  handler: async (ctx, args): Promise<PreparedHero> => {
    const userId = await requireUserId(ctx);
    const version: Doc<"v2VisualVersions"> = await ctx.runQuery(internal.visualWorkflow.getVersionForExport, { userId, versionId: args.versionId });
    const source = await ctx.storage.get(version.storageId);
    if (!source) throw new Error("Hero source bytes are missing");
    const sourceBytes = new Uint8Array(await source.arrayBuffer());
    if (createHash("sha256").update(sourceBytes).digest("hex") !== version.sha256) throw new Error("Hero source bytes no longer match their immutable version");
    const prepared = await prepareHeroExport(sourceBytes, args.crop);
    if (prepared.sourceSha256 !== version.sha256) throw new Error("Hero source bytes no longer match their immutable version");
    const metadata = { width: prepared.presentation.width, height: prepared.presentation.height, bytes: prepared.presentation.bytes, format: prepared.presentation.format, crop: JSON.stringify(prepared.presentation) };
    const exportStorageId = await ctx.storage.store(new Blob([Uint8Array.from(prepared.bytes).buffer], { type: "image/webp" }));
    // A lost mutation response may follow a committed export record. Preserve
    // bytes on errors; ownership checks deny any unregistered orphan. Only a
    // confirmed duplicate result proves the new blob is safe to remove.
    const retained = await ctx.runMutation(internal.visualWorkflow.recordHeroExport, { userId, versionId: version._id, sourceSha256: prepared.sourceSha256, exportStorageId, exportHash: prepared.sha256, exportMetadata: metadata });
    if (retained.reused && retained.exportStorageId !== exportStorageId) await ctx.storage.delete(exportStorageId);
    const url = await ctx.storage.getUrl(retained.exportStorageId);
    if (!url) throw new Error("Prepared hero bytes are missing");
    return { versionId: version._id, exportHash: retained.exportHash, exportStorageId: retained.exportStorageId, url, metadata: retained.exportMetadata };
  },
});

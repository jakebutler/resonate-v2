"use node";
import { createHash } from "node:crypto";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./campaignAccess";
import {
  parsePreparedManifest,
  resolvePreparedEntry,
  type ResolvedPreparedItem,
} from "../lib/preparedPackage";
import { prepareBlogHero } from "../lib/prepareBlogHero";
import type { Doc } from "./_generated/dataModel";
const sha = (input: string | Uint8Array) =>
  createHash("sha256").update(input).digest("hex");
function canonical(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(canonical);
  if (input && typeof input === "object")
    return Object.fromEntries(
      Object.entries(input)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, canonical(value)]),
    );
  return input;
}
function decodeHero(value: string) {
  if (value.length > 4000000 || !value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new Error(
      "heroFile: invalid or oversized base64 upload (maximum 3 MB).",
    );
  const bytes = Buffer.from(value, "base64");
  if (
    !bytes.length ||
    bytes.length > 3000000 ||
    bytes.toString("base64") !== value
  )
    throw new Error("heroFile: invalid or oversized image.");
  return bytes;
}
export const reviewEntry = action({
  args: {
    manifest: v.string(),
    entryKey: v.string(),
    files: v.array(
      v.object({
        path: v.string(),
        data: v.string(),
        kind: v.union(v.literal("text"), v.literal("base64")),
      }),
    ),
  },
  returns: v.object({
    reviewId: v.id("preparedImportReviews"),
    previewBase64: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    reviewId: Doc<"preparedImportReviews">["_id"];
    previewBase64: string;
  }> => {
    const userId = await requireUserId(ctx);
    const manifest = parsePreparedManifest(args.manifest);
    const resolved = resolvePreparedEntry(manifest, args.entryKey, args.files);
    const bytes = decodeHero(resolved.hero.data);
    const heroSourceHash = sha(bytes);
    const sourceHash = sha(
      JSON.stringify(
        canonical({
          brandId: manifest.brandId,
          title: manifest.title,
          entry: resolved.entry,
          items: resolved.items,
          heroSourceHash,
        }),
      ),
    );
    const plan: { existingPosts?: Doc<"v2Posts">[]; actions: string[] } =
      await ctx.runQuery(internal.preparedImports.assess, {
        userId,
        manifest,
        entryKey: args.entryKey,
        sourceHash,
        items: resolved.items,
      });
    const { bytes: _prepared, ...hero } = await prepareBlogHero(
      bytes,
      resolved.entry.article.crop ?? "centre",
    );
    let attachHeroMatches = true;
    let attachedHeroStorageId: Doc<"v2Posts">["heroImageStorageId"];
    if (resolved.items[0].existingPostId && plan.actions[0] === "attach") {
      const article = plan.existingPosts?.find(
        (p) => p._id === resolved.items[0].existingPostId,
      );
      attachedHeroStorageId = article?.heroImageStorageId;
      const blob = attachedHeroStorageId
        ? await ctx.storage.get(attachedHeroStorageId)
        : null;
      attachHeroMatches = Boolean(
        blob &&
          blob.size <= 3000000 &&
          sha(new Uint8Array(await blob.arrayBuffer())) === heroSourceHash &&
          article?.preparedHero?.sha256 === hero.sha256 &&
          article.preparedHero.crop === hero.crop,
      );
    }
    const reviewId = await ctx.runMutation(
      internal.preparedImports.saveReview,
      {
        userId,
        manifest,
        entryKey: args.entryKey,
        sourceHash,
        items: resolved.items,
        hero,
        heroSourceHash,
        attachHeroMatches,
        attachedHeroStorageId,
      },
    );
    return { reviewId, previewBase64: _prepared.toString("base64") };
  },
});
export const commitEntry = action({
  args: {
    reviewId: v.id("preparedImportReviews"),
    heroBase64: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args): Promise<Doc<"preparedImportReceipts"> | null> => {
    const userId = await requireUserId(ctx);
    const {
      review,
      receipt,
    }: {
      review: Doc<"preparedImportReviews">;
      receipt: Doc<"preparedImportReceipts"> | null;
    } = await ctx.runQuery(internal.preparedImports.reviewContext, {
      reviewId: args.reviewId,
      userId,
    });
    if (receipt) {
      if (receipt.sourceHash !== review.sourceHash)
        throw new Error(
          "Existing entry source changed; conflict requires review.",
        );
      return receipt;
    }
    if (review.actions.includes("conflict"))
      throw new Error("Resolve the import conflict before commit.");
    const article = (review.items as ResolvedPreparedItem[])[0];
    if (article.existingPostId)
      return ctx.runMutation(internal.preparedImports.commit, {
        reviewId: review._id,
        userId,
      });
    const bytes = decodeHero(args.heroBase64 ?? "");
    if (sha(bytes) !== review.heroSourceHash)
      throw new Error("Uploaded hero changed after review.");
    const prepared = await prepareBlogHero(bytes, review.hero.crop);
    if (prepared.sha256 !== review.hero.sha256)
      throw new Error("Prepared hero differs from reviewed receipt.");
    const claim: {
      assetId: Doc<"preparedImportAssets">["_id"];
      ready?: Doc<"preparedImportAssets">;
    } = await ctx.runMutation(internal.preparedImports.claimAsset, {
      userId,
      reviewId: review._id,
    });
    if (!claim.ready) {
      const sourceStorageId = await ctx.storage.store(
        new Blob([new Uint8Array(bytes)]),
      );
      let storageId: Doc<"preparedImportAssets">["storageId"];
      try {
        storageId = await ctx.storage.store(
          new Blob([new Uint8Array(prepared.bytes)], { type: "image/webp" }),
        );
        await ctx.runMutation(internal.preparedImports.recordAsset, {
          assetId: claim.assetId,
          userId,
          sourceStorageId,
          storageId,
        });
      } catch (error) {
        await ctx.storage.delete(sourceStorageId);
        if (storageId) await ctx.storage.delete(storageId);
        throw error;
      }
    }
    return ctx.runMutation(internal.preparedImports.commit, {
      userId,
      reviewId: review._id,
      assetId: claim.assetId,
    });
  },
});

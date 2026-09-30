import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { audit, requireUserId, requireBrandAccess } from "./campaignAccess";
import { createCanonicalPost } from "./publishing";
import { attachEntry, seriesPost } from "./series";
import { blogEditorialFingerprint } from "../lib/blogContract";
import { fingerprintPostContent } from "../lib/domain";
import type {
  PreparedManifest,
  ResolvedPreparedItem,
} from "../lib/preparedPackage";
import type { Doc, Id } from "./_generated/dataModel";
async function authorized(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  brandId: Doc<"v2Posts">["brandId"],
) {
  const role = await requireBrandAccess(ctx, userId, brandId);
  if (role.role === "viewer")
    throw new Error("Prepared import requires editor access.");
}
function expected(item: ResolvedPreparedItem, article: boolean) {
  return {
    title: item.title,
    content: item.content,
    scheduledDate: item.scheduledDate,
    scheduledTime: item.scheduledTime,
    timezone: item.timezone,
    ...(article
      ? {
          channelId: "corvo-blog" as const,
          blogExcerpt: item.excerpt,
          blogAuthor: item.author,
          blogCategory: item.category,
          blogTags: item.tags,
          blogSlug: item.slug,
          blogPublicationIntent: item.publicationIntent,
          coverImageAlt: item.coverImageAlt,
        }
      : {
          channelId: item.channelId!,
          linkedinFirstComment: item.firstComment,
        }),
  };
}
export async function assessEntry(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  manifest: PreparedManifest,
  key: string,
  sourceHash: string,
  items: ResolvedPreparedItem[],
) {
  await authorized(ctx, userId, manifest.brandId);
  if (manifest.brandId !== "corvo") throw new Error("brandId: prepared blog packages require the Corvo brand with its enabled blog channel.");
  const pkg = await ctx.db
    .query("preparedImportPackages")
    .withIndex("by_user_and_key", (q) =>
      q.eq("userId", userId).eq("packageKey", manifest.packageKey),
    )
    .first();
  if (pkg && (pkg.brandId !== manifest.brandId || pkg.title !== manifest.title))
    throw new Error(
      "packageKey: existing package brand/title conflicts; review a new stable key.",
    );
  const receipt = pkg
    ? await ctx.db
        .query("preparedImportReceipts")
        .withIndex("by_package_and_entry", (q) =>
          q.eq("packageId", pkg._id).eq("entryKey", key),
        )
        .first()
    : null;
  if (receipt)
    return {
      pkg,
      receipt,
      actions: items.map(() =>
        receipt.sourceHash === sourceHash ? "skip" : "conflict",
      ),
      reason:
        receipt.sourceHash === sourceHash
          ? undefined
          : "Existing entry source changed; original posts/receipts are protected.",
    };
  const actions: string[] = [];
  const existingPosts: Doc<"v2Posts">[] = [];
  for (const [index, item] of items.entries()) {
    if (!item.existingPostId) {
      actions.push("create");
      continue;
    }
    const id = ctx.db.normalizeId("v2Posts", item.existingPostId);
    if (!id) throw new Error(`${key}.existingPostId: invalid ID.`);
    const post = await seriesPost(ctx, userId, manifest.brandId, id);
    existingPosts.push(post);
    const wanted = expected(item, index === 0);
    const matches = Object.entries(wanted).every(
      ([field, value]) =>
        JSON.stringify(post[field as keyof typeof post] ?? null) ===
        JSON.stringify(value ?? null),
    );
    actions.push(matches ? "attach" : "conflict");
  }
  return {
    pkg,
    receipt: null,
    actions,
    existingPosts,
    reason: actions.includes("conflict")
      ? "Existing post differs from uploaded copy, metadata or schedule; no overwrite is permitted."
      : undefined,
  };
}
export const assess = internalQuery({
  args: {
    userId: v.string(),
    manifest: v.any(),
    entryKey: v.string(),
    sourceHash: v.string(),
    items: v.any(),
  },
  returns: v.any(),
  handler: async (ctx, args) =>
    assessEntry(
      ctx,
      args.userId,
      args.manifest,
      args.entryKey,
      args.sourceHash,
      args.items,
    ),
});
export const saveReview = internalMutation({
  args: {
    userId: v.string(),
    manifest: v.any(),
    entryKey: v.string(),
    sourceHash: v.string(),
    items: v.any(),
    hero: v.any(),
    heroSourceHash: v.string(),
    attachHeroMatches: v.boolean(),
    attachedHeroStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("preparedImportReviews"),
  handler: async (ctx, args) => {
    const plan = await assessEntry(
      ctx,
      args.userId,
      args.manifest,
      args.entryKey,
      args.sourceHash,
      args.items,
    );
    const existing = await ctx.db
      .query("preparedImportReviews")
      .withIndex("by_user_entry_hash", (q) =>
        q
          .eq("userId", args.userId)
          .eq("packageKey", args.manifest.packageKey)
          .eq("entryKey", args.entryKey)
          .eq("sourceHash", args.sourceHash),
      )
      .first();
    if (existing) {
      if (plan.receipt)
        await ctx.db.patch(existing._id, {
          actions: plan.actions,
          reason: plan.reason,
          checkedAt: Date.now(),
        });
      return existing._id;
    }
    const pkgId =
      plan.pkg?._id ??
      (await ctx.db.insert("preparedImportPackages", {
        userId: args.userId,
        brandId: args.manifest.brandId,
        packageKey: args.manifest.packageKey,
        title: args.manifest.title,
        createdAt: Date.now(),
      }));
    const reviewBytes = new TextEncoder().encode(
      JSON.stringify(args.items),
    ).length;
    if ((plan.pkg?.reviewBytes ?? 0) + reviewBytes > 6000000)
      throw new Error(
        "packageKey: durable review exceeds 6 MB; split into separately reviewed packages.",
      );
    await ctx.db.patch(pkgId, {
      reviewBytes: (plan.pkg?.reviewBytes ?? 0) + reviewBytes,
    });
    const actions = args.attachHeroMatches
      ? plan.actions
      : plan.actions.map((a, index) =>
          index === 0 && a === "attach" ? "conflict" : a,
        );
    return ctx.db.insert("preparedImportReviews", {
      userId: args.userId,
      brandId: args.manifest.brandId,
      packageId: pkgId,
      packageKey: args.manifest.packageKey,
      entryKey: args.entryKey,
      sourceHash: args.sourceHash,
      items: args.items,
      hero: args.hero,
      heroSourceHash: args.heroSourceHash,
      attachedHeroStorageId: args.attachedHeroStorageId,
      actions,
      reason: args.attachHeroMatches
        ? plan.reason
        : "Existing article hero bytes differ; attachment requires exact source identity.",
      checkedAt: Date.now(),
    });
  },
});
export const reviewContext = internalQuery({
  args: { reviewId: v.id("preparedImportReviews"), userId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.userId !== args.userId)
      throw new Error("Import review not found");
    await authorized(ctx, args.userId, review.brandId);
    const pkg = (await ctx.db.get(review.packageId))!;
    const receipt = await ctx.db
      .query("preparedImportReceipts")
      .withIndex("by_package_and_entry", (q) =>
        q.eq("packageId", pkg._id).eq("entryKey", review.entryKey),
      )
      .first();
    return { review, pkg, receipt };
  },
});
export const claimAsset = internalMutation({
  args: { userId: v.string(), reviewId: v.id("preparedImportReviews") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.userId !== args.userId)
      throw new Error("Review not found");
    await authorized(ctx, args.userId, review.brandId);
    if (review.actions.includes("conflict"))
      throw new Error("Resolve the import conflict before commit.");
    const asset = await ctx.db
      .query("preparedImportAssets")
      .withIndex("by_user_source", (q) =>
        q
          .eq("userId", args.userId)
          .eq("sourceHash", review.heroSourceHash)
          .eq("preparedHash", review.hero.sha256),
      )
      .first();
    if (asset?.status === "pending")
      throw new Error(
        "Asset claim is unresolved; retain its receipt and reconcile before retrying.",
      );
    if (asset) return { assetId: asset._id, ready: asset };
    const assetId = await ctx.db.insert("preparedImportAssets", {
      userId: args.userId,
      sourceHash: review.heroSourceHash,
      preparedHash: review.hero.sha256,
      status: "pending",
      createdAt: Date.now(),
    });
    return { assetId };
  },
});
export const recordAsset = internalMutation({
  args: {
    assetId: v.id("preparedImportAssets"),
    userId: v.string(),
    sourceStorageId: v.id("_storage"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.userId !== args.userId || asset.status !== "pending")
      throw new Error("Asset receipt identity mismatch");
    await ctx.db.patch(asset._id, {
      status: "ready",
      sourceStorageId: args.sourceStorageId,
      storageId: args.storageId,
    });
    return null;
  },
});
export const commit = internalMutation({
  args: {
    userId: v.string(),
    reviewId: v.id("preparedImportReviews"),
    assetId: v.optional(v.id("preparedImportAssets")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const review = await ctx.db.get(args.reviewId);
    if (!review || review.userId !== args.userId)
      throw new Error("Import review not found");
    await authorized(ctx, args.userId, review.brandId);
    const pkg = (await ctx.db.get(review.packageId))!;
    const items = review.items as ResolvedPreparedItem[];
    const manifest = {
      brandId: review.brandId,
      packageKey: pkg.packageKey,
      title: pkg.title,
    } as PreparedManifest;
    const plan = await assessEntry(
      ctx,
      args.userId,
      manifest,
      review.entryKey,
      review.sourceHash,
      items,
    );
    if (plan.receipt) {
      if (plan.receipt.sourceHash !== review.sourceHash)
        throw new Error(
          "Existing entry changed; conflict requires editor review.",
        );
      return plan.receipt;
    }
    if (
      plan.actions.includes("conflict") ||
      review.actions.includes("conflict")
    )
      throw new Error("Import conflict; existing posts are protected.");
    if (items[0].existingPostId) {
      const article = await ctx.db.get(
        ctx.db.normalizeId("v2Posts", items[0].existingPostId)!,
      );
      if (article?.heroImageStorageId !== review.attachedHeroStorageId)
        throw new Error("Existing article hero changed after review.");
    }
    const asset = args.assetId ? await ctx.db.get(args.assetId) : null;
    if (
      !items[0].existingPostId &&
      (!asset ||
        asset.userId !== args.userId ||
        asset.status !== "ready" ||
        asset.sourceHash !== review.heroSourceHash ||
        asset.preparedHash !== review.hero.sha256)
    )
      throw new Error("Prepared hero receipt required.");
    const now = Date.now();
    const seriesId =
      pkg.seriesId ??
      (await ctx.db.insert("postSeries", {
        userId: args.userId,
        brandId: pkg.brandId,
        title: pkg.title,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      }));
    if (!pkg.seriesId) await ctx.db.patch(pkg._id, { seriesId });
    const ids: Id<"v2Posts">[] = [];
    for (const [index, item] of items.entries()) {
      if (item.existingPostId) {
        ids.push(ctx.db.normalizeId("v2Posts", item.existingPostId)!);
        continue;
      }
      const { postId, intentId } = await createCanonicalPost(ctx, args.userId, {
        brandId: pkg.brandId,
        channelId: index === 0 ? "corvo-blog" : item.channelId!,
        title: item.title,
        content: item.content,
        scheduledDate: item.scheduledDate,
        scheduledTime: item.scheduledTime,
        timezone: item.timezone,
      });
      const patch = {
        ...expected(item, index === 0),
        ...(index === 0
          ? {
              heroImageStorageId: asset!.sourceStorageId,
              heroImageUrl:
                (await ctx.storage.getUrl(asset!.sourceStorageId!)) ??
                undefined,
              preparedHero: {
                ...review.hero,
                sourceStorageId: asset!.sourceStorageId,
                storageId: asset!.storageId,
              },
            }
          : {}),
      };
      const post = (await ctx.db.get(postId))!;
      const fingerprint =
        index === 0
          ? blogEditorialFingerprint({ ...post, ...patch })
          : fingerprintPostContent({
              title: item.title,
              content: item.content,
              linkedinFirstComment: item.firstComment,
            });
      await ctx.db.patch(postId, { ...patch, contentFingerprint: fingerprint });
      await ctx.db.patch(intentId, { contentFingerprint: fingerprint });
      ids.push(postId);
    }
    const entryId = await attachEntry(
      ctx,
      args.userId,
      seriesId,
      review.entryKey,
      ids[0],
      ids.slice(1),
    );
    const receiptId = await ctx.db.insert("preparedImportReceipts", {
      userId: args.userId,
      packageId: pkg._id,
      entryKey: review.entryKey,
      sourceHash: review.sourceHash,
      seriesId,
      entryId,
      postIds: ids,
      assetId: args.assetId,
      createdAt: now,
    });
    await audit(ctx, {
      userId: args.userId,
      brandId: pkg.brandId,
      action: "series.prepared_import",
      summary:
        "Committed reviewed prepared copy as unapproved canonical posts or unchanged attachments.",
      metadata: { receiptId, entryKey: review.entryKey, postIds: ids },
    });
    return ctx.db.get(receiptId);
  },
});
export const reviews = query({
  args: { packageKey: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const rows = await ctx.db
      .query("preparedImportReviews")
      .withIndex("by_user_package", (q) =>
        q.eq("userId", userId).eq("packageKey", args.packageKey),
      )
      .take(101);
    for (const row of rows) await authorized(ctx, userId, row.brandId);
    return rows;
  },
});

export const selectedReviews = query({
  args: { reviewIds: v.array(v.id("preparedImportReviews")) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    if (
      args.reviewIds.length > 100 ||
      new Set(args.reviewIds).size !== args.reviewIds.length
    )
      throw new Error("Invalid review selection.");
    const rows = [];
    for (const id of args.reviewIds) {
      const row = await ctx.db.get(id);
      if (!row || row.userId !== userId)
        throw new Error("Import review not found");
      await authorized(ctx, userId, row.brandId);
      rows.push(row);
    }
    return rows;
  },
});

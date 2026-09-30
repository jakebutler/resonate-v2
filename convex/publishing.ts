import {postScheduleVersion} from "../lib/socialPayload";
import {priorDispatchHold, priorBufferAttempts, dispatchCapacity, releasePin, allocateDispatch, reconcileAllocation, reviewReservationsHold} from "./queueDispatch";
import {companionSubmissionHold,latestPublication} from "./articleDependencies";
import {consumeReservation} from "./queuePlanning";
import { linkedInPayload } from "../lib/socialPayload";
import { destinationSubmissionHold, readDestination } from "./bufferDestinations";
import { applyRefresh } from "./bufferDelivery";
import { destinationValidator, deliveryStatusValidator } from "./bufferValidators";
import { ownedSeries } from "./series";
import { blogArtifactValidator, preparedHeroValidator } from "./blogValidators";
import { blogEditorialFingerprint, missingBlogEditorialFields } from "../lib/blogContract";
import { previewSeedIdeas, previewSeedPosts } from "./previewSeedData";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireBrandAccess, requireUserId } from "./campaignAccess";
import { brandHasBufferLinkedInMapping, fingerprintPostContent } from "@/lib/domain";
import {
  providerForChannel as providerForChannelOrNull,
} from "@/lib/providerAdapters";
import { providerSubmissionIneligibilityReason } from "@/lib/approvalGate";
import { sanitizeProviderResponse } from "@/lib/sanitize";
import { formatYmdFromOffset } from "@/lib/formatYmd";

type BrandId = "personal" | "corvo" | "lower-db" | "freshproof";
type ChannelId =
  | "linkedin"
  | "x"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "reddit"
  | "corvo-blog";

const brandIdValidator = v.union(
  v.literal("personal"),
  v.literal("corvo"),
  v.literal("lower-db"),
  v.literal("freshproof")
);

const channelIdValidator = v.union(
  v.literal("linkedin"),
  v.literal("x"),
  v.literal("youtube"),
  v.literal("instagram"),
  v.literal("tiktok"),
  v.literal("reddit"),
  v.literal("corvo-blog")
);

const approvalValidator = v.union(
  v.literal("unapproved"),
  v.literal("approved"),
  v.literal("changes-requested")
);

const mockModeValidator = v.union(
  v.literal("success"),
  v.literal("retryable-failure"),
  v.literal("permanent-failure"),
  v.literal("ambiguous"),
  v.literal("published"),
  v.literal("unavailable")
);

const providerIntentValidator = v.union(
  v.literal("cancel"),
  v.literal("unpublish")
);

const githubPrRecordValidator = v.object({
  artifact: v.optional(blogArtifactValidator),
  exportClaimKey: v.optional(v.string()),
  prUrl: v.string(),
  branchName: v.string(),
  prNumber: v.optional(v.number()),
  prStatus: v.optional(
    v.union(
      v.literal("open"),
      v.literal("merged"),
      v.literal("closed"),
      v.literal("draft")
    )
  ),
  sanitizedResponse: v.any(),
});

const blogMetadataValidator = v.object({
  blogExcerpt: v.optional(v.string()),
  blogAuthor: v.optional(v.string()),
  blogCategory: v.optional(v.string()),
  blogTags: v.optional(v.array(v.string())),
  blogSlug: v.optional(v.string()),
  blogPublicationIntent: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  coverImageAlt: v.optional(v.string()),
  heroImageUrl: v.optional(v.string()),
  heroImageStorageId: v.optional(v.id("_storage")),
});

const linkedInPlatformSettingsValidator = v.object({ cta: v.optional(v.string()), hashtags: v.optional(v.array(v.string())), linkPreview: v.optional(v.boolean()) });
const redditPlatformSettingsValidator = v.object({ subreddit: v.optional(v.string()), flair: v.optional(v.string()), nsfw: v.optional(v.boolean()), spoiler: v.optional(v.boolean()), sensitivity: v.optional(v.string()) });
const corvoBlogPlatformSettingsValidator = v.object({ canonicalUrl: v.optional(v.string()), ogImage: v.optional(v.string()), statusFlag: v.optional(v.string()), categoryOverride: v.optional(v.string()) });
const platformSettingsValidator = v.union(linkedInPlatformSettingsValidator, redditPlatformSettingsValidator, corvoBlogPlatformSettingsValidator);

const brandSeed = [
  {
    brandId: "personal",
    name: "Personal",
    description: "Personal publishing workspace.",
    channels: ["linkedin"],
  },
  {
    brandId: "corvo",
    name: "Corvo Labs",
    description: "AI consulting, product strategy, and applied workflow writing.",
    channels: ["linkedin", "corvo-blog", "x", "youtube"],
  },
  {
    brandId: "lower-db",
    name: "the lower dB",
    description: "GLP-1 intelligence desk and patient-facing research content.",
    channels: ["linkedin", "reddit", "instagram", "tiktok", "youtube", "x"],
  },
  {
    brandId: "freshproof",
    name: "FreshProof",
    description: "Claim validation, evidence policy, and content QA.",
    channels: ["linkedin", "reddit", "youtube", "x"],
  },
] as const;

/** Normalizes the lib routing table's null to the record shape's undefined. */
function providerForChannel(channelId: ChannelId) {
  return providerForChannelOrNull(channelId) ?? undefined;
}

function brandConfigFor(brandId: BrandId) {
  const brand = brandSeed.find((entry) => entry.brandId === brandId);
  if (!brand) throw new Error(`Unknown brand: ${brandId}`);
  return brand;
}

async function ensureBrandRecord(ctx: MutationCtx, brandId: BrandId, now: number) {
  const existingBrand = await ctx.db
    .query("v2Brands")
    .withIndex("by_brand_id", (q) => q.eq("brandId", brandId))
    .first();
  if (existingBrand) return existingBrand;

  const brand = brandConfigFor(brandId);
  const brandDocId = await ctx.db.insert("v2Brands", {
    brandId: brand.brandId,
    name: brand.name,
    description: brand.description,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(brandDocId))!;
}

async function ensureBrandMembership(
  ctx: MutationCtx,
  userId: string,
  brandId: BrandId,
  now: number
) {
  const membership = await ctx.db
    .query("v2BrandMemberships")
    .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", brandId))
    .first();
  if (membership) return membership;

  await ctx.db.insert("v2BrandMemberships", {
    userId,
    brandId,
    role: "owner",
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db
    .query("v2BrandMemberships")
    .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", brandId))
    .first())!;
}

async function ensureBrandChannel(
  ctx: MutationCtx,
  brandId: BrandId,
  channelId: ChannelId,
  now: number
) {
  const brand = brandConfigFor(brandId);
  if (!(brand.channels as readonly ChannelId[]).includes(channelId)) {
    throw new Error(`Channel ${channelId} is not enabled for ${brand.name}`);
  }

  const existingChannel = await ctx.db
    .query("v2Channels")
    .withIndex("by_brand_and_channel", (q) =>
      q.eq("brandId", brandId).eq("channelId", channelId)
    )
    .first();
  if (existingChannel) return existingChannel;

  const providerId = providerForChannel(channelId);
  const channelDocId = await ctx.db.insert("v2Channels", {
    brandId,
    channelId,
    platformId: channelId,
    label: channelId === "corvo-blog" ? "Corvo Labs Blog" : channelId,
    providerId,
    routable: providerId !== undefined,
    socialAccountLabel:
      channelId === "corvo-blog" ? "jakebutler/corvo-labs-dot-com" : brand.name,
    createdAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(channelDocId))!;
}

async function ensureWorkspaceChannel(
  ctx: MutationCtx,
  userId: string,
  brandId: BrandId,
  channelId: ChannelId
) {
  const now = Date.now();
  await ensureBrandRecord(ctx, brandId, now);
  await ensureBrandMembership(ctx, userId, brandId, now);
  return await ensureBrandChannel(ctx, brandId, channelId, now);
}

function contentFingerprint(title: string, content: string, linkedinFirstComment?: string) {
  return fingerprintPostContent({ title, content, linkedinFirstComment });
}

async function getOwnedPost(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  postId: Id<"v2Posts">
) {
  const post = await ctx.db.get(postId);
  if (!post || post.userId !== userId) throw new Error("Post not found");
  await requireBrandAccess(ctx, userId, post.brandId);
  return post;
}

async function latestIntent(
  ctx: QueryCtx | MutationCtx,
  postId: Id<"v2Posts">
) {
  return await ctx.db.query("v2PublishingIntents")
    .withIndex("by_post_and_updated_at", q => q.eq("postId", postId))
    .order("desc").first();
}
export { latestIntent };

async function accessibleBrandIds(ctx: QueryCtx | MutationCtx, userId: string) {
  const memberships = await ctx.db
    .query("v2BrandMemberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return new Set(memberships.map((membership) => membership.brandId));
}

async function audit(
  ctx: MutationCtx,
  params: {
    userId: string;
    brandId: Doc<"v2Posts">["brandId"];
    postId?: Id<"v2Posts">;
    intentId?: Id<"v2PublishingIntents">;
    action: string;
    summary: string;
    metadata?: unknown;
  }
) {
  await ctx.db.insert("v2AuditEvents", {
    ...params,
    createdAt: Date.now(),
  });
}

async function seedBrandsAndChannels(
  ctx: MutationCtx,
  userId: string,
  now: number
) {
  for (const brand of brandSeed) {
    await ensureBrandRecord(ctx, brand.brandId, now);
    await ensureBrandMembership(ctx, userId, brand.brandId, now);

    for (const channelId of brand.channels) {
      await ensureBrandChannel(ctx, brand.brandId, channelId, now);
    }
  }
}

async function previewSeedRecordExists(
  ctx: MutationCtx,
  userId: string,
  legacyId: string
) {
  const records = await ctx.db
    .query("v2MigrationRecords")
    .withIndex("by_legacy", (q) =>
      q.eq("legacyTable", "previewSeed").eq("legacyId", legacyId)
    )
    .collect();
  return records.some((record) => record.userId === userId);
}

async function recordPreviewSeed(
  ctx: MutationCtx,
  userId: string,
  legacyId: string,
  targetTable: string,
  targetId: string,
  now: number
) {
  await ctx.db.insert("v2MigrationRecords", {
    userId,
    legacyTable: "previewSeed",
    legacyId,
    targetTable,
    targetId,
    createdAt: now,
  });
}

export const seedMvpWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    await seedBrandsAndChannels(ctx, userId, now);
    return { seeded: true };
  },
});

export const seedPreviewWorkspace = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    if (process.env.ALLOW_PREVIEW_SEED !== "1") {
      throw new Error(
        "seedPreviewWorkspace is disabled. Set ALLOW_PREVIEW_SEED=1 on the Convex *dev* deployment only."
      );
    }
    const cloudUrl = process.env.CONVEX_CLOUD_URL ?? "";
    if (cloudUrl.includes("healthy-platypus-553")) {
      throw new Error(
        "seedPreviewWorkspace cannot run against the production Convex deployment."
      );
    }

    const userId = await requireUserId(ctx);
    const now = Date.now();
    const dryRun = args.dryRun ?? false;
    const summary = {
      seeded: true,
      dryRun,
      ideasCreated: 0,
      postsCreated: 0,
      skipped: 0,
    };

    if (!dryRun) {
      await seedBrandsAndChannels(ctx, userId, now);
    }

    for (const idea of previewSeedIdeas) {
      if (await previewSeedRecordExists(ctx, userId, idea.legacyId)) {
        summary.skipped += 1;
        continue;
      }
      if (dryRun) {
        summary.ideasCreated += 1;
        continue;
      }

      const trimmed = idea.content.trim();
      const latestEntryPreview =
        trimmed.length <= 140 ? trimmed : `${trimmed.slice(0, 140)}…`;
      const ideaId = await ctx.db.insert("capturedIdeas", {
        userId,
        brandId: idea.brandId,
        status: "inbox",
        tags: idea.tags,
        sourceUrl: idea.sourceUrl,
        normalizedSourceUrl: idea.sourceUrl,
        sourceDomain: idea.sourceDomain,
        latestEntryPreview,
        lastCapturedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("capturedIdeaEntries", {
        ideaId,
        userId,
        content: idea.content,
        captureChannel: "web",
        createdAt: now,
      });
      await recordPreviewSeed(
        ctx,
        userId,
        idea.legacyId,
        "capturedIdeas",
        String(ideaId),
        now
      );
      summary.ideasCreated += 1;
    }

    for (const post of previewSeedPosts) {
      if (await previewSeedRecordExists(ctx, userId, post.legacyId)) {
        summary.skipped += 1;
        continue;
      }
      if (dryRun) {
        summary.postsCreated += 1;
        continue;
      }

      const channel = await ensureWorkspaceChannel(
        ctx,
        userId,
        post.brandId,
        post.channelId
      );
      const scheduledDate = formatYmdFromOffset(post.dayOffset, now);
      const fingerprint = contentFingerprint(post.title, post.content);
      const postId = await ctx.db.insert("v2Posts", {
        userId,
        brandId: post.brandId,
        channelId: post.channelId,
        platformId: channel.platformId,
        title: post.title,
        content: post.content,
        status: "scheduled",
        approvalState: "unapproved",
        scheduledDate,
        scheduledTime: post.scheduledTime,
        timezone: "America/Los_Angeles",
        blogExcerpt: post.blogExcerpt,
        blogAuthor: post.blogAuthor,
        blogCategory: post.blogCategory,
        blogTags: post.blogTags,
        blogSlug: post.blogSlug,
        heroImageUrl: post.heroImageUrl,
        contentFingerprint: fingerprint,
        createdAt: now,
        updatedAt: now,
      });
      const intentId = await ctx.db.insert("v2PublishingIntents", {
        postId,
        userId,
        brandId: post.brandId,
        channelId: post.channelId,
        platformId: channel.platformId,
        scheduledDate,
        scheduledTime: post.scheduledTime,
        timezone: "America/Los_Angeles",
        approvalState: "unapproved",
        contentFingerprint: fingerprint,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("v2ProviderStates", {
        postId,
        intentId,
        providerId: providerForChannel(post.channelId),
        status: "not-submitted",
        createdAt: now,
        updatedAt: now,
      });
      await recordPreviewSeed(
        ctx,
        userId,
        post.legacyId,
        "v2Posts",
        String(postId),
        now
      );
      summary.postsCreated += 1;
    }

    return summary;
  },
});

export const listBrands = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const memberships = await ctx.db
      .query("v2BrandMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const brands = await Promise.all(
      memberships.map((membership) =>
        ctx.db
          .query("v2Brands")
          .withIndex("by_brand_id", (q) => q.eq("brandId", membership.brandId))
          .first()
      )
    );
    return brands.filter(Boolean);
  },
});

export const listChannels = query({
  args: { brandId: brandIdValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await ctx.db
      .query("v2Channels")
      .withIndex("by_brand", (q) => q.eq("brandId", args.brandId))
      .collect();
  },
});

export const listPosts = query({
  args: {
    brandIds: v.optional(v.array(brandIdValidator)),
    platformIds: v.optional(v.array(channelIdValidator)),
    statuses: v.optional(
      v.array(
        v.union(
          v.literal("draft"),
          v.literal("approved"),
          v.literal("scheduled"),
          v.literal("submitted"),
          v.literal("queued"), v.literal("publishing"), v.literal("cancel-requested"), v.literal("cancelled"), v.literal("removed"), v.literal("provider-draft"),
          v.literal("published"),
          v.literal("needs-review"),
          v.literal("failed"),
          v.literal("unavailable"),
          v.literal("pr-created")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const accessibleBrands = await accessibleBrandIds(ctx, userId);
    const posts = await ctx.db
      .query("v2Posts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return posts
      .filter((post) => accessibleBrands.has(post.brandId))
      .filter((post) => !args.brandIds?.length || args.brandIds.includes(post.brandId))
      .filter(
        (post) => !args.platformIds?.length || args.platformIds.includes(post.platformId)
      )
      .filter((post) => !args.statuses?.length || args.statuses.includes(post.status))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const listCalendarItems = query({
  args: {
    seriesId: v.optional(v.id("postSeries")),
    brandIds: v.optional(v.array(brandIdValidator)),
    platformIds: v.optional(v.array(channelIdValidator)),
    statuses: v.optional(
      v.array(
        v.union(
          v.literal("draft"),
          v.literal("approved"),
          v.literal("scheduled"),
          v.literal("submitted"),
          v.literal("queued"), v.literal("publishing"), v.literal("cancel-requested"), v.literal("cancelled"), v.literal("removed"), v.literal("provider-draft"),
          v.literal("published"),
          v.literal("needs-review"),
          v.literal("failed"),
          v.literal("unavailable"),
          v.literal("pr-created")
        )
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const accessibleBrands = await accessibleBrandIds(ctx, userId);
    let seriesPostIds: Set<string> | null = null;
    if (args.seriesId) {
      await ownedSeries(ctx, userId, args.seriesId);
      const links = await ctx.db.query("seriesPostLinks").withIndex("by_series", q => q.eq("seriesId", args.seriesId!)).take(5001);
      if (links.length > 5000) throw new Error("Series is too large for one calendar view; use paginated series entries.");
      seriesPostIds = new Set(links.map(link => link.postId));
    }
    // Push the status filter into the index when provided: the calendar no
    // longer scans every post of every status and filters in JS.
    const posts = args.statuses?.length
      ? (
          await Promise.all(
            args.statuses.map((status) =>
              ctx.db
                .query("v2Posts")
                .withIndex("by_user_and_status", (q) =>
                  q.eq("userId", userId).eq("status", status)
                )
                .collect()
            )
          )
        ).flat()
      : await ctx.db
          .query("v2Posts")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();
    const filteredPosts = posts
      .filter(post => !seriesPostIds || seriesPostIds.has(post._id))
      .filter((post) => accessibleBrands.has(post.brandId))
      .filter(
        (post) =>
          post.variantReviewStatus !== "pending" &&
          post.variantReviewStatus !== "rejected"
      )
      .filter((post) => !args.brandIds?.length || args.brandIds.includes(post.brandId))
      .filter(
        (post) => !args.platformIds?.length || args.platformIds.includes(post.platformId)
      );

    const hydrated = await Promise.all(
      filteredPosts.map(async (post) => {
        const intent = await latestIntent(ctx, post._id);
        const providerState = intent
          ? await ctx.db
              .query("v2ProviderStates")
              .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
              .first()
          : null;
        // The full attempt rows and per-post audit trail used to ship for
        // every post on every reactive tick (an O(posts × events) N+1). The
        // list only needs a bounded count + the latest attempt; the drawer
        // loads the full trail for one post at a time via getPostAuditTrail.
        const attempts = intent
          ? await ctx.db
              .query("v2PublishAttempts")
              .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
              .take(11)
          : [];
        return {
          post,
          intent,
          providerState,
          articlePublication:post.channelId==="corvo-blog"?await latestPublication(ctx,post._id):null,
          attemptCount: attempts.length,
          lastAttempt: attempts.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null,
        };
      })
    );

    return hydrated.sort((a, b) => b.post.updatedAt - a.post.updatedAt);
  },
});

export const getPostAuditTrail = query({
  args: {
    postId: v.string(),
    attemptLimit: v.optional(v.number()),
    eventLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const normalizedId = ctx.db.normalizeId("v2Posts", args.postId);
    if (!normalizedId) return { attempts: [], auditEvents: [] };
    const post = await ctx.db.get(normalizedId);
    if (!post) return { attempts: [], auditEvents: [] };
    try {
      await requireBrandAccess(ctx, userId, post.brandId);
    } catch {
      return { attempts: [], auditEvents: [] };
    }
    const attemptLimit = Math.min(Math.max(args.attemptLimit ?? 20, 1), 100);
    const eventLimit = Math.min(Math.max(args.eventLimit ?? 50, 1), 200);
    const intent = await latestIntent(ctx, normalizedId);
    const attempts = intent
      ? (
          await ctx.db
            .query("v2PublishAttempts")
            .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
            .collect()
        ).sort((a, b) => b.createdAt - a.createdAt)
      : [];
    const auditEvents = (
      await ctx.db
        .query("v2AuditEvents")
        .withIndex("by_post", (q) => q.eq("postId", normalizedId))
        .collect()
    ).sort((a, b) => b.createdAt - a.createdAt);
    return {
      attempts: attempts.slice(0, attemptLimit),
      auditEvents: auditEvents.slice(0, eventLimit),
    };
  },
});

export const getPostById = query({
  args: { postId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const normalizedId = ctx.db.normalizeId("v2Posts", args.postId);
    if (!normalizedId) return null;
    try { return await getOwnedPost(ctx, userId, normalizedId); } catch { return null; }
  },
});

export async function createCanonicalPost(
  ctx: MutationCtx,
  userId: string,
  args: {
    brandId: Doc<"v2Posts">["brandId"];
    channelId: Doc<"v2Posts">["channelId"];
    title: string;
    content: string;
    scheduledDate?: string;
    scheduledTime?: string;
    timezone?: string;
    sourceIdeaId?: string;
    sourceResearchBriefId?: string;
  }
) {
    const channel = await ensureWorkspaceChannel(
      ctx,
      userId,
      args.brandId,
      args.channelId
    );

    const now = Date.now();
    const fingerprint = contentFingerprint(args.title, args.content);
    const postId = await ctx.db.insert("v2Posts", {
      userId,
      brandId: args.brandId,
      channelId: args.channelId,
      platformId: channel.platformId,
      title: args.title,
      content: args.content,
      ...(args.channelId === "corvo-blog" ? { blogPublicationIntent: "draft" as const } : {}),
      status: args.scheduledDate ? "scheduled" : "draft",
      approvalState: "unapproved",
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      timezone: args.timezone ?? "America/Los_Angeles",
      sourceIdeaId: args.sourceIdeaId,
      sourceResearchBriefId: args.sourceResearchBriefId,
      contentFingerprint: fingerprint,
      createdAt: now,
      updatedAt: now,
    });

    const intentId = await ctx.db.insert("v2PublishingIntents", {
      postId,
      userId,
      brandId: args.brandId,
      channelId: args.channelId,
      platformId: channel.platformId,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      timezone: args.timezone ?? "America/Los_Angeles",
      approvalState: "unapproved",
      sourceIdeaId: args.sourceIdeaId,
      sourceResearchBriefId: args.sourceResearchBriefId,
      contentFingerprint: fingerprint,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("v2ProviderStates", {
      postId,
      intentId,
      providerId: providerForChannel(args.channelId),
      status: "not-submitted",
      createdAt: now,
      updatedAt: now,
    });

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      postId,
      intentId,
      action: "post.create",
      summary: "Created v2 post and publishing intent.",
    });

    return { postId, intentId };
}

export const createPostWithIntent = mutation({
  args: {
    brandId: brandIdValidator,
    channelId: channelIdValidator,
    title: v.string(),
    content: v.string(),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
    sourceIdeaId: v.optional(v.string()),
    sourceResearchBriefId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return createCanonicalPost(ctx,userId,args);
  },
});

export const deletePost = mutation({
  args: { postId: v.id("v2Posts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (await ctx.db.query("seriesPostLinks").withIndex("by_post", q => q.eq("postId", post._id)).first()) throw new Error("Detach the post from its series before deleting it.");
    if(post.prUrl||post.blogArtifact||post.blogExportClaimKey)throw new Error("Publication receipts and pending exports must be retained; this post cannot be deleted.");
    const receipt=await ctx.db.query("v2PublishAttempts").withIndex("by_post",q=>q.eq("postId",post._id)).take(101);
    if(receipt.length>100||receipt.some(attempt=>attempt.providerId!=="mock"))throw new Error("Publication attempt history must be retained; this post cannot be deleted.");
    const liveStates=await ctx.db.query("v2ProviderStates").withIndex("by_post",q=>q.eq("postId",post._id)).take(101);
    if(liveStates.length>100||liveStates.some(state=>state.simulated!==true&&state.providerPostId&&!state.providerPostId.startsWith("mock-")))throw new Error("Provider receipts must be retained; this post cannot be deleted.");
    const intents = await ctx.db
      .query("v2PublishingIntents")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();

    for (const intent of intents) {
      const providerStates = await ctx.db
        .query("v2ProviderStates")
        .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
        .collect();
      for (const providerState of providerStates) {
        await ctx.db.delete(providerState._id);
      }

      const attempts = await ctx.db
        .query("v2PublishAttempts")
        .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
        .collect();
      for (const attempt of attempts) {
        await ctx.db.delete(attempt._id);
      }

      await ctx.db.delete(intent._id);
    }

    const auditEvents = await ctx.db
      .query("v2AuditEvents")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    for (const event of auditEvents) {
      await ctx.db.delete(event._id);
    }

    const ideaLinks = await ctx.db
      .query("capturedIdeaV2PostLinks")
      .withIndex("by_post", (q) => q.eq("postId", args.postId))
      .collect();
    for (const link of ideaLinks) {
      await ctx.db.delete(link._id);
    }

    await ctx.db.delete(args.postId);

    await audit(ctx, {
      userId,
      brandId: post.brandId,
      action: "post.delete",
      summary: `Deleted draft "${post.title}".`,
      metadata: { deletedPostId: args.postId },
    });

    return { deleted: true };
  },
});

export async function applyEditorialApproval(ctx: MutationCtx, userId: string, post: Doc<"v2Posts">, approvalState: Doc<"v2Posts">["approvalState"]) {
    const role = await requireBrandAccess(ctx,userId,post.brandId);
    if(post.userId!==userId || role.role === "viewer") throw new Error("Editor access required");
    if (post.blogExportClaimKey) throw new Error("Blog export is pending; reconcile it before editing this version.");
    const intent = await latestIntent(ctx, post._id);
    if (!intent) throw new Error("Publishing intent not found");
    if (approvalState === "approved" && post.channelId === "corvo-blog") {
      const missing = missingBlogEditorialFields(post);
      if (missing.length) throw new Error(`Review blog metadata before approval: ${missing.join(", ")}`);
    }
    const fingerprint = post.channelId === "corvo-blog"
      ? blogEditorialFingerprint(post) : contentFingerprint(post.title, post.content, post.linkedinFirstComment);
    const now = Date.now();
    const nextStatus =
      ["published","queued","publishing","submitted","cancel-requested","cancelled","removed"].includes(post.status) ? post.status :
      approvalState === "approved"
        ? post.scheduledDate
          ? "scheduled"
          : "approved"
        : "draft";

    await ctx.db.patch(post._id, {
      approvalState: approvalState,
      status: nextStatus,
      contentFingerprint: fingerprint,
      updatedAt: now,
    });
    await ctx.db.patch(intent._id, {
      approvalState: approvalState,
      contentFingerprint: fingerprint,
      updatedAt: now,
    });
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: post._id,
      intentId: intent._id,
      action: "post.approval",
      summary: `Approval changed to ${approvalState}.`,
    });
}

export const setApproval = mutation({
  args:{postId:v.id("v2Posts"),approvalState:approvalValidator},returns:v.any(),
  handler:async(ctx,args)=>{const userId=await requireUserId(ctx);const post=await getOwnedPost(ctx,userId,args.postId);await applyEditorialApproval(ctx,userId,post,args.approvalState);}
});

export const reschedule = mutation({
  args: {
    postId: v.id("v2Posts"),
    scheduledDate: v.string(),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.blogExportClaimKey) throw new Error("Blog export is pending; reconcile it before editing this version.");
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");
    if (post.blogSyncPending) throw new Error("Article schedule sync is in progress; refresh before changing it again.");
    const syncKey = JSON.stringify([args.scheduledDate, args.scheduledTime ?? null, args.timezone ?? post.timezone]);
    const now = Date.now();
    const timezone = args.timezone ?? post.timezone;

    await ctx.db.patch(args.postId, {
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      timezone,
      status: post.approvalState === "approved" ? "scheduled" : post.status,
      updatedAt: now,
    });
    await ctx.db.patch(intent._id, {
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      timezone: args.timezone ?? intent.timezone,
      updatedAt: now,
    });
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: args.postId,
      intentId: intent._id,
      action: "post.reschedule",
      summary: "Date-only schedule change preserved approval state.",
    });

    if (post.prUrl && post.branchName) {
      const providerState = await ctx.db
        .query("v2ProviderStates")
        .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
        .first();
      if (providerState?.providerId === "github-pr") {
        await ctx.db.patch(post._id, {blogSyncPending: syncKey});
        await ctx.scheduler.runAfter(0, internal.githubPrSync.syncFrontmatterAfterReschedule, {
          syncKey,
          artifact: post.blogArtifact,
          expectedTitle: post.title,
          expectedSlug: post.blogSlug,
          postId: args.postId,
          userId,
          brandId: post.brandId,
          intentId: intent._id,
          branchName: post.branchName,
          prUrl: post.prUrl,
          scheduledDate: args.scheduledDate,
          scheduledTime: args.scheduledTime,
          timezone,
        });
      }
    }
  },
});

export const recordGithubPrFrontmatterSynced = internalMutation({
  args: {
    syncKey: v.optional(v.string()),
    artifact: v.optional(blogArtifactValidator),
    postId: v.id("v2Posts"),
    userId: v.string(),
    brandId: brandIdValidator,
    intentId: v.id("v2PublishingIntents"),
    filePath: v.string(),
    scheduledDate: v.string(),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!args.syncKey || !post || post.blogSyncPending !== args.syncKey) return;
    await ctx.db.patch(post._id, {blogSyncPending: undefined, ...(args.artifact ? {blogArtifact: args.artifact} : {})});
    if (!post.blogArtifact && args.artifact) await audit(ctx, {userId: args.userId, brandId: args.brandId, postId: post._id, action: "blog.artifact_backfill", summary: "Bound a legacy article from one unambiguous PR diff match.", metadata: args.artifact});
    const now = Date.now();
    const providerState = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_intent", (q) => q.eq("intentId", args.intentId))
      .first();
    const summary = `GitHub PR frontmatter synced for ${args.scheduledDate}.`;

    if (providerState) {
      await ctx.db.patch(providerState._id, {
        lastResponseSummary: summary,
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      postId: args.postId,
      intentId: args.intentId,
      action: "provider.github_pr_reschedule_sync",
      summary,
      metadata: {
        filePath: args.filePath,
        scheduledDate: args.scheduledDate,
        scheduledTime: args.scheduledTime,
        timezone: args.timezone,
      },
    });
  },
});

export const markGithubPrRescheduleNeedsReview = internalMutation({
  args: {
    syncKey: v.optional(v.string()),
    artifact: v.optional(blogArtifactValidator),
    postId: v.id("v2Posts"),
    userId: v.string(),
    brandId: brandIdValidator,
    intentId: v.id("v2PublishingIntents"),
    reason: v.string(),
    prUrl: v.string(),
    branchName: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!args.syncKey || !post || post.blogSyncPending !== args.syncKey) return;
    await ctx.db.patch(post._id, {blogSyncPending: undefined, ...(args.artifact ? {blogArtifact: args.artifact} : {})});
    const now = Date.now();
    const summary = `Reschedule could not update GitHub PR frontmatter (${args.reason}); marked Needs Review.`;
    const providerState = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_intent", (q) => q.eq("intentId", args.intentId))
      .first();

    if (providerState) {
      await ctx.db.patch(providerState._id, {
        status: "needs-review",
        lastResponseSummary: summary,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("v2ProviderStates", {
        postId: args.postId,
        intentId: args.intentId,
        providerId: "github-pr",
        status: "needs-review",
        prUrl: args.prUrl,
        lastResponseSummary: summary,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(args.postId, {
      status: "needs-review",
      updatedAt: now,
    });

    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      postId: args.postId,
      intentId: args.intentId,
      action: "provider.github_pr_reschedule_needs_review",
      summary,
      metadata: {
        reason: args.reason,
        prUrl: args.prUrl,
        branchName: args.branchName,
      },
    });
  },
});

export const updateContent = mutation({
  args: {
    postId: v.id("v2Posts"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    linkedinFirstComment: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.blogExportClaimKey) throw new Error("Blog export is pending; reconcile it before editing this version.");
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");
    const title = args.title ?? post.title;
    const content = args.content ?? post.content;
    if (args.linkedinFirstComment !== undefined && post.channelId !== "linkedin") {
      throw new Error("First comments are only available for LinkedIn posts.");
    }
    const linkedinFirstComment = args.linkedinFirstComment?.trim() ?? post.linkedinFirstComment;
    const now = Date.now();

    await ctx.db.patch(args.postId, {
      title,
      content,
      linkedinFirstComment,
      approvalState: "unapproved",
      status: "draft",
      contentFingerprint: contentFingerprint(title, content, linkedinFirstComment),
      updatedAt: now,
    });
    await ctx.db.patch(intent._id, {
      approvalState: "unapproved",
      contentFingerprint: contentFingerprint(title, content, linkedinFirstComment),
      updatedAt: now,
    });
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: args.postId,
      intentId: intent._id,
      action: "post.content_change",
      summary: "Content change cleared approval.",
    });
    return null;
  },
});

export const updatePlatformSettings = mutation({
  args: { postId: v.id("v2Posts"), platformSettings: platformSettingsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.blogExportClaimKey) throw new Error("Blog export is pending; reconcile it before editing this version.");
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");
    const now = Date.now();
    await ctx.db.patch(args.postId, { platformSettings: args.platformSettings, approvalState: "unapproved", status: "draft", updatedAt: now });
    await ctx.db.patch(intent._id, { approvalState: "unapproved", updatedAt: now });
    await audit(ctx, { userId, brandId: post.brandId, postId: args.postId, intentId: intent._id, action: "post.platform_settings_change", summary: "Platform settings change cleared approval.", metadata: { channelId: post.channelId } });
  },
});

export const submitMockProvider = mutation({
  args: {
    postId: v.id("v2Posts"),
    mode: v.optional(mockModeValidator),
    retry: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");
    const channel = await ctx.db
      .query("v2Channels")
      .withIndex("by_brand_and_channel", (q) =>
        q.eq("brandId", post.brandId).eq("channelId", post.channelId)
      )
      .first();
    const now = Date.now();

    const ineligibleReason = providerSubmissionIneligibilityReason({
      routable: Boolean(channel?.routable),
      approvalState: post.approvalState==="approved"?intent.approvalState:post.approvalState,
      scheduledDate: intent.scheduledDate,
      contentFingerprint: intent.contentFingerprint,
      currentFingerprint: contentFingerprint(post.title, post.content, post.linkedinFirstComment),
    });

    if (ineligibleReason) {
      await audit(ctx, {
        userId,
        brandId: post.brandId,
        postId: post._id,
        intentId: intent._id,
        action: "provider.skip",
        summary: ineligibleReason,
      });
      return { submitted: false, reason: ineligibleReason };
    }

    const previousAttempts = await ctx.db
      .query("v2PublishAttempts")
      .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
      .collect();
    const latestAttempt = [...previousAttempts].sort((a, b) => b.createdAt - a.createdAt)[0];
    const baseIdempotencyKey = `${intent._id}:${intent.contentFingerprint}`;
    const existingAttempt = await ctx.db
      .query("v2PublishAttempts")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", baseIdempotencyKey))
      .first();
    if (existingAttempt) {
      const retryable =
        args.retry &&
        latestAttempt?.status === "retryable-failure";
      if (!retryable) {
        return {
          submitted: false,
          reason: args.retry
            ? "Previous attempt is not retryable."
            : "Duplicate submission prevented.",
        };
      }
    }
    if (args.retry && !existingAttempt) {
      return { submitted: false, reason: "No previous attempt exists to retry." };
    }

    const mode = args.mode ?? "success";
    const status =
      mode === "published" || mode === "success" ? "success" : mode;
    const idempotencyKey = args.retry
      ? `${baseIdempotencyKey}:retry:${previousAttempts.length}`
      : baseIdempotencyKey;
    const attemptId = await ctx.db.insert("v2PublishAttempts", {
      postId: post._id,
      intentId: intent._id,
      userId,
      providerId: "mock",
      status,
      idempotencyKey,
      retryCount: previousAttempts.length,
      submissionSnapshot: {
        postId: String(post._id),
        brandId: post.brandId,
        channelId: post.channelId,
        title: post.title,
        content: post.content,
        scheduledDate: intent.scheduledDate,
        scheduledTime: intent.scheduledTime,
        timezone: intent.timezone,
      },
      sanitizedResponse: sanitizeProviderResponse({
        mode,
        providerPostId: `mock-${post._id}`,
        accessToken: "should-not-persist",
      }),
      createdAt: now,
      updatedAt: now,
    });

    const providerStatus =
      mode === "published"
        ? "published"
        : mode === "success"
          ? "submitted"
          : mode === "ambiguous"
            ? "needs-review"
            : mode === "unavailable"
              ? "unavailable"
              : "failed";
    const postStatus =
      providerStatus === "published"
        ? "published"
        : providerStatus === "needs-review"
          ? "needs-review"
          : providerStatus === "unavailable"
            ? "unavailable"
            : providerStatus === "failed"
              ? "failed"
              : "submitted";

    const providerState = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
      .first();
    if (providerState) {
      await ctx.db.patch(providerState._id, {
        providerId: "mock",
        status: providerStatus,
        simulated: true,
        providerPostId:
          providerStatus === "submitted" || providerStatus === "published"
            ? `mock-${post._id}`
            : undefined,
        lastAttemptId: attemptId,
        lastResponseSummary:
          mode === "ambiguous"
            ? "Mock provider returned an ambiguous outcome."
            : `Simulated submission result: ${mode}.`,
        updatedAt: now,
      });
    }

    await ctx.db.patch(post._id, {
      status: postStatus,
      updatedAt: now,
    });
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: post._id,
      intentId: intent._id,
      action: "provider.mock_submit",
      summary: `Mock provider result: ${mode}.`,
      metadata: { attemptId },
    });

    return { submitted: true, attemptId };
  },
});

export const recordProviderIntent = mutation({
  args: {
    postId: v.id("v2Posts"),
    intentType: providerIntentValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");
    const now = Date.now();
    const summary =
      args.intentType === "unpublish"
        ? "Unpublish intent recorded for human/operator follow-up."
        : "Cancel intent recorded for human/operator follow-up.";
    const providerState = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
      .first();

    if (providerState) {
      await ctx.db.patch(providerState._id, {
        status: "cancel-intent-recorded",
        lastResponseSummary: summary,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("v2ProviderStates", {
        postId: post._id,
        intentId: intent._id,
        providerId: providerForChannel(post.channelId),
        status: "cancel-intent-recorded",
        lastResponseSummary: summary,
        createdAt: now,
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: post._id,
      intentId: intent._id,
      action:
        args.intentType === "unpublish"
          ? "provider.unpublish_intent"
          : "provider.cancel_intent",
      summary,
    });

    return { recorded: true, intentType: args.intentType };
  },
});

export const recordGithubPr = mutation({
  args: {
    postId: v.id("v2Posts"),
    result: githubPrRecordValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.channelId !== "corvo-blog") {
      throw new Error("GitHub PR recording is only available for Corvo Blog posts.");
    }
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");

    if (post.blogExportClaimKey && post.blogExportClaimKey !== args.result.exportClaimKey) throw new Error("Export claim mismatch");
    if (post.prUrl === args.result.prUrl) return;
    const now = Date.now();
    const sanitizedResponse = sanitizeProviderResponse(
      args.result.sanitizedResponse &&
        typeof args.result.sanitizedResponse === "object" &&
        !Array.isArray(args.result.sanitizedResponse)
        ? (args.result.sanitizedResponse as Record<string, unknown>)
        : {
            prUrl: args.result.prUrl,
            branchName: args.result.branchName,
          }
    );
    const attemptId = await ctx.db.insert("v2PublishAttempts", {
      postId: post._id,
      intentId: intent._id,
      userId,
      providerId: "github-pr",
      status: "success",
      idempotencyKey: `github-pr:${intent._id}:${args.result.branchName}`,
      retryCount: 0,
      submissionSnapshot: {
        postId: String(post._id),
        brandId: post.brandId,
        channelId: post.channelId,
        title: post.title,
        content: post.content,
        scheduledDate: intent.scheduledDate,
        scheduledTime: intent.scheduledTime,
        timezone: intent.timezone,
      },
      sanitizedResponse,
      createdAt: now,
      updatedAt: now,
    });

    const providerState = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
      .first();
    const summary = `GitHub PR recorded for manual review: ${args.result.prUrl}`;
    if (providerState) {
      await ctx.db.patch(providerState._id, {
        providerId: "github-pr",
        status: "submitted",
        prUrl: args.result.prUrl,
        lastAttemptId: attemptId,
        lastResponseSummary: summary,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("v2ProviderStates", {
        postId: post._id,
        intentId: intent._id,
        providerId: "github-pr",
        status: "submitted",
        prUrl: args.result.prUrl,
        lastAttemptId: attemptId,
        lastResponseSummary: summary,
        createdAt: now,
        updatedAt: now,
      });
    }

    const prStatus = args.result.prStatus ?? "open";
    await ctx.db.patch(post._id, {
      blogExportClaimKey: undefined,
      status: "pr-created",
      prUrl: args.result.prUrl,
      branchName: args.result.branchName,
      blogArtifact: args.result.artifact ?? post.blogArtifact,
      blogPrNumber: args.result.prNumber,
      blogPrStatus: prStatus,
      blogPrUpdatedAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: post._id,
      intentId: intent._id,
      action: "provider.github_pr_record",
      summary,
      metadata: { attemptId, prUrl: args.result.prUrl },
    });

    return { recorded: true, attemptId };
  },
});

export const createVariantPost = mutation({
  args: {
    ideaId: v.id("capturedIdeas"),
    brandId: brandIdValidator,
    channelId: channelIdValidator,
    title: v.string(),
    content: v.string(),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.userId !== userId) {
      throw new Error("Idea not found");
    }

    const channel = await ensureWorkspaceChannel(
      ctx,
      userId,
      args.brandId,
      args.channelId
    );
    const now = Date.now();
    const fingerprint = contentFingerprint(args.title, args.content);
    const timezone = args.timezone ?? "America/Los_Angeles";

    const postId = await ctx.db.insert("v2Posts", {
      userId,
      brandId: args.brandId,
      channelId: args.channelId,
      platformId: channel.platformId,
      title: args.title,
      content: args.content,
      status: "draft",
      approvalState: "unapproved",
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      timezone,
      sourceIdeaId: String(args.ideaId),
      variantReviewStatus: "pending",
      contentFingerprint: fingerprint,
      createdAt: now,
      updatedAt: now,
    });

    const intentId = await ctx.db.insert("v2PublishingIntents", {
      postId,
      userId,
      brandId: args.brandId,
      channelId: args.channelId,
      platformId: channel.platformId,
      scheduledDate: args.scheduledDate,
      scheduledTime: args.scheduledTime,
      timezone,
      approvalState: "unapproved",
      sourceIdeaId: String(args.ideaId),
      contentFingerprint: fingerprint,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("v2ProviderStates", {
      postId,
      intentId,
      providerId: providerForChannel(args.channelId),
      status: "not-submitted",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("capturedIdeaV2PostLinks", {
      ideaId: args.ideaId,
      postId,
      userId,
      brandId: args.brandId,
      channelId: args.channelId,
      createdAt: now,
    });

    if (idea.status === "inbox") {
      await ctx.db.patch(args.ideaId, {
        status: "reviewing",
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      postId,
      intentId,
      action: "variant.create",
      summary: `Generated ${args.channelId} variant from idea.`,
      metadata: { ideaId: String(args.ideaId) },
    });

    return { postId, intentId };
  },
});

export const acceptVariantPost = mutation({
  args: {
    postId: v.id("v2Posts"),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.variantReviewStatus !== "pending") {
      throw new Error("Only pending variants can be accepted.");
    }
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");

    const now = Date.now();
    const scheduledDate = args.scheduledDate ?? post.scheduledDate ?? new Date().toISOString().slice(0, 10);
    const scheduledTime = args.scheduledTime ?? post.scheduledTime ?? "09:00";
    const timezone = args.timezone ?? post.timezone ?? "America/Los_Angeles";
    const nextStatus = "scheduled";

    await ctx.db.patch(args.postId, {
      variantReviewStatus: "accepted",
      approvalState: "approved",
      status: nextStatus,
      scheduledDate,
      scheduledTime,
      timezone,
      updatedAt: now,
    });
    await ctx.db.patch(intent._id, {
      approvalState: "approved",
      scheduledDate,
      scheduledTime,
      timezone,
      updatedAt: now,
    });

    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: args.postId,
      intentId: intent._id,
      action: "variant.accept",
      summary: "Accepted variant and scheduled on the calendar.",
    });

    return { accepted: true };
  },
});

export const rejectVariantPost = mutation({
  args: { postId: v.id("v2Posts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.variantReviewStatus !== "pending") {
      throw new Error("Only pending variants can be rejected.");
    }
    const intent = await latestIntent(ctx, args.postId);
    const now = Date.now();

    await ctx.db.patch(args.postId, {
      variantReviewStatus: "rejected",
      status: "unavailable",
      updatedAt: now,
    });

    if (intent) {
      await audit(ctx, {
        userId,
        brandId: post.brandId,
        postId: args.postId,
        intentId: intent._id,
        action: "variant.reject",
        summary: "Rejected generated variant.",
      });
    }

    return { rejected: true };
  },
});

export const updateBlogMetadata = mutation({
  args: {
    postId: v.id("v2Posts"),
    metadata: blogMetadataValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.blogExportClaimKey) throw new Error("Blog export is pending; reconcile it before editing this version.");
    if (post.channelId !== "corvo-blog") {
      throw new Error("Blog metadata is only available for Corvo Blog posts.");
    }
    const intent = await latestIntent(ctx, args.postId);
    const metadata = {...args.metadata, ...(args.metadata.heroImageUrl && !args.metadata.heroImageStorageId ? {heroImageStorageId: undefined, preparedHero: undefined} : {})};
    if (args.metadata.heroImageStorageId !== undefined && args.metadata.heroImageStorageId !== post.heroImageStorageId) Object.assign(metadata, {preparedHero: undefined});
    const merged = { ...post, ...metadata };
    if (merged.blogSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(merged.blogSlug)) throw new Error("Invalid blog slug");
    const fingerprint = blogEditorialFingerprint(merged);
    if (fingerprint === blogEditorialFingerprint(post)) return { updated: false };
    const now = Date.now();

    await ctx.db.patch(args.postId, {
      ...metadata,
      contentFingerprint: fingerprint,
      approvalState: "unapproved",
      status: "draft",
      updatedAt: now,
    });

    if (intent) {
      await ctx.db.patch(intent._id, {
        approvalState: "unapproved",
        contentFingerprint: fingerprint,
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: args.postId,
      intentId: intent?._id,
      action: "post.blog_metadata_change",
      summary: "Updated blog metadata and cleared approval for re-review.",
    });

    return { updated: true };
  },
});

export const recordBlogPrStatus = mutation({
  args: {
    postId: v.id("v2Posts"),
    prStatus: v.union(
      v.literal("open"),
      v.literal("merged"),
      v.literal("closed"),
      v.literal("draft")
    ),
    prNumber: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.channelId !== "corvo-blog") {
      throw new Error("PR status is only available for Corvo Blog posts.");
    }
    const now = Date.now();
    const patch: Partial<Doc<"v2Posts">> = {
      blogPrStatus: args.prStatus,
      blogPrUpdatedAt: now,
      updatedAt: now,
    };
    if (args.prNumber !== undefined) {
      patch.blogPrNumber = args.prNumber;
    }
    // Legacy display-only PR receipt. Merge cannot verify Production or availability.

    await ctx.db.patch(args.postId, patch);
    return { updated: true, prStatus: args.prStatus };
  },
});

function isBufferLiveSubmissionEnvApproved() {
  return process.env.BUFFER_LIVE_SUBMISSION === "approved";
}

const assembleLinkedInSubmissionContent=linkedInPayload;

function isLiveBufferProviderPostId(providerPostId: string | undefined): boolean {
  if (!providerPostId?.trim()) return false;
  return !providerPostId.startsWith("mock-");
}

function mapProviderStateToPostStatus(
  providerStateStatus: Doc<"v2ProviderStates">["status"]
): Doc<"v2Posts">["status"] {
  if (["queued","publishing","cancel-requested","cancelled","removed","provider-draft"].includes(providerStateStatus)) return providerStateStatus as Doc<"v2Posts">["status"];
  if (providerStateStatus === "published") return "published";
  if (providerStateStatus === "needs-review") return "needs-review";
  if (providerStateStatus === "unavailable") return "unavailable";
  if (providerStateStatus === "failed") return "failed";
  if (providerStateStatus === "submitted") return "submitted";
  return "scheduled";
}

export const listProviderStatesByStatus = internalQuery({
  args: {
    status: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const status = args.status as Doc<"v2ProviderStates">["status"];
    return await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(limit);
  },
});

export const recordBufferStatusRefresh = internalMutation({
  args: {providerStateId:v.id("v2ProviderStates"),postId:v.id("v2Posts"),providerStateStatus:deliveryStatusValidator,providerPostId:v.optional(v.string()),reason:v.optional(v.string()),sanitizedResponse:v.optional(v.any()),checkedAt:v.optional(v.number()),expectedAttemptId:v.optional(v.id("v2PublishAttempts")),ok:v.optional(v.boolean())},
  returns:v.any(),handler:async(ctx,args)=>applyRefresh(ctx,args),
});


export const bufferLiveSubmissionEnabled = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return { enabled: isBufferLiveSubmissionEnvApproved() };
  },
});

export async function bufferSubmissionContext(
  ctx: QueryCtx | MutationCtx,
  args: { postId: Id<"v2Posts">; userId: string; retry?: boolean },
  sharedCapacity?: Awaited<ReturnType<typeof dispatchCapacity>>["capacity"],
) {
  const post = await ctx.db.get(args.postId);
  if (!post || post.userId !== args.userId) {
    return { eligible: false as const, reason: "Post not found" };
  }
  try {
    const access = await requireBrandAccess(ctx, args.userId, post.brandId);
    if (access.role === "viewer")
      return {
        eligible: false as const,
        reason: "Editor access required for Buffer dispatch.",
      };
  } catch {
    return { eligible: false as const, reason: "Brand access denied" };
  }
  if (post.channelId !== "linkedin") {
    return {
      eligible: false as const,
      brandId: post.brandId,
      reason: "Buffer live submission is only available for LinkedIn posts.",
    };
  }
  if (!brandHasBufferLinkedInMapping(post.brandId)) {
    return {
      eligible: false as const,
      brandId: post.brandId,
      reason: `No Buffer LinkedIn channel mapping exists for brand ${post.brandId}.`,
    };
  }

  const intent = await latestIntent(ctx, args.postId);
  if (!intent) {
    return {
      eligible: false as const,
      brandId: post.brandId,
      reason: "Publishing intent not found",
    };
  }

  const channel = await ctx.db
    .query("v2Channels")
    .withIndex("by_brand_and_channel", (q) =>
      q.eq("brandId", post.brandId).eq("channelId", post.channelId),
    )
    .first();

  const ineligibleReason = providerSubmissionIneligibilityReason({
    routable: Boolean(channel?.routable),
    approvalState: intent.approvalState,
    scheduledDate: intent.scheduledDate,
    contentFingerprint: intent.contentFingerprint,
    currentFingerprint: contentFingerprint(
      post.title,
      post.content,
      post.linkedinFirstComment,
    ),
  });

  if (ineligibleReason) {
    return {
      eligible: false as const,
      brandId: post.brandId,
      intentId: intent._id,
      reason: ineligibleReason,
    };
  }

  if (postScheduleVersion(post) !== postScheduleVersion(intent))
    return {
      eligible: false as const,
      brandId: post.brandId,
      intentId: intent._id,
      reason:
        "Saved post and publishing intent schedules differ; review the exact date again.",
    };
  const articleReason = await companionSubmissionHold(ctx, post);
  if (articleReason)
    return {
      eligible: false as const,
      brandId: post.brandId,
      intentId: intent._id,
      reason: articleReason,
    };
  const destinationReason = await destinationSubmissionHold(ctx, post);
  if (destinationReason)
    return {
      eligible: false as const,
      brandId: post.brandId,
      intentId: intent._id,
      reason: destinationReason,
    };
  const reviewedDestination = (await readDestination(
    ctx,
    post.userId,
    post.brandId,
  ))!.destination!;

  const priorReason = await priorDispatchHold(ctx, post._id);
  if (priorReason)
    return {
      eligible: false as const,
      brandId: post.brandId,
      intentId: intent._id,
      reason: priorReason,
    };
  const allocation = await dispatchCapacity(ctx, post, sharedCapacity);
  if (allocation.reason)
    return {
      eligible: false as const,
      brandId: post.brandId,
      intentId: intent._id,
      reason: allocation.reason,
    };
  const previousAttempts = (await priorBufferAttempts(ctx, post._id)).rows;
  const latestAttempt = [...previousAttempts].sort(
    (a, b) => b.createdAt - a.createdAt,
  )[0];
  const baseIdempotencyKey = `${intent._id}:${intent.contentFingerprint}`;
  const existingAttempt = await ctx.db
    .query("v2PublishAttempts")
    .withIndex("by_idempotency_key", (q) =>
      q.eq("idempotencyKey", baseIdempotencyKey),
    )
    .first();

  if (existingAttempt) {
    const retryable =
      args.retry && latestAttempt?.status === "retryable-failure";
    if (!retryable) {
      return {
        eligible: false as const,
        brandId: post.brandId,
        intentId: intent._id,
        reason: args.retry
          ? "Previous attempt is not retryable."
          : "Duplicate submission prevented.",
      };
    }
  }
  if (args.retry && !existingAttempt) {
    return {
      eligible: false as const,
      brandId: post.brandId,
      intentId: intent._id,
      reason: "No previous attempt exists to retry.",
    };
  }

  const idempotencyKey = args.retry
    ? `${baseIdempotencyKey}:retry:${previousAttempts.length}`
    : baseIdempotencyKey;

  return {
    eligible: true as const,
    brandId: post.brandId,
    intentId: intent._id,
    retryCount: previousAttempts.length,
    idempotencyKey,
    submission: {
      postId: String(post._id),
      brandId: post.brandId,
      channelId: post.channelId,
      title: post.title,
      content: assembleLinkedInSubmissionContent(
        post.content,
        post.platformSettings,
      ),
      firstComment: post.linkedinFirstComment?.trim() || undefined,
      scheduledDate: intent.scheduledDate,
      scheduledTime: intent.scheduledTime,
      timezone: intent.timezone,
      idempotencyKey,
      expectedDestination: reviewedDestination,
    },
  };
}
export const getBufferSubmissionContext = internalQuery({
  args: {
    postId: v.id("v2Posts"),
    userId: v.string(),
    retry: v.optional(v.boolean()),
  },
  handler: (ctx, args) => bufferSubmissionContext(ctx, args),
});

export const getBufferCancelContext = internalQuery({
  args: {
    postId: v.id("v2Posts"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== args.userId) {
      return { eligible: false as const, reason: "Post not found" };
    }
    try {
      const access=await requireBrandAccess(ctx, args.userId, post.brandId);
      if(access.role==="viewer")return {eligible:false as const,reason:"Editor access required for Buffer dispatch."};
    } catch {
      return { eligible: false as const, reason: "Brand access denied" };
    }
    if (post.channelId !== "linkedin") {
      return {
        eligible: false as const,
        reason: "Buffer cancel is only available for LinkedIn posts.",
      };
    }

    const intent = await latestIntent(ctx, args.postId);
    if (!intent) {
      return { eligible: false as const, reason: "Publishing intent not found" };
    }

    const providerState = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
      .first();

    if (
      !providerState ||
      providerState.simulated === true ||
      providerState.providerId !== "buffer" ||
      !isLiveBufferProviderPostId(providerState.providerPostId)
    ) {
      return {
        eligible: false as const,
        reason:
          "Buffer cancel requires an existing non-simulated Buffer submission with a provider post id.",
      };
    }

    if (providerState.status === "cancel-intent-recorded") {
      return {
        eligible: false as const,
        reason: "Buffer cancel was already recorded for this submission.",
      };
    }

    return {
      eligible: true as const,
      brandId: post.brandId,
      intentId: intent._id,
      providerPostId: providerState.providerPostId,
      contentFingerprint: intent.contentFingerprint,
      title: post.title,
      content: assembleLinkedInSubmissionContent(post.content, post.platformSettings),
      scheduledDate: intent.scheduledDate,
      scheduledTime: intent.scheduledTime,
      timezone: intent.timezone,
      channelId: post.channelId,
    };
  },
});

const bufferAttemptStatusValidator = v.union(
  v.literal("pending"),
  v.literal("success"),
  v.literal("retryable-failure"),
  v.literal("permanent-failure"),
  v.literal("ambiguous"),
  v.literal("unavailable")
);

const bufferProviderStateStatusValidator = deliveryStatusValidator;

export const claimBufferSubmission = internalMutation({
  args: {
    postId: v.id("v2Posts"),
    userId: v.string(),
    retry: v.optional(v.boolean()),
    reviewRowId: v.optional(v.id("queueReleaseRows")),
    runId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({
      eligible: v.literal(false),
      reason: v.string(),
      brandId: v.optional(brandIdValidator),
      intentId: v.optional(v.id("v2PublishingIntents")),
    }),
    v.object({
      eligible: v.literal(true),
      brandId: brandIdValidator,
      intentId: v.id("v2PublishingIntents"),
      attemptId: v.id("v2PublishAttempts"),
      retryCount: v.number(),
      idempotencyKey: v.string(),
      contentFingerprint: v.string(),
      submission: v.object({
        postId: v.string(),
        brandId: brandIdValidator,
        channelId: channelIdValidator,
        title: v.string(),
        content: v.string(),
        firstComment: v.optional(v.string()),
        scheduledDate: v.optional(v.string()),
        scheduledTime: v.optional(v.string()),
        timezone: v.string(),
        idempotencyKey: v.string(),
        expectedDestination: destinationValidator,
      }),
    }),
  ),
  handler: async (ctx, args) => {
    const context = await bufferSubmissionContext(ctx, args);
    if (!context.eligible) return context;
    const post = (await ctx.db.get(args.postId))!;
    const intent = (await ctx.db.get(context.intentId))!;
    const previousAttempts = (await priorBufferAttempts(ctx, post._id)).rows;
    const idempotencyKey = context.idempotencyKey;
    const reviewedDestination = context.submission.expectedDestination;
    const allocation = await dispatchCapacity(ctx, post);
    const pin = await releasePin(ctx, post, allocation.capacity);
    let reviewRow: Doc<"queueReleaseRows"> | null = null;
    if (args.reviewRowId) {
      reviewRow = await ctx.db.get(args.reviewRowId);
      const review = reviewRow ? await ctx.db.get(reviewRow.reviewId) : null;
      const series = review?.seriesId
        ? await ctx.db.get(review.seriesId)
        : null;
      if (
        !reviewRow ||
        reviewRow.postId !== post._id ||
        review?.userId !== args.userId ||
        review.status !== "running" ||
        review.runId !== args.runId ||
        Date.now() - review.createdAt > 300000 ||
        reviewRow.status !== "ready" ||
        Boolean(reviewRow.retry) !== Boolean(args.retry) ||
        reviewRow.reviewVersion !== pin.version ||
        (series && series.revision !== review?.seriesRevision)
      )
        return {
          eligible: false as const,
          brandId: post.brandId,
          intentId: intent._id,
          reason: "Queue review changed or expired; prepare a new review.",
        };
      const reservationReason = await reviewReservationsHold(
        ctx,
        review,
        allocation.capacity,
      );
      if (reservationReason)
        return {
          eligible: false as const,
          brandId: post.brandId,
          intentId: intent._id,
          reason: reservationReason,
        };
    }
    // Serialize concurrent claims by patching the intent document.
    if (
      intent.activeBufferClaimKey &&
      intent.activeBufferClaimKey !== idempotencyKey &&
      !args.retry
    ) {
      return {
        eligible: false as const,
        brandId: post.brandId,
        intentId: intent._id,
        reason: "Duplicate submission prevented.",
      };
    }
    if (intent.activeBufferClaimKey === idempotencyKey) {
      return {
        eligible: false as const,
        brandId: post.brandId,
        intentId: intent._id,
        reason: "Duplicate submission prevented.",
      };
    }

    const now = Date.now();
    const submissionSnapshot = {
      postId: String(post._id),
      brandId: post.brandId,
      channelId: post.channelId,
      title: post.title,
      content: assembleLinkedInSubmissionContent(
        post.content,
        post.platformSettings,
      ),
      firstComment: post.linkedinFirstComment?.trim() || undefined,
      scheduledDate: intent.scheduledDate,
      scheduledTime: intent.scheduledTime,
      timezone: intent.timezone,
    };

    await ctx.db.patch(intent._id, {
      activeBufferClaimKey: idempotencyKey,
      updatedAt: now,
    });

    const attemptId = await ctx.db.insert("v2PublishAttempts", {
      postId: post._id,
      intentId: intent._id,
      userId: args.userId,
      providerId: "buffer",
      status: "pending",
      idempotencyKey,
      retryCount: previousAttempts.length,
      submissionSnapshot,
      sanitizedResponse: { providerId: "buffer", phase: "claimed" },
      createdAt: now,
      updatedAt: now,
    });

    const claimId = await allocateDispatch(
      ctx,
      post,
      intent._id,
      attemptId,
      pin,
      allocation.capacity,
    );
    if (reviewRow) {
      await ctx.db.patch(claimId, { reviewRowId: reviewRow._id });
      await ctx.db.patch(reviewRow._id, {
        status: "executing",
        attemptId,
        updatedAt: now,
      });
    }

    return {
      eligible: true as const,
      brandId: post.brandId,
      intentId: intent._id,
      attemptId,
      retryCount: previousAttempts.length,
      idempotencyKey,
      contentFingerprint: intent.contentFingerprint,
      submission: {
        ...submissionSnapshot,
        idempotencyKey,
        expectedDestination: reviewedDestination,
      },
    };
  },
});

export const recordBufferSubmitResult = internalMutation({
  args: {
    postId: v.id("v2Posts"),
    userId: v.string(),
    intentId: v.id("v2PublishingIntents"),
    brandId: brandIdValidator,
    attemptId: v.id("v2PublishAttempts"),
    idempotencyKey: v.string(),
    retryCount: v.number(),
    submissionSnapshot: v.object({
      postId: v.string(),
      brandId: brandIdValidator,
      channelId: channelIdValidator,
      title: v.string(),
      content: v.string(),
      firstComment: v.optional(v.string()),
      scheduledDate: v.optional(v.string()),
      scheduledTime: v.optional(v.string()),
      timezone: v.string(),
    }),
    ok: v.boolean(),
    status: bufferAttemptStatusValidator,
    providerStateStatus: bufferProviderStateStatusValidator,
    providerPostId: v.optional(v.string()),
    reason: v.optional(v.string()),
    sanitizedResponse: v.any(),
  },
  returns: v.object({
    recorded: v.literal(true),
    attemptId: v.id("v2PublishAttempts"),
    submitted: v.boolean(),
    stale: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== args.userId) {
      throw new Error("Post not found");
    }
    await requireBrandAccess(ctx, args.userId, post.brandId);

    const intent = await ctx.db.get(args.intentId);
    if (!intent) throw new Error("Publishing intent not found");

    const attempt = await ctx.db.get(args.attemptId);
    if (
      !attempt ||
      attempt.postId !== post._id ||
      attempt.intentId !== intent._id ||
      attempt.idempotencyKey !== args.idempotencyKey
    )
      throw new Error("Submission receipt identity mismatch");
    if (attempt.status !== "pending")
      return {
        recorded: true as const,
        attemptId: attempt._id,
        submitted: attempt.status === "success",
        stale: false,
      };
    const now = Date.now();
    if (
      args.brandId !== post.brandId ||
      intent.postId !== post._id ||
      intent.userId !== args.userId
    )
      throw new Error("Receipt ownership or brand mismatch");
    for (const key of [
      "postId",
      "brandId",
      "channelId",
      "title",
      "content",
      "firstComment",
      "scheduledDate",
      "scheduledTime",
      "timezone",
    ] as const)
      if (attempt.submissionSnapshot[key] !== args.submissionSnapshot[key])
        throw new Error(
          "Submission snapshot does not match the immutable claim",
        );
    const originalAllocation = await ctx.db
      .query("queueDispatchClaims")
      .withIndex("by_attempt", (q) => q.eq("attemptId", attempt._id))
      .first();
    const currentCapacity = (await dispatchCapacity(ctx, post)).capacity;
    const currentRelease = await releasePin(ctx, post, currentCapacity);
    const releaseStillValid =
      !originalAllocation?.reviewVersion ||
      currentRelease.version === originalAllocation.reviewVersion;
    const allocation = await reconcileAllocation(
      ctx,
      args.attemptId,
      args.ok && args.providerPostId
        ? "confirmed"
        : args.status === "ambiguous" ||
            args.status === "pending" ||
            args.providerPostId
          ? "uncertain"
          : "released",
      args.providerPostId,
    );
    if (
      args.sanitizedResponse?.capacityHold === true &&
      allocation?.destination
    ) {
      const d = allocation.destination;
      await ctx.db.insert("queueObservations", {
        userId: post.userId,
        brandId: post.brandId,
        identity: allocation.identity,
        checkedAt: now,
        observation: {
          identity: allocation.identity,
          channelId: d.channelId,
          organizationId: d.organizationId,
          checkedAt: now,
          complete: false,
          providerPosts: [],
          error:
            "Buffer reported a full queue; refresh complete capacity evidence before a new review.",
        },
      });
    }
    if (args.ok && args.providerPostId)
      await consumeReservation(
        ctx,
        post._id,
        args.providerPostId,
        allocation?.identity,
      );
    if (allocation?.reviewRowId)
      await ctx.db.patch(allocation.reviewRowId, {
        status:
          args.ok &&
          args.providerPostId &&
          !args.providerPostId.startsWith("mock-") &&
          ["queued", "publishing", "published"].includes(
            args.providerStateStatus,
          )
            ? "queued"
            : args.status === "ambiguous" || args.providerPostId
              ? "needs-review"
              : args.sanitizedResponse?.capacityHold ||
                  args.sanitizedResponse?.phase === "preflight"
                ? "held"
                : "failed",
        providerPostId: args.providerPostId,
        deliveryStatus: args.providerStateStatus,
        reason: args.reason,
        updatedAt: now,
      });
    if (args.sanitizedResponse?.firstCommentUnsupported === true) {
      const destination = await readDestination(ctx, post.userId, post.brandId);
      if (destination?.destination && attempt.submissionSnapshot.firstComment)
        await ctx.db.patch(destination._id, {
          destination: {
            ...destination.destination,
            firstComment: {
              value: "unsupported",
              source: "provider-observation",
              checkedAt: now,
              evidence:
                "Definitive Buffer response rejected first-comment entitlement for this account.",
            },
          },
        });
    }
    const intentStillValid =
      releaseStillValid &&
      post.approvalState === "approved" &&
      postScheduleVersion(post) ===
        postScheduleVersion(args.submissionSnapshot) &&
      postScheduleVersion(intent) ===
        postScheduleVersion(args.submissionSnapshot) &&
      intent.approvalState === "approved" &&
      intent.contentFingerprint ===
        contentFingerprint(
          post.title,
          post.content,
          post.linkedinFirstComment,
        ) &&
      assembleLinkedInSubmissionContent(post.content, post.platformSettings) ===
        args.submissionSnapshot.content &&
      (post.linkedinFirstComment?.trim() || "") ===
        (args.submissionSnapshot.firstComment ?? "");

    const effectiveOk = args.ok && intentStillValid;
    const effectiveStatus = !intentStillValid
      ? args.ok
        ? ("success" as const)
        : args.status === "pending"
          ? ("ambiguous" as const)
          : args.status
      : args.status === "pending"
        ? ("ambiguous" as const)
        : args.status;
    const effectiveProviderStatus = !intentStillValid
      ? ("needs-review" as const)
      : args.providerStateStatus;
    if (!intentStillValid && allocation?.reviewRowId)
      await ctx.db.patch(allocation.reviewRowId, {
        status: "needs-review",
        reason:
          "Editorial version changed during submission; the known provider receipt is retained.",
      });
    const staleReason =
      "Approval or content changed while Buffer submission was in flight; provider receipt retained and post held for review.";

    const summary = !intentStillValid
      ? staleReason
      : effectiveOk
        ? `Buffer submission recorded${args.providerPostId ? ` (${args.providerPostId})` : ""}.`
        : (args.reason ?? "Buffer submission failed.");

    await ctx.db.patch(args.attemptId, {
      status: effectiveStatus,
      providerPostId: args.providerPostId,
      observedDeliveryStatus: args.providerStateStatus,
      sanitizedResponse: sanitizeProviderResponse(
        args.sanitizedResponse &&
          typeof args.sanitizedResponse === "object" &&
          !Array.isArray(args.sanitizedResponse)
          ? (args.sanitizedResponse as Record<string, unknown>)
          : { providerId: "buffer" },
      ),
      updatedAt: now,
    });

    await ctx.db.patch(args.intentId, {
      activeBufferClaimKey:
        effectiveStatus === "ambiguous" ? args.idempotencyKey : undefined,
      updatedAt: now,
    });

    // Only advance provider/post state when the claimed intent is still approved & unchanged.
    if (intentStillValid || args.providerPostId) {
      const providerState = await ctx.db
        .query("v2ProviderStates")
        .withIndex("by_intent", (q) => q.eq("intentId", args.intentId))
        .first();
      const providerPatch = {
        providerId: "buffer" as const,
        status: effectiveProviderStatus,
        simulated: false,
        providerPostId: args.providerPostId,
        lastAttemptId: args.attemptId,
        lastResponseSummary: summary,
        lastCheckedAt: now,
        lastReceipt: sanitizeProviderResponse(args.sanitizedResponse),
        dueAt:
          typeof args.sanitizedResponse?.dueAt === "string"
            ? args.sanitizedResponse.dueAt
            : undefined,
        destination:
          allocation?.destination ??
          (await readDestination(ctx, post.userId, post.brandId))?.destination,

        updatedAt: now,
      };
      if (providerState) {
        await ctx.db.patch(providerState._id, providerPatch);
      } else {
        await ctx.db.insert("v2ProviderStates", {
          postId: args.postId,
          intentId: args.intentId,
          ...providerPatch,
          createdAt: now,
        });
      }

      await ctx.db.patch(args.postId, {
        status: mapProviderStateToPostStatus(effectiveProviderStatus),
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      postId: args.postId,
      intentId: args.intentId,
      action: effectiveOk
        ? "provider.buffer_submit"
        : !intentStillValid
          ? "provider.buffer_submit_stale"
          : "provider.buffer_submit_failed",
      summary,
      metadata: {
        attemptId: args.attemptId,
        providerPostId: args.providerPostId,
      },
    });

    return {
      recorded: true as const,
      attemptId: args.attemptId,
      submitted: effectiveOk,
      stale: !intentStillValid,
    };
  },
});

export const recordBufferCancelResult = internalMutation({
  args: {
    postId: v.id("v2Posts"),
    userId: v.string(),
    intentId: v.id("v2PublishingIntents"),
    brandId: brandIdValidator,
    intentType: providerIntentValidator,
    ok: v.boolean(),
    providerStateStatus: bufferProviderStateStatusValidator,
    providerPostId: v.optional(v.string()),
    reason: v.optional(v.string()),
    sanitizedResponse: v.any(),
  },
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId);
    if (!post || post.userId !== args.userId) {
      throw new Error("Post not found");
    }
    await requireBrandAccess(ctx, args.userId, post.brandId);

    const now = Date.now();
    const provisionalSummary = args.ok
      ? args.intentType === "unpublish"
        ? "Buffer unpublish/delete recorded."
        : "Buffer cancel/delete recorded."
      : args.reason ?? "Buffer cancel failed.";

    const providerState = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_intent", (q) => q.eq("intentId", args.intentId))
      .first();

    if(providerState?.providerPostId!==args.providerPostId)return {recorded:true as const,ok:false};
    const confirmed=args.ok && args.sanitizedResponse?.deletionConfirmed===true && args.providerPostId===providerState?.providerPostId;
    if(confirmed && providerState?.lastAttemptId)await reconcileAllocation(ctx,providerState.lastAttemptId,"released",args.providerPostId);
    const summary=confirmed?provisionalSummary:"Cancellation lacks definitive matching proof; delivery remains unverified.";
    const nextStatus = providerState?.status==="cancelled" ? "cancelled" as const : providerState?.status==="removed" ? "removed" as const : confirmed ? ((providerState?.publishedAt || providerState?.status === "published") ? "removed" as const : "cancelled" as const) : (providerState?.status === "published" ? "published" as const : "cancel-requested" as const);

    const providerPatch = {
      providerId: "buffer" as const,
      status: nextStatus,
      simulated: false,
      providerPostId: args.providerPostId ?? providerState?.providerPostId,
      lastResponseSummary: confirmed ? summary : "Cancellation remains unverified; inspect the receipt before retrying.",
      lastReceipt:sanitizeProviderResponse(args.sanitizedResponse),lastCheckedAt:now,
      updatedAt: now,
    };
    if (providerState) {
      await ctx.db.patch(providerState._id, providerPatch);
    } else if (args.ok) {
      await ctx.db.insert("v2ProviderStates", {
        postId: args.postId,
        intentId: args.intentId,
        ...providerPatch,
        createdAt: now,
      });
    }

    if(nextStatus!=="published")await ctx.db.patch(post._id,{status:nextStatus,updatedAt:now});
    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      postId: args.postId,
      intentId: args.intentId,
      action:
        args.intentType === "unpublish"
          ? confirmed
            ? "provider.buffer_unpublish"
            : "provider.buffer_unpublish_failed"
          : confirmed
            ? "provider.buffer_cancel"
            : "provider.buffer_cancel_failed",
      summary,
      metadata: {
        providerPostId: args.providerPostId,
        sanitizedResponse: sanitizeProviderResponse(
          args.sanitizedResponse &&
            typeof args.sanitizedResponse === "object" &&
            !Array.isArray(args.sanitizedResponse)
            ? (args.sanitizedResponse as Record<string, unknown>)
            : { providerId: "buffer" }
        ),
      },
    });

    return { recorded: true as const, ok: confirmed };
  },
});

export const auditBufferSkip = internalMutation({
  args: {
    postId: v.id("v2Posts"),
    userId: v.string(),
    brandId: brandIdValidator,
    intentId: v.optional(v.id("v2PublishingIntents")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      postId: args.postId,
      intentId: args.intentId,
      action: "provider.skip",
      summary: args.reason,
    });
    return { recorded: true as const };
  },
});

export const getHeroPreparationContext = internalQuery({
  args: {postId: v.id("v2Posts"), userId: v.string()}, returns: v.any(),
  handler: async (ctx, args) => {
    const post = await getOwnedPost(ctx, args.userId, args.postId);
    if (post.channelId !== "corvo-blog" || !post.heroImageStorageId) throw new Error("Save an uploaded hero in the composer first.");
    return post;
  },
});
export const recordPreparedHero = internalMutation({
  args: {postId: v.id("v2Posts"), userId: v.string(), hero: preparedHeroValidator}, returns: v.null(),
  handler: async (ctx, args) => {
    const post = await getOwnedPost(ctx, args.userId, args.postId);
    if (post.blogExportClaimKey) throw new Error("Blog export is pending; reconcile it before editing this version.");
    if (post.heroImageStorageId !== args.hero.sourceStorageId) throw new Error("The source image changed during preparation; review the new image.");
    if (post.preparedHero?.sourceStorageId === args.hero.sourceStorageId && post.preparedHero.sha256 === args.hero.sha256 && post.preparedHero.crop === args.hero.crop) {
      await ctx.storage.delete(args.hero.storageId);
      return null;
    }
    const intent = await latestIntent(ctx, post._id);
    const fingerprint = blogEditorialFingerprint({...post, preparedHero: args.hero});
    await ctx.db.patch(post._id, {preparedHero: args.hero, approvalState: "unapproved", status: "draft", contentFingerprint: fingerprint, updatedAt: Date.now()});
    if (intent) await ctx.db.patch(intent._id, {approvalState: "unapproved", contentFingerprint: fingerprint, updatedAt: Date.now()});
    await audit(ctx, {userId: args.userId, brandId: post.brandId, postId: post._id, action: "blog.hero_prepared", summary: "Prepared website hero; review the exported crop before approval.", metadata: args.hero});
    return null;
  },
});

export const claimBlogExport = mutation({
  args: {postId: v.id("v2Posts"), fingerprint: v.string(), schedule: v.string(), key: v.string()},
  returns: v.string(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.channelId !== "corvo-blog" || post.approvalState !== "approved" || post.contentFingerprint !== args.fingerprint || blogEditorialFingerprint(post) !== args.fingerprint || JSON.stringify([post.scheduledDate, post.scheduledTime, post.timezone]) !== args.schedule) throw new Error("Saved approved export or schedule changed; review again.");
    if (post.blogSyncPending || post.prUrl || (post.blogExportClaimKey && post.blogExportClaimKey !== args.key)) throw new Error("Existing article export requires reconciliation.");
    if (!post.blogExportClaimKey) {
      await ctx.db.patch(post._id, {blogExportClaimKey: args.key});
      await audit(ctx, {userId, brandId: post.brandId, postId: post._id, action: "blog.export_claim", summary: "Pinned the approved article and schedule for export."});
    }
    return args.key;
  },
});

export const isCurrentBlogSync = internalQuery({
  args: {postId: v.id("v2Posts"), userId: v.string(), syncKey: v.string()}, returns: v.boolean(),
  handler: async (ctx, args) => {
    const post = await getOwnedPost(ctx, args.userId, args.postId);
    return post.blogSyncPending === args.syncKey;
  },
});

/** Last server check after provider account discovery, immediately before createPost. */
export const revalidateBufferClaim = internalMutation({
  args: { attemptId: v.id("v2PublishAttempts"), userId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (
      !attempt ||
      attempt.userId !== args.userId ||
      attempt.status !== "pending"
    )
      return "Submission claim is no longer pending.";
    const post = await ctx.db.get(attempt.postId);
    if (!post || post.userId !== args.userId) return "Post access changed.";
    const role = await requireBrandAccess(ctx, args.userId, post.brandId);
    if (role.role === "viewer") return "Editor access was revoked.";
    const intent = await latestIntent(ctx, post._id);
    if (
      !intent ||
      intent._id !== attempt.intentId ||
      post.approvalState !== "approved" ||
      intent.approvalState !== "approved" ||
      intent.contentFingerprint !==
        contentFingerprint(post.title, post.content, post.linkedinFirstComment)
    )
      return "Editorial approval or intent changed after the claim.";
    const channel = await ctx.db
      .query("v2Channels")
      .withIndex("by_brand_and_channel", (q) =>
        q.eq("brandId", post.brandId).eq("channelId", post.channelId),
      )
      .first();
    if (!channel?.routable) return "Destination routing changed.";
    if (postScheduleVersion(post) !== postScheduleVersion(intent))
      return "Post and intent schedule changed.";
    const article = await companionSubmissionHold(ctx, post);
    if (article) return article;
    const destination = await destinationSubmissionHold(ctx, post);
    if (destination) return destination;
    const claim = await ctx.db
      .query("queueDispatchClaims")
      .withIndex("by_attempt", (q) => q.eq("attemptId", attempt._id))
      .first();
    if (!claim || claim.status !== "active")
      return "Capacity claim requires reconciliation.";
    const capacity = (await dispatchCapacity(ctx, post)).capacity;
    if (capacity.projection.unknown) return capacity.projection.unknown;
    const pin = await releasePin(ctx, post, capacity);
    if (pin.version !== claim.reviewVersion)
      return "Payload, schedule, destination, article evidence, reservation or capacity changed after the claim.";
    if (claim.reviewRowId) {
      const row = await ctx.db.get(claim.reviewRowId);
      const review = row ? await ctx.db.get(row.reviewId) : null;
      if (
        !review ||
        review.status !== "running" ||
        Date.now() - review.createdAt > 300000
      )
        return "Queue review expired or stopped.";
      const reservationReason = await reviewReservationsHold(
        ctx,
        review,
        capacity,
      );
      if (reservationReason) return reservationReason;
      if (review.seriesId) {
        const series = await ctx.db.get(review.seriesId);
        if (!series || series.revision !== review.seriesRevision)
          return "Series membership changed.";
      }
    }
    return null;
  },
});
export const markDispatchUncertain = internalMutation({
  args: {
    attemptId: v.id("v2PublishAttempts"),
    userId: v.string(),
    providerPostId: v.optional(v.string()),
    receipt: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (
      !attempt ||
      attempt.userId !== args.userId ||
      attempt.status !== "pending"
    )
      return null;
    await ctx.db.patch(attempt._id, {
      status: "ambiguous",
      providerPostId: args.providerPostId,
      sanitizedResponse: sanitizeProviderResponse(
        args.receipt ?? { outcome: "uncertain" },
      ),
      updatedAt: Date.now(),
    });
    const claim = await reconcileAllocation(
      ctx,
      attempt._id,
      "uncertain",
      args.providerPostId,
    );
    if (args.providerPostId) {
      const state = await ctx.db
        .query("v2ProviderStates")
        .withIndex("by_intent", (q) => q.eq("intentId", attempt.intentId))
        .first();
      const patch = {
        providerId: "buffer" as const,
        status: "needs-review" as const,
        providerPostId: args.providerPostId,
        lastAttemptId: attempt._id,
        simulated: false,
        destination: claim?.destination,
        lastReceipt: sanitizeProviderResponse(args.receipt ?? {}),
        lastResponseSummary:
          "Known accepted identifier retained after receipt persistence interruption; read status to reconcile.",
        updatedAt: Date.now(),
      };
      if (state) await ctx.db.patch(state._id, patch);
      else
        await ctx.db.insert("v2ProviderStates", {
          postId: attempt.postId,
          intentId: attempt.intentId,
          ...patch,
          createdAt: Date.now(),
        });
    }
    if (claim?.reviewRowId)
      await ctx.db.patch(claim.reviewRowId, {
        status: "needs-review",
        providerPostId: args.providerPostId,
        reason:
          "Provider result could not be durably reconciled; inspect this attempt before any new review.",
        updatedAt: Date.now(),
      });
    return null;
  },
});

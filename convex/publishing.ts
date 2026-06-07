import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

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

function providerForChannel(channelId: ChannelId) {
  if (channelId === "linkedin") return "buffer" as const;
  if (channelId === "reddit") return "zernio" as const;
  if (channelId === "corvo-blog") return "github-pr" as const;
  return undefined;
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

function contentFingerprint(title: string, content: string) {
  return `${title.trim()}\n${content.trim()}`;
}

function sanitizeProviderResponse(response: Record<string, unknown>) {
  const blocked = /token|secret|key|authorization|cookie/i;
  return Object.fromEntries(
    Object.entries(response).map(([key, value]) => [
      key,
      blocked.test(key) ? "[redacted]" : value,
    ])
  );
}

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) throw new Error("Unauthorized");
  return identity.subject;
}

async function requireBrandAccess(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  brandId: BrandId
) {
  const membership = await ctx.db
    .query("v2BrandMemberships")
    .withIndex("by_user_and_brand", (q) =>
      q.eq("userId", userId).eq("brandId", brandId)
    )
    .first();

  if (!membership) throw new Error("Brand access denied");
  return membership;
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

async function latestIntent(ctx: QueryCtx | MutationCtx, postId: Id<"v2Posts">) {
  const intents = await ctx.db
    .query("v2PublishingIntents")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  return intents.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

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

export const seedMvpWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();

    for (const brand of brandSeed) {
      const existingBrand = await ctx.db
        .query("v2Brands")
        .withIndex("by_brand_id", (q) => q.eq("brandId", brand.brandId))
        .first();
      if (!existingBrand) {
        await ctx.db.insert("v2Brands", {
          brandId: brand.brandId,
          name: brand.name,
          description: brand.description,
          createdAt: now,
          updatedAt: now,
        });
      }

      const membership = await ctx.db
        .query("v2BrandMemberships")
        .withIndex("by_user_and_brand", (q) =>
          q.eq("userId", userId).eq("brandId", brand.brandId)
        )
        .first();
      if (!membership) {
        await ctx.db.insert("v2BrandMemberships", {
          userId,
          brandId: brand.brandId,
          role: "owner",
          createdAt: now,
          updatedAt: now,
        });
      }

      for (const channelId of brand.channels) {
        const existingChannel = await ctx.db
          .query("v2Channels")
          .withIndex("by_brand_and_channel", (q) =>
            q.eq("brandId", brand.brandId).eq("channelId", channelId)
          )
          .first();
        if (existingChannel) continue;
        const providerId = providerForChannel(channelId);
        await ctx.db.insert("v2Channels", {
          brandId: brand.brandId,
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
      }
    }

    return { seeded: true };
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
    brandIds: v.optional(v.array(brandIdValidator)),
    platformIds: v.optional(v.array(channelIdValidator)),
    statuses: v.optional(
      v.array(
        v.union(
          v.literal("draft"),
          v.literal("approved"),
          v.literal("scheduled"),
          v.literal("submitted"),
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
    const filteredPosts = posts
      .filter((post) => accessibleBrands.has(post.brandId))
      .filter(
        (post) =>
          post.variantReviewStatus !== "pending" &&
          post.variantReviewStatus !== "rejected"
      )
      .filter((post) => !args.brandIds?.length || args.brandIds.includes(post.brandId))
      .filter(
        (post) => !args.platformIds?.length || args.platformIds.includes(post.platformId)
      )
      .filter((post) => !args.statuses?.length || args.statuses.includes(post.status));

    const hydrated = await Promise.all(
      filteredPosts.map(async (post) => {
        const intent = await latestIntent(ctx, post._id);
        const providerState = intent
          ? await ctx.db
              .query("v2ProviderStates")
              .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
              .first()
          : null;
        const attempts = intent
          ? await ctx.db
              .query("v2PublishAttempts")
              .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
              .collect()
          : [];
        const sortedAttempts = attempts.sort((a, b) => b.createdAt - a.createdAt);
        const auditEvents = await ctx.db
          .query("v2AuditEvents")
          .withIndex("by_post", (q) => q.eq("postId", post._id))
          .collect();

        return {
          post,
          intent,
          providerState,
          attemptCount: attempts.length,
          attempts: sortedAttempts,
          lastAttempt: sortedAttempts[0] ?? null,
          auditEvents: auditEvents.sort((a, b) => b.createdAt - a.createdAt),
        };
      })
    );

    return hydrated.sort((a, b) => b.post.updatedAt - a.post.updatedAt);
  },
});

export const getPostById = query({
  args: { postId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const normalizedId = ctx.db.normalizeId("v2Posts", args.postId);
    if (!normalizedId) return null;
    try { return await getOwnedPost(ctx, userId, normalizedId); } catch { return null; }
  },
});

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
  },
});

export const deletePost = mutation({
  args: { postId: v.id("v2Posts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
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

export const setApproval = mutation({
  args: {
    postId: v.id("v2Posts"),
    approvalState: approvalValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");
    const now = Date.now();
    const nextStatus =
      args.approvalState === "approved"
        ? post.scheduledDate
          ? "scheduled"
          : "approved"
        : "draft";

    await ctx.db.patch(args.postId, {
      approvalState: args.approvalState,
      status: nextStatus,
      contentFingerprint: contentFingerprint(post.title, post.content),
      updatedAt: now,
    });
    await ctx.db.patch(intent._id, {
      approvalState: args.approvalState,
      contentFingerprint: contentFingerprint(post.title, post.content),
      updatedAt: now,
    });
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: args.postId,
      intentId: intent._id,
      action: "post.approval",
      summary: `Approval changed to ${args.approvalState}.`,
    });
  },
});

export const reschedule = mutation({
  args: {
    postId: v.id("v2Posts"),
    scheduledDate: v.string(),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");
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
        await ctx.scheduler.runAfter(0, internal.githubPrSync.syncFrontmatterAfterReschedule, {
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
    postId: v.id("v2Posts"),
    userId: v.string(),
    brandId: brandIdValidator,
    intentId: v.id("v2PublishingIntents"),
    filePath: v.string(),
    scheduledDate: v.string(),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
    postId: v.id("v2Posts"),
    userId: v.string(),
    brandId: brandIdValidator,
    intentId: v.id("v2PublishingIntents"),
    reason: v.string(),
    prUrl: v.string(),
    branchName: v.string(),
  },
  handler: async (ctx, args) => {
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
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");
    const title = args.title ?? post.title;
    const content = args.content ?? post.content;
    const now = Date.now();

    await ctx.db.patch(args.postId, {
      title,
      content,
      approvalState: "unapproved",
      status: "draft",
      contentFingerprint: contentFingerprint(title, content),
      updatedAt: now,
    });
    await ctx.db.patch(intent._id, {
      approvalState: "unapproved",
      contentFingerprint: contentFingerprint(title, content),
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
  },
});

export const updatePlatformSettings = mutation({
  args: { postId: v.id("v2Posts"), platformSettings: platformSettingsValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
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

    const ineligibleReason = !channel?.routable
      ? "Channel is not routable."
      : intent.approvalState !== "approved"
        ? "Post is not approved."
        : !intent.scheduledDate
          ? "Scheduled date is required."
          : intent.contentFingerprint !== contentFingerprint(post.title, post.content)
            ? "Content changed after approval."
            : null;

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
        (latestAttempt?.status === "retryable-failure" ||
          latestAttempt?.status === "ambiguous");
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
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.channelId !== "corvo-blog") {
      throw new Error("GitHub PR recording is only available for Corvo Blog posts.");
    }
    const intent = await latestIntent(ctx, args.postId);
    if (!intent) throw new Error("Publishing intent not found");

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
      status: "pr-created",
      prUrl: args.result.prUrl,
      branchName: args.result.branchName,
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
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await getOwnedPost(ctx, userId, args.postId);
    if (post.channelId !== "corvo-blog") {
      throw new Error("Blog metadata is only available for Corvo Blog posts.");
    }
    const intent = await latestIntent(ctx, args.postId);
    const now = Date.now();

    await ctx.db.patch(args.postId, {
      ...args.metadata,
      approvalState: "unapproved",
      status: "draft",
      updatedAt: now,
    });

    if (intent) {
      await ctx.db.patch(intent._id, {
        approvalState: "unapproved",
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
    if (args.prStatus === "merged") {
      patch.status = "published";
    } else if (args.prStatus === "closed") {
      patch.status = "unavailable";
    }

    await ctx.db.patch(args.postId, patch);
    return { updated: true, prStatus: args.prStatus };
  },
});

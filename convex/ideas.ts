import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

type IdeaStatus = Doc<"capturedIdeas">["status"];
type BrandId = NonNullable<Doc<"capturedIdeas">["brandId"]>;
type ChannelId = Doc<"v2Channels">["channelId"];

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

function buildIdeaPreview(content: string, maxLength = 140) {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

function deriveSourceDomain(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function providerForChannel(channelId: ChannelId) {
  if (channelId === "linkedin") return "buffer" as const;
  if (channelId === "reddit") return "zernio" as const;
  if (channelId === "corvo-blog") return "github-pr" as const;
  return undefined;
}

function contentFingerprint(title: string, content: string) {
  return `${title.trim()}\n${content.trim()}`;
}

function titleForChannel(idea: Doc<"capturedIdeas">, channelId: ChannelId) {
  if (channelId === "corvo-blog") return idea.sourceTitle || "Idea draft";
  if (channelId === "reddit") return idea.sourceTitle || idea.latestEntryPreview;
  return idea.sourceTitle || idea.latestEntryPreview;
}

function contentForChannel(
  idea: Doc<"capturedIdeas">,
  entries: Doc<"capturedIdeaEntries">[],
  channelId: ChannelId
) {
  const sortedEntries = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const referenceLine = idea.sourceUrl ? `\n\nSource: ${idea.sourceUrl}` : "";

  if (channelId === "corvo-blog") {
    const notes = sortedEntries.map((entry) => `- ${entry.content}`).join("\n");
    return `# ${titleForChannel(idea, channelId)}\n\n## Source Idea Notes\n${notes}${referenceLine}`;
  }

  return `${sortedEntries.map((entry) => entry.content).join("\n\n")}${referenceLine}`;
}

async function requireUserId(ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

async function requireOwnedIdea(
  ctx: { db: { get: (id: Id<"capturedIdeas">) => Promise<Doc<"capturedIdeas"> | null> } },
  ideaId: Id<"capturedIdeas">,
  userId: string
) {
  const idea = await ctx.db.get(ideaId);
  if (!idea || idea.userId !== userId) {
    throw new Error("Idea not found");
  }
  return idea;
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

export const list = query({
  args: {
    brandId: v.optional(brandIdValidator),
    status: v.optional(
      v.union(
        v.literal("inbox"),
        v.literal("reviewing"),
        v.literal("ready"),
        v.literal("used"),
        v.literal("archived")
      )
    ),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const searchTerm = args.search?.trim().toLowerCase();

    const ideas = args.status
      ? await ctx.db
          .query("capturedIdeas")
          .withIndex("by_user_and_status", (q) =>
            q.eq("userId", userId).eq("status", args.status!)
          )
          .collect()
      : await ctx.db
          .query("capturedIdeas")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();

    return ideas
      .filter((idea) => {
        if (args.brandId && idea.brandId !== args.brandId) return false;
        if (!args.status && idea.status === "archived") return false;
        if (!searchTerm) return true;

        const haystack = [
          idea.latestEntryPreview,
          idea.sourceTitle,
          idea.sourceDomain,
          idea.sourceUrl,
          ...idea.tags,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(searchTerm);
      })
      .sort((a, b) => b.lastCapturedAt - a.lastCapturedAt);
  },
});

export const getById = query({
  args: { id: v.id("capturedIdeas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await requireOwnedIdea(ctx, args.id, userId);
    const entries = await ctx.db
      .query("capturedIdeaEntries")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.id))
      .collect();
    const postLinks = await ctx.db
      .query("capturedIdeaPostLinks")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.id))
      .collect();
    const v2PostLinks = await ctx.db
      .query("capturedIdeaV2PostLinks")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.id))
      .collect();
    const v2Posts = await Promise.all(
      v2PostLinks.map(async (link) => {
        const post = await ctx.db.get(link.postId);
        return post ? { link, post } : null;
      })
    );

    return {
      ...idea,
      entries: entries.sort((a, b) => a.createdAt - b.createdAt),
      postLinks,
      v2PostLinks: v2Posts.filter(
        (item): item is NonNullable<typeof item> => item !== null
      ),
    };
  },
});

export const findByNormalizedSourceUrl = query({
  args: { normalizedSourceUrl: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const ideas = await ctx.db
      .query("capturedIdeas")
      .withIndex("by_user_and_source", (q) =>
        q.eq("userId", userId).eq("normalizedSourceUrl", args.normalizedSourceUrl)
      )
      .collect();

    return ideas.sort((a, b) => b.lastCapturedAt - a.lastCapturedAt);
  },
});

export const create = mutation({
  args: {
    brandId: v.optional(brandIdValidator),
    content: v.string(),
    tags: v.optional(v.array(v.string())),
    sourceUrl: v.optional(v.string()),
    normalizedSourceUrl: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    sourceDomain: v.optional(v.string()),
    captureChannel: v.optional(
      v.union(
        v.literal("web"),
        v.literal("extension"),
        v.literal("ios_share")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const brandId = args.brandId ?? "corvo";
    await requireBrandAccess(ctx, userId, brandId);
    const now = Date.now();
    const preview = buildIdeaPreview(args.content);

    const ideaId = await ctx.db.insert("capturedIdeas", {
      userId,
      brandId,
      status: "inbox",
      tags: args.tags ?? [],
      sourceUrl: args.sourceUrl,
      normalizedSourceUrl: args.normalizedSourceUrl,
      sourceTitle: args.sourceTitle,
      sourceDomain: args.sourceDomain ?? deriveSourceDomain(args.normalizedSourceUrl ?? args.sourceUrl),
      latestEntryPreview: preview,
      lastCapturedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("capturedIdeaEntries", {
      ideaId,
      userId,
      content: args.content,
      captureChannel: args.captureChannel ?? "web",
      createdAt: now,
    });

    return ideaId;
  },
});

export const appendEntry = mutation({
  args: {
    ideaId: v.id("capturedIdeas"),
    content: v.string(),
    captureChannel: v.optional(
      v.union(
        v.literal("web"),
        v.literal("extension"),
        v.literal("ios_share")
      )
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireOwnedIdea(ctx, args.ideaId, userId);
    const now = Date.now();

    const entryId = await ctx.db.insert("capturedIdeaEntries", {
      ideaId: args.ideaId,
      userId,
      content: args.content,
      captureChannel: args.captureChannel ?? "web",
      createdAt: now,
    });

    await ctx.db.patch(args.ideaId, {
      latestEntryPreview: buildIdeaPreview(args.content),
      lastCapturedAt: now,
      updatedAt: now,
    });

    return entryId;
  },
});

export const updateMeta = mutation({
  args: {
    id: v.id("capturedIdeas"),
    status: v.optional(
      v.union(
        v.literal("inbox"),
        v.literal("reviewing"),
        v.literal("ready"),
        v.literal("used"),
        v.literal("archived")
      )
    ),
    brandId: v.optional(brandIdValidator),
    tags: v.optional(v.array(v.string())),
    sourceUrl: v.optional(v.union(v.string(), v.null())),
    normalizedSourceUrl: v.optional(v.union(v.string(), v.null())),
    sourceTitle: v.optional(v.union(v.string(), v.null())),
    sourceDomain: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await requireOwnedIdea(ctx, args.id, userId);

    const status = args.status ?? existing.status;
    const patch: Partial<Doc<"capturedIdeas">> = {
      updatedAt: Date.now(),
      status,
    };

    if (args.brandId !== undefined) {
      await requireBrandAccess(ctx, userId, args.brandId);
      patch.brandId = args.brandId;
    }
    if (args.tags !== undefined) patch.tags = args.tags;
    if (args.sourceUrl !== undefined) patch.sourceUrl = args.sourceUrl ?? undefined;
    if (args.normalizedSourceUrl !== undefined) {
      patch.normalizedSourceUrl = args.normalizedSourceUrl ?? undefined;
    }
    if (args.sourceTitle !== undefined) patch.sourceTitle = args.sourceTitle ?? undefined;
    if (args.sourceDomain !== undefined) {
      patch.sourceDomain =
        args.sourceDomain ?? deriveSourceDomain(args.normalizedSourceUrl ?? args.sourceUrl ?? existing.sourceUrl);
    }

    if (status === "archived") {
      patch.archivedAt = existing.archivedAt ?? Date.now();
    } else {
      patch.archivedAt = undefined;
    }

    await ctx.db.patch(args.id, patch);
  },
});

export const spawnV2Posts = mutation({
  args: {
    ideaId: v.id("capturedIdeas"),
    brandId: brandIdValidator,
    channelIds: v.array(channelIdValidator),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await requireOwnedIdea(ctx, args.ideaId, userId);
    await requireBrandAccess(ctx, userId, args.brandId);

    const uniqueChannelIds = Array.from(new Set(args.channelIds));
    if (uniqueChannelIds.length === 0) {
      throw new Error("Select at least one target platform");
    }

    const entries = await ctx.db
      .query("capturedIdeaEntries")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.ideaId))
      .collect();
    if (entries.length === 0) {
      throw new Error("Idea has no entries");
    }

    const now = Date.now();
    const created: { postId: Id<"v2Posts">; intentId: Id<"v2PublishingIntents"> }[] = [];

    for (const channelId of uniqueChannelIds) {
      const channel = await ctx.db
        .query("v2Channels")
        .withIndex("by_brand_and_channel", (q) =>
          q.eq("brandId", args.brandId).eq("channelId", channelId)
        )
        .first();
      if (!channel) {
        throw new Error(`Channel ${channelId} is not available for ${args.brandId}`);
      }

      const title = titleForChannel(idea, channelId);
      const content = contentForChannel(idea, entries, channelId);
      const fingerprint = contentFingerprint(title, content);
      const timezone = args.timezone ?? "America/Los_Angeles";
      const postId = await ctx.db.insert("v2Posts", {
        userId,
        brandId: args.brandId,
        channelId,
        platformId: channel.platformId,
        title,
        content,
        status: args.scheduledDate ? "scheduled" : "draft",
        approvalState: "unapproved",
        scheduledDate: args.scheduledDate,
        scheduledTime: args.scheduledTime,
        timezone,
        sourceIdeaId: String(args.ideaId),
        contentFingerprint: fingerprint,
        createdAt: now,
        updatedAt: now,
      });

      const intentId = await ctx.db.insert("v2PublishingIntents", {
        postId,
        userId,
        brandId: args.brandId,
        channelId,
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
        providerId: providerForChannel(channelId),
        status: "not-submitted",
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("capturedIdeaV2PostLinks", {
        ideaId: args.ideaId,
        postId,
        userId,
        brandId: args.brandId,
        channelId,
        createdAt: now,
      });

      await ctx.db.insert("v2AuditEvents", {
        userId,
        brandId: args.brandId,
        postId,
        intentId,
        action: "idea.spawn_v2_post",
        summary: `Spawned ${channelId} draft from source Idea.`,
        metadata: { ideaId: String(args.ideaId) },
        createdAt: now,
      });

      created.push({ postId, intentId });
    }

    await ctx.db.patch(args.ideaId, {
      brandId: args.brandId,
      status: "used" satisfies IdeaStatus,
      updatedAt: now,
    });

    return created;
  },
});

export const archive = mutation({
  args: { id: v.id("capturedIdeas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireOwnedIdea(ctx, args.id, userId);
    await ctx.db.patch(args.id, {
      status: "archived" satisfies IdeaStatus,
      archivedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("capturedIdeas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireOwnedIdea(ctx, args.id, userId);

    const links = await ctx.db
      .query("capturedIdeaPostLinks")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.id))
      .collect();
    const v2Links = await ctx.db
      .query("capturedIdeaV2PostLinks")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.id))
      .collect();
    if (links.length > 0 || v2Links.length > 0) {
      throw new Error("Ideas with linked posts must be archived instead of deleted");
    }

    const entries = await ctx.db
      .query("capturedIdeaEntries")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.id))
      .collect();

    await Promise.all(entries.map((entry) => ctx.db.delete(entry._id)));
    await ctx.db.delete(args.id);
  },
});

export const linkPost = mutation({
  args: {
    ideaId: v.id("capturedIdeas"),
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireOwnedIdea(ctx, args.ideaId, userId);

    const existing = await ctx.db
      .query("capturedIdeaPostLinks")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.ideaId))
      .collect();
    if (existing.some((link) => link.postId === args.postId)) {
      return existing.find((link) => link.postId === args.postId)!._id;
    }

    return await ctx.db.insert("capturedIdeaPostLinks", {
      ideaId: args.ideaId,
      postId: args.postId,
      userId,
      createdAt: Date.now(),
    });
  },
});

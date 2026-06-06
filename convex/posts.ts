import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {
    type: v.optional(v.union(v.literal("blog"), v.literal("linkedin"))),
  },
  handler: async (ctx, args) => {
    if (args.type) {
      return await ctx.db
        .query("posts")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .order("desc")
        .collect();
    }
    return await ctx.db.query("posts").order("desc").collect();
  },
});

export const getById = query({
  args: { id: v.id("posts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    type: v.union(v.literal("blog"), v.literal("linkedin")),
    title: v.optional(v.string()),
    content: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("published")
    ),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    fileIds: v.optional(v.array(v.id("_storage"))),
    linkedBlogPostId: v.optional(v.id("posts")),
    externalUrl: v.optional(v.string()),
    isRepost: v.optional(v.boolean()),
    githubPrUrl: v.optional(v.string()),
    // Full-screen editor fields
    heroImageId: v.optional(v.id("_storage")),
    tags: v.optional(v.array(v.string())),
    seoDescription: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    author: v.optional(v.string()),
    category: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    coverImageAlt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("posts", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("posts"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("scheduled"),
        v.literal("published")
      )
    ),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    fileIds: v.optional(v.array(v.id("_storage"))),
    linkedBlogPostId: v.optional(v.id("posts")),
    externalUrl: v.optional(v.string()),
    isRepost: v.optional(v.boolean()),
    githubPrUrl: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    // Full-screen editor fields
    heroImageId: v.optional(v.id("_storage")),
    tags: v.optional(v.array(v.string())),
    seoDescription: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    author: v.optional(v.string()),
    category: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    coverImageAlt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...fields } = args;
    await ctx.db.patch(id, { ...fields, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("posts") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const getFileUrl = query({
  args: { fileId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.fileId);
  },
});

export const createFromIdea = mutation({
  args: {
    ideaId: v.id("capturedIdeas"),
    type: v.union(v.literal("blog"), v.literal("linkedin")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const idea = await ctx.db.get(args.ideaId);
    if (!idea || idea.userId !== identity.subject) {
      throw new Error("Idea not found");
    }

    const entries = await ctx.db
      .query("capturedIdeaEntries")
      .withIndex("by_idea", (q) => q.eq("ideaId", args.ideaId))
      .collect();
    const sortedEntries = entries.sort((a, b) => a.createdAt - b.createdAt);
    if (sortedEntries.length === 0) {
      throw new Error("Idea has no entries");
    }

    const noteLines = sortedEntries.map((entry) => `- ${entry.content}`);
    const referenceLine = idea.sourceUrl
      ? `\nReference: ${idea.sourceUrl}`
      : "";
    const now = Date.now();

    const postId = await ctx.db.insert("posts", {
      type: args.type,
      title: args.type === "blog" ? idea.sourceTitle || "Idea draft" : undefined,
      content:
        args.type === "blog"
          ? `# ${idea.sourceTitle || "Idea Draft"}\n\n## Notes\n${noteLines.join("\n")}${referenceLine}`
          : `${sortedEntries.map((entry) => entry.content).join("\n\n")}${referenceLine}`,
      status: "draft",
      externalUrl: args.type === "linkedin" ? idea.sourceUrl : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("capturedIdeaPostLinks", {
      ideaId: args.ideaId,
      postId,
      userId: identity.subject,
      createdAt: now,
    });

    return postId;
  },
});

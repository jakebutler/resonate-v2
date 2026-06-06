import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  DRAFT_STAGES,
  RESEARCH_MODES,
  RESEARCH_SOURCES,
  extractUrls,
  formatWorkflowTitle,
  getNextDraftStage,
  isPublishedCardVisible,
  runDraftStageCheck,
  runIdeaStageCheck,
  summarizeTextPreview,
  type DraftStage,
} from "../lib/workflow";

const ideaStatusValidator = v.union(
  v.literal("backlog"),
  v.literal("idea"),
  v.literal("research"),
  v.literal("archived")
);

const draftStageValidator = v.union(
  v.literal("outline"),
  v.literal("copyedit"),
  v.literal("seo"),
  v.literal("final"),
  v.literal("published")
);

const researchModeValidator = v.union(
  v.literal(RESEARCH_MODES[0]),
  v.literal(RESEARCH_MODES[1]),
  v.literal(RESEARCH_MODES[2]),
  v.literal(RESEARCH_MODES[3]),
  v.literal(RESEARCH_MODES[4]),
  v.literal(RESEARCH_MODES[5])
);

const researchSourceValidator = v.union(
  v.literal(RESEARCH_SOURCES[0]),
  v.literal(RESEARCH_SOURCES[1]),
  v.literal(RESEARCH_SOURCES[2]),
  v.literal(RESEARCH_SOURCES[3]),
  v.literal(RESEARCH_SOURCES[4]),
  v.literal(RESEARCH_SOURCES[5]),
  v.literal(RESEARCH_SOURCES[6])
);

const referenceValidator = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  kind: v.optional(v.string()),
  addedBy: v.union(
    v.literal("user"),
    v.literal("extractor"),
    v.literal("agent")
  ),
});

async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) {
    throw new Error("Unauthorized");
  }
  return identity.subject;
}

function mergeReferences(
  existing: Doc<"ideas">["references"] | undefined,
  incoming: Array<{
    url: string;
    title?: string;
    kind?: string;
    addedBy: "user" | "extractor" | "agent";
  }>
) {
  const merged = [...(existing ?? [])];
  const seen = new Set(merged.map((reference) => reference.url));

  for (const reference of incoming) {
    if (seen.has(reference.url)) continue;
    merged.push(reference);
    seen.add(reference.url);
  }

  return merged;
}

function seedPostContent(type: "blog" | "linkedin", idea: Doc<"ideas">): string {
  const references = (idea.references ?? [])
    .map((reference) =>
      reference.title
        ? `- ${reference.title} (${reference.url})`
        : `- ${reference.url}`
    )
    .join("\n");

  if (type === "blog") {
    return [
      "# Working Title",
      "",
      "## Core Idea",
      idea.text.trim(),
      "",
      "## Research Objective",
      idea.researchObjective?.trim() || "Clarify the angle for this post.",
      "",
      "## Research Notes",
      idea.researchNotes?.trim() || "Add supporting notes, examples, and evidence here.",
      "",
      "## Sources",
      references || "- Add sources here",
      "",
      "## Draft",
      "",
    ].join("\n");
  }

  return [
    "Hook:",
    "",
    "Core angle:",
    idea.text.trim(),
    "",
    "Supporting notes:",
    idea.researchNotes?.trim() || "Add supporting proof points here.",
    "",
    "Sources:",
    references || "- Add sources here",
    "",
    "Draft:",
    "",
  ].join("\n");
}

function getPublishedAt(post: Doc<"posts">, draft: Doc<"workflowDrafts">) {
  if (draft.publishedAt) return draft.publishedAt;
  if (post.publishedAt) return post.publishedAt;
  if (post.scheduledDate) {
    return Date.parse(`${post.scheduledDate}T12:00:00.000Z`);
  }
  return undefined;
}

function hasOwn<T extends object>(value: T, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

async function getIdeaForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  ideaId: Id<"ideas">
) {
  const idea = await ctx.db.get(ideaId);
  if (!idea || idea.userId !== userId) {
    throw new Error("Idea not found");
  }
  return idea;
}

async function getDraftForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  draftId: Id<"workflowDrafts">
) {
  const draft = await ctx.db.get(draftId);
  if (!draft || draft.userId !== userId) {
    throw new Error("Workflow draft not found");
  }
  return draft;
}

async function patchIdeaGate(
  ctx: MutationCtx,
  ideaId: Id<"ideas">,
  gate: ReturnType<typeof runIdeaStageCheck>
) {
  await ctx.db.patch(ideaId, {
    lastGateStage: gate.stage,
    lastGateReady: gate.ready,
    lastGateSummary: gate.summary,
    lastGateIssues: gate.issues,
    lastGateCheckedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

async function patchDraftGate(
  ctx: MutationCtx,
  draftId: Id<"workflowDrafts">,
  gate: ReturnType<typeof runDraftStageCheck>
) {
  await ctx.db.patch(draftId, {
    lastGateStage: gate.stage,
    lastGateReady: gate.ready,
    lastGateSummary: gate.summary,
    lastGateIssues: gate.issues,
    lastGateCheckedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

export const getBoard = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const [ideas, drafts] = await Promise.all([
      ctx.db
        .query("ideas")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("workflowDrafts")
        .withIndex("by_user_id", (q) => q.eq("userId", userId))
        .collect(),
    ]);

    const draftCounts = new Map<Id<"ideas">, number>();
    for (const draft of drafts) {
      draftCounts.set(draft.ideaId, (draftCounts.get(draft.ideaId) ?? 0) + 1);
    }

    const ideaCards = ideas
      .filter((idea) => idea.status === "idea")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((idea) => ({
        ...idea,
        references: idea.references ?? [],
        researchModes: idea.researchModes ?? [],
        researchSources: idea.researchSources ?? [],
        researchStatus: idea.researchStatus ?? "idle",
        lastGateIssues: idea.lastGateIssues ?? [],
        draftCount: draftCounts.get(idea._id) ?? 0,
      }));

    const researchCards = ideas
      .filter((idea) => idea.status === "research")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((idea) => ({
        ...idea,
        references: idea.references ?? [],
        researchModes: idea.researchModes ?? [],
        researchSources: idea.researchSources ?? [],
        researchStatus: idea.researchStatus ?? "idle",
        lastGateIssues: idea.lastGateIssues ?? [],
        draftCount: draftCounts.get(idea._id) ?? 0,
      }));

    const availableIdeas = ideas
      .filter((idea) => idea.status === "backlog")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((idea) => ({
        _id: idea._id,
        title: idea.title,
        text: idea.text,
        updatedAt: idea.updatedAt,
        referencesCount: idea.references?.length ?? 0,
      }));

    const hydratedDrafts = (
      await Promise.all(
        drafts.map(async (draft) => {
          const [idea, post] = await Promise.all([
            ctx.db.get(draft.ideaId),
            ctx.db.get(draft.postId),
          ]);

          if (!idea || idea.userId !== userId || !post) {
            return null;
          }

          const publishedAt = getPublishedAt(post, draft);
          if (draft.stage === "published" && !isPublishedCardVisible(publishedAt)) {
            return null;
          }

          return {
            _id: draft._id,
            ideaId: idea._id,
            postId: post._id,
            type: draft.type,
            stage: draft.stage,
            title: formatWorkflowTitle(post.title, post.content),
            preview: summarizeTextPreview(post.content),
            content: post.content,
            postStatus: post.status,
            scheduledDate: post.scheduledDate,
            scheduledTime: post.scheduledTime,
            publishedAt,
            lastAgentStage: draft.lastAgentStage,
            lastAgentSummary: draft.lastAgentSummary,
            lastAgentRunAt: draft.lastAgentRunAt,
            lastGateStage: draft.lastGateStage,
            lastGateReady: draft.lastGateReady,
            lastGateSummary: draft.lastGateSummary,
            lastGateIssues: draft.lastGateIssues ?? [],
            lastGateCheckedAt: draft.lastGateCheckedAt,
            ideaTitle: idea.title,
            ideaText: idea.text,
            researchObjective: idea.researchObjective,
            researchNotes: idea.researchNotes,
            references: idea.references ?? [],
            updatedAt: draft.updatedAt,
          };
        })
      )
    ).filter((draft): draft is NonNullable<typeof draft> => draft !== null);

    const draftColumns = DRAFT_STAGES.map((stage) => ({
      stage,
      cards: hydratedDrafts
        .filter((draft) => draft.stage === stage)
        .sort((a, b) => {
          if (stage === "published") {
            return (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
          }
          return b.updatedAt - a.updatedAt;
        }),
    }));

    return {
      ideaCards,
      researchCards,
      availableIdeas,
      draftColumns,
    };
  },
});

export const getIdea = query({
  args: { id: v.id("ideas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await ctx.db.get(args.id);
    if (!idea || idea.userId !== userId) {
      return null;
    }

    return {
      ...idea,
      references: idea.references ?? [],
      researchModes: idea.researchModes ?? [],
      researchSources: idea.researchSources ?? [],
      researchStatus: idea.researchStatus ?? "idle",
      draftCount: (
        await ctx.db
          .query("workflowDrafts")
          .withIndex("by_user_id_and_idea_id", (q) =>
            q.eq("userId", userId).eq("ideaId", args.id)
          )
          .collect()
      ).length,
    };
  },
});

export const getDraftByPostId = query({
  args: { postId: v.id("posts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("workflowDrafts")
      .withIndex("by_user_id_and_post_id", (q) =>
        q.eq("userId", userId).eq("postId", args.postId)
      )
      .unique();
  },
});

export const getDraftForEditor = query({
  args: { id: v.id("workflowDrafts") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const draft = await ctx.db.get(args.id);
    if (!draft || draft.userId !== userId) {
      return null;
    }

    const [idea, post] = await Promise.all([
      ctx.db.get(draft.ideaId),
      ctx.db.get(draft.postId),
    ]);

    if (!idea || idea.userId !== userId || !post) {
      return null;
    }

    return {
      draft: {
        ...draft,
        lastGateIssues: draft.lastGateIssues ?? [],
      },
      idea: {
        ...idea,
        references: idea.references ?? [],
        researchModes: idea.researchModes ?? [],
        researchSources: idea.researchSources ?? [],
        researchStatus: idea.researchStatus ?? "idle",
        lastGateIssues: idea.lastGateIssues ?? [],
      },
      post,
    };
  },
});

export const createIdea = mutation({
  args: {
    title: v.optional(v.string()),
    text: v.string(),
    status: v.optional(ideaStatusValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    return await ctx.db.insert("ideas", {
      userId,
      title: args.title,
      text: args.text.trim(),
      status: args.status ?? "backlog",
      researchStatus: "idle",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateIdea = mutation({
  args: {
    id: v.id("ideas"),
    title: v.optional(v.string()),
    text: v.optional(v.string()),
    status: v.optional(ideaStatusValidator),
    researchObjective: v.optional(v.string()),
    researchNotes: v.optional(v.string()),
    researchModes: v.optional(v.array(researchModeValidator)),
    researchSources: v.optional(v.array(researchSourceValidator)),
    researchStatus: v.optional(
      v.union(v.literal("idle"), v.literal("queued"), v.literal("completed"))
    ),
    references: v.optional(v.array(referenceValidator)),
    lastResearchRunAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await getIdeaForUser(ctx, userId, args.id);
    const patch: Partial<Doc<"ideas">> = {
      updatedAt: Date.now(),
    };

    if (hasOwn(args, "title")) patch.title = args.title;
    if (hasOwn(args, "text")) patch.text = args.text?.trim() ?? "";
    if (hasOwn(args, "status")) patch.status = args.status;
    if (hasOwn(args, "researchObjective")) patch.researchObjective = args.researchObjective;
    if (hasOwn(args, "researchNotes")) patch.researchNotes = args.researchNotes;
    if (hasOwn(args, "researchModes")) patch.researchModes = args.researchModes;
    if (hasOwn(args, "researchSources")) patch.researchSources = args.researchSources;
    if (hasOwn(args, "researchStatus")) patch.researchStatus = args.researchStatus;
    if (hasOwn(args, "references")) patch.references = args.references;
    if (hasOwn(args, "lastResearchRunAt")) patch.lastResearchRunAt = args.lastResearchRunAt;

    await ctx.db.patch(idea._id, patch);
  },
});

export const extractIdeaReferences = mutation({
  args: { id: v.id("ideas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await getIdeaForUser(ctx, userId, args.id);
    const urls = extractUrls([idea.text, idea.researchNotes ?? ""].join("\n"));
    const merged = mergeReferences(
      idea.references,
      urls.map((url) => ({
        url,
        addedBy: "extractor" as const,
      }))
    );

    await ctx.db.patch(args.id, {
      references: merged,
      updatedAt: Date.now(),
    });

    return merged;
  },
});

export const addIdeaReference = mutation({
  args: {
    id: v.id("ideas"),
    reference: referenceValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await getIdeaForUser(ctx, userId, args.id);
    const merged = mergeReferences(idea.references, [args.reference]);

    await ctx.db.patch(args.id, {
      references: merged,
      updatedAt: Date.now(),
    });
  },
});

export const moveIdeaToStatus = mutation({
  args: {
    id: v.id("ideas"),
    status: ideaStatusValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await getIdeaForUser(ctx, userId, args.id);
    await ctx.db.patch(idea._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const advanceIdeaStage = mutation({
  args: {
    id: v.id("ideas"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await getIdeaForUser(ctx, userId, args.id);
    if (idea.status !== "idea") {
      throw new Error("Only selected ideas can advance into research.");
    }

    const gate = runIdeaStageCheck({
      currentStage: "idea",
      nextStage: "research",
      title: idea.title,
      text: idea.text,
      researchObjective: idea.researchObjective,
      researchNotes: idea.researchNotes,
      references: idea.references ?? [],
    });

    await patchIdeaGate(ctx, idea._id, gate);

    if (!gate.ready && !args.force) {
      return { blocked: true, gate };
    }

    await ctx.db.patch(idea._id, {
      status: "research",
      researchStatus: idea.researchStatus ?? "idle",
      updatedAt: Date.now(),
    });

    return { blocked: false, advancedTo: "research", gate };
  },
});

export const createDraftFromIdea = mutation({
  args: {
    ideaId: v.id("ideas"),
    type: v.union(v.literal("blog"), v.literal("linkedin")),
    force: v.optional(v.boolean()),
    seedContent: v.optional(v.string()),
    seedTitle: v.optional(v.string()),
    agentSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await getIdeaForUser(ctx, userId, args.ideaId);
    if (idea.status !== "research") {
      throw new Error("Move the idea into research before creating a draft.");
    }

    const gate = runIdeaStageCheck({
      currentStage: "research",
      nextStage: "outline",
      title: idea.title,
      text: idea.text,
      researchObjective: idea.researchObjective,
      researchNotes: idea.researchNotes,
      references: idea.references ?? [],
    });

    await patchIdeaGate(ctx, idea._id, gate);

    if (!gate.ready && !args.force) {
      return { blocked: true, gate };
    }

    const now = Date.now();
    const title = args.seedTitle?.trim() || idea.title;
    const postId = await ctx.db.insert("posts", {
      type: args.type,
      title,
      content: args.seedContent?.trim() || seedPostContent(args.type, idea),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    const draftId = await ctx.db.insert("workflowDrafts", {
      userId,
      ideaId: idea._id,
      postId,
      type: args.type,
      stage: "outline",
      title,
      lastAgentStage: args.agentSummary ? "outline" : undefined,
      lastAgentSummary: args.agentSummary,
      lastAgentRunAt: args.agentSummary ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { blocked: false, draftId, postId, gate };
  },
});

export const updateDraftContent = mutation({
  args: {
    id: v.id("workflowDrafts"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    stageNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const draft = await getDraftForUser(ctx, userId, args.id);
    const post = await ctx.db.get(draft.postId);

    if (!post) {
      throw new Error("Linked post not found");
    }

    const now = Date.now();
    const postPatch: Partial<Doc<"posts">> = { updatedAt: now };
    const draftPatch: Partial<Doc<"workflowDrafts">> = { updatedAt: now };

    if (hasOwn(args, "title")) {
      postPatch.title = args.title;
      draftPatch.title = args.title;
    }
    if (hasOwn(args, "content")) postPatch.content = args.content ?? post.content;
    if (hasOwn(args, "scheduledDate")) postPatch.scheduledDate = args.scheduledDate;
    if (hasOwn(args, "scheduledTime")) postPatch.scheduledTime = args.scheduledTime;
    if (hasOwn(args, "stageNotes")) draftPatch.stageNotes = args.stageNotes;

    await ctx.db.patch(draft.postId, postPatch);
    await ctx.db.patch(draft._id, draftPatch);
  },
});

export const advanceDraft = mutation({
  args: {
    id: v.id("workflowDrafts"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const draft = await getDraftForUser(ctx, userId, args.id);
    const post = await ctx.db.get(draft.postId);

    if (!post) {
      throw new Error("Linked post not found");
    }

    const nextStage = getNextDraftStage(draft.stage as DraftStage);
    if (!nextStage) {
      return { blocked: false, advancedTo: null, gate: null };
    }

    const gate = runDraftStageCheck({
      currentStage: draft.stage as DraftStage,
      nextStage,
      type: draft.type,
      title: post.title,
      content: post.content,
      scheduledDate: post.scheduledDate,
    });

    await patchDraftGate(ctx, draft._id, gate);

    if (!gate.ready && !args.force) {
      return { blocked: true, gate };
    }

    const now = Date.now();
    const draftPatch: Partial<Doc<"workflowDrafts">> = {
      stage: nextStage,
      updatedAt: now,
    };

    if (nextStage === "published") {
      const publishedAt = getPublishedAt(post, draft) ?? now;
      draftPatch.publishedAt = publishedAt;
      await ctx.db.patch(post._id, {
        status: "published",
        publishedAt,
        scheduledDate:
          post.scheduledDate ?? new Date(publishedAt).toISOString().slice(0, 10),
        updatedAt: now,
      });
    }

    await ctx.db.patch(draft._id, draftPatch);
    return { blocked: false, advancedTo: nextStage, gate };
  },
});

export const recordDraftAgentRun = mutation({
  args: {
    id: v.id("workflowDrafts"),
    stage: draftStageValidator,
    summary: v.string(),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const draft = await getDraftForUser(ctx, userId, args.id);
    const post = await ctx.db.get(draft.postId);

    if (!post) {
      throw new Error("Linked post not found");
    }

    const now = Date.now();
    await ctx.db.patch(post._id, {
      title: args.title ?? post.title,
      content: args.content ?? post.content,
      updatedAt: now,
    });

    await ctx.db.patch(draft._id, {
      title: args.title ?? draft.title,
      lastAgentStage: args.stage,
      lastAgentSummary: args.summary,
      lastAgentRunAt: now,
      updatedAt: now,
    });
  },
});

export const recordIdeaResearchRun = mutation({
  args: {
    id: v.id("ideas"),
    researchObjective: v.optional(v.string()),
    researchModes: v.optional(v.array(researchModeValidator)),
    researchSources: v.optional(v.array(researchSourceValidator)),
    researchNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const idea = await getIdeaForUser(ctx, userId, args.id);
    const now = Date.now();

    await ctx.db.patch(idea._id, {
      status: "research",
      researchObjective: args.researchObjective ?? idea.researchObjective,
      researchModes: args.researchModes ?? idea.researchModes,
      researchSources: args.researchSources ?? idea.researchSources,
      researchNotes: args.researchNotes,
      researchStatus: "completed",
      lastResearchRunAt: now,
      updatedAt: now,
    });
  },
});

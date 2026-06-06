import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

type BrandId = "personal" | "corvo" | "lower-db" | "freshproof";

const brandIdValidator = v.union(
  v.literal("personal"),
  v.literal("corvo"),
  v.literal("lower-db"),
  v.literal("freshproof")
);

const depthValidator = v.union(
  v.literal("light"),
  v.literal("standard"),
  v.literal("rigorous")
);

const riskValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

const sourceStatusValidator = v.union(
  v.literal("unvetted"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("flagged")
);

const claimStatusValidator = v.union(
  v.literal("unreviewed"),
  v.literal("accepted"),
  v.literal("needs-revision"),
  v.literal("unsupported"),
  v.literal("too-risky"),
  v.literal("out-of-scope")
);

const sourceValidator = v.object({
  id: v.string(),
  title: v.string(),
  url: v.string(),
  domain: v.optional(v.string()),
  evidenceLabel: v.string(),
  relevanceScore: v.optional(v.number()),
  publishedYear: v.optional(v.number()),
  useCase: v.optional(v.string()),
  addedBy: v.optional(v.string()),
  status: v.optional(sourceStatusValidator),
  reviewerNotes: v.optional(v.string()),
  raw: v.optional(v.any()),
});

const claimValidator = v.object({
  id: v.string(),
  text: v.string(),
  sourceIds: v.array(v.string()),
  evidenceLabel: v.string(),
  confidence: v.string(),
  caveats: v.optional(v.string()),
  reviewerNotes: v.optional(v.string()),
  status: v.optional(claimStatusValidator),
  raw: v.optional(v.any()),
});

const outlineSectionValidator = v.object({
  heading: v.string(),
  notes: v.string(),
  claimIds: v.array(v.string()),
  evidenceLabels: v.array(v.string()),
});

const takeawayRowValidator = v.object({
  finding: v.string(),
  evidenceLabel: v.string(),
  source: v.string(),
});

const outlineStatusValidator = v.union(
  v.literal("draft"),
  v.literal("approved"),
  v.literal("generating-draft")
);

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

async function ownedResearchBrief(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  researchBriefId: Id<"v2ResearchBriefs">
) {
  const brief = await ctx.db.get(researchBriefId);
  if (!brief || brief.userId !== userId) throw new Error("Research brief not found");
  await requireBrandAccess(ctx, userId, brief.brandId);
  return brief;
}

async function ownedClaimMap(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  claimMapId: Id<"v2ClaimMaps">
) {
  const claimMap = await ctx.db.get(claimMapId);
  if (!claimMap || claimMap.userId !== userId) throw new Error("Claim map not found");
  await requireBrandAccess(ctx, userId, claimMap.brandId);
  return claimMap;
}

async function audit(
  ctx: MutationCtx,
  params: {
    userId: string;
    brandId: BrandId;
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

export const saveResearchBrief = mutation({
  args: {
    localBriefId: v.optional(v.string()),
    brandId: brandIdValidator,
    topic: v.string(),
    audience: v.string(),
    thesis: v.string(),
    depth: depthValidator,
    riskLevel: riskValidator,
    targetOutputs: v.array(v.string()),
    provider: v.string(),
    warning: v.optional(v.string()),
    sources: v.array(sourceValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const now = Date.now();

    const researchBriefId = await ctx.db.insert("v2ResearchBriefs", {
      userId,
      brandId: args.brandId,
      topic: args.topic,
      audience: args.audience,
      thesis: args.thesis,
      depth: args.depth,
      riskLevel: args.riskLevel,
      targetOutputs: args.targetOutputs,
      status: "source-review",
      provider: args.provider,
      warning: args.warning,
      localBriefId: args.localBriefId,
      createdAt: now,
      updatedAt: now,
    });

    for (const source of args.sources) {
      await ctx.db.insert("v2ResearchSources", {
        researchBriefId,
        userId,
        brandId: args.brandId,
        sourceId: source.id,
        title: source.title,
        url: source.url,
        domain: source.domain,
        evidenceLabel: source.evidenceLabel,
        relevanceScore: source.relevanceScore,
        publishedYear: source.publishedYear,
        useCase: source.useCase,
        addedBy: source.addedBy,
        status: source.status ?? "unvetted",
        reviewerNotes: source.reviewerNotes,
        raw: source.raw ?? source,
        createdAt: now,
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "research.brief_save",
      summary: `Saved research brief with ${args.sources.length} source snapshots.`,
      metadata: { researchBriefId },
    });

    return { researchBriefId, sourceCount: args.sources.length };
  },
});

export const saveClaimMap = mutation({
  args: {
    localClaimMapId: v.optional(v.string()),
    researchBriefId: v.optional(v.id("v2ResearchBriefs")),
    brandId: brandIdValidator,
    topic: v.string(),
    thesis: v.string(),
    provider: v.string(),
    warning: v.optional(v.string()),
    claims: v.array(claimValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    if (args.researchBriefId) {
      await ownedResearchBrief(ctx, userId, args.researchBriefId);
    }
    const now = Date.now();

    const claimMapId = await ctx.db.insert("v2ClaimMaps", {
      userId,
      brandId: args.brandId,
      researchBriefId: args.researchBriefId,
      localClaimMapId: args.localClaimMapId,
      topic: args.topic,
      thesis: args.thesis,
      status: "review-ready",
      provider: args.provider,
      warning: args.warning,
      createdAt: now,
      updatedAt: now,
    });

    for (const claim of args.claims) {
      await ctx.db.insert("v2Claims", {
        claimMapId,
        userId,
        brandId: args.brandId,
        claimId: claim.id,
        text: claim.text,
        sourceIds: claim.sourceIds,
        evidenceLabel: claim.evidenceLabel,
        confidence: claim.confidence,
        caveats: claim.caveats,
        reviewerNotes: claim.reviewerNotes,
        status: claim.status ?? "unreviewed",
        raw: claim.raw ?? claim,
        createdAt: now,
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "research.claim_map_save",
      summary: `Saved claim map with ${args.claims.length} claim snapshots.`,
      metadata: { claimMapId, researchBriefId: args.researchBriefId },
    });

    return { claimMapId, claimCount: args.claims.length };
  },
});

export const reviewSource = mutation({
  args: {
    researchBriefId: v.id("v2ResearchBriefs"),
    sourceId: v.string(),
    status: sourceStatusValidator,
    reviewerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const brief = await ownedResearchBrief(ctx, userId, args.researchBriefId);
    const source = await ctx.db
      .query("v2ResearchSources")
      .withIndex("by_brief_and_source", (q) =>
        q.eq("researchBriefId", args.researchBriefId).eq("sourceId", args.sourceId)
      )
      .first();
    if (!source) throw new Error("Research source not found");

    await ctx.db.patch(source._id, {
      status: args.status,
      reviewerNotes: args.reviewerNotes,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      brandId: brief.brandId,
      action: "research.source_review",
      summary: `Source ${args.sourceId} marked ${args.status}.`,
      metadata: { researchBriefId: args.researchBriefId, sourceId: args.sourceId },
    });
  },
});

export const reviewClaim = mutation({
  args: {
    claimMapId: v.id("v2ClaimMaps"),
    claimId: v.string(),
    status: claimStatusValidator,
    reviewerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const claimMap = await ownedClaimMap(ctx, userId, args.claimMapId);
    const claim = await ctx.db
      .query("v2Claims")
      .withIndex("by_claim_map_and_claim", (q) =>
        q.eq("claimMapId", args.claimMapId).eq("claimId", args.claimId)
      )
      .first();
    if (!claim) throw new Error("Claim not found");

    await ctx.db.patch(claim._id, {
      status: args.status,
      reviewerNotes: args.reviewerNotes,
      updatedAt: Date.now(),
    });
    const allClaims = await ctx.db
      .query("v2Claims")
      .withIndex("by_claim_map", (q) => q.eq("claimMapId", args.claimMapId))
      .collect();
    const nextClaims = allClaims.map((candidate) =>
      candidate._id === claim._id ? { ...candidate, status: args.status } : candidate
    );
    const allReviewed = nextClaims.every((candidate) => candidate.status !== "unreviewed");
    if (allReviewed) {
      await ctx.db.patch(args.claimMapId, {
        status: "reviewed",
        updatedAt: Date.now(),
      });
    }
    await audit(ctx, {
      userId,
      brandId: claimMap.brandId,
      action: "research.claim_review",
      summary: `Claim ${args.claimId} marked ${args.status}.`,
      metadata: { claimMapId: args.claimMapId, claimId: args.claimId },
    });
  },
});

export const getResearchBrief = query({
  args: { researchBriefId: v.id("v2ResearchBriefs") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const brief = await ownedResearchBrief(ctx, userId, args.researchBriefId);
    const sources = await ctx.db
      .query("v2ResearchSources")
      .withIndex("by_brief", (q) => q.eq("researchBriefId", args.researchBriefId))
      .collect();
    return { brief, sources };
  },
});

export const saveEditorialOutline = mutation({
  args: {
    localOutlineId: v.optional(v.string()),
    localClaimMapId: v.optional(v.string()),
    claimMapId: v.optional(v.id("v2ClaimMaps")),
    brandId: brandIdValidator,
    thesis: v.string(),
    sections: v.array(outlineSectionValidator),
    takeawayTable: v.array(takeawayRowValidator),
    citationPlan: v.string(),
    status: v.optional(outlineStatusValidator),
    provider: v.string(),
    warning: v.optional(v.string()),
    raw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    if (args.claimMapId) {
      await ownedClaimMap(ctx, userId, args.claimMapId);
    }
    const now = Date.now();

    const outlineId = await ctx.db.insert("v2EditorialOutlines", {
      userId,
      brandId: args.brandId,
      claimMapId: args.claimMapId,
      localOutlineId: args.localOutlineId,
      localClaimMapId: args.localClaimMapId,
      thesis: args.thesis,
      sections: args.sections,
      takeawayTable: args.takeawayTable,
      citationPlan: args.citationPlan,
      status: args.status ?? "draft",
      provider: args.provider,
      warning: args.warning,
      raw: args.raw ?? args,
      createdAt: now,
      updatedAt: now,
    });

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "research.outline_save",
      summary: `Saved editorial outline with ${args.sections.length} sections.`,
      metadata: { outlineId, claimMapId: args.claimMapId },
    });

    return { outlineId, sectionCount: args.sections.length };
  },
});

export const saveLongFormDraft = mutation({
  args: {
    outlineId: v.optional(v.id("v2EditorialOutlines")),
    localOutlineId: v.optional(v.string()),
    claimMapId: v.optional(v.id("v2ClaimMaps")),
    localClaimMapId: v.optional(v.string()),
    brandId: brandIdValidator,
    markdown: v.string(),
    provider: v.string(),
    warning: v.optional(v.string()),
    acceptedClaimIds: v.array(v.string()),
    raw: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    if (args.claimMapId) {
      await ownedClaimMap(ctx, userId, args.claimMapId);
    }
    if (args.outlineId) {
      const outline = await ctx.db.get(args.outlineId);
      if (!outline || outline.userId !== userId) {
        throw new Error("Editorial outline not found");
      }
      await requireBrandAccess(ctx, userId, outline.brandId);
    }
    const now = Date.now();

    const draftId = await ctx.db.insert("v2LongFormDrafts", {
      userId,
      brandId: args.brandId,
      outlineId: args.outlineId,
      localOutlineId: args.localOutlineId,
      claimMapId: args.claimMapId,
      localClaimMapId: args.localClaimMapId,
      markdown: args.markdown,
      provider: args.provider,
      warning: args.warning,
      acceptedClaimIds: args.acceptedClaimIds,
      raw: args.raw ?? args,
      createdAt: now,
      updatedAt: now,
    });

    if (args.outlineId) {
      await ctx.db.patch(args.outlineId, {
        status: "approved",
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "research.long_form_draft_save",
      summary: "Saved long-form draft markdown.",
      metadata: { draftId, outlineId: args.outlineId, claimMapId: args.claimMapId },
    });

    return { draftId, markdownLength: args.markdown.length };
  },
});

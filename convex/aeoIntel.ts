import { v } from "convex/values";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import { BlockedUrlError, validatePublicHttpsUrl } from "../lib/urlGuard";
import { audit, brandIdValidator, requireBrandAccess, requireUserId } from "./campaignAccess";
import {
  aeoBrandTargetValidator,
  aeoCrawlPageValidator,
  aeoIntelFindingValidator,
  aeoIntelRunValidator,
  aeoPlanValidator,
  aeoReviewStateValidator,
  aeoRunKindValidator,
  aeoSiteCrawlValidator,
  aeoStrategyPlanValidator,
  aeoTargetValidationValidator,
} from "./aeoTables";
import type { BrandId } from "./campaignAccess";

/**
 * AEO/SEO intelligence (A1): the persistence layer for the new artifact
 * family — brand targets, immutable crawl snapshots, intel runs/findings, and
 * strategy plans. Every mutation enforces `requireUserId` + `requireBrandAccess`
 * and writes an audit event; queries enforce the same access checks.
 */

async function readTarget(ctx: QueryCtx | MutationCtx, userId: string, brandId: BrandId) {
  return await ctx.db
    .query("brandTargets")
    .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", brandId))
    .first();
}

async function getOwnedTarget(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  brandId: BrandId,
  targetId: string
) {
  const normalized = ctx.db.normalizeId("brandTargets", targetId);
  if (!normalized) throw new Error("Brand target not found");
  const target = await ctx.db.get(normalized);
  if (!target || target.userId !== userId) throw new Error("Brand target not found");
  await requireBrandAccess(ctx, userId, target.brandId);
  if (target.brandId !== brandId) throw new Error("Brand target not found");
  return target;
}

async function getOwnedRun(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  brandId: BrandId,
  runId: string
) {
  const normalized = ctx.db.normalizeId("intelRuns", runId);
  if (!normalized) throw new Error("Intel run not found");
  const run = await ctx.db.get(normalized);
  if (!run || run.userId !== userId) throw new Error("Intel run not found");
  await requireBrandAccess(ctx, userId, run.brandId);
  if (run.brandId !== brandId) throw new Error("Intel run not found");
  return run;
}

async function getOwnedFinding(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  brandId: BrandId,
  findingId: string
) {
  const normalized = ctx.db.normalizeId("intelFindings", findingId);
  if (!normalized) throw new Error("Intel finding not found");
  const finding = await ctx.db.get(normalized);
  if (!finding || finding.userId !== userId) throw new Error("Intel finding not found");
  await requireBrandAccess(ctx, userId, finding.brandId);
  if (finding.brandId !== brandId) throw new Error("Intel finding not found");
  return finding;
}

export const getTarget = query({
  args: { brandId: brandIdValidator },
  returns: v.union(aeoBrandTargetValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await readTarget(ctx, userId, args.brandId);
  },
});

export const listCrawls = query({
  args: { brandId: brandIdValidator },
  returns: v.array(aeoSiteCrawlValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await ctx.db
      .query("siteCrawls")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", args.brandId))
      .order("desc")
      .collect();
  },
});

export const getRun = query({
  args: { brandId: brandIdValidator, runId: v.string() },
  returns: v.object({
    run: aeoIntelRunValidator,
    findings: v.array(aeoIntelFindingValidator),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const run = await getOwnedRun(ctx, userId, args.brandId, args.runId);
    const findings = await ctx.db
      .query("intelFindings")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .collect();
    return { run, findings };
  },
});

export const listRuns = query({
  args: { brandId: brandIdValidator },
  returns: v.array(aeoIntelRunValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await ctx.db
      .query("intelRuns")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", args.brandId))
      .order("desc")
      .collect();
  },
});

export const listFindings = query({
  args: { brandId: brandIdValidator },
  returns: v.array(aeoIntelFindingValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await ctx.db
      .query("intelFindings")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", args.brandId))
      .order("desc")
      .collect();
  },
});

export const connectTarget = mutation({
  args: {
    brandId: brandIdValidator,
    siteUrl: v.string(),
    productIdentifiers: v.array(v.string()),
    competitorUrls: v.array(v.string()),
    validation: v.optional(aeoTargetValidationValidator),
  },
  returns: v.id("brandTargets"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    // Entry validation for stored URLs: https-only and non-blocked hosts
    // (resolution-time SSRF checks run in validateRemoteUrl before any fetch).
    // Convex mutations cannot do DNS lookups, so this is the sync half of the
    // guard — but it closes the http-scheme and literal-private-host holes.
    try {
      validatePublicHttpsUrl(args.siteUrl);
      for (const url of args.competitorUrls) validatePublicHttpsUrl(url);
    } catch (error) {
      throw new Error(
        error instanceof BlockedUrlError ? error.message : "Invalid site URL."
      );
    }
    const now = Date.now();
    const existing = await readTarget(ctx, userId, args.brandId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        siteUrl: args.siteUrl,
        productIdentifiers: args.productIdentifiers,
        competitorUrls: args.competitorUrls,
        validation: args.validation,
        updatedAt: now,
      });
      await audit(ctx, {
        userId,
        brandId: args.brandId,
        action: "aeo.target_update",
        summary: `Updated the connected target for ${args.brandId} — ${args.siteUrl}.`,
        metadata: { targetId: String(existing._id), siteUrl: args.siteUrl },
      });
      return existing._id;
    }
    const targetId = await ctx.db.insert("brandTargets", {
      userId,
      brandId: args.brandId,
      siteUrl: args.siteUrl,
      productIdentifiers: args.productIdentifiers,
      competitorUrls: args.competitorUrls,
      validation: args.validation,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "aeo.target_connect",
      summary: `Connected a target site for ${args.brandId} — ${args.siteUrl}.`,
      metadata: { targetId: String(targetId), siteUrl: args.siteUrl },
    });
    return targetId;
  },
});

const crawlPageInput = v.object({
  url: v.string(),
  title: v.optional(v.string()),
  headings: v.array(v.string()),
  schemaTypes: v.array(v.string()),
  description: v.optional(v.string()),
  contentSample: v.optional(v.string()),
});

/** The review pin is the human gate: intel cycles read only pinned targets. */
export const pinTargetReview = mutation({
  args: {
    brandId: brandIdValidator,
    pinned: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const target = await readTarget(ctx, userId, args.brandId);
    if (target === null) {
      throw new Error("No connected target for this brand — connect a target first.");
    }
    await ctx.db.patch(target._id, {
      reviewPinned: args.pinned,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "aeo.target_review_pinned",
      summary: args.pinned
        ? "Pinned the target review — scheduled intel cycles will now read it."
        : "Unpinned the target review — scheduled intel cycles will skip it.",
      metadata: { targetId: String(target._id), reviewPinned: args.pinned },
    });
    return null;
  },
});

export const recordCrawlSnapshot = mutation({
  args: {
    brandId: brandIdValidator,
    targetId: v.string(),
    siteUrl: v.string(),
    version: v.number(),
    status: v.union(v.literal("complete"), v.literal("failed")),
    detail: v.optional(v.string()),
    pages: v.array(crawlPageInput),
  },
  returns: v.id("siteCrawls"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const target = await getOwnedTarget(ctx, userId, args.brandId, args.targetId);

    // Snapshots are immutable, append-only versions: a (target, version) pair
    // is written exactly once. A second write is refused, never merged.
    const duplicate = await ctx.db
      .query("siteCrawls")
      .withIndex("by_target_and_version", (q) =>
        q.eq("targetId", target._id).eq("version", args.version)
      )
      .first();
    if (duplicate) {
      throw new Error(
        `Crawl snapshot version ${args.version} already exists for this target; write a new version instead.`
      );
    }

    const now = Date.now();
    const crawlId = await ctx.db.insert("siteCrawls", {
      userId,
      brandId: args.brandId,
      targetId: target._id,
      siteUrl: args.siteUrl,
      version: args.version,
      status: args.status,
      pageCount: args.pages.length,
      detail: args.detail,
      createdAt: now,
    });
    for (const page of args.pages) {
      await ctx.db.insert("crawlPages", {
        userId,
        brandId: args.brandId,
        crawlId,
        ...page,
        createdAt: now,
      });
    }
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "aeo.crawl_snapshot",
      summary: `Recorded crawl v${args.version} of ${args.siteUrl} — ${args.pages.length} page(s), ${args.status}.`,
      metadata: { targetId: String(target._id), crawlId: String(crawlId), version: args.version },
    });
    return crawlId;
  },
});

export const listCrawlPages = query({
  args: { brandId: brandIdValidator, crawlId: v.string() },
  returns: v.array(aeoCrawlPageValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const normalized = ctx.db.normalizeId("siteCrawls", args.crawlId);
    if (!normalized) throw new Error("Crawl snapshot not found");
    const crawl = await ctx.db.get(normalized);
    if (!crawl || crawl.userId !== userId) throw new Error("Crawl snapshot not found");
    return await ctx.db
      .query("crawlPages")
      .withIndex("by_crawl", (q) => q.eq("crawlId", normalized))
      .collect();
  },
});

export const createIntelRun = mutation({
  args: {
    brandId: brandIdValidator,
    kind: aeoRunKindValidator,
    costCeilingCents: v.number(),
    questionCount: v.number(),
  },
  returns: v.id("intelRuns"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const runId = await ctx.db.insert("intelRuns", {
      userId,
      brandId: args.brandId,
      kind: args.kind,
      status: "running",
      costCeilingCents: args.costCeilingCents,
      questionCount: args.questionCount,
      startedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "aeo.intel_run_created",
      summary: `Started a ${args.kind} intel run (ceiling ${args.costCeilingCents} cents, ${args.questionCount} question(s)).`,
      metadata: { runId: String(runId), kind: args.kind },
    });
    return runId;
  },
});

export const completeIntelRun = mutation({
  args: {
    brandId: brandIdValidator,
    runId: v.string(),
    status: v.union(v.literal("complete"), v.literal("failed")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const run = await getOwnedRun(ctx, userId, args.brandId, args.runId);
    await ctx.db.patch(run._id, { status: args.status, finishedAt: Date.now() });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "aeo.intel_run_completed",
      summary: `Intel run finished as ${args.status}.`,
      metadata: { runId: String(run._id), status: args.status },
    });
    return null;
  },
});

export const addIntelFinding = mutation({
  args: {
    brandId: brandIdValidator,
    runId: v.string(),
    classification: v.union(v.literal("gap"), v.literal("opportunity")),
    citationStatus: v.union(
      v.literal("cited"),
      v.literal("uncited"),
      v.literal("not-observed")
    ),
    extractability: v.number(),
    summary: v.string(),
    evidence: v.array(v.string()),
  },
  returns: v.id("intelFindings"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const run = await getOwnedRun(ctx, userId, args.brandId, args.runId);
    const findingId = await ctx.db.insert("intelFindings", {
      userId,
      brandId: args.brandId,
      runId: run._id,
      classification: args.classification,
      citationStatus: args.citationStatus,
      extractability: args.extractability,
      summary: args.summary,
      evidence: args.evidence,
      reviewStatus: "unreviewed",
      createdAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "aeo.finding_recorded",
      summary: `Recorded a ${args.classification} finding in the intel run.`,
      metadata: { runId: String(run._id), findingId: String(findingId) },
    });
    return findingId;
  },
});

export const reviewIntelFinding = mutation({
  args: {
    brandId: brandIdValidator,
    findingId: v.string(),
    reviewStatus: aeoReviewStateValidator,
    reviewNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const finding = await getOwnedFinding(ctx, userId, args.brandId, args.findingId);
    await ctx.db.patch(finding._id, {
      reviewStatus: args.reviewStatus,
      reviewNotes: args.reviewNotes,
    });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "aeo.finding_review",
      summary: `Reviewed an intel finding as ${args.reviewStatus}.`,
      metadata: { findingId: String(finding._id), reviewStatus: args.reviewStatus },
    });
    return null;
  },
});

export const saveStrategyPlan = mutation({
  args: {
    brandId: brandIdValidator,
    status: v.union(v.literal("draft"), v.literal("reviewed")),
    reviewNotes: v.optional(v.string()),
    /**
     * Optimistic-concurrency guard: the plan version the caller loaded before
     * editing. When supplied, a save against a superseded version is refused
     * instead of silently clobbering the newer row — the same expectedVersion
     * pattern the publishing surfaces use. Without it the save appends, which
     * keeps historical internal callers working.
     */
    expectedVersion: v.optional(v.number()),
    plan: aeoPlanValidator,
  },
  returns: v.id("strategyPlans"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    // Plans are append-only versions, mirroring the corpus-version precedent:
    // the newest row per brand is current, older versions stay as history.
    // The append itself is transactional (single-document insert); the race
    // this guards is read-modify-write across two concurrent saves, resolved
    // by the caller-supplied expectedVersion below.
    const latest = await ctx.db
      .query("strategyPlans")
      .withIndex("by_user_and_brand", (q) =>
        q.eq("userId", userId).eq("brandId", args.brandId)
      )
      .order("desc")
      .first();
    if (args.expectedVersion !== undefined && (latest?.version ?? 0) !== args.expectedVersion) {
      throw new Error(
        `Strategy plan changed since it was loaded (current version ${latest?.version ?? 0}, expected ${args.expectedVersion}); reload the plan and save again.`
      );
    }
    const version = (latest?.version ?? 0) + 1;
    const planId = await ctx.db.insert("strategyPlans", {
      userId,
      brandId: args.brandId,
      version,
      status: args.status,
      reviewNotes: args.reviewNotes,
      plan: args.plan,
      createdAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "aeo.strategy_plan_saved",
      summary: `Saved strategy plan v${version} — ${args.plan.gaps.length} gap(s), ${args.plan.opportunities.length} opportunit(ies).`,
      metadata: { planId: String(planId), version },
    });
    return planId;
  },
});

export const getLatestStrategyPlan = query({
  args: { brandId: brandIdValidator },
  returns: v.union(aeoStrategyPlanValidator, v.null()),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await ctx.db
      .query("strategyPlans")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", args.brandId))
      .order("desc")
      .first();
  },
});

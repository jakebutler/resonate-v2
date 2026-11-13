import { defineTable } from "convex/server";
import { v } from "convex/values";
import { brandIdValidator } from "./campaignAccess";

/**
 * AEO/SEO artifact family (A1). Per locked decision L14 this is a separate
 * artifact family from content research (the v2Research* tables), and per L13
 * new tables carry no `v2` prefix. Every row is userId-owned and brand-scoped
 * with the same envelope as the rest of the schema.
 */

export const aeoTargetValidationValidator = v.object({
  state: v.union(
    v.literal("pending"),
    v.literal("validated"),
    v.literal("failed")
  ),
  checkedAt: v.number(),
  detail: v.optional(v.string()),
});

/** The connected target site/product for a brand — one per user+brand. */
export const brandTargetFields = {
  userId: v.string(),
  brandId: brandIdValidator,
  siteUrl: v.string(),
  productIdentifiers: v.array(v.string()),
  competitorUrls: v.array(v.string()),
  validation: v.optional(aeoTargetValidationValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
};

/**
 * Immutable crawl snapshots: each record is a complete version of a target
 * site's crawl. Snapshots are append-only — a version is written once and a
 * second write to an existing (targetId, version) is refused.
 */
export const siteCrawlFields = {
  userId: v.string(),
  brandId: brandIdValidator,
  targetId: v.id("brandTargets"),
  siteUrl: v.string(),
  version: v.number(),
  status: v.union(
    v.literal("complete"),
    v.literal("failed")
  ),
  pageCount: v.number(),
  detail: v.optional(v.string()),
  createdAt: v.number(),
};

export const crawlPageFields = {
  userId: v.string(),
  brandId: brandIdValidator,
  crawlId: v.id("siteCrawls"),
  url: v.string(),
  title: v.optional(v.string()),
  headings: v.array(v.string()),
  schemaTypes: v.array(v.string()),
  description: v.optional(v.string()),
  contentSample: v.optional(v.string()),
  createdAt: v.number(),
};

export const aeoRunKindValidator = v.union(
  v.literal("competitor-intel"),
  v.literal("competitor-discovery"),
  v.literal("answer-engine")
);

export const aeoReviewStateValidator = v.union(
  v.literal("unreviewed"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("flagged")
);

export const intelRunFields = {
  userId: v.string(),
  brandId: brandIdValidator,
  kind: aeoRunKindValidator,
  status: v.union(
    v.literal("running"),
    v.literal("complete"),
    v.literal("failed")
  ),
  costCeilingCents: v.number(),
  questionCount: v.number(),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
};

export const intelFindingFields = {
  userId: v.string(),
  brandId: brandIdValidator,
  runId: v.id("intelRuns"),
  classification: v.union(
    v.literal("gap"),
    v.literal("opportunity")
  ),
  citationStatus: v.union(
    v.literal("cited"),
    v.literal("uncited"),
    v.literal("not-observed")
  ),
  extractability: v.number(),
  summary: v.string(),
  evidence: v.array(v.string()),
  reviewStatus: aeoReviewStateValidator,
  reviewNotes: v.optional(v.string()),
  createdAt: v.number(),
};

export const aeoPlanItemValidator = v.object({
  title: v.string(),
  description: v.string(),
  priority: v.number(),
  sourceFindingIds: v.array(v.id("intelFindings")),
});

/** Brief fields mapped to the Marketing Director L5 required set. */
export const aeoPlanBriefValidator = v.object({
  goal: v.string(),
  audience: v.string(),
  thesis: v.string(),
  window: v.string(),
  channels: v.array(v.string()),
  cta: v.string(),
  metric: v.string(),
  constraints: v.array(v.string()),
});

export const aeoPlanValidator = v.object({
  gaps: v.array(aeoPlanItemValidator),
  opportunities: v.array(aeoPlanItemValidator),
  targetKeywords: v.array(v.string()),
  targetQuestions: v.array(v.string()),
  brief: aeoPlanBriefValidator,
});

export const strategyPlanFields = {
  userId: v.string(),
  brandId: brandIdValidator,
  version: v.number(),
  status: v.union(
    v.literal("draft"),
    v.literal("reviewed"),
    v.literal("accepted")
  ),
  plan: aeoPlanValidator,
  createdAt: v.number(),
};

export const aeoBrandTargetValidator = v.object({
  _id: v.id("brandTargets"),
  _creationTime: v.number(),
  ...brandTargetFields,
});
export const aeoSiteCrawlValidator = v.object({
  _id: v.id("siteCrawls"),
  _creationTime: v.number(),
  ...siteCrawlFields,
});
export const aeoCrawlPageValidator = v.object({
  _id: v.id("crawlPages"),
  _creationTime: v.number(),
  ...crawlPageFields,
});
export const aeoIntelRunValidator = v.object({
  _id: v.id("intelRuns"),
  _creationTime: v.number(),
  ...intelRunFields,
});
export const aeoIntelFindingValidator = v.object({
  _id: v.id("intelFindings"),
  _creationTime: v.number(),
  ...intelFindingFields,
});
export const aeoStrategyPlanValidator = v.object({
  _id: v.id("strategyPlans"),
  _creationTime: v.number(),
  ...strategyPlanFields,
});

export const aeoTables = {
  brandTargets: defineTable(brandTargetFields)
    .index("by_user_and_brand", ["userId", "brandId"])
    .index("by_brand", ["brandId"]),
  siteCrawls: defineTable(siteCrawlFields)
    .index("by_user_and_brand", ["userId", "brandId"])
    .index("by_target_and_version", ["targetId", "version"]),
  crawlPages: defineTable(crawlPageFields)
    .index("by_crawl", ["crawlId"]),
  intelRuns: defineTable(intelRunFields)
    .index("by_user_and_brand", ["userId", "brandId"])
    .index("by_brand", ["brandId"]),
  intelFindings: defineTable(intelFindingFields)
    .index("by_run", ["runId"])
    .index("by_user_and_brand", ["userId", "brandId"]),
  strategyPlans: defineTable(strategyPlanFields)
    .index("by_user_and_brand", ["userId", "brandId"])
    .index("by_brand", ["brandId"]),
};

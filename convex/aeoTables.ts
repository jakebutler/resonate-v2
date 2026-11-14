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
  /** Set by the review-pin flow: nothing reads or crawls an unpinned target. */
  reviewPinned: v.optional(v.boolean()),
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
  v.literal("answer-engine"),
  v.literal("keyword-research")
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
  /**
   * Findings in this run whose cited answer is suspected of describing a
   * different product with the brand's name (brand-mismatch detection).
   * Recorded at run completion so the run record itself carries the
   * qualification, not just the per-finding rows.
   */
  brandMismatchCount: v.optional(v.number()),
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
  /**
   * Brand-mismatch classification for cited findings (see answerEngine's
   * assessAnswerBrandMatch). Optional so findings recorded before the
   * detection existed still validate; a suspect citation is qualified
   * everywhere it is displayed.
   */
  brandMatch: v.optional(
    v.union(
      v.literal("match"),
      v.literal("suspect"),
      v.literal("unknown")
    )
  ),
  brandMatchDetail: v.optional(v.string()),
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

/**
 * A competitor surfaced by a discovery pass (A5). Suggestions are evidence,
 * never instructions: a row starts `suggested` and only a human review moves
 * it to `accepted` (which adds it to `brandTargets.competitorUrls`) or
 * `rejected` (which is remembered so discovery never re-proposes it).
 */
export const competitorSuggestionFields = {
  userId: v.string(),
  brandId: brandIdValidator,
  runId: v.id("intelRuns"),
  /** Display/matching name: the candidate URL's hostname without "www.". */
  name: v.string(),
  /** Candidate URL; accepting adds it to brandTargets.competitorUrls. */
  url: v.string(),
  status: v.union(
    v.literal("suggested"),
    v.literal("accepted"),
    v.literal("rejected")
  ),
  /** How many distinct discovery queries surfaced this candidate. */
  frequency: v.number(),
  /** Which phrasings surfaced it, e.g. `search: "best glp-1 trackers"`. */
  phrasings: v.array(v.string()),
  /** Per-appearance evidence: the query/answer that surfaced the candidate. */
  evidence: v.array(v.string()),
  reviewNotes: v.optional(v.string()),
  reviewedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

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
  /** Human review notes: a change request lands as a new draft version. */
  reviewNotes: v.optional(v.string()),
  plan: aeoPlanValidator,
  createdAt: v.number(),
};

/**
 * A candidate keyword with its demand-signal verdict (SEO half of AEO/SEO).
 * Candidates are derived only from real rows (crawl pages, audit questions,
 * competitor phrasings, plan keywords); the status is an honest tri-state:
 * "absent" means a real run observed it without the target cited/surfaced,
 * "present" means a run observed it with the target cited/surfaced, and
 * "unproven" means no real signal has observed it yet — absence without
 * observation is never recorded as evidence.
 */
export const keywordGapFields = {
  userId: v.string(),
  brandId: brandIdValidator,
  runId: v.id("intelRuns"),
  /** The candidate phrase, verbatim from its source rows. */
  keyword: v.string(),
  status: v.union(
    v.literal("present"),
    v.literal("absent"),
    v.literal("unproven")
  ),
  /** Which real signal produced the status. */
  signal: v.union(
    v.literal("answer-engine"),
    v.literal("search"),
    v.literal("derived")
  ),
  // Convex ids are strings; these reference real rows but the pure lib
  // carries them unbranded.
  sourceFindingIds: v.array(v.string()),
  sourcePageUrls: v.array(v.string()),
  sourceSuggestionIds: v.array(v.string()),
  fromPlan: v.boolean(),
  /** Display evidence: matched questions, source page URLs, search notes. */
  evidence: v.array(v.string()),
  /** When the budgeted search leg ran, when a search produced the status. */
  searchedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
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
export const aeoCompetitorSuggestionValidator = v.object({
  _id: v.id("competitorSuggestions"),
  _creationTime: v.number(),
  ...competitorSuggestionFields,
});
export const aeoKeywordGapValidator = v.object({
  _id: v.id("keywordGaps"),
  _creationTime: v.number(),
  ...keywordGapFields,
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
  competitorSuggestions: defineTable(competitorSuggestionFields)
    .index("by_user_and_brand", ["userId", "brandId"])
    .index("by_user_brand_and_name", ["userId", "brandId", "name"]),
  keywordGaps: defineTable(keywordGapFields)
    .index("by_user_and_brand", ["userId", "brandId"])
    .index("by_user_brand_and_keyword", ["userId", "brandId", "keyword"]),
};

import { v } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { audit, brandIdValidator, requireBrandAccess, requireUserId } from "./campaignAccess";
import { aeoKeywordGapValidator } from "./aeoTables";
import {
  deriveKeywordCandidates,
  keywordCitationStatus,
  keywordRunLimits,
  keywordSearchOrder,
  keywordSearchPresence,
  planKeywordResearchRun,
  type CitationFinding,
  type KeywordCandidate,
  type KeywordPresence,
} from "../lib/keywordResearch";
import { firecrawlSearch, type ProviderAdapterContext } from "../lib/providerAdapters";

/**
 * Keyword-gap research (SEO half of AEO/SEO).
 *
 * A budgeted run derives candidate keywords only from real rows — the
 * target's latest complete crawl, recorded answer-engine questions,
 * competitor-discovery phrasings, and saved plan keywords — then classifies
 * each by honest absence signals: which audit questions the target was NOT
 * cited in (answer-engine findings), and, for a budgeted top slice, which
 * search results do not surface the target's own domain (Firecrawl search).
 * The run never invents keywords and never publishes anything: it records
 * reviewable `keywordGaps` rows whose status is present/absent/unproven (L8).
 */

type ResearchInput = {
  siteUrl: string;
  reviewPinned: boolean;
  pages: Array<{ url: string; title?: string; headings: string[] }>;
  findings: Array<{
    _id: Id<"intelFindings">;
    summary: string;
    citationStatus: "cited" | "uncited" | "not-observed";
    brandMatch?: "match" | "suspect" | "unknown";
  }>;
  suggestions: Array<{ _id: Id<"competitorSuggestions">; phrasings: string[] }>;
  planKeywords: string[];
};

export const researchInput = internalQuery({
  args: { userId: v.string(), brandId: brandIdValidator },
  returns: v.union(
    v.object({
      siteUrl: v.string(),
      reviewPinned: v.boolean(),
      pages: v.array(v.object({ url: v.string(), title: v.optional(v.string()), headings: v.array(v.string()) })),
      findings: v.array(
        v.object({
          _id: v.id("intelFindings"),
          summary: v.string(),
          citationStatus: v.union(v.literal("cited"), v.literal("uncited"), v.literal("not-observed")),
          brandMatch: v.optional(v.union(v.literal("match"), v.literal("suspect"), v.literal("unknown"))),
        })
      ),
      suggestions: v.array(v.object({ _id: v.id("competitorSuggestions"), phrasings: v.array(v.string()) })),
      planKeywords: v.array(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<ResearchInput | null> => {
    const target = await ctx.db
      .query("brandTargets")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", args.userId).eq("brandId", args.brandId))
      .first();
    if (!target) return null;

    const crawls = await ctx.db
      .query("siteCrawls")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", args.userId).eq("brandId", args.brandId))
      .collect();
    const latestComplete = crawls
      .filter((crawl) => crawl.siteUrl === target.siteUrl && crawl.status === "complete")
      .sort((a, b) => b.version - a.version)[0];
    const pages = latestComplete
      ? await ctx.db
          .query("crawlPages")
          .withIndex("by_crawl", (q) => q.eq("crawlId", latestComplete._id))
          .collect()
      : [];

    const findings = await ctx.db
      .query("intelFindings")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", args.userId).eq("brandId", args.brandId))
      .collect();
    const suggestions = await ctx.db
      .query("competitorSuggestions")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", args.userId).eq("brandId", args.brandId))
      .collect();
    const plan = await ctx.db
      .query("strategyPlans")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", args.userId).eq("brandId", args.brandId))
      .order("desc")
      .first();

    return {
      siteUrl: target.siteUrl,
      reviewPinned: target.reviewPinned === true,
      pages: pages.map((page) => ({ url: page.url, title: page.title, headings: page.headings })),
      findings: findings.map((finding) => ({
        _id: finding._id,
        summary: finding.summary,
        citationStatus: finding.citationStatus,
        ...(finding.brandMatch ? { brandMatch: finding.brandMatch } : {}),
      })),
      suggestions: suggestions.map((suggestion) => ({ _id: suggestion._id, phrasings: suggestion.phrasings })),
      planKeywords: plan?.plan.targetKeywords ?? [],
    };
  },
});

export const hasRunningRun = internalQuery({
  args: { userId: v.string(), brandId: brandIdValidator },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("intelRuns")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", args.userId).eq("brandId", args.brandId))
      .collect();
    return runs.some((run) => run.kind === "keyword-research" && run.status === "running");
  },
});

export const startRun = internalMutation({
  args: {
    userId: v.string(),
    brandId: brandIdValidator,
    candidateCount: v.number(),
    estimatedCostCents: v.number(),
    costCeilingCents: v.number(),
  },
  returns: v.id("intelRuns"),
  handler: async (ctx, args) => {
    await requireBrandAccess(ctx, args.userId, args.brandId);
    const runId = await ctx.db.insert("intelRuns", {
      userId: args.userId,
      brandId: args.brandId,
      kind: "keyword-research",
      status: "running",
      costCeilingCents: args.costCeilingCents,
      questionCount: args.candidateCount,
      startedAt: Date.now(),
    });
    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      action: "aeo.keyword_run_started",
      summary: `Keyword-gap research started — ${args.candidateCount} candidate(s), estimate ${args.estimatedCostCents} cents.`,
      metadata: { runId: String(runId), candidateCount: args.candidateCount },
    });
    return runId;
  },
});

export const finishRun = internalMutation({
  args: {
    runId: v.id("intelRuns"),
    userId: v.string(),
    brandId: brandIdValidator,
    status: v.union(v.literal("complete"), v.literal("failed")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== args.userId || run.brandId !== args.brandId) {
      throw new Error("Intel run not found");
    }
    if (run.status !== "running") throw new Error("Intel run is not running");
    await requireBrandAccess(ctx, args.userId, args.brandId);
    await ctx.db.patch(run._id, { status: args.status, finishedAt: Date.now() });
    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      action: "aeo.keyword_run_finished",
      summary: `Keyword-gap research finished as ${args.status}.`,
      metadata: { runId: String(run._id), status: args.status },
    });
    return null;
  },
});

/** Stale-run recovery: a crashed keyword run must not lock out the next one. */
export const reapStaleRuns = internalMutation({
  args: { staleMs: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const runs = await ctx.db.query("intelRuns").collect();
    let reaped = 0;
    for (const run of runs) {
      if (run.kind !== "keyword-research" || run.status !== "running") continue;
      if (now - run.startedAt <= args.staleMs) continue;
      await ctx.db.patch(run._id, { status: "failed", finishedAt: now });
      reaped += 1;
    }
    return reaped;
  },
});

export const recordKeywordGap = internalMutation({
  args: {
    runId: v.id("intelRuns"),
    userId: v.string(),
    brandId: brandIdValidator,
    keyword: v.string(),
    status: v.union(v.literal("present"), v.literal("absent"), v.literal("unproven")),
    signal: v.union(v.literal("answer-engine"), v.literal("search"), v.literal("derived")),
    // Convex ids are strings; the pure lib carries them unbranded.
    sourceFindingIds: v.array(v.string()),
    sourcePageUrls: v.array(v.string()),
    sourceSuggestionIds: v.array(v.string()),
    fromPlan: v.boolean(),
    evidence: v.array(v.string()),
    searchedAt: v.optional(v.number()),
  },
  returns: v.id("keywordGaps"),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== args.userId || run.brandId !== args.brandId) {
      throw new Error("Intel run not found");
    }
    if (run.status !== "running") throw new Error("Intel run is not running");
    await requireBrandAccess(ctx, args.userId, args.brandId);
    // One row per (user, brand, keyword): a re-run refreshes the verdict
    // instead of stacking duplicate rows.
    const existing = await ctx.db
      .query("keywordGaps")
      .withIndex("by_user_brand_and_keyword", (q) =>
        q.eq("userId", args.userId).eq("brandId", args.brandId).eq("keyword", args.keyword)
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        runId: args.runId,
        status: args.status,
        signal: args.signal,
        sourceFindingIds: args.sourceFindingIds,
        sourcePageUrls: args.sourcePageUrls,
        sourceSuggestionIds: args.sourceSuggestionIds,
        fromPlan: args.fromPlan,
        evidence: args.evidence,
        ...(args.searchedAt !== undefined ? { searchedAt: args.searchedAt } : {}),
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("keywordGaps", {
      userId: args.userId,
      brandId: args.brandId,
      runId: args.runId,
      keyword: args.keyword,
      status: args.status,
      signal: args.signal,
      sourceFindingIds: args.sourceFindingIds,
      sourcePageUrls: args.sourcePageUrls,
      sourceSuggestionIds: args.sourceSuggestionIds,
      fromPlan: args.fromPlan,
      evidence: args.evidence,
      ...(args.searchedAt !== undefined ? { searchedAt: args.searchedAt } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listKeywordGaps = query({
  args: { brandId: brandIdValidator },
  returns: v.array(aeoKeywordGapValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await ctx.db
      .query("keywordGaps")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", args.brandId))
      .order("desc")
      .collect();
  },
});

function keywordAdapterContext(): ProviderAdapterContext {
  // No request-scoped approval flow reaches an action; the runtime gate is the
  // explicit server env decision, matching the discovery batch.
  return {
    env: process.env,
    liveProviderValidationApproved: process.env.AEO_KEYWORD_RESEARCH_LIVE_APPROVED === "approved",
  };
}

/** Derived-row recording for one candidate, resolved against the real findings. */
function derivedRecordingFor(candidate: KeywordCandidate, findings: CitationFinding[]): {
  status: KeywordPresence;
  signal: "answer-engine" | "derived";
  sourceFindingIds: string[];
  evidence: string[];
} {
  const matched = findings.filter((finding) => {
    const a = candidate.keyword.toLowerCase();
    const b = finding.summary.toLowerCase();
    return b.includes(a) || a.includes(b);
  });
  const status = keywordCitationStatus(candidate.keyword, findings);
  return {
    status,
    // Only a real answer-engine observation earns the answer-engine signal;
    // an unobserved candidate's "unproven" is a derived, non-evidence state.
    signal: matched.length > 0 ? "answer-engine" : "derived",
    sourceFindingIds: matched.map((finding) => finding._id),
    evidence: matched.map((finding) => finding.summary),
  };
}

/**
 * The user-triggered, budget-admitted research run. Gates fail closed with an
 * explicit error the UI can render: disabled, unpinned target, no target,
 * no data to derive from, or a refused budget. The search leg is capped at
 * the configured per-run maximum; every candidate beyond it keeps its
 * derived answer-engine/derived verdict.
 */
export const runKeywordResearch = action({
  args: { brandId: brandIdValidator },
  returns: v.object({ runId: v.id("intelRuns"), candidateCount: v.number(), searchedCount: v.number() }),
  handler: async (
    ctx,
    args
  ): Promise<{ runId: Id<"intelRuns">; candidateCount: number; searchedCount: number }> => {
    if (process.env.AEO_KEYWORD_RESEARCH_ENABLED !== "1") {
      throw new Error("Keyword research is disabled (AEO_KEYWORD_RESEARCH_ENABLED !== \"1\").");
    }
    if (!process.env.FIRECRAWL_API_KEY?.trim()) {
      throw new Error("Firecrawl is not configured in server secret scope.");
    }
    const target = await ctx.runQuery(api.aeoIntel.getTarget, { brandId: args.brandId });
    if (!target) {
      throw new Error("No connected target for this brand — connect a target first.");
    }
    // The review pin is the human gate, matching the crawl and discovery paths.
    if (target.reviewPinned !== true) {
      throw new Error("Pin the target review first — keyword research only reads pinned targets.");
    }

    const limits = keywordRunLimits(process.env);
    await ctx.runMutation(internal.keywordResearch.reapStaleRuns, { staleMs: limits.staleRunMs });
    if (await ctx.runQuery(internal.keywordResearch.hasRunningRun, { brandId: args.brandId, userId: target.userId })) {
      throw new Error("A keyword research run is already in progress for this brand.");
    }

    const input = await ctx.runQuery(internal.keywordResearch.researchInput, {
      userId: target.userId,
      brandId: args.brandId,
    });
    if (!input) throw new Error("Brand target not found");

    const candidates = deriveKeywordCandidates(
      {
        pages: input.pages,
        findings: input.findings.map((finding) => ({ _id: finding._id, summary: finding.summary })),
        suggestions: input.suggestions,
        planKeywords: input.planKeywords,
      },
      limits.maxCandidates
    );
    const plan = planKeywordResearchRun({ candidateCount: candidates.length, limits });
    if (!plan.ok) {
      throw new Error(
        plan.reason === "no-candidates"
          ? "No candidate keywords could be derived from real data — run a crawl or an intel cycle first."
          : `Planned keyword research cost ${plan.estimatedCostCents} cents exceeds the run ceiling of ${plan.ceilingCents} cents; lower AEO_KEYWORD_MAX_SEARCH_QUERIES or raise AEO_KEYWORD_RUN_CEILING_CENTS.`
      );
    }

    const runId = await ctx.runMutation(internal.keywordResearch.startRun, {
      userId: target.userId,
      brandId: args.brandId,
      candidateCount: plan.candidateCount,
      estimatedCostCents: plan.estimatedCostCents,
      costCeilingCents: plan.ceilingCents,
    });

    const findingRows: CitationFinding[] = input.findings;
    const sourceIdsOfKind = (candidate: KeywordCandidate, kind: "question" | "competitor-topic"): string[] =>
      candidate.sources.flatMap((source) => {
        if (kind === "question" && source.kind === "question") return [source.findingId];
        if (kind === "competitor-topic" && source.kind === "competitor-topic") return [source.suggestionId];
        return [];
      });

    let failed = false;
    let failureReason = "";
    const searched = keywordSearchOrder(candidates).slice(0, plan.searchQueryCount);
    const searchedKeywords = new Set(searched.map((candidate) => candidate.keyword.toLowerCase()));

    try {
      for (const candidate of candidates) {
        const questionIds = sourceIdsOfKind(candidate, "question");
        const suggestionIds = sourceIdsOfKind(candidate, "competitor-topic");
        const pageUrls = candidate.sources
          .filter((source): source is Extract<typeof source, { kind: "crawl-page" }> => source.kind === "crawl-page")
          .map((source) => source.pageUrl);
        const derived = derivedRecordingFor(candidate, findingRows);

        if (searchedKeywords.has(candidate.keyword.toLowerCase())) {
          let search;
          try {
            search = await firecrawlSearch(keywordAdapterContext(), { query: candidate.keyword });
          } catch (error) {
            search = {
              ok: false as const,
              reason: `Firecrawl transport failed: ${error instanceof Error ? error.message : "unknown"}.`,
            };
          }
          if (!search.ok) {
            failed = true;
            failureReason = search.reason ?? "Firecrawl search failed.";
            break;
          }
          const status = keywordSearchPresence(candidate.keyword, search.results ?? [], input.siteUrl);
          await ctx.runMutation(internal.keywordResearch.recordKeywordGap, {
            runId,
            userId: target.userId,
            brandId: args.brandId,
            keyword: candidate.keyword,
            status,
            signal: "search",
            sourceFindingIds: questionIds,
            sourcePageUrls: pageUrls,
            sourceSuggestionIds: suggestionIds,
            fromPlan: candidate.origin === "plan",
            evidence: [
              ...derived.evidence,
              `Search results for "${candidate.keyword}": ${search.results?.length ?? 0} returned.`,
            ],
            searchedAt: Date.now(),
          });
        } else {
          await ctx.runMutation(internal.keywordResearch.recordKeywordGap, {
            runId,
            userId: target.userId,
            brandId: args.brandId,
            keyword: candidate.keyword,
            status: derived.status,
            signal: derived.signal,
            sourceFindingIds: questionIds,
            sourcePageUrls: pageUrls,
            sourceSuggestionIds: suggestionIds,
            fromPlan: candidate.origin === "plan",
            evidence: derived.evidence,
          });
        }
      }
    } finally {
      await ctx.runMutation(internal.keywordResearch.finishRun, {
        runId,
        userId: target.userId,
        brandId: args.brandId,
        status: failed ? "failed" : "complete",
      });
    }

    if (failed) throw new Error(failureReason);
    return { runId, candidateCount: plan.candidateCount, searchedCount: plan.searchQueryCount };
  },
});

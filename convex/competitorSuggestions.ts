import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { audit, brandIdValidator, requireBrandAccess, requireUserId } from "./campaignAccess";
import { aeoCompetitorSuggestionValidator, aeoReviewStateValidator } from "./aeoTables";
import {
  answerEngineCredential,
  askAnswerEngine,
  brandNameFor,
  competitorNameFromUrl,
  competitorNamesFromUrls,
} from "../lib/answerEngine";
import {
  buildDiscoveryQueries,
  discoveryEvidenceLabel,
  discoveryRunLimits,
  parseDiscoveryAnswer,
  planDiscoveryRun,
} from "../lib/competitorDiscovery";
import { firecrawlSearch, type ProviderAdapterContext } from "../lib/providerAdapters";

/**
 * Suggested-competitor discovery + review queue (A5).
 *
 * The discovery pass (cron-registered internal action) runs Firecrawl search
 * and gateway questions for each connected target and proposes reviewable
 * `competitorSuggestions` rows. It never writes into `brandTargets`: only the
 * public `reviewSuggestion` mutation does that, on an explicit human accept.
 * Rejections are remembered, so a rejected name is never re-proposed.
 */

/** Candidate hosts the pass must not propose: the target itself and tracked competitors. */
function isOwnOrTracked(host: string, targetSiteUrl: string, competitorUrls: string[]): boolean {
  const targetHost = competitorNameFromUrl(targetSiteUrl);
  return host === targetHost || competitorNamesFromUrls(competitorUrls).includes(host);
}

export const allTargets = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("brandTargets"),
      userId: v.string(),
      brandId: brandIdValidator,
      siteUrl: v.string(),
      productIdentifiers: v.array(v.string()),
      competitorUrls: v.array(v.string()),
    })
  ),
  handler: async (ctx) => {
    const targets = await ctx.db.query("brandTargets").collect();
    // The review pin is the human gate: an unpinned target is never read, so
    // discovery never proposes competitors for it.
    return targets
      .filter((target) => target.reviewPinned === true)
      .map((target) => ({
        _id: target._id,
        userId: target.userId,
        brandId: target.brandId,
        siteUrl: target.siteUrl,
        productIdentifiers: target.productIdentifiers,
        competitorUrls: target.competitorUrls,
      }));
  },
});

export const hasRunningDiscoveryRun = internalQuery({
  args: { userId: v.string(), brandId: brandIdValidator },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("intelRuns")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", args.userId).eq("brandId", args.brandId))
      .collect();
    return runs.some((run) => run.kind === "competitor-discovery" && run.status === "running");
  },
});

export const startDiscoveryRun = internalMutation({
  args: {
    targetId: v.id("brandTargets"),
    userId: v.string(),
    brandId: brandIdValidator,
    queryCount: v.number(),
    estimatedCostCents: v.number(),
    costCeilingCents: v.number(),
  },
  returns: v.id("intelRuns"),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.targetId);
    if (!target || target.userId !== args.userId || target.brandId !== args.brandId) {
      throw new Error("Brand target not found");
    }
    await requireBrandAccess(ctx, args.userId, args.brandId);
    const runId = await ctx.db.insert("intelRuns", {
      userId: args.userId,
      brandId: args.brandId,
      kind: "competitor-discovery",
      status: "running",
      costCeilingCents: args.costCeilingCents,
      questionCount: args.queryCount,
      startedAt: Date.now(),
    });
    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      action: "aeo.discovery_run_started",
      summary: `Competitor discovery started — ${args.queryCount} query/queries, estimate ${args.estimatedCostCents} cents.`,
      metadata: {
        runId: String(runId),
        targetId: String(args.targetId),
        queryCount: args.queryCount,
        estimatedCostCents: args.estimatedCostCents,
      },
    });
    return runId;
  },
});

/**
 * Propose one candidate. The dedupe rule: a host already tracked in
 * `brandTargets.competitorUrls` or equal to the target's own site is never
 * proposed; an `accepted` or `rejected` suggestion is never re-proposed; a
 * `suggested` one gains the new evidence instead of a duplicate row.
 */
export const proposeSuggestion = internalMutation({
  args: {
    runId: v.id("intelRuns"),
    userId: v.string(),
    brandId: brandIdValidator,
    name: v.string(),
    url: v.string(),
    evidence: v.string(),
    phrasing: v.string(),
  },
  returns: v.union(v.id("competitorSuggestions"), v.null()),
  handler: async (ctx, args) => {
    const target = await ctx.db
      .query("brandTargets")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", args.userId).eq("brandId", args.brandId))
      .first();
    if (!target) throw new Error("Brand target not found");
    const host = competitorNameFromUrl(args.url);
    if (isOwnOrTracked(host, target.siteUrl, target.competitorUrls)) return null;

    const existing = await ctx.db
      .query("competitorSuggestions")
      .withIndex("by_user_brand_and_name", (q) =>
        q.eq("userId", args.userId).eq("brandId", args.brandId).eq("name", host)
      )
      .first();
    if (existing && existing.status !== "suggested") {
      // Accepted = already tracked; rejected = the human declined it. Either
      // way the discovery pass stays silent about this host.
      return null;
    }
    const now = Date.now();
    if (existing) {
      const evidence = existing.evidence.includes(args.evidence)
        ? existing.evidence
        : [...existing.evidence, args.evidence];
      const phrasings = existing.phrasings.includes(args.phrasing)
        ? existing.phrasings
        : [...existing.phrasings, args.phrasing];
      await ctx.db.patch(existing._id, {
        frequency: evidence.length,
        evidence,
        phrasings,
        runId: args.runId,
        updatedAt: now,
      });
      return existing._id;
    }
    const suggestionId = await ctx.db.insert("competitorSuggestions", {
      userId: args.userId,
      brandId: args.brandId,
      runId: args.runId,
      name: host,
      url: args.url,
      status: "suggested",
      frequency: 1,
      phrasings: [args.phrasing],
      evidence: [args.evidence],
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      action: "aeo.suggestion_proposed",
      summary: `Discovered a suggested competitor — ${host}.`,
      metadata: { runId: String(args.runId), suggestionId: String(suggestionId), name: host },
    });
    return suggestionId;
  },
});

export const finishDiscoveryRun = internalMutation({
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
      action: "aeo.discovery_run_finished",
      summary: `Competitor discovery finished as ${args.status}.`,
      metadata: { runId: String(args.runId), status: args.status },
    });
    return null;
  },
});

export type DiscoveryBatchOutcome = {
  started: number;
  completed: number;
  failed: number;
  proposed: number;
  skipped: Array<{ brandId: string; reason: string }>;
  reason?: string;
};

function discoveryAdapterContext(): ProviderAdapterContext {
  // The cron has no request-scoped approval flow; the runtime approval gate is
  // an explicit server env decision, matching the ZERNIO/BUFFER live flags.
  return {
    env: process.env,
    liveProviderValidationApproved: process.env.AEO_DISCOVERY_LIVE_APPROVED === "approved",
  };
}

/**
 * Cron target (registered in convex/crons.ts). Every gate fails closed with
 * an explicit outcome — disabled, missing credentials, over budget — never a
 * silent skip and never unbounded re-search: the query set is capped at the
 * configured maximum and each search at the Firecrawl per-run result ceiling.
 */
export const runDiscoveryBatch = internalAction({
  args: {},
  returns: v.object({
    started: v.number(),
    completed: v.number(),
    failed: v.number(),
    proposed: v.number(),
    skipped: v.array(v.object({ brandId: v.string(), reason: v.string() })),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<DiscoveryBatchOutcome> => {
    if (process.env.AEO_DISCOVERY_ENABLED !== "1") {
      return {
        started: 0,
        completed: 0,
        failed: 0,
        proposed: 0,
        skipped: [],
        reason: "competitor-discovery-disabled",
      };
    }
    if (!process.env.FIRECRAWL_API_KEY?.trim()) {
      return {
        started: 0,
        completed: 0,
        failed: 0,
        proposed: 0,
        skipped: [],
        reason: "credentials-not-configured:firecrawl",
      };
    }
    if (!answerEngineCredential(process.env)) {
      return {
        started: 0,
        completed: 0,
        failed: 0,
        proposed: 0,
        skipped: [],
        reason: "credentials-not-configured:gateway",
      };
    }
    const limits = discoveryRunLimits(process.env);
    const adapterContext = discoveryAdapterContext();
    const targets = await ctx.runQuery(internal.competitorSuggestions.allTargets, {});
    const outcome: DiscoveryBatchOutcome = {
      started: 0,
      completed: 0,
      failed: 0,
      proposed: 0,
      skipped: [],
    };

    for (const target of targets) {
      if (
        await ctx.runQuery(internal.competitorSuggestions.hasRunningDiscoveryRun, {
          userId: target.userId,
          brandId: target.brandId,
        })
      ) {
        outcome.skipped.push({ brandId: target.brandId, reason: "run-already-running" });
        continue;
      }
      const queries = buildDiscoveryQueries({
        brandName: brandNameFor(target.brandId),
        productIdentifiers: target.productIdentifiers,
      }).slice(0, limits.maxQueries);
      const plan = planDiscoveryRun({ queryCount: queries.length, limits });
      if (!plan.ok) {
        outcome.skipped.push({ brandId: target.brandId, reason: `budget-refused:${plan.reason}` });
        continue;
      }
      const runId = await ctx.runMutation(internal.competitorSuggestions.startDiscoveryRun, {
        targetId: target._id,
        userId: target.userId,
        brandId: target.brandId,
        queryCount: plan.queryCount,
        estimatedCostCents: plan.estimatedCostCents,
        costCeilingCents: plan.ceilingCents,
      });
      outcome.started += 1;

      let failed = false;
      for (const query of queries) {
        let surfaced: Array<{ url: string; title?: string; description?: string }> = [];
        if (query.channel === "search") {
          // The adapter returns ok:false for provider-reported failures but
          // throws on transport errors; both are the same outcome here — the
          // run fails explicitly instead of crashing the batch.
          let search;
          try {
            search = await firecrawlSearch(adapterContext, { query: query.prompt });
          } catch (error) {
            search = { ok: false as const, reason: `Firecrawl transport failed: ${error instanceof Error ? error.message : "unknown"}.` };
          }
          if (!search.ok) {
            failed = true;
            outcome.failed += 1;
            await ctx.runMutation(internal.competitorSuggestions.finishDiscoveryRun, {
              runId,
              userId: target.userId,
              brandId: target.brandId,
              status: "failed",
            });
            break;
          }
          surfaced = search.results ?? [];
        } else {
          const ask = await askAnswerEngine({ env: process.env }, { question: query.prompt });
          if (!ask.ok) {
            failed = true;
            outcome.failed += 1;
            await ctx.runMutation(internal.competitorSuggestions.finishDiscoveryRun, {
              runId,
              userId: target.userId,
              brandId: target.brandId,
              status: "failed",
            });
            break;
          }
          surfaced = parseDiscoveryAnswer(ask.answer).map((candidate) => ({
            url: candidate.url,
            description: candidate.name,
          }));
        }
        for (const result of surfaced) {
          const suggestionId = await ctx.runMutation(internal.competitorSuggestions.proposeSuggestion, {
            runId,
            userId: target.userId,
            brandId: target.brandId,
            name: competitorNameFromUrl(result.url),
            url: result.url,
            evidence: discoveryEvidenceLabel(query, result),
            phrasing: query.prompt,
          });
          if (suggestionId) outcome.proposed += 1;
        }
      }
      if (!failed) {
        await ctx.runMutation(internal.competitorSuggestions.finishDiscoveryRun, {
          runId,
          userId: target.userId,
          brandId: target.brandId,
          status: "complete",
        });
        outcome.completed += 1;
      }
    }
    return outcome;
  },
});

export const listSuggestions = query({
  args: { brandId: brandIdValidator },
  returns: v.array(aeoCompetitorSuggestionValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await ctx.db
      .query("competitorSuggestions")
      .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", args.brandId))
      .order("desc")
      .collect();
  },
});

/** The review queue's only write path into brandTargets: an explicit accept. */
export const reviewSuggestion = mutation({
  args: {
    brandId: brandIdValidator,
    suggestionId: v.string(),
    reviewStatus: aeoReviewStateValidator,
    reviewNotes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    const normalized = ctx.db.normalizeId("competitorSuggestions", args.suggestionId);
    if (!normalized) throw new Error("Competitor suggestion not found");
    const suggestion = await ctx.db.get(normalized);
    if (!suggestion || suggestion.userId !== userId || suggestion.brandId !== args.brandId) {
      throw new Error("Competitor suggestion not found");
    }

    await ctx.db.patch(suggestion._id, {
      status:
        args.reviewStatus === "accepted"
          ? "accepted"
          : args.reviewStatus === "rejected"
            ? "rejected"
            : suggestion.status,
      reviewNotes: args.reviewNotes,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (args.reviewStatus === "accepted") {
      // Accepting is the one write into tracking: the URL joins
      // brandTargets.competitorUrls, so subsequent crawls and answer-engine
      // runs include it. Flagging never changes tracking.
      const target = await ctx.db
        .query("brandTargets")
        .withIndex("by_user_and_brand", (q) => q.eq("userId", userId).eq("brandId", args.brandId))
        .first();
      if (!target) throw new Error("Brand target not found");
      const host = competitorNameFromUrl(suggestion.url);
      const alreadyTracked = competitorNamesFromUrls(target.competitorUrls).includes(host);
      const competitorUrls = alreadyTracked
        ? target.competitorUrls
        : [...target.competitorUrls, suggestion.url];
      await ctx.db.patch(target._id, { competitorUrls, updatedAt: Date.now() });
    }

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: `aeo.suggestion_${args.reviewStatus}`,
      summary:
        args.reviewStatus === "accepted"
          ? `Accepted the suggested competitor ${suggestion.name}; it joins the brand's competitor tracking.`
          : args.reviewStatus === "rejected"
            ? `Rejected the suggested competitor ${suggestion.name}; discovery will not re-propose it.`
            : `Flagged the suggested competitor ${suggestion.name}.`,
      metadata: { suggestionId: String(suggestion._id), reviewStatus: args.reviewStatus },
    });
    return null;
  },
});

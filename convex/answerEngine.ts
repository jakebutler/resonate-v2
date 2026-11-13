"use node";

import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { audit, brandIdValidator, requireBrandAccess } from "./campaignAccess";
import {
  analyzeAnswerCitation,
  answerEngineCredential,
  answerEngineRunLimits,
  brandNameFor,
  buildAnswerEngineQuestions,
  askAnswerEngine,
  competitorNamesFromUrls,
  planAnswerEngineRun,
  truncateAnswerExcerpt,
} from "../lib/answerEngine";

/**
 * Answer-engine visibility runs (A3): a cron-driven batch asks each connected
 * brand target's question set through the Cortex/Pioneer gateway and records
 * reviewable `intelFindings` rows (citation status + extractability) under a
 * per-run cost ceiling.
 *
 * The cron has no user identity, so run lifecycle happens in internal
 * mutations that take the target owner's userId explicitly. The ownership
 * envelope is preserved: every mutation verifies the target/run is owned by
 * that userId, re-checks `requireBrandAccess`, and writes an audit event.
 * Reviewing findings stays in the public `aeoIntel.reviewIntelFinding`
 * mutation, where identity is enforced.
 */

/** Every connected target is due each cycle; a brand with a run still in
 * "running" state is skipped so a crashed cycle is never overlapped. */
export const allTargets = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("brandTargets"),
      _creationTime: v.number(),
      userId: v.string(),
      brandId: brandIdValidator,
      productIdentifiers: v.array(v.string()),
      competitorUrls: v.array(v.string()),
    })
  ),
  handler: async (ctx) => {
    const targets = await ctx.db.query("brandTargets").collect();
    return targets.map((target) => ({
      _id: target._id,
      _creationTime: target._creationTime,
      userId: target.userId,
      brandId: target.brandId,
      productIdentifiers: target.productIdentifiers,
      competitorUrls: target.competitorUrls,
    }));
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
    return runs.some((run) => run.kind === "answer-engine" && run.status === "running");
  },
});

export const startRun = internalMutation({
  args: {
    targetId: v.id("brandTargets"),
    userId: v.string(),
    brandId: brandIdValidator,
    questionCount: v.number(),
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
      kind: "answer-engine",
      status: "running",
      costCeilingCents: args.costCeilingCents,
      questionCount: args.questionCount,
      startedAt: Date.now(),
    });
    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      action: "aeo.answer_engine_run_started",
      summary: `Answer-engine run started — ${args.questionCount} question(s), estimate ${args.estimatedCostCents} cents.`,
      metadata: {
        runId: String(runId),
        targetId: String(args.targetId),
        questionCount: args.questionCount,
        estimatedCostCents: args.estimatedCostCents,
      },
    });
    return runId;
  },
});

export const recordFinding = internalMutation({
  args: {
    runId: v.id("intelRuns"),
    userId: v.string(),
    brandId: brandIdValidator,
    question: v.string(),
    classification: v.union(v.literal("gap"), v.literal("opportunity")),
    citationStatus: v.union(v.literal("cited"), v.literal("uncited"), v.literal("not-observed")),
    extractability: v.number(),
    evidence: v.array(v.string()),
  },
  returns: v.id("intelFindings"),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.userId !== args.userId || run.brandId !== args.brandId) {
      throw new Error("Intel run not found");
    }
    if (run.status !== "running") throw new Error("Intel run is not running");
    await requireBrandAccess(ctx, args.userId, args.brandId);
    const findingId = await ctx.db.insert("intelFindings", {
      userId: args.userId,
      brandId: args.brandId,
      runId: run._id,
      classification: args.classification,
      citationStatus: args.citationStatus,
      extractability: args.extractability,
      summary: args.question,
      // Evidence is the question plus a bounded answer excerpt; raw provider
      // responses are never stored whole.
      evidence: [...args.evidence.slice(0, 1), truncateAnswerExcerpt(args.evidence[1] ?? "")].filter(Boolean),
      reviewStatus: "unreviewed",
      createdAt: Date.now(),
    });
    await audit(ctx, {
      userId: args.userId,
      brandId: args.brandId,
      action: "aeo.answer_engine_finding_recorded",
      summary: `Recorded a ${args.classification} finding (${args.citationStatus}) in the answer-engine run.`,
      metadata: { runId: String(run._id), findingId: String(findingId) },
    });
    return findingId;
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
      action: "aeo.answer_engine_run_finished",
      summary: `Answer-engine run finished as ${args.status}.`,
      metadata: { runId: String(run._id), status: args.status },
    });
    return null;
  },
});

/** Pages of the target's latest complete crawl snapshot, for extractability scoring. */
export const latestTargetPages = internalQuery({
  args: { targetId: v.id("brandTargets") },
  returns: v.array(
    v.object({
      title: v.optional(v.string()),
      headings: v.array(v.string()),
      description: v.optional(v.string()),
      contentSample: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const crawls = await ctx.db
      .query("siteCrawls")
      .withIndex("by_target_and_version", (q) => q.eq("targetId", args.targetId))
      .collect();
    const latest = crawls
      .filter((crawl) => crawl.status === "complete")
      .sort((a, b) => b.version - a.version)[0];
    if (!latest) return [];
    const pages = await ctx.db
      .query("crawlPages")
      .withIndex("by_crawl", (q) => q.eq("crawlId", latest._id))
      .collect();
    return pages.map((page) => ({
      title: page.title,
      headings: page.headings,
      description: page.description,
      contentSample: page.contentSample,
    }));
  },
});

export type AnswerEngineBatchOutcome = {
  started: number;
  completed: number;
  failed: number;
  skipped: Array<{ brandId: string; reason: string }>;
  reason?: string;
};

/**
 * Cron target (registered in convex/crons.ts). The kill switch and the
 * credential gate fail closed with explicit outcomes, never a silent skip.
 */
export const runAnswerEngineBatch = internalAction({
  args: {},
  returns: v.object({
    started: v.number(),
    completed: v.number(),
    failed: v.number(),
    skipped: v.array(v.object({ brandId: v.string(), reason: v.string() })),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<AnswerEngineBatchOutcome> => {
    if (process.env.AEO_ANSWER_ENGINE_ENABLED !== "1") {
      return {
        started: 0,
        completed: 0,
        failed: 0,
        skipped: [],
        reason: "answer-engine-runs-disabled",
      };
    }
    if (!answerEngineCredential(process.env)) {
      return {
        started: 0,
        completed: 0,
        failed: 0,
        skipped: [],
        reason: "credentials-not-configured",
      };
    }
    const limits = answerEngineRunLimits(process.env);
    const targets = await ctx.runQuery(internal.answerEngine.allTargets, {});
    const outcome: AnswerEngineBatchOutcome = { started: 0, completed: 0, failed: 0, skipped: [] };

    for (const target of targets) {
      if (await ctx.runQuery(internal.answerEngine.hasRunningRun, { userId: target.userId, brandId: target.brandId })) {
        outcome.skipped.push({ brandId: target.brandId, reason: "run-already-running" });
        continue;
      }
      const questions = buildAnswerEngineQuestions({
        brandName: brandNameFor(target.brandId),
        productIdentifiers: target.productIdentifiers,
        competitorUrls: target.competitorUrls,
      }).slice(0, limits.maxQuestions);
      const plan = planAnswerEngineRun({ questionCount: questions.length, limits });
      if (!plan.ok) {
        outcome.skipped.push({ brandId: target.brandId, reason: `budget-refused:${plan.reason}` });
        continue;
      }
      const targetPages = await ctx.runQuery(internal.answerEngine.latestTargetPages, {
        targetId: target._id,
      });
      const runId = await ctx.runMutation(internal.answerEngine.startRun, {
        targetId: target._id,
        userId: target.userId,
        brandId: target.brandId,
        questionCount: plan.questionCount,
        estimatedCostCents: plan.estimatedCostCents,
        costCeilingCents: plan.ceilingCents,
      });
      outcome.started += 1;

      const competitorNames = competitorNamesFromUrls(target.competitorUrls);
      let failed = false;
      for (const question of questions) {
        const ask = await askAnswerEngine({ env: process.env }, { question: question.question });
        if (!ask.ok) {
          failed = true;
          outcome.failed += 1;
          await ctx.runMutation(internal.answerEngine.finishRun, {
            runId,
            userId: target.userId,
            brandId: target.brandId,
            status: "failed",
          });
          break;
        }
        const analysis = analyzeAnswerCitation({
          answer: ask.answer,
          question: question.question,
          brandName: brandNameFor(target.brandId),
          productIdentifiers: target.productIdentifiers,
          competitorNames,
          targetPages,
        });
        await ctx.runMutation(internal.answerEngine.recordFinding, {
          runId,
          userId: target.userId,
          brandId: target.brandId,
          question: question.question,
          classification: analysis.classification,
          citationStatus: analysis.citationStatus,
          extractability: analysis.extractability,
          evidence: [
            `question: ${question.question}`,
            `answer: ${ask.answer}`,
          ],
        });
      }
      if (!failed) {
        await ctx.runMutation(internal.answerEngine.finishRun, {
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

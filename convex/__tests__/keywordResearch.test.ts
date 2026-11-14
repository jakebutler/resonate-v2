import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { BrandId } from "../campaignAccess";

// Offline fixture harness for the keyword-research module: run admission and
// recording at the data layer, honest listing, and access enforcement. The
// Firecrawl-backed action itself is exercised through lib fixtures; nothing
// here touches the network.
const modules = import.meta.glob("../**/*.ts");

async function fixture(userId: string, brands: BrandId[]) {
  const t = convexTest(schema, modules);
  await t.run((ctx) => {
    for (const brandId of brands) {
      ctx.db.insert("v2BrandMemberships", {
        userId,
        brandId,
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });
  return { t, user: t.withIdentity({ subject: userId }) };
}

async function connectFixtureTarget(
  user: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  brandId: BrandId = "freshproof"
) {
  await user.mutation(api.aeoIntel.connectTarget, {
    brandId,
    siteUrl: "https://www.freshproof.example",
    productIdentifiers: ["FreshProof band"],
    competitorUrls: ["https://competitor.example"],
  });
  await user.mutation(api.aeoIntel.pinTargetReview, { brandId, pinned: true });
}

describe("listKeywordGaps access envelope", () => {
  it("rejects unauthenticated calls before any brand logic runs", async () => {
    const { t } = await fixture("owner", ["freshproof"]);
    await expect(
      t.query(api.keywordResearch.listKeywordGaps, { brandId: "freshproof" })
    ).rejects.toThrow(/Unauthorized/);
  });

  it("rejects cross-brand access the caller holds no membership for", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    await expect(
      user.query(api.keywordResearch.listKeywordGaps, { brandId: "corvo" })
    ).rejects.toThrow(/Brand access denied/);
  });
});

describe("keyword-gap recording and honest listing", () => {
  it("lists recorded gaps newest-first with their stored verdicts", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectFixtureTarget(user);
    const targetId = await t.run(async (ctx) => {
      const target = await ctx.db
        .query("brandTargets")
        .withIndex("by_user_and_brand", (q) => q.eq("userId", "owner").eq("brandId", "freshproof"))
        .first();
      return target!._id;
    });
    const runId = await t.run((ctx) =>
      ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "keyword-research",
        // Gaps are recorded mid-run; the run closes in finishRun.
        status: "running",
        costCeilingCents: 50,
        questionCount: 0,
        startedAt: 1,
      })
    );

    await t.mutation(internal.keywordResearch.recordKeywordGap, {
      runId,
      userId: "owner",
      brandId: "freshproof",
      keyword: "claim validation tooling",
      status: "absent",
      signal: "search",
      sourceFindingIds: [],
      sourcePageUrls: ["https://www.freshproof.example/pricing"],
      sourceSuggestionIds: [],
      fromPlan: false,
      evidence: ["Search results for \u201cclaim validation tooling\u201d: 3 returned."],
      searchedAt: 100,
    });
    await t.mutation(internal.keywordResearch.recordKeywordGap, {
      runId,
      userId: "owner",
      brandId: "freshproof",
      keyword: "How claim validation works",
      status: "present",
      signal: "answer-engine",
      sourceFindingIds: ["finding-does-not-exist-here"],
      sourcePageUrls: [],
      sourceSuggestionIds: [],
      fromPlan: false,
      evidence: [],
    });

    const gaps = await user.query(api.keywordResearch.listKeywordGaps, { brandId: "freshproof" });
    expect(gaps.map((gap) => gap.keyword)).toEqual([
      "How claim validation works",
      "claim validation tooling",
    ]);
    expect(gaps[0].status).toBe("present");
    expect(gaps[1].status).toBe("absent");
    expect(gaps[1].sourcePageUrls).toEqual(["https://www.freshproof.example/pricing"]);
    expect(gaps[1].searchedAt).toBe(100);
    expect(targetId).toBeDefined();
  });

  it("refreshes the verdict in place instead of stacking rows on re-record", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectFixtureTarget(user);
    const runId = await t.run((ctx) =>
      ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "keyword-research",
        status: "running",
        costCeilingCents: 50,
        questionCount: 0,
        startedAt: 1,
      })
    );
    const record = (status: "absent" | "unproven") =>
      t.mutation(internal.keywordResearch.recordKeywordGap, {
        runId,
        userId: "owner",
        brandId: "freshproof",
        keyword: "Claim Validation Tooling",
        status,
        signal: "search",
        sourceFindingIds: [],
        sourcePageUrls: [],
        sourceSuggestionIds: [],
        fromPlan: false,
        evidence: [],
      });
    const first = await record("absent");
    const second = await record("unproven");
    // Same row refreshed, not a second row.
    expect(second).toBe(first);
    const gaps = await user.query(api.keywordResearch.listKeywordGaps, { brandId: "freshproof" });
    expect(gaps).toHaveLength(1);
    expect(gaps[0].keyword).toBe("Claim Validation Tooling");
    expect(gaps[0].status).toBe("unproven");
  });
});

describe("run lifecycle and stale-run recovery", () => {
  it("admits exactly one running run per brand and finishes it", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectFixtureTarget(user);

    const runId = await t.mutation(internal.keywordResearch.startRun, {
      userId: "owner",
      brandId: "freshproof",
      candidateCount: 3,
      estimatedCostCents: 6,
      costCeilingCents: 50,
    });
    expect(
      await user.query(internal.keywordResearch.hasRunningRun, {
        brandId: "freshproof",
        userId: "owner",
      })
    ).toBe(true);

    await t.mutation(internal.keywordResearch.finishRun, {
      runId,
      userId: "owner",
      brandId: "freshproof",
      status: "complete",
    });
    expect(
      await user.query(internal.keywordResearch.hasRunningRun, {
        brandId: "freshproof",
        userId: "owner",
      })
    ).toBe(false);
    const runs = await t.run((ctx) =>
      ctx.db
        .query("intelRuns")
        .withIndex("by_user_and_brand", (q) => q.eq("userId", "owner").eq("brandId", "freshproof"))
        .collect()
    );
    expect(runs.map((run) => run.kind)).toContain("keyword-research");
    expect(runs.every((run) => run.status !== "running")).toBe(true);
  });

  it("reaps only stale running runs, marking them failed", async () => {
    const { t } = await fixture("owner", ["freshproof"]);
    const stale = await t.run((ctx) =>
      ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "keyword-research",
        status: "running",
        costCeilingCents: 50,
        questionCount: 0,
        startedAt: Date.now() - 60 * 60 * 1000, // one hour ago
      })
    );
    const fresh = await t.run((ctx) =>
      ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "keyword-research",
        status: "running",
        costCeilingCents: 50,
        questionCount: 0,
        startedAt: Date.now(),
      })
    );

    await t.mutation(internal.keywordResearch.reapStaleRuns, { staleMs: 30 * 60 * 1000 });

    const states = await t.run(async (ctx) => ({
      stale: await ctx.db.get(stale),
      fresh: await ctx.db.get(fresh),
    }));
    expect(states.stale?.status).toBe("failed");
    expect(states.fresh?.status).toBe("running");
  });
});

describe("researchInput assembly", () => {
  it("returns null when the brand has no connected target", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const input = await user.query(internal.keywordResearch.researchInput, {
      userId: "owner",
      brandId: "freshproof",
    });
    expect(input).toBeNull();
  });

  it("assembles pages, findings, suggestions, and plan keywords from real rows", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectFixtureTarget(user);

    const runId = await t.run((ctx) =>
      ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "answer-engine",
        status: "complete",
        costCeilingCents: 50,
        questionCount: 1,
        startedAt: 1,
      })
    );
    await t.run(async (ctx) => {
      const target = await ctx.db
        .query("brandTargets")
        .withIndex("by_user_and_brand", (q) => q.eq("userId", "owner").eq("brandId", "freshproof"))
        .first();
      const crawlId = await ctx.db.insert("siteCrawls", {
        userId: "owner",
        brandId: "freshproof",
        targetId: target!._id,
        siteUrl: "https://www.freshproof.example",
        version: 1,
        status: "complete",
        pageCount: 1,
        createdAt: 1,
      });
      await ctx.db.insert("crawlPages", {
        userId: "owner",
        brandId: "freshproof",
        crawlId,
        url: "https://www.freshproof.example/pricing",
        title: "FreshProof claim validation pricing",
        headings: ["How claim validation works"],
        schemaTypes: [],
        createdAt: 1,
      });
      await ctx.db.insert("intelFindings", {
        userId: "owner",
        brandId: "freshproof",
        runId,
        classification: "gap",
        citationStatus: "uncited",
        extractability: 50,
        summary: "Is FreshProof cheaper than manual review?",
        evidence: [],
        reviewStatus: "unreviewed",
        createdAt: 1,
      });
      await ctx.db.insert("competitorSuggestions", {
        userId: "owner",
        brandId: "freshproof",
        runId,
        name: "competitor.example",
        url: "https://competitor.example",
        status: "suggested",
        frequency: 1,
        phrasings: ["Manual review alternatives"],
        evidence: ["search: \u201cmanual review alternatives\u201d"],
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("strategyPlans", {
        userId: "owner",
        brandId: "freshproof",
        version: 1,
        status: "draft",
        plan: {
          gaps: [],
          opportunities: [],
          targetKeywords: ["claim validation tooling"],
          targetQuestions: [],
          brief: {
            goal: "Grow citations",
            audience: "Marketers",
            thesis: "Evidence first",
            window: "2026 Q4",
            channels: ["blog"],
            cta: "Join",
            metric: "Citation share",
            constraints: [],
          },
        },
        createdAt: 1,
      });
    });

    const input = await user.query(internal.keywordResearch.researchInput, {
      userId: "owner",
      brandId: "freshproof",
    });
    expect(input).not.toBeNull();
    expect(input?.siteUrl).toBe("https://www.freshproof.example");
    expect(input?.reviewPinned).toBe(true);
    expect(input?.pages).toEqual([
      {
        url: "https://www.freshproof.example/pricing",
        title: "FreshProof claim validation pricing",
        headings: ["How claim validation works"],
      },
    ]);
    expect(input?.findings.map((finding) => finding.summary)).toEqual([
      "Is FreshProof cheaper than manual review?",
    ]);
    expect(input?.suggestions.map((suggestion) => suggestion.phrasings)).toEqual([
      ["Manual review alternatives"],
    ]);
    expect(input?.planKeywords).toEqual(["claim validation tooling"]);
  });
});

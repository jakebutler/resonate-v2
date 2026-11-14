import { describe, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import type { BrandId } from "../campaignAccess";

const modules = import.meta.glob("../**/*.ts");

/** Seeds memberships for one identity and returns an identity-bound handle. */
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

function samplePlan() {
  return {
    gaps: [
      {
        title: "No comparison content",
        description: "Answer engines surface no FreshProof vs alternative pages.",
        priority: 1,
        sourceFindingIds: [],
      },
    ],
    opportunities: [],
    targetKeywords: ["protein powder review"],
    targetQuestions: ["which protein powders are third-party tested?"],
    brief: {
      goal: "Grow AEO citations for FreshProof",
      audience: "Sleep-deprived new parents",
      thesis: "Third-party evidence beats marketing claims",
      window: "2026 Q4",
      channels: ["blog", "linkedin"],
      cta: "Join the waitlist",
      metric: "Citation share in answer engines",
      constraints: ["No unverifiable health claims"],
    },
  };
}

async function connectFixtureTarget(
  user: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  brandId: BrandId = "freshproof"
) {
  return await user.mutation(api.aeoIntel.connectTarget, {
    brandId,
    siteUrl: "https://www.freshproof.example",
    productIdentifiers: ["FreshProof band"],
    competitorUrls: ["https://competitor.example"],
  });
}

describe("aeo data model access envelope", () => {
  it("rejects unauthenticated calls before any brand logic runs", async () => {
    const { t } = await fixture("owner", ["freshproof"]);
    await expect(
      t.query(api.aeoIntel.getTarget, { brandId: "freshproof" })
    ).rejects.toThrow(/Unauthorized/);
  });

  it("rejects cross-brand access the caller holds no membership for", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    await expect(
      user.mutation(api.aeoIntel.connectTarget, {
        brandId: "corvo",
        siteUrl: "https://corvo.example",
        productIdentifiers: [],
        competitorUrls: [],
      })
    ).rejects.toThrow(/Brand access denied/);
  });

  it("refuses to store http or private-host target URLs", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    await expect(
      user.mutation(api.aeoIntel.connectTarget, {
        brandId: "freshproof",
        siteUrl: "http://freshproof.example",
        productIdentifiers: [],
        competitorUrls: [],
      })
    ).rejects.toThrow(/Only https URLs are supported/);
    await expect(
      user.mutation(api.aeoIntel.connectTarget, {
        brandId: "freshproof",
        siteUrl: "https://192.168.1.10/",
        productIdentifiers: [],
        competitorUrls: [],
      })
    ).rejects.toThrow(/not allowed for this connection/);
    await expect(
      user.mutation(api.aeoIntel.connectTarget, {
        brandId: "freshproof",
        siteUrl: "https://freshproof.example",
        productIdentifiers: [],
        competitorUrls: ["https://127.0.0.1/"],
      })
    ).rejects.toThrow(/not allowed for this connection/);
    await expect(
      user.mutation(api.aeoIntel.connectTarget, {
        brandId: "freshproof",
        siteUrl: "https://localhost:3000/",
        productIdentifiers: [],
        competitorUrls: [],
      })
    ).rejects.toThrow(/not allowed for this connection/);
  });

  it("still connects a public https target after validation", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    const targetId = await user.mutation(api.aeoIntel.connectTarget, {
      brandId: "freshproof",
      siteUrl: "https://www.freshproof.example",
      productIdentifiers: [],
      competitorUrls: ["https://competitor.example"],
    });
    expect(targetId).toBeDefined();
  });

  it("refuses records owned by another user even on a shared brand shape", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectFixtureTarget(user);
    const stranger = t.withIdentity({ subject: "someone-else" });
    await t.run((ctx) => {
      ctx.db.insert("v2BrandMemberships", {
        userId: "someone-else",
        brandId: "freshproof",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    await expect(
      stranger.mutation(api.aeoIntel.recordCrawlSnapshot, {
        brandId: "freshproof",
        targetId,
        siteUrl: "https://www.freshproof.example",
        version: 1,
        status: "complete",
        pages: [],
      })
    ).rejects.toThrow(/Brand target not found/);
  });

  it("enforces the same envelope on queries", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectFixtureTarget(user);
    const outsider = t.withIdentity({ subject: "no-membership" });
    await expect(
      outsider.query(api.aeoIntel.getTarget, { brandId: "freshproof" })
    ).rejects.toThrow(/Brand access denied/);
  });
});

describe("aeo audit trail", () => {
  it("writes an audit event for every mutation", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectFixtureTarget(user);
    await user.mutation(api.aeoIntel.recordCrawlSnapshot, {
      brandId: "freshproof",
      targetId,
      siteUrl: "https://www.freshproof.example",
      version: 1,
      status: "complete",
      pages: [
        {
          url: "https://www.freshproof.example/",
          headings: ["Evidence-first protein"],
          schemaTypes: ["Product"],
        },
      ],
    });
    const runId = await user.mutation(api.aeoIntel.createIntelRun, {
      brandId: "freshproof",
      kind: "competitor-intel",
      questionCount: 2,
    });
    const findingId = await user.mutation(api.aeoIntel.addIntelFinding, {
      brandId: "freshproof",
      runId,
      classification: "gap",
      citationStatus: "uncited",
      extractability: 20,
      summary: "FreshProof is not cited for third-party testing questions.",
      evidence: ["answer-engine transcript"],
    });
    await user.mutation(api.aeoIntel.reviewIntelFinding, {
      brandId: "freshproof",
      findingId,
      reviewStatus: "accepted",
      reviewNotes: "Confirmed against the transcript.",
    });
    await user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "draft",
      plan: samplePlan(),
    });
    await user.mutation(api.aeoIntel.completeIntelRun, {
      brandId: "freshproof",
      runId,
      status: "complete",
    });

    const actions = (await t.run((ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    )).map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "aeo.target_connect",
        "aeo.crawl_snapshot",
        "aeo.intel_run_created",
        "aeo.finding_recorded",
        "aeo.finding_review",
        "aeo.strategy_plan_saved",
        "aeo.intel_run_completed",
      ])
    );
    const targetActions = actions.filter((action) => action.startsWith("aeo."));
    expect(targetActions).toHaveLength(7);
  });

  it("updates the connected target in place with its own audit event", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectFixtureTarget(user);
    await connectFixtureTarget(user);
    const targets = await t.run((ctx) => ctx.db.query("brandTargets").collect());
    expect(targets).toHaveLength(1);
    const actions = (await t.run((ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    )).map((event) => event.action);
    expect(actions).toEqual(
      expect.arrayContaining(["aeo.target_connect", "aeo.target_update"])
    );
  });
});

describe("aeo crawl snapshot immutability", () => {
  it("refuses a second write to an existing snapshot version", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectFixtureTarget(user);
    await user.mutation(api.aeoIntel.recordCrawlSnapshot, {
      brandId: "freshproof",
      targetId,
      siteUrl: "https://www.freshproof.example",
      version: 1,
      status: "complete",
      pages: [],
    });
    await expect(
      user.mutation(api.aeoIntel.recordCrawlSnapshot, {
        brandId: "freshproof",
        targetId,
        siteUrl: "https://www.freshproof.example",
        version: 1,
        status: "complete",
        pages: [{ url: "https://www.freshproof.example/rewritten", headings: [], schemaTypes: [] }],
      })
    ).rejects.toThrow(/already exists/);
  });

  it("appends new versions and keeps every snapshot intact", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectFixtureTarget(user);
    for (const version of [1, 2, 3]) {
      await user.mutation(api.aeoIntel.recordCrawlSnapshot, {
        brandId: "freshproof",
        targetId,
        siteUrl: "https://www.freshproof.example",
        version,
        status: "complete",
        pages: [
          {
            url: `https://www.freshproof.example/?v=${version}`,
            headings: ["Home"],
            schemaTypes: ["WebSite"],
          },
        ],
      });
    }
    const crawls = await user.query(api.aeoIntel.listCrawls, { brandId: "freshproof" });
    expect(crawls.map((crawl) => crawl.version)).toEqual([3, 2, 1]);
    expect(crawls.every((crawl) => crawl.pageCount === 1)).toBe(true);
    const pages = await user.query(api.aeoIntel.listCrawlPages, {
      brandId: "freshproof",
      crawlId: crawls[0]._id,
    });
    expect(pages).toHaveLength(1);
    expect(pages[0].url).toContain("v=3");
  });

  it("refuses a snapshot write pairing a target with a different brand", async () => {
    const { user } = await fixture("owner", ["freshproof", "lower-db"]);
    const targetId = await connectFixtureTarget(user);
    await expect(
      user.mutation(api.aeoIntel.recordCrawlSnapshot, {
        brandId: "lower-db",
        targetId,
        siteUrl: "https://www.freshproof.example",
        version: 1,
        status: "complete",
        pages: [],
      })
    ).rejects.toThrow(/Brand target not found/);
  });
});

describe("aeo intel run and finding lifecycle", () => {
  it("keeps findings reviewable and scoped to their run", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const runId = await user.mutation(api.aeoIntel.createIntelRun, {
      brandId: "freshproof",
      kind: "competitor-intel",
      questionCount: 1,
    });
    const findingId = await user.mutation(api.aeoIntel.addIntelFinding, {
      brandId: "freshproof",
      runId,
      classification: "opportunity",
      citationStatus: "cited",
      extractability: 80,
      summary: "Comparison pages earn citations.",
      evidence: [],
    });
    await user.mutation(api.aeoIntel.reviewIntelFinding, {
      brandId: "freshproof",
      findingId,
      reviewStatus: "accepted",
    });
    const { run, findings } = await user.query(api.aeoIntel.getRun, {
      brandId: "freshproof",
      runId,
    });
    expect(run.status).toBe("running");
    expect(findings).toHaveLength(1);
    expect(findings[0].reviewStatus).toBe("accepted");
    const otherRun = await user.mutation(api.aeoIntel.createIntelRun, {
      brandId: "freshproof",
      kind: "competitor-intel",
      questionCount: 1,
    });
    const other = await user.query(api.aeoIntel.getRun, {
      brandId: "freshproof",
      runId: otherRun,
    });
    expect(other.findings).toHaveLength(0);
    expect((await t.run((ctx) => ctx.db.get(findingId)))!.runId).not.toBe(otherRun);
  });
});

describe("aeo strategy plans", () => {
  it("appends plan versions and returns the latest", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    await user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "draft",
      plan: samplePlan(),
    });
    const revised = {
      ...samplePlan(),
      targetKeywords: ["third-party tested protein"],
    };
    await user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "reviewed",
      plan: revised,
    });
    const latest = await user.query(api.aeoIntel.getLatestStrategyPlan, {
      brandId: "freshproof",
    });
    expect(latest?.version).toBe(2);
    expect(latest?.status).toBe("reviewed");
    expect(latest?.plan.targetKeywords).toEqual(["third-party tested protein"]);
  });

  it("keeps plan versions scoped per brand", async () => {
    const { user } = await fixture("owner", ["freshproof", "lower-db"]);
    await user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "draft",
      plan: samplePlan(),
    });
    const lowerDb = await user.query(api.aeoIntel.getLatestStrategyPlan, {
      brandId: "lower-db",
    });
    expect(lowerDb).toBeNull();
  });
});

describe("aeo strategy plan version race", () => {
  it("refuses a concurrent save against a superseded version and lets the winner append cleanly", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "draft",
      plan: samplePlan(),
    });
    const latest = await user.query(api.aeoIntel.getLatestStrategyPlan, {
      brandId: "freshproof",
    });
    expect(latest?.version).toBe(1);

    // Two concurrent saves both read version 1 and both send it as their
    // expected version — the clobber window the guard exists for.
    const winner = user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "reviewed",
      expectedVersion: 1,
      plan: { ...samplePlan(), targetKeywords: ["winner keywords"] },
    });
    const loser = user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "draft",
      expectedVersion: 1,
      plan: { ...samplePlan(), targetKeywords: ["loser keywords"] },
    });

    await winner; // exactly one wins
    await expect(loser).rejects.toThrow(/Strategy plan changed since it was loaded/);

    const current = await user.query(api.aeoIntel.getLatestStrategyPlan, {
      brandId: "freshproof",
    });
    expect(current?.version).toBe(2);
    expect(current?.plan.targetKeywords).toEqual(["winner keywords"]);
    // The refused save appended nothing: two rows total, not three.
    const planRows = await t.run((ctx) => ctx.db.query("strategyPlans").collect());
    expect(planRows).toHaveLength(2);
  });

  it("accepts a save whose expected version matches and refuses one against a deleted plan", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    await user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "draft",
      expectedVersion: 0,
      plan: samplePlan(),
    });
    const matching = await user.mutation(api.aeoIntel.saveStrategyPlan, {
      brandId: "freshproof",
      status: "reviewed",
      expectedVersion: 1,
      plan: samplePlan(),
    });
    expect(matching).toBeDefined();
    await expect(
      user.mutation(api.aeoIntel.saveStrategyPlan, {
        brandId: "freshproof",
        status: "draft",
        expectedVersion: 1,
        plan: samplePlan(),
      })
    ).rejects.toThrow(/current version 2, expected 1/);
  });
});

describe("aeo intel run admission gating", () => {
  it("refuses manual creation of batch-admitted run kinds", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    // A client-created "running" answer-engine run would make every
    // scheduled cycle skip the brand until someone finished it — the same
    // for a running discovery run against the discovery batch.
    await expect(
      user.mutation(api.aeoIntel.createIntelRun, {
        brandId: "freshproof",
        kind: "answer-engine",
        questionCount: 2,
      })
    ).rejects.toThrow(/admitted internally/);
    await expect(
      user.mutation(api.aeoIntel.createIntelRun, {
        brandId: "freshproof",
        kind: "competitor-discovery",
        questionCount: 2,
      })
    ).rejects.toThrow(/admitted internally/);
    const runs = await user.query(api.aeoIntel.listRuns, { brandId: "freshproof" });
    expect(runs).toHaveLength(0);
    void t;
  });

  it("accepts no client-supplied cost ceiling — the ceiling is server-derived", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    vi.stubEnv("AEO_ANSWER_ENGINE_RUN_CEILING_CENTS", "42");
    const runId = await user.mutation(api.aeoIntel.createIntelRun, {
      brandId: "freshproof",
      kind: "competitor-intel",
      questionCount: 1,
    });
    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run).toMatchObject({ costCeilingCents: 42, status: "running" });
    vi.unstubAllEnvs();
  });
});

describe("aeo finding extractability bound", () => {
  it("refuses manual findings whose extractability is not an integer 0–100", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    const runId = await user.mutation(api.aeoIntel.createIntelRun, {
      brandId: "freshproof",
      kind: "competitor-intel",
      questionCount: 1,
    });
    for (const bad of [-1, 101, 0.5]) {
      await expect(
        user.mutation(api.aeoIntel.addIntelFinding, {
          brandId: "freshproof",
          runId,
          classification: "gap",
          citationStatus: "uncited",
          extractability: bad,
          summary: "Out of range",
          evidence: [],
        })
      ).rejects.toThrow(/integer from 0 to 100/);
    }
  });

  it("accepts a bounded manual finding and stamps it manual", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    const runId = await user.mutation(api.aeoIntel.createIntelRun, {
      brandId: "freshproof",
      kind: "competitor-intel",
      questionCount: 1,
    });
    const findingId = await user.mutation(api.aeoIntel.addIntelFinding, {
      brandId: "freshproof",
      runId,
      classification: "needs-review",
      citationStatus: "cited",
      extractability: 55,
      summary: "Manually recorded finding",
      evidence: ["hand-entered"],
    });
    const { findings } = await user.query(api.aeoIntel.getRun, {
      brandId: "freshproof",
      runId,
    });
    expect(findings[0]).toMatchObject({
      _id: findingId,
      classification: "needs-review",
      extractability: 55,
      source: "manual",
    });
  });
});

describe("aeo provenance source discriminator", () => {
  it("stamps manually recorded crawl snapshots manual", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectFixtureTarget(user);
    await user.mutation(api.aeoIntel.recordCrawlSnapshot, {
      brandId: "freshproof",
      targetId,
      siteUrl: "https://www.freshproof.example",
      version: 1,
      status: "complete",
      pages: [],
    });
    const crawls = await user.query(api.aeoIntel.listCrawls, { brandId: "freshproof" });
    expect(crawls).toHaveLength(1);
    expect(crawls[0].source).toBe("manual");
  });

  it("stamps the in-app crawl capture runner via the internal write path", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectFixtureTarget(user);
    await t.mutation(internal.aeoIntel.recordRunnerCrawlSnapshot, {
      userId: "owner",
      brandId: "freshproof",
      targetId,
      siteUrl: "https://www.freshproof.example",
      version: 1,
      status: "complete",
      pages: [
        { url: "https://www.freshproof.example/", headings: [], schemaTypes: [] },
      ],
    });
    const crawls = await user.query(api.aeoIntel.listCrawls, { brandId: "freshproof" });
    expect(crawls).toHaveLength(1);
    expect(crawls[0].source).toBe("runner");
  });

  it("refuses a runner snapshot write pairing a target with a different owner", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectFixtureTarget(user);
    await expect(
      t.mutation(internal.aeoIntel.recordRunnerCrawlSnapshot, {
        userId: "someone-else",
        brandId: "freshproof",
        targetId,
        siteUrl: "https://www.freshproof.example",
        version: 1,
        status: "complete",
        pages: [],
      })
    ).rejects.toThrow(/Brand target not found/);
  });
});

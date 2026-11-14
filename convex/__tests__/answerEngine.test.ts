import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

async function connectTarget(
  user: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  overrides: Partial<{ brandId: BrandId; siteUrl: string; productIdentifiers: string[]; competitorUrls: string[] }> = {}
) {
  const brandId = overrides.brandId ?? "freshproof";
  const targetId = await user.mutation(api.aeoIntel.connectTarget, {
    brandId,
    siteUrl: overrides.siteUrl ?? "https://www.freshproof.example",
    productIdentifiers: overrides.productIdentifiers ?? ["FreshProof band"],
    competitorUrls: overrides.competitorUrls ?? ["https://competitor.example"],
  });
  // The intel cycles only act on pinned targets; tests exercise the pinned path.
  await user.mutation(api.aeoIntel.pinTargetReview, { brandId, pinned: true });
  return targetId;
}

function gatewayAnswer(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }), {
    status: 200,
  });
}

/** Brand-phrased questions mention FreshProof; competitor ones do not. */
function answerFor(question: string): Response {
  if (question.includes("alternatives")) {
    return gatewayAnswer("I would recommend competitor.example for that.");
  }
  if (question.startsWith("Would you recommend")) {
    return gatewayAnswer("No. competitor.example is the stronger option.");
  }
  return gatewayAnswer("FreshProof validates claims with third-party evidence.");
}

/** Stubs the gateway fetch boundary with question-aware answers. */
function mockGateway(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.mocked(fetch) as ReturnType<typeof vi.fn>;
  fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return answerFor(body.messages.at(-1).content);
  });
  return fetchMock;
}

async function enabledEnv() {
  vi.stubEnv("AEO_ANSWER_ENGINE_ENABLED", "1");
  vi.stubEnv("CORTEX_API_KEY", "test-cortex-key");
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("answer-engine run lifecycle", () => {
  it("refuses to run while the batch is disabled, with an explicit outcome", async () => {
    const { t } = await fixture("owner", ["freshproof"]);
    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome).toMatchObject({ started: 0, reason: "answer-engine-runs-disabled" });
  });

  it("refuses to run without gateway credentials and never fetches", async () => {
    const { t } = await fixture("owner", ["freshproof"]);
    await connectTarget(t.withIdentity({ subject: "owner" }));
    vi.stubEnv("AEO_ANSWER_ENGINE_ENABLED", "1");
    // Hermetic: CI exports placeholder gateway credentials for other suites; the
    // no-credential path must not depend on their ambient absence.
    vi.stubEnv("CORTEX_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.mocked(fetch);
    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome).toMatchObject({ started: 0, reason: "credentials-not-configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never reads a connected target whose review is not pinned", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await user.mutation(api.aeoIntel.pinTargetReview, { brandId: "freshproof", pinned: false });

    const unpinned = await t.query(internal.answerEngine.allTargets, {});
    expect(unpinned).toHaveLength(0);

    await user.mutation(api.aeoIntel.pinTargetReview, { brandId: "freshproof", pinned: true });
    const pinned = await t.query(internal.answerEngine.allTargets, {});
    expect(pinned).toHaveLength(1);
  });

  it("runs the question set, records reviewable findings, and completes the run", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    const fetchMock = mockGateway();

    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome).toMatchObject({ started: 1, completed: 1, failed: 0 });
    // Default depth (12): 2 brand + 1 identifier + 1 competitor + 8 depth
    // phrasings, one gateway call per question.
    expect(fetchMock).toHaveBeenCalledTimes(12);

    const stored = await t.run(async (ctx) => {
      const runs = await ctx.db.query("intelRuns").collect();
      const rows = await ctx.db.query("intelFindings").collect();
      return { runs, rows };
    });
    expect(stored.runs).toHaveLength(1);
    expect(stored.runs[0]).toMatchObject({
      brandId: "freshproof",
      kind: "answer-engine",
      status: "complete",
      userId: "owner",
    });
    expect(stored.runs[0].finishedAt).toBeDefined();
    expect(stored.rows).toHaveLength(12);
    // Brand-phrased answers cite the brand; the recommendation answer names
    // only the competitor; the two alternatives-phrasings name the competitor
    // too. Without a crawl snapshot every cited row's brand match is unknown.
    const citationStatuses = stored.rows.map((row) => row.citationStatus).sort();
    expect(citationStatuses).toEqual([
      ...Array(9).fill("cited"),
      ...Array(3).fill("uncited"),
    ]);
    for (const row of stored.rows.filter((row) => row.citationStatus === "cited")) {
      expect(row.brandMatch).toBe("unknown");
    }
    const classifications = new Set(stored.rows.map((row) => row.classification));
    expect(classifications).toEqual(new Set(["gap", "opportunity"]));
    for (const row of stored.rows) {
      expect(row.reviewStatus).toBe("unreviewed");
      expect(row.evidence.length).toBeGreaterThan(0);
    }
  });

  it("fetches once per question through the gateway fetch boundary", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user, { competitorUrls: [] });
    await enabledEnv();
    const fetchMock = mockGateway();

    await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    // 2 brand questions + 1 identifier question + 8 depth questions = 11
    // gateway calls, no network beyond the mocked fetch boundary.
    expect(fetchMock).toHaveBeenCalledTimes(11);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/chat/completions");
  });

  it("scores extractability against the target's latest crawl snapshot", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    await user.mutation(api.aeoIntel.recordCrawlSnapshot, {
      brandId: "freshproof",
      targetId,
      siteUrl: "https://www.freshproof.example",
      version: 1,
      status: "complete",
      pages: [
        {
          url: "https://www.freshproof.example/",
          title: "FreshProof claim validation",
          headings: ["evidence review"],
          schemaTypes: [],
          contentSample: "FreshProof band validates claims with third-party evidence.",
        },
      ],
    });
    await enabledEnv();
    mockGateway();

    await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    const stored = await t.run(async (ctx) => ctx.db.query("intelFindings").collect());
    const cited = stored.filter((row) => row.citationStatus === "cited");
    expect(cited.length).toBeGreaterThan(0);
    for (const row of cited) {
      // Stored scale: an integer 0–100.
      expect(Number.isInteger(row.extractability)).toBe(true);
      expect(row.extractability).toBeGreaterThanOrEqual(0);
      expect(row.extractability).toBeLessThanOrEqual(100);
      expect(row.extractability).toBeGreaterThan(0);
      // Runner-written rows are stamped by the write path.
      expect(row.source).toBe("runner");
    }
  });

  it("finishes a run as failed with an explicit outcome when the gateway errors", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("transport down"));

    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome).toMatchObject({ started: 1, completed: 0, failed: 1 });
    const stored = await t.run(async (ctx) => ctx.db.query("intelRuns").collect());
    expect(stored[0]).toMatchObject({ status: "failed" });
    expect(stored[0].finishedAt).toBeDefined();
  });

  it("refuses a second running run inside the admitting mutation itself", async () => {
    // The batch's hasRunningRun pre-check is advisory: two concurrent
    // triggers can both pass it. The admission must re-check in the same
    // mutation that inserts the run, or concurrent triggers double-spend the
    // per-run ceiling.
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    const runId = await t.run((ctx) =>
      ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "answer-engine",
        status: "running",
        costCeilingCents: 50,
        questionCount: 2,
        startedAt: 1,
      })
    );

    // Simulated concurrency: a trigger whose pre-check ran before the row
    // above existed still arrives at the admission mutation.
    const refused = await t.mutation(internal.answerEngine.startRun, {
      targetId,
      userId: "owner",
      brandId: "freshproof",
      questionCount: 2,
      estimatedCostCents: 4,
      costCeilingCents: 50,
    });
    expect(refused).toBeNull();

    const runs = await t.run(async (ctx) => ctx.db.query("intelRuns").collect());
    expect(runs).toHaveLength(1);
    expect(String(runs[0]._id)).toBe(String(runId));
  });

  it("admits a run once the previous one is no longer running", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    await t.run((ctx) =>
      ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "answer-engine",
        status: "failed",
        costCeilingCents: 50,
        questionCount: 2,
        startedAt: 1,
      })
    );

    const runId = await t.mutation(internal.answerEngine.startRun, {
      targetId,
      userId: "owner",
      brandId: "freshproof",
      questionCount: 2,
      estimatedCostCents: 4,
      costCeilingCents: 50,
    });
    expect(runId).not.toBeNull();
  });

  it("skips a brand at the batch level when admission loses the race", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    mockGateway();
    await t.run((ctx) =>
      ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "answer-engine",
        status: "running",
        costCeilingCents: 50,
        questionCount: 2,
        startedAt: 1,
      })
    );

    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome).toMatchObject({ started: 0, completed: 0 });
    expect(outcome.skipped).toEqual([
      { brandId: "freshproof", reason: "run-already-running" },
    ]);
  });
});

describe("answer-engine budget refusal", () => {
  it("refuses a run whose estimate exceeds the per-run ceiling and creates no rows", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user, { competitorUrls: ["https://c1.example", "https://c2.example", "https://c3.example", "https://c4.example", "https://c5.example"] });
    await enabledEnv();
    vi.stubEnv("AEO_ANSWER_ENGINE_RUN_CEILING_CENTS", "3");
    vi.stubEnv("AEO_ANSWER_ENGINE_COST_PER_QUESTION_CENTS", "2");

    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome.started).toBe(0);
    expect(outcome.skipped[0].brandId).toBe("freshproof");
    expect(outcome.skipped[0].reason).toMatch(/^budget-refused:budget-exceeded/);
    expect(outcome.skipped[0].reason).toContain("estimate");
    const stored = await t.run(async (ctx) => ({
      runs: await ctx.db.query("intelRuns").collect(),
      findings: await ctx.db.query("intelFindings").collect(),
    }));
    expect(stored.runs).toHaveLength(0);
    expect(stored.findings).toHaveLength(0);
  });

  it("caps the question set at the configured maximum", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user, { competitorUrls: ["https://c1.example", "https://c2.example", "https://c3.example", "https://c4.example", "https://c5.example"] });
    await enabledEnv();
    vi.stubEnv("AEO_ANSWER_ENGINE_MAX_QUESTIONS", "3");
    const fetchMock = mockGateway();

    await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails a deep run closed with a numbered refusal when the ceiling cannot fit the depth", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user, { competitorUrls: [], productIdentifiers: [] });
    await enabledEnv();
    // 10 questions x 5¢ = 50¢ against a 20¢ ceiling.
    vi.stubEnv("AEO_ANSWER_ENGINE_MAX_QUESTIONS", "20");
    vi.stubEnv("AEO_ANSWER_ENGINE_RUN_CEILING_CENTS", "20");
    vi.stubEnv("AEO_ANSWER_ENGINE_COST_PER_QUESTION_CENTS", "5");

    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome.started).toBe(0);
    expect(outcome.skipped[0].reason).toBe("budget-refused:budget-exceeded (estimate 50¢ > ceiling 20¢)");
    const stored = await t.run(async (ctx) => ({
      runs: await ctx.db.query("intelRuns").collect(),
      findings: await ctx.db.query("intelFindings").collect(),
    }));
    expect(stored.runs).toHaveLength(0);
    expect(stored.findings).toHaveLength(0);
  });
});

describe("answer-engine brand-mismatch detection", () => {
  const designProofingPages = [
    {
      url: "https://www.freshproof.example/",
      title: "FreshProof online proofing",
      headings: ["design review", "feedback management"],
      schemaTypes: [],
      description: "Real-time collaboration for creative teams and design review.",
      contentSample: "Streamline your design review process with proofing and collaboration tools.",
    },
  ];

  it("records a suspect classification and flags the run when a cited answer describes a different product", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user, { competitorUrls: [], productIdentifiers: [] });
    await user.mutation(api.aeoIntel.recordCrawlSnapshot, {
      brandId: "freshproof",
      targetId,
      siteUrl: "https://www.freshproof.example",
      version: 1,
      status: "complete",
      pages: designProofingPages,
    });
    await enabledEnv();
    // The 2026-11-14 live-proof case: the "What is FreshProof" answer describes
    // a blockchain/supply-chain homonym; every other answer matches the crawl.
    const fetchMock = vi.mocked(fetch) as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const question: string = body.messages.at(-1).content;
      const answer = question.startsWith("What is FreshProof")
        ? "FreshProof is a blockchain-based platform designed for supply chain traceability " +
          "and authenticity verification. It helps businesses track and verify the origin of " +
          "their products using tamper-proof blockchain records."
        : "FreshProof is an online proofing tool that streamlines design review with " +
          "real-time feedback and collaboration for creative teams.";
      return gatewayAnswer(answer);
    });

    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome).toMatchObject({ started: 1, completed: 1, failed: 0 });

    const stored = await t.run(async (ctx) => ({
      runs: await ctx.db.query("intelRuns").collect(),
      rows: await ctx.db.query("intelFindings").collect(),
      events: await ctx.db.query("v2AuditEvents").collect(),
    }));
    const homonym = stored.rows.find((row) => row.summary.startsWith("What is FreshProof"));
    expect(homonym).toBeDefined();
    expect(homonym).toMatchObject({ citationStatus: "cited", brandMatch: "suspect" });
    expect(homonym?.brandMatchDetail).toContain("different product");
    // A suspect citation is never an unflagged opportunity: the finding row
    // carries the explicit needs-review classification downstream consumers
    // (gaps list, strategy plan) render.
    expect(homonym?.classification).toBe("needs-review");
    // Matching answers still cite cleanly (and classify as opportunities).
    for (const row of stored.rows.filter((row) => !row.summary.startsWith("What is FreshProof"))) {
      expect(row.citationStatus).toBe("cited");
      expect(row.brandMatch).toBe("match");
      expect(row.classification).toBe("opportunity");
    }
    // The run record itself carries the mismatch classification.
    expect(stored.runs[0]).toMatchObject({ status: "complete", brandMismatchCount: 1 });
    const finished = stored.events.find(
      (event) => (event as { action?: string }).action === "aeo.answer_engine_run_finished"
    ) as { summary?: string } | undefined;
    expect(finished?.summary).toContain("brand mismatch");
  });
});

describe("answer-engine finding review states", () => {
  it("exposes recorded findings through the shared review-state mutation", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    await enabledEnv();
    mockGateway();
    await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    const stored = await t.run(async (ctx) => ctx.db.query("intelFindings").collect());
    expect(stored).toHaveLength(12);

    // Review through the same public mutation sources/claims use.
    await user.mutation(api.aeoIntel.reviewIntelFinding, {
      brandId: "freshproof",
      findingId: stored[0]._id,
      reviewStatus: "accepted",
      reviewNotes: "Matches the crawl evidence.",
    });
    await user.mutation(api.aeoIntel.reviewIntelFinding, {
      brandId: "freshproof",
      findingId: stored[1]._id,
      reviewStatus: "rejected",
    });
    await user.mutation(api.aeoIntel.reviewIntelFinding, {
      brandId: "freshproof",
      findingId: stored[2]._id,
      reviewStatus: "flagged",
    });
    const after = await t.run(async (ctx) => ctx.db.query("intelFindings").collect());
    const statuses = Object.fromEntries(
      after.map((row) => [String(row._id), { reviewStatus: row.reviewStatus, reviewNotes: row.reviewNotes }])
    );
    expect(statuses[String(stored[0]._id)]).toEqual({
      reviewStatus: "accepted",
      reviewNotes: "Matches the crawl evidence.",
    });
    expect(statuses[String(stored[1]._id)]).toMatchObject({ reviewStatus: "rejected" });
    expect(statuses[String(stored[2]._id)]).toMatchObject({ reviewStatus: "flagged" });
    void targetId;
  });

  it("rejects reviews of findings owned by a different user on the same brand", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    await enabledEnv();
    mockGateway();
    await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    const stored = await t.run(async (ctx) => ctx.db.query("intelFindings").collect());
    void targetId;

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
      stranger.mutation(api.aeoIntel.reviewIntelFinding, {
        brandId: "freshproof",
        findingId: stored[0]._id,
        reviewStatus: "accepted",
      })
    ).rejects.toThrow(/Intel finding not found/);
  });

  it("keeps a brand with an in-flight run out of the next cycle", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    // A crashed cycle leaves the run "running" with no findings.
    await t.run(async (ctx) => {
      await ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "answer-engine",
        status: "running",
        costCeilingCents: 50,
        questionCount: 4,
        startedAt: 1,
      });
    });
    void targetId;
    await enabledEnv();

    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome.started).toBe(0);
    expect(outcome.skipped[0]).toMatchObject({ brandId: "freshproof", reason: "run-already-running" });
  });
});

describe("answer-engine audit envelope", () => {
  it("writes an audit event for run start, findings, and completion", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    mockGateway();
    await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    const events = await t.run(async (ctx) => ctx.db.query("v2AuditEvents").collect());
    const actions = events.map((event) => (event as { action: string }).action);
    expect(actions).toContain("aeo.answer_engine_run_started");
    expect(actions).toContain("aeo.answer_engine_finding_recorded");
    expect(actions).toContain("aeo.answer_engine_run_finished");
  });
});

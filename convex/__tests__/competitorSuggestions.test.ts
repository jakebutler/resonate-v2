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
  overrides: Partial<{ brandId: BrandId; competitorUrls: string[]; productIdentifiers: string[] }> = {}
) {
  const brandId = overrides.brandId ?? "freshproof";
  const targetId = await user.mutation(api.aeoIntel.connectTarget, {
    brandId,
    siteUrl: "https://www.freshproof.example",
    productIdentifiers: ["FreshProof band"],
    competitorUrls: [],
    ...overrides,
  });
  // Discovery only acts on pinned targets; tests exercise the pinned path.
  await user.mutation(api.aeoIntel.pinTargetReview, { brandId, pinned: true });
  return targetId;
}

async function enabledEnv() {
  vi.stubEnv("AEO_DISCOVERY_ENABLED", "1");
  vi.stubEnv("AEO_DISCOVERY_LIVE_APPROVED", "approved");
  vi.stubEnv("FIRECRAWL_API_KEY", "test-firecrawl-key");
  vi.stubEnv("CORTEX_API_KEY", "test-cortex-key");
}

/** Firecrawl answers both searches with the same two competitors. */
function firecrawlResponse(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      data: [
        { url: "https://rival.example", title: "Rival", description: "A rival product." },
        { url: "https://othercompetitor.example", title: "Other Competitor" },
      ],
    }),
    { status: 200 }
  );
}

/** The gateway answers both questions with the same JSON candidate list. */
function gatewayAnswer(): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: "assistant",
            content:
              '[{"name":"Rival","url":"https://rival.example"},{"name":"Third Option","url":"https://thirdoption.example"}]',
          },
        },
      ],
    }),
    { status: 200 }
  );
}

/** Routes the mocked fetch boundary by endpoint shape. */
function mockProviders(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.mocked(fetch) as ReturnType<typeof vi.fn>;
  fetchMock.mockImplementation((url: unknown) => {
    const target = String(url);
    if (target.includes("/search")) return firecrawlResponse();
    if (target.includes("/v1/chat/completions")) return gatewayAnswer();
    throw new Error(`Unexpected fetch in discovery test: ${target}`);
  });
  return fetchMock;
}

function storedSuggestions(t: Awaited<ReturnType<typeof fixture>>["t"]) {
  return t.run(async (ctx) => ctx.db.query("competitorSuggestions").collect());
}

function storedAuditActions(t: Awaited<ReturnType<typeof fixture>>["t"]) {
  return t.run(async (ctx) =>
    (await ctx.db.query("v2AuditEvents").collect()).map((event) => (event as { action: string }).action)
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("discovery batch gates", () => {
  it("refuses to run while discovery is disabled, with an explicit outcome", async () => {
    const { t } = await fixture("owner", ["freshproof"]);
    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(outcome).toMatchObject({ started: 0, reason: "competitor-discovery-disabled" });
  });

  it("names the missing vendor explicitly and never fetches", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    vi.stubEnv("AEO_DISCOVERY_ENABLED", "1");
    // Hermetic: CI exports placeholder gateway credentials for other suites; the
    // no-credential paths must not depend on their ambient absence.
    vi.stubEnv("CORTEX_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.mocked(fetch);

    const withoutFirecrawl = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(withoutFirecrawl).toMatchObject({ started: 0, reason: "credentials-not-configured:firecrawl" });

    vi.stubEnv("FIRECRAWL_API_KEY", "test-firecrawl-key");
    const withoutGateway = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(withoutGateway).toMatchObject({ started: 0, reason: "credentials-not-configured:gateway" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never reads a connected target whose review is not pinned", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await user.mutation(api.aeoIntel.pinTargetReview, { brandId: "freshproof", pinned: false });

    const unpinned = await t.query(internal.competitorSuggestions.allTargets, {});
    expect(unpinned).toHaveLength(0);

    await user.mutation(api.aeoIntel.pinTargetReview, { brandId: "freshproof", pinned: true });
    const pinned = await t.query(internal.competitorSuggestions.allTargets, {});
    expect(pinned).toHaveLength(1);
  });

  it("refuses a run whose estimate exceeds the per-run ceiling and creates no rows", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    vi.stubEnv("AEO_DISCOVERY_RUN_CEILING_CENTS", "3");
    vi.stubEnv("AEO_DISCOVERY_COST_PER_QUERY_CENTS", "2");

    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(outcome.started).toBe(0);
    expect(outcome.skipped[0]).toMatchObject({
      brandId: "freshproof",
      reason: "budget-refused:budget-exceeded",
    });
    const runs = await t.run(async (ctx) => ctx.db.query("intelRuns").collect());
    expect(runs).toHaveLength(0);
  });

  it("caps the query set at the configured maximum", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    vi.stubEnv("AEO_DISCOVERY_MAX_QUERIES", "2");
    const fetchMock = mockProviders();

    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(outcome).toMatchObject({ started: 1, completed: 1 });
    // 2 queries: one Firecrawl search + one gateway ask.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("discovery proposal lifecycle", () => {
  it("proposes evidence-backed suggestions and completes the run", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    mockProviders();

    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(outcome).toMatchObject({ started: 1, completed: 1, failed: 0 });

    const suggestions = await storedSuggestions(t);
    const byName = Object.fromEntries(suggestions.map((row) => [row.name, row]));
    // rival.example surfaces in both searches and both answers → frequency 4.
    expect(byName["rival.example"]).toMatchObject({
      status: "suggested",
      frequency: 4,
      userId: "owner",
      brandId: "freshproof",
    });
    expect(byName["rival.example"]!.evidence).toHaveLength(4);
    expect(byName["rival.example"]!.phrasings).toHaveLength(4);
    // othercompetitor.example surfaces in the two searches only.
    expect(byName["othercompetitor.example"]).toMatchObject({ frequency: 2 });
    // thirdoption.example surfaces in the two gateway answers only.
    expect(byName["thirdoption.example"]).toMatchObject({ frequency: 2 });
    for (const row of suggestions) {
      expect(row.evidence.length).toBe(row.frequency);
      expect(row.evidence[0]).toContain("→");
    }
    const runs = await t.run(async (ctx) => ctx.db.query("intelRuns").collect());
    expect(runs[0]).toMatchObject({ kind: "competitor-discovery", status: "complete" });
  });

  it("never proposes the brand's own site or already-tracked competitors", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user, {
      siteUrl: "https://rival.example",
      competitorUrls: ["https://thirdoption.example/pricing"],
    });
    await enabledEnv();
    mockProviders();

    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(outcome.completed).toBe(1);
    const suggestions = await storedSuggestions(t);
    expect(suggestions.map((row) => row.name)).toEqual(["othercompetitor.example"]);
  });

  it("a repeat cycle neither duplicates rows nor duplicates identical evidence", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    mockProviders();

    await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    const secondRun = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(secondRun).toMatchObject({ started: 1, completed: 1 });

    const suggestions = await storedSuggestions(t);
    expect(suggestions.filter((row) => row.name === "rival.example")).toHaveLength(1);
    const rival = suggestions.find((row) => row.name === "rival.example");
    // The second cycle saw the same queries and answers, so the evidence is
    // identical — frequency stays at the number of distinct queries that
    // surfaced the candidate, not the number of times it was seen.
    expect(rival!.evidence).toHaveLength(4);
    expect(new Set(rival!.evidence).size).toBe(4);
  });

  it("finishes the run as failed with an explicit outcome when the provider errors", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("transport down"));

    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(outcome).toMatchObject({ started: 1, completed: 0, failed: 1 });
    const runs = await t.run(async (ctx) => ctx.db.query("intelRuns").collect());
    expect(runs[0]).toMatchObject({ status: "failed" });
    expect(runs[0]!.finishedAt).toBeDefined();
  });

  it("keeps a brand with an in-flight discovery run out of the next cycle", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    await t.run(async (ctx) => {
      await ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "competitor-discovery",
        status: "running",
        costCeilingCents: 50,
        questionCount: 4,
        startedAt: Date.now(), // fresh: inside the stale-run window
      });
    });

    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(outcome.started).toBe(0);
    expect(outcome.skipped[0]).toMatchObject({ brandId: "freshproof", reason: "run-already-running" });
  });

  it("recovers a crashed run so the next cycle can start, leaving fresh runs alone", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    mockProviders();
    const staleStartedAt = Date.now() - 31 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "competitor-discovery",
        status: "running",
        costCeilingCents: 50,
        questionCount: 4,
        startedAt: staleStartedAt,
      });
    });

    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    // The stuck run no longer blocks: the batch starts and completes a new one.
    expect(outcome).toMatchObject({ started: 1, completed: 1 });

    const runs = await t.run(async (ctx) =>
      ctx.db.query("intelRuns").collect()
    );
    expect(runs).toHaveLength(2);
    const recovered = runs.find((run) => run.startedAt === staleStartedAt);
    expect(recovered).toMatchObject({ status: "failed" });
    expect(recovered!.finishedAt).toBeDefined();
    const fresh = runs.find((run) => run.startedAt !== staleStartedAt);
    expect(fresh).toMatchObject({ status: "complete" });

    const actions = await storedAuditActions(t);
    expect(actions).toContain("aeo.discovery_run_recovered");
  });

  it("honors the configured stale-run window", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    mockProviders();
    vi.stubEnv("AEO_DISCOVERY_STALE_RUN_MS", "60000");
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    await t.run(async (ctx) => {
      await ctx.db.insert("intelRuns", {
        userId: "owner",
        brandId: "freshproof",
        kind: "competitor-discovery",
        status: "running",
        costCeilingCents: 50,
        questionCount: 4,
        startedAt: twoMinutesAgo,
      });
    });

    const outcome = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(outcome).toMatchObject({ started: 1, completed: 1 });
    const runs = await t.run(async (ctx) => ctx.db.query("intelRuns").collect());
    const stale = runs.find((run) => run.startedAt === twoMinutesAgo);
    expect(stale).toMatchObject({ status: "failed" });
  });

  it("writes an audit event for run start, proposal, and completion", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    await enabledEnv();
    mockProviders();
    await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    const actions = await storedAuditActions(t);
    expect(actions).toContain("aeo.discovery_run_started");
    expect(actions).toContain("aeo.suggestion_proposed");
    expect(actions).toContain("aeo.discovery_run_finished");
  });
});

describe("review queue", () => {
  async function runDiscoveryAndSuggest(t: Awaited<ReturnType<typeof fixture>>["t"]) {
    await enabledEnv();
    mockProviders();
    await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    const suggestions = await storedSuggestions(t);
    return suggestions.find((row) => row.name === "rival.example")!;
  }

  it("lists suggestions for the owning brand through the public query", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    const rival = await runDiscoveryAndSuggest(t);

    const listed = await user.query(api.competitorSuggestions.listSuggestions, {
      brandId: "freshproof",
    });
    expect(listed.map((row) => String(row._id))).toContain(String(rival._id));
  });

  it("accepting writes the URL into brandTargets competitor tracking exactly once", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    const rival = await runDiscoveryAndSuggest(t);

    await user.mutation(api.competitorSuggestions.reviewSuggestion, {
      brandId: "freshproof",
      suggestionId: rival._id,
      reviewStatus: "accepted",
      reviewNotes: "Surfaces in every alternatives answer.",
    });
    const target = await t.run(async (ctx) => ctx.db.get(targetId));
    expect(target!.competitorUrls).toEqual(["https://rival.example"]);
    const suggestions = await storedSuggestions(t);
    expect(suggestions.find((row) => row.name === "rival.example")).toMatchObject({
      status: "accepted",
      reviewNotes: "Surfaces in every alternatives answer.",
    });

    // Accepting twice (host already tracked) must not duplicate the URL.
    await user.mutation(api.competitorSuggestions.reviewSuggestion, {
      brandId: "freshproof",
      suggestionId: rival._id,
      reviewStatus: "accepted",
    });
    const afterReaccept = await t.run(async (ctx) => ctx.db.get(targetId));
    expect(afterReaccept!.competitorUrls).toEqual(["https://rival.example"]);
  });

  it("an accepted competitor enters the next answer-engine run's question set", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    const rival = await runDiscoveryAndSuggest(t);
    await user.mutation(api.competitorSuggestions.reviewSuggestion, {
      brandId: "freshproof",
      suggestionId: rival._id,
      reviewStatus: "accepted",
    });

    vi.stubEnv("AEO_ANSWER_ENGINE_ENABLED", "1");
    const answerEngineFetch = vi.mocked(fetch) as ReturnType<typeof vi.fn>;
    answerEngineFetch.mockClear();
    answerEngineFetch.mockImplementation((_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return Promise.resolve(
        new Response(
          JSON.stringify({ choices: [{ message: { role: "assistant", content: "FreshProof is best." } }] }),
          { status: 200 }
        )
      );
    });
    const outcome = await t.action(internal.answerEngine.runAnswerEngineBatch, {});
    expect(outcome).toMatchObject({ started: 1, completed: 1 });
    const asked = answerEngineFetch.mock.calls.map((call) =>
      JSON.parse(String((call[1] as RequestInit).body)).messages.at(-1).content as string
    );
    expect(asked.some((question) => question.includes("rival.example"))).toBe(true);
  });

  it("rejecting records a reason, leaves tracking untouched, and dedupes re-proposals", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    const rival = await runDiscoveryAndSuggest(t);

    await user.mutation(api.competitorSuggestions.reviewSuggestion, {
      brandId: "freshproof",
      suggestionId: rival._id,
      reviewStatus: "rejected",
      reviewNotes: "Not a competitor — a partner integration.",
    });
    const target = await t.run(async (ctx) => ctx.db.get(targetId));
    expect(target!.competitorUrls).toEqual([]);

    // A later discovery cycle must stay silent about the rejected host.
    const secondRun = await t.action(internal.competitorSuggestions.runDiscoveryBatch, {});
    expect(secondRun.completed).toBe(1);
    const suggestions = await storedSuggestions(t);
    const rivalRows = suggestions.filter((row) => row.name === "rival.example");
    expect(rivalRows).toHaveLength(1);
    expect(rivalRows[0]).toMatchObject({
      status: "rejected",
      reviewNotes: "Not a competitor — a partner integration.",
    });
    expect(rivalRows[0]!.evidence).toHaveLength(4);
  });

  it("flagging review is recorded but never changes tracking", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    const targetId = await connectTarget(user);
    const rival = await runDiscoveryAndSuggest(t);
    await user.mutation(api.competitorSuggestions.reviewSuggestion, {
      brandId: "freshproof",
      suggestionId: rival._id,
      reviewStatus: "flagged",
    });
    const target = await t.run(async (ctx) => ctx.db.get(targetId));
    expect(target!.competitorUrls).toEqual([]);
    const suggestions = await storedSuggestions(t);
    expect(suggestions.find((row) => row.name === "rival.example")!.status).toBe("suggested");
  });

  it("writes an audit event for accept, reject, and flag reviews", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    const rival = await runDiscoveryAndSuggest(t);
    await user.mutation(api.competitorSuggestions.reviewSuggestion, {
      brandId: "freshproof",
      suggestionId: rival._id,
      reviewStatus: "accepted",
    });
    await user.mutation(api.competitorSuggestions.reviewSuggestion, {
      brandId: "freshproof",
      suggestionId: rival._id,
      reviewStatus: "rejected",
      reviewNotes: "Changed my mind.",
    });
    await user.mutation(api.competitorSuggestions.reviewSuggestion, {
      brandId: "freshproof",
      suggestionId: rival._id,
      reviewStatus: "flagged",
    });
    const actions = await storedAuditActions(t);
    expect(actions).toContain("aeo.suggestion_accepted");
    expect(actions).toContain("aeo.suggestion_rejected");
    expect(actions).toContain("aeo.suggestion_flagged");
  });

  it("rejects reviews of a suggestion owned by a different user", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    await connectTarget(user);
    const rival = await runDiscoveryAndSuggest(t);

    await t.run((ctx) => {
      ctx.db.insert("v2BrandMemberships", {
        userId: "someone-else",
        brandId: "freshproof",
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const stranger = t.withIdentity({ subject: "someone-else" });
    await expect(
      stranger.mutation(api.competitorSuggestions.reviewSuggestion, {
        brandId: "freshproof",
        suggestionId: rival._id,
        reviewStatus: "accepted",
      })
    ).rejects.toThrow(/Competitor suggestion not found/);
  });
});

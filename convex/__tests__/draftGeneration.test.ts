import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const JAKE = { subject: "user-jake", name: "Jake" };
const OTHER = { subject: "user-other", name: "Other User" };

function createTestHarness() {
  return convexTest(schema, modules);
}

async function seedBrand(t: ReturnType<typeof convexTest>) {
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("v2Brands", {
      brandId: "corvo",
      name: "Corvo Labs",
      description: "Test brand",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2BrandMemberships", {
      userId: JAKE.subject,
      brandId: "corvo",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2BrandMemberships", {
      userId: OTHER.subject,
      brandId: "corvo",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
  });
}

/**
 * Seeds the full grounding chain the live path reads: a versioned brand
 * corpus with one accepted public-safe excerpt, five member ideas citing it,
 * and an accepted shape with one slot per idea.
 */
async function setupGroundedShape(t: ReturnType<typeof convexTest>) {
  const asUser = t.withIdentity(JAKE);
  const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
    brandId: "corvo",
    title: "Live drafting campaign",
  });

  const now = Date.now();
  const { corpusId, shapeId } = await t.run(async (ctx) => {
    const createdCorpusId = await ctx.db.insert("corpora", {
      brandId: "corvo",
      origin: "upload",
      version: 1,
      status: "active",
      createdAt: now,
    });
    const documentId = await ctx.db.insert("corpusDocuments", {
      corpusId: createdCorpusId,
      name: "field notes",
      kind: "md",
    });
    await ctx.db.insert("corpusExcerpts", {
      corpusId: createdCorpusId,
      documentId,
      seq: 1,
      text: "Grounding beats vibes: every claim ships with a corpus pointer.",
      provenance: "2026 field notes",
      sensitivity: "public-safe",
      reviewState: "accepted",
    });
    // An unaccepted twin excerpt: never quotable, never shipped to a model.
    await ctx.db.insert("corpusExcerpts", {
      corpusId: createdCorpusId,
      documentId,
      seq: 2,
      text: "Unreviewed claim that must not reach a model.",
      provenance: "2026 field notes",
      sensitivity: "public-safe",
      reviewState: "flagged",
    });
    const createdShapeId = await ctx.db.insert("campaignShapes", {
      campaignId: campaignId as never,
      preset: "standard",
      status: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    return { corpusId: String(createdCorpusId), shapeId: String(createdShapeId) };
  });
  // Citations carry the real corpus id — the resolver joins on it.
  const excerptCitation = `corpus://corvo/${corpusId}#excerpt-1`;

  const roles = ["pillar", "hook", "satellite", "satellite", "recap"] as const;
  for (let index = 0; index < roles.length; index += 1) {
    const ideaId = await t.run(async (ctx) => {
      return String(
        await ctx.db.insert("ideas", {
          userId: JAKE.subject,
          text: `Working-set idea ${index + 1} with a complete claim.`,
          status: "idea",
          flavor: "insight",
          excerptCitations: [excerptCitation],
          createdAt: now,
          updatedAt: now,
        })
      );
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("campaignSlots", {
        shapeId: shapeId as never,
        seq: index + 1,
        channel: index === 0 ? "corvo-blog" : "linkedin",
        mediaType: index === 0 ? "article" : "post",
        role: roles[index],
        title: `Slot ${index + 1} title`,
        ideaId: ideaId as never,
      });
    });
  }

  return { asUser, campaignId, excerptCitation };
}

/** Fetch stub echoing a grounded JSON draft whose citation comes from the prompt. */
function stubGroundingGateway() {
  return vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const user = body.messages[1].content as string;
    const citation = user.match(/corpus:\/\/[^\s\]]+/)?.[0] ?? "";
    const callNumber = stubbedGateway.calls.size + 1;
    stubbedGateway.calls.add(callNumber);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: `AI draft ${callNumber}`,
                content: `Opener ${callNumber}: a grounded claim worth making. [${citation}]`,
              }),
            },
          },
        ],
      }),
      { status: 200 }
    );
  });
}

const stubbedGateway = { calls: new Set<number>() };

function stubLiveCredentials() {
  vi.stubEnv("CORTEX_API_KEY", "cortex-test-key");
  vi.stubEnv("OPENAI_API_KEY", "");
}

describe("live draft generation", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedBrand(t);
    stubbedGateway.calls = new Set<number>();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed without a verified gateway credential (D-21, live branch)", async () => {
    vi.stubEnv("CORTEX_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const { asUser, campaignId } = await setupGroundedShape(t);
    await expect(
      asUser.action(api.draftGeneration.generateLiveDraftSet, { campaignId })
    ).rejects.toThrow(/Live generation is not available/);
  });

  it("refuses without an accepted shape", async () => {
    stubLiveCredentials();
    const asUser = t.withIdentity(JAKE);
    const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
      brandId: "corvo",
      title: "No shape yet",
    });
    await expect(
      asUser.action(api.draftGeneration.generateLiveDraftSet, { campaignId })
    ).rejects.toThrow(/Accept a complete shape/);
  });

  it("refuses with a clear message when the budget estimate exceeds the ceiling", async () => {
    stubLiveCredentials();
    vi.stubEnv("CAMPAIGN_DRAFT_RUN_CEILING_CENTS", "1");
    const { asUser, campaignId } = await setupGroundedShape(t);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      asUser.action(api.draftGeneration.generateLiveDraftSet, { campaignId })
    ).rejects.toThrow(/CAMPAIGN_DRAFT_RUN_CEILING_CENTS/);
    // Admission precedes dispatch: a refused run never reaches the gateway.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("composes a live set where drafts render, citations link, and the cohesion gate fires", async () => {
    stubLiveCredentials();
    vi.stubGlobal("fetch", stubGroundingGateway());
    const { asUser, campaignId, excerptCitation } = await setupGroundedShape(t);

    const result = await asUser.action(api.draftGeneration.generateLiveDraftSet, {
      campaignId,
    });
    expect(result.draftCount).toBe(5);

    const view = await asUser.query(api.draftSet.getDraftSet, { campaignId });
    expect(view?.materialization?.mode).toBe("live");
    expect(view?.materialization?.mockAcknowledged).toBeUndefined();
    // 5 AI-composed drafts plus the cohesion gate's auto-fixed CTA slot.
    expect(view?.drafts).toHaveLength(6);
    const ordered = [...(view?.drafts ?? [])].sort(
      (a, b) => a.seq - b.seq
    );
    for (const entry of ordered.slice(0, 5)) {
      // L8: generation only — every draft lands unapproved.
      expect(entry.post.approvalState).toBe("unapproved");
      expect(entry.post.status).toBe("draft");
      // The evidence-link model survives live drafting: each draft links the
      // idea's corpus citation, and no placeholder tokens mask unreviewed copy.
      expect(entry.post.sourceExcerptIds).toContain(excerptCitation);
      expect(entry.post.content).toContain(excerptCitation);
      expect(entry.post.content).not.toMatch(/\[[A-Z]+:/);
    }
    // The auto-fixed CTA is the gate's own placeholder composition (D-7/D-11,
    // shared with the mock path) — still visibly unapproved for human review.
    expect(ordered[5].post.content).toMatch(/\[CTA:/);
    expect(ordered[5].post.approvalState).toBe("unapproved");

    // The cohesion gate ran on the new set as part of the generation action.
    expect(result.cohesionRunNumber).toBe(1);
    const review = await asUser.query(api.cohesion.getReviewPasses, { campaignId });
    expect(review?.latestRun?.passed).toBe(true);

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    const audit = audits.find(
      (event) => event.action === "campaign.generate_draft_set_live"
    );
    expect(audit).toBeDefined();
    // The audit envelope records the provider/model metadata but never the
    // credential itself.
    const serializedMetadata = JSON.stringify(audit?.metadata);
    expect(serializedMetadata).toContain("claude-sonnet-4.6");
    expect(serializedMetadata).not.toContain("cortex-test-key");
  });

  it("never materializes a partial set when one slot fails composition", async () => {
    stubLiveCredentials();
    const fetchMock = vi.fn().mockImplementation(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const user = body.messages[1].content as string;
      const seq = Number(user.match(/seq=(\d+)/)?.[1]);
      const content =
        seq === 3
          ? `[ANGLE: the model regressed to placeholder tokens]`
          : `Opener ${seq}: a grounded claim. [${user.match(/corpus:\/\/[^\s\]]+/)?.[0] ?? ""}]`;
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: JSON.stringify({ title: `AI draft ${seq}`, content }) } },
          ],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, campaignId } = await setupGroundedShape(t);

    await expect(
      asUser.action(api.draftGeneration.generateLiveDraftSet, { campaignId })
    ).rejects.toThrow(/slot #3/);

    const view = await asUser.query(api.draftSet.getDraftSet, { campaignId });
    expect(view?.materialization).toBeNull();
    expect(view?.drafts).toHaveLength(0);
  });

  it("is idempotent per shape — one live set, no duplicate batches", async () => {
    stubLiveCredentials();
    vi.stubGlobal("fetch", stubGroundingGateway());
    const { asUser, campaignId } = await setupGroundedShape(t);

    await asUser.action(api.draftGeneration.generateLiveDraftSet, { campaignId });
    await expect(
      asUser.action(api.draftGeneration.generateLiveDraftSet, { campaignId })
    ).rejects.toThrow(/already generated/);

    const view = await asUser.query(api.draftSet.getDraftSet, { campaignId });
    // 5 composed + the gate's auto-fixed CTA.
    expect(view?.drafts).toHaveLength(6);
  });

  it("denies cross-user live generation", async () => {
    stubLiveCredentials();
    vi.stubGlobal("fetch", stubGroundingGateway());
    const { campaignId } = await setupGroundedShape(t);
    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.action(api.draftGeneration.generateLiveDraftSet, { campaignId })
    ).rejects.toThrow(/Campaign not found/);
  });

  // Gated live fixture (the CORVO_VISUAL_SEED_SOURCE_DIRECTORY precedent):
  // runs the real gateway only when an operator opts in with
  // CAMPAIGN_DRAFT_LIVE_TEST=1 and real credentials — never in CI.
  it.runIf(process.env.CAMPAIGN_DRAFT_LIVE_TEST === "1")(
    "live gateway fixture: composes real drafts end to end",
    async () => {
      const { asUser, campaignId } = await setupGroundedShape(t);
      const result = await asUser.action(api.draftGeneration.generateLiveDraftSet, {
        campaignId,
      });
      expect(result.draftCount).toBe(5);
      expect(result.cohesionPassed).toBe(true);
    }
  );
});

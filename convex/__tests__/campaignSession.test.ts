import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const JAKE = { subject: "user-jake", name: "Jake" };
const OTHER = { subject: "user-other", name: "Other User" };

function createTestHarness() {
  return convexTest(schema, modules);
}

async function seedCorvoMembership(t: ReturnType<typeof convexTest>) {
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
  });
}

async function createCorpus(
  t: ReturnType<typeof convexTest>,
  documentName = "react-synergizing-reasoning-acting-2210.03629.pdf"
) {
  const asUser = t.withIdentity(JAKE);
  return await asUser.mutation(api.corpora.createCorpusVersion, {
    brandId: "corvo",
    origin: "upload",
    documents: [
      {
        name: documentName,
        kind: "pdf" as const,
        excerpts: [
          {
            text: "We explore the use of large language models to generate reasoning traces and task-specific actions in an interleaved manner.",
            provenance: "p.1 · Abstract",
          },
          {
            text: "ReAct outperforms the strongest imitation-learning baseline on HotpotQA and grounding reduces hallucination.",
            provenance: "p.6 · HotpotQA results",
          },
          {
            text: "Performance is limited by in-context examples and the model may diverge between reasoning and actions.",
            provenance: "p.9 · Limitations",
          },
          {
            text: "Combining reasoning with interactive actions achieves the best of both worlds across embodied tasks.",
            provenance: "p.7 · ALFWorld",
          },
          {
            text: "Error analysis shows grounding in retrieved evidence reduces hallucination relative to reasoning-only chains.",
            provenance: "p.6 · Analysis",
          },
        ],
      },
    ],
  });
}

async function startCampaign(
  t: ReturnType<typeof convexTest>,
  corpusId: string
) {
  const asUser = t.withIdentity(JAKE);
  const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
    brandId: "corvo",
    title: "Reasoning + acting for editorial pipelines",
  });
  await asUser.mutation(api.campaigns.attachCorpus, { campaignId, corpusId });
  return { asUser, campaignId };
}

describe("campaign session", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedCorvoMembership(t);
  });

  it("suggests ideas citing corpus excerpts after explicit mock acknowledgment", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);

    await expect(
      asUser.mutation(api.campaigns.suggestIdeas, {
        campaignId,
        mockAcknowledged: false,
      })
    ).rejects.toThrow(/acknowledge mock mode/);

    const { created } = await asUser.mutation(api.campaigns.suggestIdeas, {
      campaignId,
      mockAcknowledged: true,
    });
    expect(created).toBeGreaterThan(0);

    const session = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    expect(session?.suggested.length).toBe(created);
    for (const entry of session?.suggested ?? []) {
      expect(entry.idea?.flavor).toBeDefined();
      expect((entry.idea?.excerptCitations ?? []).length).toBeGreaterThan(0);
      for (const citation of entry.idea?.excerptCitations ?? []) {
        expect(citation).toMatch(new RegExp(`^corpus://corvo/${corpus.corpusId}#excerpt-[1-5]$`));
      }
    }
  });

  it("keeps suggestion deterministic across reloads without duplicating ideas", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);

    await asUser.mutation(api.campaigns.suggestIdeas, {
      campaignId,
      mockAcknowledged: true,
    });
    const second = await asUser.mutation(api.campaigns.suggestIdeas, {
      campaignId,
      mockAcknowledged: true,
    });
    expect(second.created).toBe(0);

    const session = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    expect(session?.suggested.length).toBeGreaterThan(0);
  });

  it("refuses suggestions before a corpus is attached", async () => {
    const asUser = t.withIdentity(JAKE);
    const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
      brandId: "corvo",
      title: "Empty campaign",
    });
    await expect(
      asUser.mutation(api.campaigns.suggestIdeas, {
        campaignId,
        mockAcknowledged: true,
      })
    ).rejects.toThrow(/Attach a corpus/);
  });

  it("accepts suggested ideas into the working set with campaign-primary hints", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);
    await asUser.mutation(api.campaigns.suggestIdeas, {
      campaignId,
      mockAcknowledged: true,
    });
    const session = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    const ideaId = session?.suggested[0]?.idea?._id as string;

    const result = await asUser.mutation(api.campaigns.addIdeaToCampaign, {
      campaignId,
      ideaId,
    });
    expect(result.added).toBe(true);

    const updated = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    expect(updated?.workingSet).toHaveLength(1);
    expect(updated?.workingSet[0].join.primary).toBe(true);

    const idea = await t.run((ctx) => ctx.db.get(ideaId as never));
    expect(idea?.campaignHints?.[0]).toMatchObject({
      campaignTitle: "Reasoning + acting for editorial pipelines",
    });
  });

  it("links an idea from another campaign without moving it (many-to-many)", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);
    await asUser.mutation(api.campaigns.suggestIdeas, {
      campaignId,
      mockAcknowledged: true,
    });
    const session = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    const ideaId = session?.suggested[0]?.idea?._id as string;
    await asUser.mutation(api.campaigns.addIdeaToCampaign, { campaignId, ideaId });

    const { campaignId: campaignB } = await asUser.mutation(
      api.campaigns.createCampaign,
      { brandId: "corvo", title: "Second campaign" }
    );
    await asUser.mutation(api.campaigns.attachCorpus, {
      campaignId: campaignB,
      corpusId: corpus.corpusId,
    });
    await asUser.mutation(api.campaigns.addIdeaToCampaign, {
      campaignId: campaignB,
      ideaId,
    });

    const first = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    const second = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId: campaignB,
    });
    expect(first?.workingSet).toHaveLength(1);
    expect(second?.workingSet).toHaveLength(1);
    const idea = await t.run((ctx) => ctx.db.get(ideaId as never));
    expect(idea?.campaignHints).toHaveLength(2);
  });

  it("rejects ideas softly and reversibly (D-5)", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);
    await asUser.mutation(api.campaigns.suggestIdeas, {
      campaignId,
      mockAcknowledged: true,
    });
    const session = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    const ideaId = session?.suggested[0]?.idea?._id as string;

    await asUser.mutation(api.campaigns.rejectIdea, { campaignId, ideaId });
    let updated = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    expect(updated?.rejected).toHaveLength(1);

    await asUser.mutation(api.campaigns.undoIdeaRejection, {
      campaignId,
      ideaId,
    });
    updated = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    expect(updated?.rejected).toHaveLength(0);
    expect(updated?.suggested).toHaveLength(5);
  });

  it("prevents rejecting an idea that is in the working set", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);
    await asUser.mutation(api.campaigns.suggestIdeas, {
      campaignId,
      mockAcknowledged: true,
    });
    const session = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    const ideaId = session?.suggested[0]?.idea?._id as string;
    await asUser.mutation(api.campaigns.addIdeaToCampaign, { campaignId, ideaId });

    await expect(
      asUser.mutation(api.campaigns.rejectIdea, { campaignId, ideaId })
    ).rejects.toThrow(/Remove the idea from the working set/);
  });

  it("detaches working-set removal from shape slots (D-7 one-way membership)", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);
    await asUser.mutation(api.campaigns.suggestIdeas, {
      campaignId,
      mockAcknowledged: true,
    });
    const session = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    const ideaId = session?.suggested[0]?.idea?._id as string;
    await asUser.mutation(api.campaigns.addIdeaToCampaign, { campaignId, ideaId });

    const now = Date.now();
    const shapeId = await t.run(async (ctx) => {
      return await ctx.db.insert("campaignShapes", {
        campaignId: campaignId as never,
        preset: "standard",
        status: "proposed",
        createdAt: now,
        updatedAt: now,
      });
    });
    const slotId = await t.run(async (ctx) => {
      return await ctx.db.insert("campaignSlots", {
        shapeId: shapeId as never,
        seq: 1,
        channel: "linkedin",
        mediaType: "post",
        role: "pillar",
        title: "Pillar slot",
        ideaId: ideaId as never,
      });
    });

    const result = await asUser.mutation(api.campaigns.removeIdeaFromCampaign, {
      campaignId,
      ideaId,
    });
    expect(result.removed).toBe(true);
    expect(result.detachedSlots).toBe(1);

    const slot = await t.run((ctx) => ctx.db.get(slotId as never));
    expect(slot?.ideaId).toBeUndefined();

    const updated = await asUser.query(api.campaigns.getCampaignSession, {
      campaignId,
    });
    expect(updated?.workingSet).toHaveLength(0);
    const idea = await t.run((ctx) => ctx.db.get(ideaId as never));
    expect(idea?.campaignHints ?? []).toHaveLength(0);
  });

  it("searches session ideas scoped to the caller (inbox search)", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("ideas", {
        userId: JAKE.subject,
        text: "Could a weekly review digest replace standup for the content team?",
        status: "backlog",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("ideas", {
        userId: OTHER.subject,
        text: "Zebra unicorns parade at dawn — another user's private idea.",
        status: "backlog",
        createdAt: now,
        updatedAt: now,
      });
    });

    const hits = await asUser.query(api.campaigns.searchSessionIdeas, {
      campaignId,
      search: "review digest",
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].idea.text).toContain("review digest");
    expect(hits[0].state).toBeNull();

    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.query(api.campaigns.searchSessionIdeas, {
        campaignId,
        search: "zebra",
      })
    ).rejects.toThrow(/Campaign not found/);
  });

  it("denies session access to users without brand membership", async () => {
    const corpus = await createCorpus(t);
    const { asUser, campaignId } = await startCampaign(t, corpus.corpusId);

    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.query(api.campaigns.getCampaignSession, { campaignId })
    ).rejects.toThrow(/Campaign not found/);
    await expect(
      otherUser.mutation(api.campaigns.attachCorpus, {
        campaignId,
        corpusId: corpus.corpusId,
      })
    ).rejects.toThrow(/Campaign not found/);
  });

  it("refuses to attach a corpus from another brand", async () => {
    const asUser = t.withIdentity(JAKE);
    const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
      brandId: "corvo",
      title: "Corvo campaign",
    });

    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("v2Brands", {
        brandId: "lower-db",
        name: "the lower dB",
        description: "Other brand",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("v2BrandMemberships", {
        userId: OTHER.subject,
        brandId: "lower-db",
        role: "owner",
        createdAt: now,
        updatedAt: now,
      });
    });

    const asLowerDb = t.withIdentity(OTHER);
    await asLowerDb.mutation(api.corpora.createCorpusVersion, {
      brandId: "lower-db",
      origin: "cli",
      documents: [
        {
          name: "notebook.md",
          kind: "md",
          excerpts: [
            {
              text: "A lab notebook entry with real content worth citing.",
              provenance: "2026-05-26 · EXP-020",
            },
          ],
        },
      ],
    });
    const foreign = await t.run(async (ctx) => {
      const corpora = await ctx.db.query("corpora").collect();
      return corpora.find((corpus) => corpus.brandId === "lower-db");
    });

    await expect(
      asUser.mutation(api.campaigns.attachCorpus, {
        campaignId,
        corpusId: foreign!._id as never,
      })
    ).rejects.toThrow(/Corpus not found for this brand/);
  });
});

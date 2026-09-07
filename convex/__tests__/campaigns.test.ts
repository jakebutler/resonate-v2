import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const CORVO_ONLY_USER = { subject: "user-corvo-only", name: "Corvo User" };
const LOWER_DB_ONLY_USER = {
  subject: "user-lowerdb-only",
  name: "Lower DB User",
};

function createTestHarness() {
  return convexTest(schema, modules);
}

async function seedBrandMemberships(t: ReturnType<typeof convexTest>) {
  const now = Date.now();
  await t.run(async (ctx) => {
    for (const brand of [
      { brandId: "corvo" as const, name: "Corvo Labs" },
      { brandId: "lower-db" as const, name: "the lower dB" },
    ]) {
      await ctx.db.insert("v2Brands", {
        brandId: brand.brandId,
        name: brand.name,
        description: "Test brand",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("v2BrandMemberships", {
      userId: CORVO_ONLY_USER.subject,
      brandId: "corvo",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2BrandMemberships", {
      userId: LOWER_DB_ONLY_USER.subject,
      brandId: "lower-db",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
  });
}

const paperDocuments = [
  {
    name: "react-synergizing-reasoning-acting-2210.03629.pdf",
    kind: "pdf" as const,
    meta: { pages: 33 },
    excerpts: [
      {
        text: "We explore the use of large language models to generate both reasoning traces and task-specific actions in an interleaved manner.",
        provenance: "p.1 · Abstract",
      },
      {
        text: "ReAct outperforms the strongest imitation-learning baseline on HotpotQA.",
        provenance: "p.6 · HotpotQA results",
        sensitivity: "public-safe" as const,
        labels: ["results"],
      },
    ],
  },
  {
    name: "notes.md",
    kind: "md" as const,
    excerpts: [
      {
        text: "Reasoning traces help the model induce, track, and update high-level plans.",
        provenance: "p.2 · §2",
      },
    ],
  },
];

describe("campaigns", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedBrandMemberships(t);
  });

  it("creates a campaign title-only with audit trail", async () => {
    const asUser = t.withIdentity(CORVO_ONLY_USER);
    const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
      brandId: "corvo",
      title: "  Reasoning + acting for editorial pipelines  ",
    });

    expect(campaignId).toBeTruthy();

    const campaign = await asUser.query(api.campaigns.getCampaign, {
      campaignId,
    });
    expect(campaign).toMatchObject({
      title: "Reasoning + acting for editorial pipelines",
      brandId: "corvo",
      status: "active",
      corpusIds: [],
    });

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    const createEvent = audits.find(
      (event) => event.action === "campaign.create"
    );
    expect(createEvent).toBeDefined();
    expect(createEvent?.summary).toContain("Reasoning + acting");
  });

  it("requires authentication to create a campaign", async () => {
    await expect(
      t.mutation(api.campaigns.createCampaign, {
        brandId: "corvo",
        title: "Nope",
      })
    ).rejects.toThrow(/Unauthorized/i);
  });

  it("denies campaign creation for a brand the user does not belong to", async () => {
    const asCorvoUser = t.withIdentity(CORVO_ONLY_USER);
    await expect(
      asCorvoUser.mutation(api.campaigns.createCampaign, {
        brandId: "lower-db",
        title: "Cross",
      })
    ).rejects.toThrow(/Brand access denied/);
  });

  it("requires a non-empty title", async () => {
    const asUser = t.withIdentity(CORVO_ONLY_USER);
    await expect(
      asUser.mutation(api.campaigns.createCampaign, {
        brandId: "corvo",
        title: "   ",
      })
    ).rejects.toThrow(/title is required/i);
  });

  it("hides campaigns from users without brand membership", async () => {
    const asCorvoUser = t.withIdentity(CORVO_ONLY_USER);
    const { campaignId } = await asCorvoUser.mutation(
      api.campaigns.createCampaign,
      { brandId: "corvo", title: "Corvo campaign" }
    );

    const asLowerDbUser = t.withIdentity(LOWER_DB_ONLY_USER);
    const visible = await asLowerDbUser.query(api.campaigns.getCampaign, {
      campaignId,
    });
    expect(visible).toBeNull();
  });

  it("lists campaigns scoped to the caller's accessible brands", async () => {
    const asCorvoUser = t.withIdentity(CORVO_ONLY_USER);
    await asCorvoUser.mutation(api.campaigns.createCampaign, {
      brandId: "corvo",
      title: "Corvo campaign",
    });

    const asLowerDbUser = t.withIdentity(LOWER_DB_ONLY_USER);
    await asLowerDbUser.mutation(api.campaigns.createCampaign, {
      brandId: "lower-db",
      title: "Lower dB campaign",
    });

    const corvoList = await asCorvoUser.query(api.campaigns.listCampaigns, {});
    expect(corvoList.map((campaign) => campaign.title)).toEqual([
      "Corvo campaign",
    ]);
    const lowerDbList = await asLowerDbUser.query(api.campaigns.listCampaigns, {});
    expect(lowerDbList.map((campaign) => campaign.title)).toEqual([
      "Lower dB campaign",
    ]);
  });
});

describe("corpora", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedBrandMemberships(t);
  });

  it("creates an immutable corpus version with stable cross-document sequence numbers", async () => {
    const asUser = t.withIdentity(CORVO_ONLY_USER);
    const result = await asUser.mutation(api.corpora.createCorpusVersion, {
      brandId: "corvo",
      origin: "upload",
      documents: paperDocuments,
    });

    expect(result).toMatchObject({ version: 1, excerptCount: 3 });

    const corpus = await asUser.query(api.corpora.getCorpus, {
      corpusId: result.corpusId,
    });
    expect(corpus?.corpus).toMatchObject({
      brandId: "corvo",
      origin: "upload",
      version: 1,
      status: "active",
    });
    expect(corpus?.documents.map((document) => document.name)).toEqual([
      "react-synergizing-reasoning-acting-2210.03629.pdf",
      "notes.md",
    ]);
    expect(corpus?.excerpts.map((excerpt) => excerpt.seq)).toEqual([1, 2, 3]);
    expect(
      corpus?.excerpts.every((excerpt) => excerpt.reviewState === "accepted")
    ).toBe(true);
    expect(
      corpus?.excerpts[1].sensitivity === "public-safe" &&
        corpus?.excerpts[0].sensitivity === "unreviewed"
    ).toBe(true);
  });

  it("assigns the next per-brand version monotonically", async () => {
    const asUser = t.withIdentity(CORVO_ONLY_USER);
    const first = await asUser.mutation(api.corpora.createCorpusVersion, {
      brandId: "corvo",
      origin: "upload",
      documents: paperDocuments,
    });
    const second = await asUser.mutation(api.corpora.createCorpusVersion, {
      brandId: "corvo",
      origin: "cli",
      documents: paperDocuments,
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);

    const asLowerDbUser = t.withIdentity(LOWER_DB_ONLY_USER);
    const otherBrand = await asLowerDbUser.mutation(
      api.corpora.createCorpusVersion,
      { brandId: "lower-db", origin: "cli", documents: paperDocuments }
    );
    expect(otherBrand.version).toBe(1);
  });

  it("refuses to create an empty corpus version (fail-closed ingest)", async () => {
    const asUser = t.withIdentity(CORVO_ONLY_USER);
    await expect(
      asUser.mutation(api.corpora.createCorpusVersion, {
        brandId: "corvo",
        origin: "upload",
        documents: [{ name: "empty.pdf", kind: "pdf", excerpts: [] }],
      })
    ).rejects.toThrow(/at least one accepted excerpt/i);

    await expect(
      asUser.mutation(api.corpora.createCorpusVersion, {
        brandId: "corvo",
        origin: "upload",
        documents: [],
      })
    ).rejects.toThrow(/at least one document/i);
  });

  it("denies corpus creation for a brand the user does not belong to", async () => {
    const asCorvoUser = t.withIdentity(CORVO_ONLY_USER);
    await expect(
      asCorvoUser.mutation(api.corpora.createCorpusVersion, {
        brandId: "lower-db",
        origin: "cli",
        documents: paperDocuments,
      })
    ).rejects.toThrow(/Brand access denied/);
  });

  it("hides corpora from users without brand membership", async () => {
    const asCorvoUser = t.withIdentity(CORVO_ONLY_USER);
    const created = await asCorvoUser.mutation(api.corpora.createCorpusVersion, {
      brandId: "corvo",
      origin: "upload",
      documents: paperDocuments,
    });

    const asLowerDbUser = t.withIdentity(LOWER_DB_ONLY_USER);
    const visible = await asLowerDbUser.query(api.corpora.getCorpus, {
      corpusId: created.corpusId,
    });
    expect(visible).toBeNull();
  });

  it("writes an audit event for corpus version creation", async () => {
    const asUser = t.withIdentity(CORVO_ONLY_USER);
    await asUser.mutation(api.corpora.createCorpusVersion, {
      brandId: "corvo",
      origin: "upload",
      documents: paperDocuments,
    });

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    const event = audits.find(
      (entry) => entry.action === "corpus.version_created"
    );
    expect(event).toBeDefined();
    expect(event?.summary).toContain("corpus v1");
  });

  it("lists a brand's corpora newest-version first", async () => {
    const asUser = t.withIdentity(CORVO_ONLY_USER);
    await asUser.mutation(api.corpora.createCorpusVersion, {
      brandId: "corvo",
      origin: "upload",
      documents: paperDocuments,
    });
    await asUser.mutation(api.corpora.createCorpusVersion, {
      brandId: "corvo",
      origin: "paste",
      documents: paperDocuments,
    });

    const corpora = await asUser.query(api.corpora.listCorpora, {
      brandId: "corvo",
    });
    expect(corpora.map((corpus) => corpus.version)).toEqual([2, 1]);
  });
});

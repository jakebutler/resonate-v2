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

/** Sets up a campaign with an accepted, fully linked standard shape. */
async function setupAcceptedShape(t: ReturnType<typeof convexTest>) {
  const asUser = t.withIdentity(JAKE);
  const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
    brandId: "corvo",
    title: "Draft set campaign",
  });

  const now = Date.now();
  const shapeId = await t.run(async (ctx) => {
    return String(
      await ctx.db.insert("campaignShapes", {
        campaignId: campaignId as never,
        preset: "standard",
        status: "accepted",
        createdAt: now,
        updatedAt: now,
      })
    );
  });

  const roles = ["pillar", "hook", "satellite", "satellite", "recap"] as const;
  for (let index = 0; index < roles.length; index += 1) {
    const ideaId = await t.run(async (ctx) => {
      return String(
        await ctx.db.insert("ideas", {
          userId: JAKE.subject,
          text: `Working-set idea ${index + 1} with a complete claim.`,
          status: "idea",
          flavor: "insight",
          excerptCitations: [`corpus://corvo/corpus_1#excerpt-${index + 1}`],
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

  return { asUser, campaignId, shapeId };
}

describe("draft set", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedBrand(t);
  });

  it("fails closed without explicit mock acknowledgment (D-21)", async () => {
    const { asUser, campaignId } = await setupAcceptedShape(t);
    await expect(
      asUser.mutation(api.draftSet.generateDraftSet, {
        campaignId,
        mockAcknowledged: false,
      })
    ).rejects.toThrow(/acknowledge mock mode/);
  });

  it("refuses generation without an accepted shape", async () => {
    const asUser = t.withIdentity(JAKE);
    const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
      brandId: "corvo",
      title: "No shape yet",
    });
    await expect(
      asUser.mutation(api.draftSet.generateDraftSet, {
        campaignId,
        mockAcknowledged: true,
      })
    ).rejects.toThrow(/Accept a complete shape/);
  });

  it("materializes a placeholder draft set where every draft is unapproved", async () => {
    const { asUser, campaignId } = await setupAcceptedShape(t);

    const result = await asUser.mutation(api.draftSet.generateDraftSet, {
      campaignId,
      mockAcknowledged: true,
    });
    expect(result.draftCount).toBe(5);
    expect(result.alreadyGenerated).toBe(false);

    const view = await asUser.query(api.draftSet.getDraftSet, { campaignId });
    expect(view?.drafts).toHaveLength(5);
    expect(view?.materialization?.mode).toBe("mock");
    expect(view?.drafts.map((entry) => entry.seq)).toEqual([1, 2, 3, 4, 5]);
    for (const entry of view?.drafts ?? []) {
      expect(entry.post.approvalState).toBe("unapproved");
      expect(entry.post.status).toBe("draft");
      expect(entry.post.sourceCampaignId).toBeDefined();
      expect(entry.post.sourceSlotId).toBeDefined();
      expect(entry.post.sourceExcerptIds?.length ?? 0).toBeGreaterThan(0);
      expect(entry.post.content).toMatch(/\[[A-Z]+:/);
    }
  });

  it("is idempotent per shape — no duplicate batches", async () => {
    const { asUser, campaignId } = await setupAcceptedShape(t);
    await asUser.mutation(api.draftSet.generateDraftSet, {
      campaignId,
      mockAcknowledged: true,
    });
    const second = await asUser.mutation(api.draftSet.generateDraftSet, {
      campaignId,
      mockAcknowledged: true,
    });
    expect(second.alreadyGenerated).toBe(true);
    expect(second.draftCount).toBe(0);

    const view = await asUser.query(api.draftSet.getDraftSet, { campaignId });
    expect(view?.drafts).toHaveLength(5);
  });

  it("writes an audit event and denies cross-user generation", async () => {
    const { asUser, campaignId } = await setupAcceptedShape(t);
    await asUser.mutation(api.draftSet.generateDraftSet, {
      campaignId,
      mockAcknowledged: true,
    });

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    expect(
      audits.find((event) => event.action === "campaign.generate_draft_set")
    ).toBeDefined();

    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.mutation(api.draftSet.generateDraftSet, {
        campaignId,
        mockAcknowledged: true,
      })
    ).rejects.toThrow(/Campaign not found/);
    await expect(
      otherUser.query(api.draftSet.getDraftSet, { campaignId })
    ).rejects.toThrow(/Campaign not found/);
  });
});

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

async function createCampaign(
  t: ReturnType<typeof convexTest>,
  title: string
) {
  const asUser = t.withIdentity(JAKE);
  const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
    brandId: "corvo",
    title,
  });
  return { asUser, campaignId };
}

describe("mock acknowledgment tokens (D-21, C8)", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedBrand(t);
  });

  it("mints a token bound to the caller and campaign, and denies foreign campaigns", async () => {
    const { asUser, campaignId } = await createCampaign(t, "Token campaign");

    const ack = await asUser.mutation(api.mockAck.requestMockAcknowledgment, {
      campaignId,
    });
    expect(ack.token).toMatch(/^[0-9a-f]{32}$/);
    expect(ack.expiresAt).toBeGreaterThan(Date.now());

    // Ownership is enforced before any token is minted.
    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.mutation(api.mockAck.requestMockAcknowledgment, { campaignId })
    ).rejects.toThrow(/Campaign not found/);
  });

  it("gates generation on the token: valid unlocks, foreign-campaign token does not", async () => {
    const { asUser, campaignId } = await createCampaign(t, "Gated campaign");

    const now = Date.now();
    const shapeId = await t.run(async (ctx) =>
      String(
        await ctx.db.insert("campaignShapes", {
          campaignId: campaignId as never,
          preset: "seed",
          status: "accepted",
          createdAt: now,
          updatedAt: now,
        })
      )
    );
    const ideaId = await t.run(async (ctx) =>
      String(
        await ctx.db.insert("ideas", {
          userId: JAKE.subject,
          text: "Pillar idea with a real claim.",
          status: "idea",
          createdAt: now,
          updatedAt: now,
        })
      )
    );
    await asUser.mutation(api.campaigns.addIdeaToCampaign, { campaignId, ideaId });
    await t.run(async (ctx) => {
      await ctx.db.insert("campaignSlots", {
        shapeId: shapeId as never,
        seq: 1,
        channel: "linkedin",
        mediaType: "post",
        role: "pillar",
        ideaId: ideaId as never,
      });
    });

    await expect(
      asUser.mutation(api.draftSet.generateDraftSet, {
        campaignId,
        mockAckToken: "not-a-real-token",
      })
    ).rejects.toThrow(/acknowledge mock mode/);

    // A token minted for a different campaign must not unlock this one.
    const { campaignId: otherCampaignId } = await createCampaign(t, "Other campaign");
    const foreignAck = await asUser.mutation(
      api.mockAck.requestMockAcknowledgment,
      { campaignId: otherCampaignId }
    );
    await expect(
      asUser.mutation(api.draftSet.generateDraftSet, {
        campaignId,
        mockAckToken: foreignAck.token,
      })
    ).rejects.toThrow(/acknowledge mock mode/);

    const ack = await asUser.mutation(api.mockAck.requestMockAcknowledgment, {
      campaignId,
    });
    const result = await asUser.mutation(api.draftSet.generateDraftSet, {
      campaignId,
      mockAckToken: ack.token,
    });
    expect(result.draftCount).toBeGreaterThan(0);
  });

  it("rejects another user's token and expired tokens (fail-closed)", async () => {
    const { asUser, campaignId } = await createCampaign(t, "Expiry campaign");

    // A token minted by another user (for their own campaign) never
    // unlocks this caller's generation.
    const otherUser = t.withIdentity(OTHER);
    const { campaignId: otherCampaignId } = await otherUser.mutation(
      api.campaigns.createCampaign,
      { brandId: "corvo", title: "Other user's campaign" }
    );
    const foreignAck = await otherUser.mutation(
      api.mockAck.requestMockAcknowledgment,
      { campaignId: otherCampaignId }
    );
    await expect(
      asUser.mutation(api.draftSet.generateDraftSet, {
        campaignId,
        mockAckToken: foreignAck.token,
      })
    ).rejects.toThrow(/acknowledge mock mode/);

    const ack = await asUser.mutation(api.mockAck.requestMockAcknowledgment, {
      campaignId,
    });
    await t.run(async (ctx) => {
      const records = await ctx.db.query("mockAcknowledgments").collect();
      const record = records.find((entry) => entry.token === ack.token)!;
      await ctx.db.patch(record._id, { expiresAt: Date.now() - 1000 });
    });
    await expect(
      asUser.mutation(api.draftSet.generateDraftSet, {
        campaignId,
        mockAckToken: ack.token,
      })
    ).rejects.toThrow(/acknowledge mock mode/);
  });
});

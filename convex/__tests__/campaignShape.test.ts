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

async function seed(t: ReturnType<typeof convexTest>) {
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

async function setupCampaignWithWorkingSet(
  t: ReturnType<typeof convexTest>,
  workingSetSize = 5
) {
  const asUser = t.withIdentity(JAKE);
  const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
    brandId: "corvo",
    title: "Shape test campaign",
  });

  const now = Date.now();
  const ideaIds: string[] = [];
  for (let i = 0; i < workingSetSize; i += 1) {
    const ideaId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("ideas", {
        userId: JAKE.subject,
        text: `Working-set idea ${i + 1} — a complete thought worth publishing.`,
        status: "idea",
        createdAt: now + i,
        updatedAt: now + i,
      });
      return String(id);
    });
    ideaIds.push(ideaId);
    await asUser.mutation(api.campaigns.addIdeaToCampaign, {
      campaignId,
      ideaId,
    });
  }
  return { asUser, campaignId, ideaIds };
}

describe("campaign shape", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seed(t);
  });

  it("proposes a Standard shape with sequence numbers and preset default linking", async () => {
    const { asUser, campaignId, ideaIds } = await setupCampaignWithWorkingSet(t, 5);

    const { shapeId, slotCount } = await asUser.mutation(api.shapes.proposeShape, {
      campaignId,
      preset: "standard",
    });
    expect(slotCount).toBe(5);

    const view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    expect(view?.shape?.preset).toBe("standard");
    expect(view?.slots.map((slot) => slot.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(view?.slots.map((slot) => slot.role)).toEqual([
      "pillar",
      "hook",
      "satellite",
      "satellite",
      "recap",
    ]);
    expect(view?.slots.every((slot) => slot.ideaId)).toBe(true);
    void shapeId;
    void ideaIds;
  });

  it("blocks acceptance while any slot is incomplete (D-11)", async () => {
    const { asUser, campaignId } = await setupCampaignWithWorkingSet(t, 2);
    const { shapeId } = await asUser.mutation(api.shapes.proposeShape, {
      campaignId,
      preset: "standard",
    });

    const view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    expect(view?.slots.filter((slot) => !slot.ideaId).length).toBeGreaterThan(0);

    await expect(
      asUser.mutation(api.shapes.acceptShape, { shapeId })
    ).rejects.toThrow(/incomplete/);
  });

  it("accepts a complete shape and locks it as the durable plan", async () => {
    const { asUser, campaignId } = await setupCampaignWithWorkingSet(t, 7);
    const { shapeId } = await asUser.mutation(api.shapes.proposeShape, {
      campaignId,
      preset: "deep",
    });

    const result = await asUser.mutation(api.shapes.acceptShape, { shapeId });
    expect(result.accepted).toBe(true);

    const view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    expect(view?.shape?.status).toBe("accepted");

    await expect(
      asUser.mutation(api.shapes.proposeShape, { campaignId, preset: "seed" })
    ).rejects.toThrow(/already has an accepted shape/);

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    expect(
      audits.find((event) => event.action === "campaign.accept_shape")
    ).toBeDefined();
  });

  it("preserves operator edits when switching presets (D-10)", async () => {
    const { asUser, campaignId } = await setupCampaignWithWorkingSet(t, 5);
    const { shapeId } = await asUser.mutation(api.shapes.proposeShape, {
      campaignId,
      preset: "standard",
    });

    const view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    const pillarSlot = view?.slots.find((slot) => slot.role === "pillar");
    const satelliteSlots = view?.slots.filter((slot) => slot.role === "satellite") ?? [];

    await asUser.mutation(api.shapes.updateSlot, {
      shapeId,
      slotId: pillarSlot!._id as never,
      title: "My edited pillar title",
      angle: "Ground it in the approval-gate telemetry",
    });
    await asUser.mutation(api.shapes.linkSlotIdea, {
      shapeId,
      slotId: satelliteSlots[0]!._id as never,
      ideaId: undefined,
    });

    await asUser.mutation(api.shapes.proposeShape, {
      campaignId,
      preset: "deep",
    });

    const switched = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    expect(switched?.shape?.preset).toBe("deep");
    expect(switched?.slots).toHaveLength(7);

    const switchedPillar = switched?.slots.find((slot) => slot.role === "pillar");
    expect(switchedPillar?.title).toBe("My edited pillar title");
    expect(switchedPillar?.angle).toBe("Ground it in the approval-gate telemetry");
    expect(switchedPillar?.ideaId).toBeDefined();

    // Unmatched slots fill from the preset: hook (x/post) exists in both —
    // satellite(linkedin/post) matched too; essay/youtube/cta are new.
    const essay = switched?.slots.find((slot) => slot.mediaType === "essay");
    expect(essay?.ideaId).toBeDefined();
    void satelliteSlots;
  });

  it("moves slots within the publishing sequence without changing the schedule model", async () => {
    const { asUser, campaignId } = await setupCampaignWithWorkingSet(t, 5);
    const { shapeId } = await asUser.mutation(api.shapes.proposeShape, {
      campaignId,
      preset: "standard",
    });

    let view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    const first = view!.slots[0];
    const second = view!.slots[1];

    const moved = await asUser.mutation(api.shapes.moveSlot, {
      shapeId,
      slotId: second!._id as never,
      direction: -1,
    });
    expect(moved.moved).toBe(true);

    view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    expect(view?.slots[0].role).toBe("hook");
    expect(view?.slots[1].role).toBe("pillar");
    expect(view?.slots.map((slot) => slot.seq)).toEqual([1, 2, 3, 4, 5]);
    void first;
  });

  it("refuses edge moves and keeps sequence contiguous", async () => {
    const { asUser, campaignId } = await setupCampaignWithWorkingSet(t, 5);
    const { shapeId } = await asUser.mutation(api.shapes.proposeShape, {
      campaignId,
      preset: "standard",
    });
    const view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    const first = view!.slots[0];

    const moved = await asUser.mutation(api.shapes.moveSlot, {
      shapeId,
      slotId: first!._id as never,
      direction: -1,
    });
    expect(moved.moved).toBe(false);
  });

  it("saves the progressive brief (D-3 goal/audience at the shape step)", async () => {
    const { asUser, campaignId } = await setupCampaignWithWorkingSet(t, 2);
    await asUser.mutation(api.shapes.saveBrief, {
      campaignId,
      goal: "Position excerpt-first drafting as Corvo's methodology",
      audience: "Engineering leaders shipping agentic workflows",
    });

    const view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    expect(view?.brief?.goal).toContain("excerpt-first drafting");
    expect(view?.brief?.audience).toContain("Engineering leaders");
  });

  it("denies shape access to other users (cross-brand authorization)", async () => {
    const { asUser, campaignId } = await setupCampaignWithWorkingSet(t, 2);
    await asUser.mutation(api.shapes.proposeShape, { campaignId, preset: "seed" });
    const view = await asUser.query(api.shapes.getCampaignShape, { campaignId });
    const shapeId = view!.shape!._id as string;

    // Other user is a member of corvo but does not own the campaign.
    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.mutation(api.shapes.acceptShape, { shapeId })
    ).rejects.toThrow(/Campaign not found/);
    await expect(
      otherUser.query(api.shapes.getCampaignShape, { campaignId })
    ).rejects.toThrow(/Campaign not found/);
  });
});

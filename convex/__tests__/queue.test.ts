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

async function setupGatedDraftSet(t: ReturnType<typeof convexTest>) {
  const asUser = t.withIdentity(JAKE);
  const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
    brandId: "corvo",
    title: "Queue campaign",
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
    const seq = index + 1;
    const role = roles[index];
    const ideaId = await t.run(async (ctx) => {
      return String(
        await ctx.db.insert("ideas", {
          userId: JAKE.subject,
          text: `Idea ${seq}: grounded claims need receipts.`,
          status: "idea",
          flavor: "insight",
          excerptCitations: [`corpus://corvo/c1#excerpt-${seq}`],
          createdAt: now,
          updatedAt: now,
        })
      );
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("campaignSlots", {
        shapeId: shapeId as never,
        seq,
        channel: role === "pillar" ? "corvo-blog" : "linkedin",
        mediaType: role === "pillar" ? "article" : "post",
        role,
        title: `Slot ${seq}`,
        ideaId: ideaId as never,
      });
    });
  }

  await asUser.mutation(api.draftSet.generateDraftSet, {
    campaignId,
    mockAcknowledged: true,
  });
  await asUser.mutation(api.cohesion.runCohesionGate, { campaignId });

  return { asUser, campaignId };
}

describe("materialize + approval queue", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedBrand(t);
  });

  it("blocks materialization when the cohesion gate has not passed", async () => {
    const asUser = t.withIdentity(JAKE);
    const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
      brandId: "corvo",
      title: "Ungated campaign",
    });

    await expect(
      asUser.mutation(api.queue.materializeDraftSet, { campaignId })
    ).rejects.toThrow(/Generate the draft set/);

    // Even with a draft set but no gate run: blocked (D-13).
    const now = Date.now();
    const shapeId = await t.run(async (ctx) => {
      return String(
        await ctx.db.insert("campaignShapes", {
          campaignId: campaignId as never,
          preset: "seed",
          status: "accepted",
          createdAt: now,
          updatedAt: now,
        })
      );
    });
    const ideaId = await t.run(async (ctx) => {
      return String(
        await ctx.db.insert("ideas", {
          userId: JAKE.subject,
          text: "Pillar idea.",
          status: "idea",
          createdAt: now,
          updatedAt: now,
        })
      );
    });
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
    await asUser.mutation(api.draftSet.generateDraftSet, {
      campaignId,
      mockAcknowledged: true,
    });

    await expect(
      asUser.mutation(api.queue.materializeDraftSet, { campaignId })
    ).rejects.toThrow(/Cohesion gate is blocking/);
  });

  it("materializes as scheduled-but-unapproved with calendar intents", async () => {
    const { asUser, campaignId } = await setupGatedDraftSet(t);

    const result = await asUser.mutation(api.queue.materializeDraftSet, {
      campaignId,
    });
    expect(result.materialized).toBe(true);
    // The cohesion gate auto-added the missing CTA slot (§9.1 default), so the
    // batch carries 6 drafts, not the preset's 5.
    expect(result.draftCount).toBe(6);

    const view = await asUser.query(api.queue.getCampaignQueue, { campaignId });
    expect(view?.materialized).toBe(true);
    expect(view?.totalCount).toBe(6);
    expect(
      view?.queue.every((entry) => entry.approvalState === "unapproved")
    ).toBe(true);
    expect(
      view?.queue.every((entry) => entry.status === "scheduled")
    ).toBe(true);
    expect(
      view?.queue.every((entry) => entry.scheduledDate && entry.scheduledTime)
    ).toBe(true);
    // Sequence-aware placement: first slots earliest.
    expect(view?.queue[0]!.scheduledDate <= view!.queue[4]!.scheduledDate!).toBe(true);

    // Calendar hydration data exists: intents + provider states.
    const intents = await t.run(async (ctx) =>
      ctx.db.query("v2PublishingIntents").collect()
    );
    expect(intents.filter((intent) => intent.approvalState === "unapproved").length).toBe(6);
    const providerStates = await t.run(async (ctx) =>
      ctx.db.query("v2ProviderStates").collect()
    );
    expect(
      providerStates.every((state) => state.status === "not-submitted")
    ).toBe(true);
  });

  it("is idempotent — rematerializing does nothing", async () => {
    const { asUser, campaignId } = await setupGatedDraftSet(t);
    await asUser.mutation(api.queue.materializeDraftSet, { campaignId });
    const second = await asUser.mutation(api.queue.materializeDraftSet, {
      campaignId,
    });
    expect(second.materialized).toBe(false);
    expect(second.reason).toMatch(/already materialized/);
  });

  it("approves drafts through the existing gated path and tracks the next in sequence", async () => {
    const { asUser, campaignId } = await setupGatedDraftSet(t);
    await asUser.mutation(api.queue.materializeDraftSet, { campaignId });

    const view = await asUser.query(api.queue.getCampaignQueue, { campaignId });
    const first = view!.queue[0]!;
    expect(view!.nextSeq).toBe(1);

    await asUser.mutation(api.publishing.setApproval, {
      postId: first.postId as never,
      approvalState: "approved",
    });

    const after = await asUser.query(api.queue.getCampaignQueue, { campaignId });
    expect(after!.approvedCount).toBe(1);
    expect(after!.nextSeq).toBe(2);
    expect(after!.queue[0]!.approvalState).toBe("approved");
    // Approval preserved with schedule; nothing submitted.
    expect(after!.queue[0]!.status).toBe("scheduled");
  });

  it("reports the fully-approved end state", async () => {
    const { asUser, campaignId } = await setupGatedDraftSet(t);
    await asUser.mutation(api.queue.materializeDraftSet, { campaignId });

    const view = await asUser.query(api.queue.getCampaignQueue, { campaignId });
    for (const entry of view!.queue) {
      await asUser.mutation(api.publishing.setApproval, {
        postId: entry.postId as never,
        approvalState: "approved",
      });
    }

    const final = await asUser.query(api.queue.getCampaignQueue, { campaignId });
    expect(final!.allApproved).toBe(true);
    expect(final!.nextSeq).toBeNull();
  });

  it("denies queue access and materialization to other users", async () => {
    const { campaignId } = await setupGatedDraftSet(t);
    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.query(api.queue.getCampaignQueue, { campaignId })
    ).rejects.toThrow(/Campaign not found/);
    await expect(
      otherUser.mutation(api.queue.materializeDraftSet, { campaignId })
    ).rejects.toThrow(/Campaign not found/);
  });

  it("writes a materialize audit event", async () => {
    const { asUser, campaignId } = await setupGatedDraftSet(t);
    await asUser.mutation(api.queue.materializeDraftSet, { campaignId });

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    const event = audits.find((entry) => entry.action === "campaign.materialize");
    expect(event).toBeDefined();
    expect(event!.summary).toContain("scheduled-but-unapproved");
  });
});

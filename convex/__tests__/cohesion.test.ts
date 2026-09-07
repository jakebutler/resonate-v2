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

type SetupOptions = {
  /** Slot roles; default standard composition WITHOUT a CTA (the §9.1 tension). */
  roles?: ("pillar" | "hook" | "satellite" | "recap" | "cta")[];
  /** Force the post at this seq to repeat seq 1's opener. */
  duplicateOpenerAtSeq?: number;
};

async function setupDraftSet(t: ReturnType<typeof convexTest>, options: SetupOptions = {}) {
  const asUser = t.withIdentity(JAKE);
  const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
    brandId: "corvo",
    title: "Cohesion campaign",
  });

  const now = Date.now();
  const roles =
    options.roles ?? ["pillar", "hook", "satellite", "satellite", "recap"];

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

  if (options.duplicateOpenerAtSeq) {
    const sourceSeq = 1;
    const targetSeq = options.duplicateOpenerAtSeq;
    await t.run(async (ctx) => {
      const posts = await ctx.db.query("v2Posts").collect();
      const source = posts.find((post) => post.title === `Slot ${sourceSeq}`);
      const target = posts.find((post) => post.title === `Slot ${targetSeq}`);
      if (source && target) {
        const sourceFirstProse = source.content
          .split("\n")
          .find((line) => line.trim() && !line.trim().startsWith("#"))!;
        await ctx.db.patch(target._id, {
          content:
            sourceFirstProse +
            "\n" +
            target.content
              .split("\n")
              .filter((line) => line.trim())
              .slice(1)
              .join("\n"),
        });
      }
    });
  }

  return { asUser, campaignId, shapeId };
}

describe("cohesion gate", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedBrand(t);
  });

  it("blocks materialization until the gate passes", async () => {
    const { asUser, campaignId } = await setupDraftSet(t);

    // Standard preset has no CTA — the §9.1 tension. First run auto-adds it.
    const firstRun = await asUser.mutation(api.cohesion.runCohesionGate, {
      campaignId,
    });
    expect(firstRun.passed).toBe(true);
    expect(
      firstRun.checks.find((check) => check.id === "one-cta")!.passed
    ).toBe(true);
    expect(
      firstRun.autoFixLog.some((fix) => fix.checkId === "one-cta")
    ).toBe(true);
  });

  it("auto-adds a CTA slot with an explanatory note (spec §9.1 recommended default)", async () => {
    const { asUser, campaignId } = await setupDraftSet(t);
    await asUser.mutation(api.cohesion.runCohesionGate, { campaignId });

    const view = await asUser.query(api.draftSet.getDraftSet, { campaignId });
    const ctaDrafts = view?.drafts.filter((entry) => entry.slot.role === "cta");
    expect(ctaDrafts).toHaveLength(1);
    expect(ctaDrafts![0]!.post.approvalState).toBe("unapproved");

    const review = await asUser.query(api.cohesion.getReviewPasses, { campaignId });
    const ctaFix = review?.latestRun?.autoFixLog.find(
      (fix) => fix.checkId === "one-cta"
    );
    expect(ctaFix?.note).toMatch(/created automatically/);
  });

  it("auto-regenerates a duplicated framing opener with a note", async () => {
    const { asUser, campaignId } = await setupDraftSet(t, {
      roles: ["pillar", "hook", "satellite", "recap", "cta"],
      duplicateOpenerAtSeq: 3,
    });

    const run = await asUser.mutation(api.cohesion.runCohesionGate, { campaignId });
    const openerFix = run.autoFixLog.find(
      (fix) => fix.checkId === "unique-openers"
    );
    expect(openerFix).toBeDefined();
    expect(openerFix!.note).toMatch(/regenerated automatically/);

    const review = await asUser.query(api.cohesion.getReviewPasses, { campaignId });
    const fixedDraft = review?.seoAeo.find((entry) => entry.postId === "post_3");
    void fixedDraft;

    const view = await asUser.query(api.draftSet.getDraftSet, { campaignId });
    const target = view?.drafts.find((entry) => entry.seq === 3);
    expect(target?.post.content).toContain("Grounding beats vibes");
  });

  it("blocks when a satellite does not reference the pillar claim", async () => {
    const { asUser, campaignId } = await setupDraftSet(t, {
      roles: ["pillar", "satellite", "recap", "cta"],
    });
    await t.run(async (ctx) => {
      const posts = await ctx.db.query("v2Posts").collect();
      const orphan = posts.find((post) => post.title === "Slot 2");
      if (orphan) {
        await ctx.db.patch(orphan._id, {
          content: "Wholly unrelated content with no grounding whatsoever.",
          sourceExcerptIds: ["corpus://corvo/other#excerpt-42"],
        });
      }
    });

    const run = await asUser.mutation(api.cohesion.runCohesionGate, { campaignId });
    expect(run.passed).toBe(false);
    expect(
      run.blockingFailures.map((failure) => failure.id)
    ).toContain("satellites-reference-pillar");
  });

  it("persists multiple runs and passes after fixes", async () => {
    const { asUser, campaignId } = await setupDraftSet(t);
    const first = await asUser.mutation(api.cohesion.runCohesionGate, { campaignId });
    expect(first.runNumber).toBe(1);
    const second = await asUser.mutation(api.cohesion.runCohesionGate, { campaignId });
    expect(second.runNumber).toBe(2);
    expect(second.passed).toBe(true);
  });

  it("refuses to run before a draft set exists and denies other users", async () => {
    const asUser = t.withIdentity(JAKE);
    const { campaignId } = await asUser.mutation(api.campaigns.createCampaign, {
      brandId: "corvo",
      title: "No drafts yet",
    });
    await expect(
      asUser.mutation(api.cohesion.runCohesionGate, { campaignId })
    ).rejects.toThrow(/Generate the draft set/);

    await setupDraftSet(t);
    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.mutation(api.cohesion.runCohesionGate, { campaignId })
    ).rejects.toThrow(/Campaign not found/);
  });
});

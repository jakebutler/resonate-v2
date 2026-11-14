import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";
import { formatYmdFromOffset } from "@/lib/formatYmd";
import {
  campaignFixture,
  driveCampaignToApproval,
} from "./helpers/campaignFixture";

const modules = import.meta.glob("../**/*.ts");

function createTestHarness() {
  return convexTest(schema, modules);
}

describe("campaignFixture harness (verification deliverable C1)", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    t = createTestHarness();
  });

  it("seeds a gate-passed, materialized batch in one call", async () => {
    const fixture = await campaignFixture(t);

    // Materialized: every draft scheduled-but-unapproved, nothing auto-approved.
    // The standard preset ships 5 slots; the gate's mechanical auto-fix may add
    // the CTA draft (ADR 0006), so counts are asserted relative to the queue.
    expect(fixture.materialize.materialized).toBe(true);
    expect(fixture.queue.materialized).toBe(true);
    expect(fixture.queue.totalCount).toBeGreaterThanOrEqual(5);
    expect(fixture.queue.queue).toHaveLength(fixture.queue.totalCount);
    expect(
      fixture.queue.queue.every(
        (entry) => entry.status === "scheduled" && entry.approvalState === "unapproved"
      )
    ).toBe(true);

    // Gate-passed: the latest cohesion run passed and carries a fingerprint.
    const gateRuns = await t.run(async (ctx) => ctx.db.query("cohesionRuns").collect());
    expect(gateRuns).toHaveLength(1);
    expect(gateRuns[0]?.passed).toBe(true);
    expect(gateRuns[0]?.draftSetFingerprint).toBeTruthy();

    // Each post carries a publishing intent plus a not-submitted provider state.
    const intents = await t.run(async (ctx) =>
      ctx.db.query("v2PublishingIntents").collect()
    );
    expect(intents).toHaveLength(fixture.queue.totalCount);
    const providerStates = await t.run(async (ctx) =>
      ctx.db.query("v2ProviderStates").collect()
    );
    expect(providerStates.every((state) => state.status === "not-submitted")).toBe(true);
  });

  it("loop driver approves in sequence until getCampaignQueue.allApproved", async () => {
    const fixture = await campaignFixture(t);
    expect(fixture.queue.allApproved).toBe(false);
    expect(fixture.queue.nextSeq).toBe(1);

    const queue = await driveCampaignToApproval(fixture);

    expect(queue.allApproved).toBe(true);
    expect(queue.approvedCount).toBe(queue.totalCount);
    expect(queue.nextSeq).toBe(null);
    expect(queue.queue.every((entry) => entry.approvalState === "approved")).toBe(true);
  });

  it("assigns the deterministic schedule ladder: fixed times, 3-per-day, LA timezone", async () => {
    const startedAt = Date.now();
    const fixture = await campaignFixture(t, { preset: "standard" });
    const finishedAt = Date.now();

    // Expected ladder (convex/queue.ts): times cycle 09:00 / 13:30 / 16:00,
    // day = 1 + floor(index / 3), timezone fixed to America/Los_Angeles.
    // Date candidates come from before and after the run so the assertion
    // holds even if the LA calendar day rolls over mid-test.
    const scheduleTimes = ["09:00", "13:30", "16:00"];
    const candidateDates = (offset: number) => [
      formatYmdFromOffset(offset, startedAt),
      formatYmdFromOffset(offset, finishedAt),
    ];

    const ordered = [...fixture.queue.queue].sort((a, b) => a.seq - b.seq);
    ordered.forEach((entry, index) => {
      const dayOffset = 1 + Math.floor(index / scheduleTimes.length);
      expect(entry.scheduledTime, `seq ${entry.seq} scheduled time`).toBe(
        scheduleTimes[index % scheduleTimes.length]
      );
      expect(candidateDates(dayOffset), `seq ${entry.seq} scheduled date`).toContain(
        entry.scheduledDate
      );
    });

    const intents = await t.run(async (ctx) =>
      ctx.db.query("v2PublishingIntents").collect()
    );
    expect(intents.every((intent) => intent.timezone === "America/Los_Angeles")).toBe(true);
  });

  it("stales the gate after a post-gate draft edit: materialize is blocked until the gate re-runs", async () => {
    const fixture = await campaignFixture(t);

    // Reproduce the staleness case: unground a satellite AFTER the gate
    // passed. The fixture's drafts share corpus citations with the pillar, so
    // the ungrounding must clear the citation overlap as well as the content
    // (lib/cohesion.ts: a satellite counts as grounded on either). The
    // replacement content is built from words the pillar's keyword check
    // cannot match, so the gate fails honestly instead of via keyword overlap.
    const satellite = fixture.queue.queue.find((entry) => entry.role === "satellite");
    expect(satellite).toBeDefined();
    const satellitePostId = satellite!.postId;
    const pillarEntry = fixture.queue.queue.find((entry) => entry.role === "pillar");
    expect(pillarEntry).toBeDefined();
    const original = await t.run(async (ctx) => {
      const post = await ctx.db.get(ctx.db.normalizeId("v2Posts", satellitePostId)!);
      return { content: post!.content, sourceExcerptIds: post!.sourceExcerptIds };
    });
    const pillarPost = await t.run(async (ctx) =>
      ctx.db.get(ctx.db.normalizeId("v2Posts", pillarEntry!.postId)!)
    );
    const pillarWords = new Set(
      pillarPost!.content.toLowerCase().match(/[a-z]{5,}/g) ?? []
    );
    const candidates = ["quokka", "xylophone", "veranda", "tundra", "lantern"];
    const safeWords = candidates.filter(
      (word) => ![...pillarWords].some((keyword) => word.includes(keyword))
    );
    expect(safeWords.length).toBeGreaterThanOrEqual(3);
    const ungroundedContent = `${safeWords.slice(0, 3).join(" ")}.`;
    await t.run(async (ctx) => {
      const post = ctx.db.normalizeId("v2Posts", satellitePostId);
      if (post) {
        await ctx.db.patch(post, {
          content: ungroundedContent,
          sourceExcerptIds: [],
        });
      }
    });

    await expect(
      fixture.asUser.mutation(api.queue.materializeDraftSet, { campaignId: fixture.campaignId })
    ).rejects.toThrow(/changed after the last cohesion gate/);

    // Recovery: re-running the gate re-evaluates honestly — it now blocks on
    // the ungrounded satellite — and restoring grounded content re-passes.
    const rerun = await fixture.asUser.mutation(api.cohesion.runCohesionGate, {
      campaignId: fixture.campaignId,
    });
    expect(rerun.passed).toBe(false);
    expect(rerun.blockingFailures.map((failure) => failure.id)).toContain(
      "satellites-reference-pillar"
    );

    await t.run(async (ctx) => {
      const post = ctx.db.normalizeId("v2Posts", satellitePostId);
      if (post) {
        await ctx.db.patch(post, original);
      }
    });
    await fixture.asUser.mutation(api.cohesion.runCohesionGate, { campaignId: fixture.campaignId });
    const refreshed = await fixture.asUser.mutation(api.queue.materializeDraftSet, {
      campaignId: fixture.campaignId,
    });
    // Already-materialized batch: a no-op, but reached only through a fresh gate.
    expect(refreshed.materialized).toBe(false);
  });

  it("is idempotent: regenerating and re-materializing do not duplicate drafts or intents", async () => {
    const fixture = await campaignFixture(t);

    const postsBefore = await t.run(async (ctx) =>
      ctx.db.query("v2Posts").collect()
    );

    // Draft-set generation is idempotent per accepted shape (mock-ack gated).
    const generateAck = await fixture.asUser.mutation(api.mockAck.requestMockAcknowledgment, {
      campaignId: fixture.campaignId,
    });
    await fixture.asUser.mutation(api.draftSet.generateDraftSet, {
      campaignId: fixture.campaignId,
      mockAckToken: generateAck.token,
    });

    const rematerialize = await fixture.asUser.mutation(api.queue.materializeDraftSet, {
      campaignId: fixture.campaignId,
    });
    expect(rematerialize.materialized).toBe(false);
    expect(rematerialize.reason).toBe("already materialized");

    const postsAfter = await t.run(async (ctx) =>
      ctx.db.query("v2Posts").collect()
    );
    expect(postsAfter).toHaveLength(postsBefore.length);

    const intents = await t.run(async (ctx) =>
      ctx.db.query("v2PublishingIntents").collect()
    );
    expect(intents).toHaveLength(fixture.queue.totalCount);
  });

  it("writes an audit event at every lifecycle step the fixture drives", async () => {
    const fixture = await campaignFixture(t);
    await driveCampaignToApproval(fixture);

    const actions = (
      await t.run(async (ctx) => ctx.db.query("v2AuditEvents").collect())
    ).map((event) => event.action);

    const expected = [
      "campaign.create",
      "campaign.attach_corpus",
      "campaign.suggest_ideas",
      "campaign.add_idea",
      "campaign.propose_shape",
      "campaign.accept_shape",
      "campaign.generate_draft_set",
      "campaign.cohesion_gate",
      "campaign.materialize",
      "post.approval",
    ];
    for (const action of expected) {
      expect(actions, `missing audit event for ${action}`).toContain(action);
    }
  });

  it("scopes the fixture to its creator: neither a co-owner nor an outsider can read the queue", async () => {
    const fixture = await campaignFixture(t);

    // Campaigns are creator-scoped (campaignAccess.getOwnedCampaign), even for
    // another owner of the same brand — the queue query refuses both.
    for (const identity of [fixture.otherUser, t.withIdentity({ subject: "user-fixture-outsider", name: "Outsider" })]) {
      await expect(
        identity.query(api.queue.getCampaignQueue, { campaignId: fixture.campaignId as never })
      ).rejects.toThrow(/Campaign not found/);
    }
  });
});

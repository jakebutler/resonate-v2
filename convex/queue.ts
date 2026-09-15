import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  audit,
  getOwnedCampaign,
  requireUserId,
} from "./campaignAccess";
import { parseCorpusCitation } from "@/lib/campaignGrounding";
import {
  countIncompleteSlots,
  isShapeComplete,
} from "@/lib/campaignShapes";
import { draftSetFingerprint } from "@/lib/draftSetFingerprint";
import { formatYmdFromOffset } from "@/lib/formatYmd";
import { latestIntent } from "./publishing";

const SCHEDULE_TIMES = ["09:00", "13:30", "16:00"];

/**
 * D-17: distinct citations in the batch whose target excerpt is still marked
 * "unreviewed". Used at materialize time for the audit record and by
 * getCampaignQueue for the persistent warning banner (so the warning survives
 * reloads and clears itself once sensitivities are fixed).
 */
async function countUnreviewedCitations(
  ctx: Parameters<typeof getOwnedCampaign>[0],
  drafts: Awaited<ReturnType<typeof loadCampaignDrafts>>["drafts"]
): Promise<number> {
  const unreviewedCitations = new Set<string>();
  for (const draft of drafts) {
    for (const citation of draft.post.sourceExcerptIds ?? []) {
      const parsed = parseCorpusCitation(citation);
      if (!parsed) continue;
      const corpusId = ctx.db.normalizeId("corpora", parsed.corpusId);
      if (!corpusId) continue;
      const excerpt = await ctx.db
        .query("corpusExcerpts")
        .withIndex("by_corpus_and_seq", (q) =>
          q.eq("corpusId", corpusId).eq("seq", parsed.seq)
        )
        .first();
      if (excerpt && excerpt.sensitivity === "unreviewed") {
        unreviewedCitations.add(citation);
      }
    }
  }
  return unreviewedCitations.size;
}

async function loadCampaignDrafts(
  ctx: Parameters<typeof getOwnedCampaign>[0],
  campaignId: string,
  userId: string
) {
  const shape = (
    await ctx.db
      .query("campaignShapes")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaignId as never).eq("status", "accepted")
      )
      .first()
  ) as Doc<"campaignShapes"> | null;
  if (!shape) return { shape: null, slots: [], drafts: [] };

  const slots = (
    await ctx.db
      .query("campaignSlots")
      .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
      .collect()
  ).sort((a, b) => a.seq - b.seq);

  const posts = await ctx.db
    .query("v2Posts")
    .withIndex("by_user_and_campaign", (q) =>
      q.eq("userId", userId).eq("sourceCampaignId", campaignId as never)
    )
    .collect();

  const drafts: { post: Doc<"v2Posts">; seq: number; role: string; mediaType: string }[] = [];
  for (const post of posts) {
    const slot = slots.find(
      (candidate) => String(candidate._id) === String(post.sourceSlotId)
    );
    if (!slot) continue;
    drafts.push({ post, seq: slot.seq, role: slot.role, mediaType: slot.mediaType });
  }
  drafts.sort((a, b) => a.seq - b.seq);
  return { shape, slots, drafts };
}

export const materializeDraftSet = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const materialization = (
      await ctx.db
        .query("materializations")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .collect()
    ).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!materialization) {
      throw new Error("Generate the draft set before materializing.");
    }

    // The cohesion gate blocks materialization (D-13): the latest run must pass.
    const latestRun = (
      await ctx.db
        .query("cohesionRuns")
        .withIndex("by_materialization", (q) =>
          q.eq("materializationId", materialization._id)
        )
        .collect()
    ).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!latestRun || !latestRun.passed) {
      throw new Error(
        "Cohesion gate is blocking — run the gate and resolve the failures to materialize."
      );
    }

    const { shape, slots, drafts } = await loadCampaignDrafts(
      ctx,
      campaign._id,
      userId
    );
    if (drafts.length === 0) {
      throw new Error("No drafts found for this campaign.");
    }

    // Gate freshness: the passing run must describe the drafts as they are
    // right now. Any post-gate edit (content change, added or removed draft)
    // stales the run and forces a re-run — the gate result never outlives the
    // content it checked.
    const currentFingerprint = draftSetFingerprint(
      drafts.map((draft) => ({
        postId: String(draft.post._id),
        seq: draft.seq,
        title: draft.post.title,
        content: draft.post.content,
      }))
    );
    if (
      !latestRun.draftSetFingerprint ||
      latestRun.draftSetFingerprint !== currentFingerprint
    ) {
      throw new Error(
        "The drafts changed after the last cohesion gate run — run the gate again to materialize."
      );
    }

    // D-11: slot completeness is re-checked at materialization, not only at
    // accept — a slot can lose its linked idea after the shape was accepted.
    if (shape) {
      const incomplete = countIncompleteSlots(slots);
      if (incomplete > 0 || !isShapeComplete(slots)) {
        throw new Error(
          `${incomplete} slot(s) incomplete — every slot needs a linked idea before the batch can be scheduled.`
        );
      }
    }

    const alreadyScheduled = drafts.filter(
      (draft) => draft.post.status === "scheduled" || draft.post.status === "approved"
    );
    if (alreadyScheduled.length === drafts.length) {
      return { materialized: false, reason: "already materialized" };
    }

    const now = Date.now();
    const timezone = "America/Los_Angeles";

    // D-17: warn when the batch quotes excerpts still marked unreviewed.
    const unreviewedCount = await countUnreviewedCitations(ctx, drafts);

    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index]!;
      const scheduledDate = formatYmdFromOffset(1 + Math.floor(index / SCHEDULE_TIMES.length), now, timezone);
      const scheduledTime = SCHEDULE_TIMES[index % SCHEDULE_TIMES.length]!;

      const existingIntent = await ctx.db
        .query("v2PublishingIntents")
        .withIndex("by_post", (q) => q.eq("postId", draft.post._id))
        .first();
      if (existingIntent) {
        await ctx.db.patch(existingIntent._id, {
          scheduledDate,
          scheduledTime,
          updatedAt: now,
        });
      } else {
        const intentId = await ctx.db.insert("v2PublishingIntents", {
          postId: draft.post._id,
          userId,
          brandId: campaign.brandId,
          channelId: draft.post.channelId,
          platformId: draft.post.platformId,
          scheduledDate,
          scheduledTime,
          timezone,
          approvalState: "unapproved",
          contentFingerprint: draft.post.contentFingerprint,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("v2ProviderStates", {
          postId: draft.post._id,
          intentId,
          status: "not-submitted",
          createdAt: now,
          updatedAt: now,
        });
      }

      await ctx.db.patch(draft.post._id, {
        status: "scheduled",
        approvalState: "unapproved",
        scheduledDate,
        scheduledTime,
        timezone,
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.materialize",
      summary: `Materialized a ${drafts.length}-draft batch to the calendar as scheduled-but-unapproved for "${campaign.title}". Nothing auto-approves.${unreviewedCount > 0 ? ` Warning: ${unreviewedCount} cited excerpt(s) are still marked unreviewed.` : ""}`,
      metadata: {
        campaignId: String(campaign._id),
        materializationId: String(materialization._id),
        draftCount: drafts.length,
        unreviewedExcerptCount: unreviewedCount,
      },
    });

    return {
      materialized: true,
      draftCount: drafts.length,
      unreviewedExcerptCount: unreviewedCount,
    };
  },
});

export const getCampaignQueue = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const { drafts } = await loadCampaignDrafts(ctx, campaign._id, userId);

    const queue = [];
    for (const draft of drafts) {
      // Resolve the same way the calendar does (latest by updatedAt) so the
      // campaign queue and the calendar can never disagree about a post's
      // schedule when it has more than one intent.
      const intent = await latestIntent(ctx, draft.post._id);
      queue.push({
        postId: String(draft.post._id),
        seq: draft.seq,
        role: draft.role,
        mediaType: draft.mediaType,
        channel: draft.post.channelId,
        title: draft.post.title,
        content: draft.post.content,
        approvalState: draft.post.approvalState,
        status: draft.post.status,
        scheduledDate: intent?.scheduledDate ?? draft.post.scheduledDate ?? null,
        scheduledTime: intent?.scheduledTime ?? draft.post.scheduledTime ?? null,
      });
    }

    const approvedCount = queue.filter((entry) => entry.approvalState === "approved").length;
    const nextUnapproved = queue.find((entry) => entry.approvalState !== "approved");
    const unreviewedCitationCount = await countUnreviewedCitations(ctx, drafts);

    return {
      campaign,
      queue,
      approvedCount,
      totalCount: queue.length,
      nextSeq: nextUnapproved?.seq ?? null,
      allApproved: queue.length > 0 && approvedCount === queue.length,
      materialized: queue.some((entry) => entry.status === "scheduled"),
      unreviewedCitationCount,
    };
  },
});

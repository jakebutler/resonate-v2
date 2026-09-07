import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  audit,
  getOwnedCampaign,
  requireUserId,
} from "./campaignAccess";

const SCHEDULE_TIMES = ["09:00", "13:30", "16:00"];

function formatYmdFromOffset(
  dayOffset: number,
  now = Date.now(),
  timeZone = "America/Los_Angeles"
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  base.setUTCDate(base.getUTCDate() + dayOffset);
  return base.toISOString().slice(0, 10);
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

  const posts = (
    await ctx.db
      .query("v2Posts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).filter((post) => post.sourceCampaignId === campaignId);

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

    const { drafts } = await loadCampaignDrafts(ctx, campaign._id, userId);
    if (drafts.length === 0) {
      throw new Error("No drafts found for this campaign.");
    }

    const alreadyScheduled = drafts.filter(
      (draft) => draft.post.status === "scheduled" || draft.post.status === "approved"
    );
    if (alreadyScheduled.length === drafts.length) {
      return { materialized: false, reason: "already materialized" };
    }

    const now = Date.now();
    const timezone = "America/Los_Angeles";
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
      summary: `Materialized a ${drafts.length}-draft batch to the calendar as scheduled-but-unapproved for "${campaign.title}". Nothing auto-approves.`,
      metadata: {
        campaignId: String(campaign._id),
        materializationId: String(materialization._id),
        draftCount: drafts.length,
      },
    });

    return { materialized: true, draftCount: drafts.length };
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
      const intent = await ctx.db
        .query("v2PublishingIntents")
        .withIndex("by_post", (q) => q.eq("postId", draft.post._id))
        .first();
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

    return {
      campaign,
      queue,
      approvedCount,
      totalCount: queue.length,
      nextSeq: nextUnapproved?.seq ?? null,
      allApproved: queue.length > 0 && approvedCount === queue.length,
      materialized: queue.some((entry) => entry.status === "scheduled"),
    };
  },
});

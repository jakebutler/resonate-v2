import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  audit,
  getOwnedCampaign,
  requireUserId,
} from "./campaignAccess";
import { assertGroundingAllowed } from "@/lib/campaignGrounding";
import {
  composeDraftSet,
  containsPlaceholderTokens,
  type DraftSlotInput,
} from "@/lib/campaignDrafts";

function contentFingerprint(title: string, content: string) {
  return `${title.trim()}\n${content.trim()}`;
}

export const generateDraftSet = mutation({
  args: {
    campaignId: v.id("campaigns"),
    mockAcknowledged: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    // Fail-closed grounding (D-21): mock generation refuses to run until the
    // operator explicitly acknowledges mock mode.
    assertGroundingAllowed({
      mode: "mock",
      mockAcknowledged: args.mockAcknowledged,
      liveConfigured: false,
    });

    const shape = await ctx.db
      .query("campaignShapes")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaign._id).eq("status", "accepted")
      )
      .first();
    if (!shape) {
      throw new Error("Accept a complete shape before generating the draft set.");
    }

    const existing = await ctx.db
      .query("materializations")
      .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
      .first();
    if (existing) {
      return {
        materializationId: String(existing._id),
        draftCount: 0,
        alreadyGenerated: true,
      };
    }

    const slots = (
      await ctx.db
        .query("campaignSlots")
        .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
        .collect()
    ).sort((a, b) => a.seq - b.seq);

    const ideaIds = new Set(
      slots.map((slot) => slot.ideaId).filter(Boolean) as Id<"ideas">[]
    );
    const ideaDocs = new Map<string, Doc<"ideas">>();
    for (const ideaId of ideaIds) {
      const idea = await ctx.db.get(ideaId);
      if (idea) ideaDocs.set(String(ideaId), idea);
    }

    const draftInputs: DraftSlotInput[] = slots.map((slot) => {
      const idea = slot.ideaId ? ideaDocs.get(String(slot.ideaId)) : undefined;
      return {
        seq: slot.seq,
        role: slot.role,
        channel: slot.channel,
        mediaType: slot.mediaType,
        title: slot.title,
        angle: slot.angle,
        ideaText: idea?.text,
        excerptCitations: idea?.excerptCitations,
      };
    });

    const composed = composeDraftSet(draftInputs);
    if (composed.length !== slots.length) {
      throw new Error("Draft set composition failed — slot count mismatch.");
    }
    for (const draft of composed) {
      if (!containsPlaceholderTokens(draft.content)) {
        throw new Error(
          "Refusing to generate: placeholder tokens are missing, which would mask unreviewed copy."
        );
      }
    }

    const now = Date.now();
    const materializationId = await ctx.db.insert("materializations", {
      campaignId: campaign._id,
      shapeId: shape._id,
      mode: "mock",
      mockAcknowledged: true,
      createdAt: now,
    });

    const postIds: string[] = [];
    for (let index = 0; index < slots.length; index += 1) {
      const slot = slots[index];
      const draft = composed[index];
      const idea = slot.ideaId ? ideaDocs.get(String(slot.ideaId)) : undefined;
      const postId = await ctx.db.insert("v2Posts", {
        userId,
        brandId: campaign.brandId,
        channelId: slot.channel,
        platformId: slot.channel,
        title: draft.title,
        content: draft.content,
        status: "draft",
        approvalState: "unapproved",
        timezone: "America/Los_Angeles",
        sourceCampaignId: campaign._id,
        sourceSlotId: slot._id,
        sourceExcerptIds: idea?.excerptCitations,
        contentFingerprint: contentFingerprint(draft.title, draft.content),
        createdAt: now,
        updatedAt: now,
      });
      postIds.push(String(postId));
    }

    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.generate_draft_set",
      summary: `Generated a ${slots.length}-draft placeholder set in acknowledged mock mode for "${campaign.title}" — every draft unapproved.`,
      metadata: {
        campaignId: String(campaign._id),
        materializationId: String(materializationId),
        draftCount: slots.length,
        mode: "mock",
      },
    });

    return {
      materializationId: String(materializationId),
      draftCount: postIds.length,
      alreadyGenerated: false,
    };
  },
});

export const getDraftSet = query({
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
      return { campaign, materialization: null, drafts: [] };
    }

    const shape = await ctx.db.get(materialization.shapeId);
    const slots = shape
      ? (
          await ctx.db
            .query("campaignSlots")
            .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
            .collect()
        ).sort((a, b) => a.seq - b.seq)
      : [];

    const drafts = (
      await ctx.db
        .query("v2Posts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).filter(
      (post) =>
        post.sourceCampaignId === campaign._id &&
        post.sourceSlotId !== undefined
    );

    const hydrated = [];
    for (const post of drafts) {
      const slot = slots.find(
        (candidate) => String(candidate._id) === String(post.sourceSlotId)
      );
      if (!slot) continue;
      hydrated.push({ post, slot, seq: slot.seq });
    }
    hydrated.sort((a, b) => a.seq - b.seq);

    return {
      campaign,
      materialization,
      drafts: hydrated,
    };
  },
});

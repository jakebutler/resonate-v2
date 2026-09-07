import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  audit,
  getOwnedCampaign,
  requireUserId,
} from "./campaignAccess";
import {
  applyPreset,
  countIncompleteSlots,
  isShapeComplete,
  type CampaignPresetKey,
  type EditableSlot,
} from "@/lib/campaignShapes";

const presetValidator = v.union(
  v.literal("seed"),
  v.literal("standard"),
  v.literal("deep")
);

type ShapeCtx = QueryCtx | MutationCtx;

export const saveBrief = mutation({
  args: {
    campaignId: v.id("campaigns"),
    goal: v.optional(v.string()),
    audience: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const existing = await ctx.db
      .query("campaignBriefs")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.goal !== undefined ? { goal: args.goal } : {}),
        ...(args.audience !== undefined ? { audience: args.audience } : {}),
      });
    } else {
      await ctx.db.insert("campaignBriefs", {
        campaignId: campaign._id,
        goal: args.goal,
        audience: args.audience,
      });
    }
    return { saved: true };
  },
});

async function loadProposedShape(
  ctx: ShapeCtx,
  campaignId: string
) {
  const shape = await ctx.db
    .query("campaignShapes")
    .withIndex("by_campaign_and_status", (q) =>
      q.eq("campaignId", campaignId as never).eq("status", "proposed")
    )
    .first();
  return shape;
}

async function loadSlots(
  ctx: ShapeCtx,
  shapeId: string
) {
  const slots = await ctx.db
    .query("campaignSlots")
    .withIndex("by_shape", (q) => q.eq("shapeId", shapeId as never))
    .collect();
  return slots.sort((a, b) => a.seq - b.seq);
}

export const proposeShape = mutation({
  args: {
    campaignId: v.id("campaigns"),
    preset: presetValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const accepted = await ctx.db
      .query("campaignShapes")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaign._id).eq("status", "accepted")
      )
      .first();
    if (accepted) {
      throw new Error(
        "This campaign already has an accepted shape — the durable plan cannot be re-proposed."
      );
    }

    // Inherit operator edits from any existing proposed shape (D-10).
    const existingShape = await loadProposedShape(ctx, campaign._id);
    const currentSlots: EditableSlot[] = existingShape
      ? (await loadSlots(ctx, existingShape._id)).map((slot) => ({
          role: slot.role,
          channel: slot.channel,
          mediaType: slot.mediaType,
          title: slot.title,
          angle: slot.angle,
          ideaId: slot.ideaId ? String(slot.ideaId) : undefined,
        }))
      : [];

    const nextSlots = applyPreset(currentSlots, args.preset as CampaignPresetKey);

    // Preset default linking: working-set ideas fill unlinked slots in
    // working-set order (prototype: "every slot links a working-set idea").
    const memberJoins = (
      await ctx.db
        .query("campaignIdeas")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .collect()
    )
      .filter((join) => join.state === "member")
      .sort((a, b) => a.addedAt - b.addedAt);
    const linkedIds = new Set(
      nextSlots.map((slot) => slot.ideaId).filter(Boolean) as string[]
    );
    const availableIdeas = memberJoins
      .map((join) => String(join.ideaId))
      .filter((ideaId) => !linkedIds.has(ideaId));
    for (const slot of nextSlots) {
      if (!slot.ideaId && availableIdeas.length > 0) {
        slot.ideaId = availableIdeas.shift();
      }
    }

    const now = Date.now();
    let shapeId: string;
    if (existingShape) {
      await ctx.db.patch(existingShape._id, { preset: args.preset, updatedAt: now });
      shapeId = String(existingShape._id);
      for (const slot of await loadSlots(ctx, existingShape._id)) {
        await ctx.db.delete(slot._id);
      }
    } else {
      shapeId = String(
        await ctx.db.insert("campaignShapes", {
          campaignId: campaign._id,
          preset: args.preset,
          status: "proposed",
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    let seq = 0;
    for (const slot of nextSlots) {
      seq += 1;
      await ctx.db.insert("campaignSlots", {
        shapeId: shapeId as never,
        seq,
        channel: slot.channel,
        mediaType: slot.mediaType,
        role: slot.role,
        title: slot.title,
        angle: slot.angle,
        ideaId: slot.ideaId ? (slot.ideaId as never) : undefined,
      });
    }

    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.propose_shape",
      summary: `Proposed a ${args.preset} shape (${nextSlots.length} slots) for "${campaign.title}".`,
      metadata: { campaignId: String(campaign._id), preset: args.preset },
    });

    return { shapeId, slotCount: nextSlots.length };
  },
});

async function getOwnedShapeContext(
  ctx: ShapeCtx,
  userId: string,
  shapeId: string
) {
  const normalized = ctx.db.normalizeId("campaignShapes", shapeId as never);
  if (!normalized) throw new Error("Shape not found");
  const shape = await ctx.db.get(normalized);
  if (!shape) throw new Error("Shape not found");
  const campaign = await getOwnedCampaign(
    ctx,
    userId,
    String(shape.campaignId)
  );
  return { shape, campaign };
}

export const updateSlot = mutation({
  args: {
    shapeId: v.id("campaignShapes"),
    slotId: v.id("campaignSlots"),
    title: v.optional(v.string()),
    angle: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { shape } = await getOwnedShapeContext(ctx, userId, args.shapeId);
    const slot = await ctx.db.get(args.slotId);
    if (!slot || String(slot.shapeId) !== String(shape._id)) {
      throw new Error("Slot not found");
    }
    await ctx.db.patch(args.slotId, {
      ...(args.title !== undefined ? { title: args.title } : {}),
      ...(args.angle !== undefined ? { angle: args.angle } : {}),
    });
    return { updated: true };
  },
});

export const linkSlotIdea = mutation({
  args: {
    shapeId: v.id("campaignShapes"),
    slotId: v.id("campaignSlots"),
    ideaId: v.optional(v.id("ideas")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { shape } = await getOwnedShapeContext(ctx, userId, args.shapeId);
    const slot = await ctx.db.get(args.slotId);
    if (!slot || String(slot.shapeId) !== String(shape._id)) {
      throw new Error("Slot not found");
    }
    await ctx.db.patch(args.slotId, { ideaId: args.ideaId });
    return { linked: true };
  },
});

export const moveSlot = mutation({
  args: {
    shapeId: v.id("campaignShapes"),
    slotId: v.id("campaignSlots"),
    direction: v.union(v.literal(-1), v.literal(1)),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { shape } = await getOwnedShapeContext(ctx, userId, args.shapeId);
    const slots = await loadSlots(ctx, shape._id);
    const index = slots.findIndex((slot) => String(slot._id) === String(args.slotId));
    if (index === -1) throw new Error("Slot not found");
    const neighborIndex = index + args.direction;
    if (neighborIndex < 0 || neighborIndex >= slots.length) {
      return { moved: false, reason: "already at the edge" };
    }
    const seqValues = [slots[index].seq, slots[neighborIndex].seq];
    await ctx.db.patch(slots[index]._id, { seq: seqValues[1] });
    await ctx.db.patch(slots[neighborIndex]._id, { seq: seqValues[0] });
    return { moved: true };
  },
});

export const acceptShape = mutation({
  args: { shapeId: v.id("campaignShapes") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { shape, campaign } = await getOwnedShapeContext(
      ctx,
      userId,
      args.shapeId
    );
    if (shape.status === "accepted") {
      return { accepted: true, alreadyAccepted: true };
    }
    const slots = await loadSlots(ctx, shape._id);
    const incomplete = countIncompleteSlots(slots);
    if (incomplete > 0 || !isShapeComplete(slots)) {
      throw new Error(
        `${incomplete} slot(s) incomplete — every slot needs a linked idea before the shape can be accepted.`
      );
    }

    await ctx.db.patch(shape._id, { status: "accepted", updatedAt: Date.now() });
    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.accept_shape",
      summary: `Accepted the ${shape.preset} shape (${slots.length} slots in publishing sequence) for "${campaign.title}".`,
      metadata: { campaignId: String(campaign._id), shapeId: String(shape._id) },
    });
    return { accepted: true };
  },
});

export const getCampaignShape = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const shape =
      (
        await ctx.db
          .query("campaignShapes")
          .withIndex("by_campaign_and_status", (q) =>
            q.eq("campaignId", campaign._id).eq("status", "proposed")
          )
          .first()
      ) ??
      (
        await ctx.db
          .query("campaignShapes")
          .withIndex("by_campaign_and_status", (q) =>
            q.eq("campaignId", campaign._id).eq("status", "accepted")
          )
          .first()
      );

    const memberJoins = (
      await ctx.db
        .query("campaignIdeas")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .collect()
    ).filter((join) => join.state === "member");
    const workingSet = (
      await Promise.all(
        memberJoins.map(async (join) => ({
          join,
          idea: await ctx.db.get(join.ideaId),
        }))
      )
    ).filter((entry) => entry.idea !== null);

    if (!shape) {
      const briefOnly = await ctx.db
        .query("campaignBriefs")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .first();
      return {
        campaign,
        shape: null,
        slots: [],
        workingSet,
        brief: briefOnly ?? null,
      };
    }

    const slots = await loadSlots(ctx, shape._id);
    const brief = await ctx.db
      .query("campaignBriefs")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .first();

    return { campaign, shape, slots, workingSet, brief: brief ?? null };
  },
});


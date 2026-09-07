import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  audit,
  brandIdValidator,
  requireBrandAccess,
  requireUserId,
  type BrandId,
} from "./campaignAccess";

export const createCampaign = mutation({
  args: {
    brandId: brandIdValidator,
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);

    const title = args.title.trim();
    if (!title) {
      throw new Error("Campaign title is required.");
    }

    const now = Date.now();
    const campaignId = await ctx.db.insert("campaigns", {
      userId,
      brandId: args.brandId,
      title,
      status: "active",
      corpusIds: [],
      createdAt: now,
      updatedAt: now,
    });

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "campaign.create",
      summary: `Started campaign "${title}" (title-only confirm).`,
      metadata: { campaignId: String(campaignId) },
    });

    return { campaignId: String(campaignId) };
  },
});

export const listCampaigns = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const memberships = await ctx.db
      .query("v2BrandMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const accessibleBrands = new Set(
      memberships.map((membership) => membership.brandId)
    );

    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return campaigns
      .filter((campaign) => accessibleBrands.has(campaign.brandId))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaignId = ctx.db.normalizeId("campaigns", args.campaignId);
    if (!campaignId) return null;
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return null;
    try {
      await requireBrandAccess(ctx, userId, campaign.brandId as BrandId);
    } catch {
      return null;
    }
    return campaign;
  },
});

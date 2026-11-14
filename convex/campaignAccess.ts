import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export type BrandId = Doc<"v2Brands">["brandId"];

export const brandIdValidator = v.union(
  v.literal("personal"),
  v.literal("corvo"),
  v.literal("lower-db"),
  v.literal("freshproof")
);

/**
 * Single source of truth for caller identity. The ctx param is structural so
 * the same helper works in queries, mutations, and "use node" actions.
 */
export async function requireUserId(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) throw new Error("Unauthorized");
  return identity.subject;
}

export async function requireBrandAccess(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  brandId: BrandId
) {
  const memberships = await ctx.db
    .query("v2BrandMemberships")
    .withIndex("by_user_and_brand", (q) =>
      q.eq("userId", userId).eq("brandId", brandId)
    )
    .take(2);

  if (memberships.length > 1) throw new Error("Ambiguous brand membership");
  const membership = memberships[0];
  if (!membership) throw new Error("Brand access denied");
  return membership;
}

export async function getOwnedCampaign(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  campaignId: string
): Promise<Doc<"campaigns">> {
  const normalized = ctx.db.normalizeId("campaigns", campaignId);
  if (!normalized) throw new Error("Campaign not found");
  const campaign = await ctx.db.get(normalized);
  if (!campaign || campaign.userId !== userId) {
    throw new Error("Campaign not found");
  }
  await requireBrandAccess(ctx, userId, campaign.brandId);
  return campaign;
}

/**
 * Shared ADR0004 access rule for legacy `posts` rows: rows created after the
 * ownership fix carry a userId and are owner-only; historical ownerless rows
 * stay editable only by Corvo workspace members.
 */
export async function requireLegacyPostAccess(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  post: Doc<"posts">
): Promise<void> {
  if (post.userId && post.userId !== userId) {
    throw new Error("Post not found");
  }
  if (!post.userId) await requireBrandAccess(ctx, userId, "corvo");
}

export async function getOwnedLegacyPost(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  postId: string
): Promise<Doc<"posts">> {
  const normalized = ctx.db.normalizeId("posts", postId);
  if (!normalized) throw new Error("Post not found");
  const post = await ctx.db.get(normalized);
  if (!post) throw new Error("Post not found");
  await requireLegacyPostAccess(ctx, userId, post);
  return post;
}

/**
 * Non-throwing membership probe for listing surfaces: callers without the
 * brand simply do not see the rows that require it.
 */
export async function isCorvoWorkspaceMember(
  ctx: QueryCtx | MutationCtx,
  userId: string
): Promise<boolean> {
  const memberships = await ctx.db
    .query("v2BrandMemberships")
    .withIndex("by_user_and_brand", (q) =>
      q.eq("userId", userId).eq("brandId", "corvo")
    )
    .take(2);
  return memberships.length > 0;
}

export async function audit(
  ctx: MutationCtx,
  params: {
    userId: string;
    brandId: BrandId;
    postId?: Doc<"v2Posts">["_id"];
    intentId?: Doc<"v2PublishingIntents">["_id"];
    action: string;
    summary: string;
    metadata?: unknown;
  }
) {
  await ctx.db.insert("v2AuditEvents", {
    ...params,
    createdAt: Date.now(),
  });
}

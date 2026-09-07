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

export async function requireUserId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) throw new Error("Unauthorized");
  return identity.subject;
}

export async function requireBrandAccess(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  brandId: BrandId
) {
  const membership = await ctx.db
    .query("v2BrandMemberships")
    .withIndex("by_user_and_brand", (q) =>
      q.eq("userId", userId).eq("brandId", brandId)
    )
    .first();

  if (!membership) throw new Error("Brand access denied");
  return membership;
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

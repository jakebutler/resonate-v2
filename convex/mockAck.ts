import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { getOwnedCampaign, requireUserId } from "./campaignAccess";

const TOKEN_TTL_MS = 10 * 60 * 1000;

/**
 * D-21: mock acknowledgment must be a server-verifiable artifact, not a
 * client-asserted boolean. The confirm dialog mints a short-lived,
 * single-campaign, single-user token; grounded-generation mutations refuse to
 * run without one. Fail-closed: no token, no generation.
 */
function randomToken() {
  let token = "";
  for (let index = 0; index < 4; index += 1) {
    token += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, "0");
  }
  return token;
}

export const requestMockAcknowledgment = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const now = Date.now();
    const token = randomToken();
    await ctx.db.insert("mockAcknowledgments", {
      token,
      userId,
      campaignId: campaign._id,
      expiresAt: now + TOKEN_TTL_MS,
      createdAt: now,
    });
    return { token, expiresAt: now + TOKEN_TTL_MS };
  },
});

/**
 * Verifies a minted token server-side and consumes it: a token unlocks at most
 * one grounded-generation mutation (the UI mints a fresh token per action).
 * False means the gate stays closed.
 */
export async function verifyMockAcknowledgment(
  ctx: MutationCtx,
  input: { campaignId: string; userId: string; token: string }
): Promise<boolean> {
  if (!input.token) return false;
  const normalized = ctx.db.normalizeId("campaigns", input.campaignId);
  if (!normalized) return false;
  const record = await ctx.db
    .query("mockAcknowledgments")
    .withIndex("by_token", (q) => q.eq("token", input.token))
    .first();
  if (!record) return false;
  if (
    record.userId !== input.userId ||
    record.campaignId !== normalized ||
    record.expiresAt <= Date.now() ||
    record.consumedAt !== undefined
  ) {
    return false;
  }
  await ctx.db.patch(record._id, { consumedAt: Date.now() });
  return true;
}

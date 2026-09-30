import schema from "../convex/schema";
import type { TestConvex } from "convex-test";
import {
  destinationIdentity,
  type BufferDestination,
} from "../lib/bufferContracts";
export async function seedCapacity(
  t: TestConvex<typeof schema>,
  userId: string,
  brandId: "corvo" | "lower-db",
  destination: BufferDestination,
  limit = 10,
) {
  const identity = destinationIdentity(destination);
  await t.run(async (ctx) => {
    const old = await ctx.db
      .query("queueConstraints")
      .withIndex("by_user_and_identity", (q) =>
        q.eq("userId", userId).eq("identity", identity),
      )
      .first();
    if (!old)
      await ctx.db.insert("queueConstraints", {
        userId,
        brandId,
        identity,
        channelId: destination.channelId,
        organizationId: destination.organizationId,
        channelLimit: limit,
        organizationLimit: limit,
        actor: userId,
        evidence: "Sanitized fixture queue ceiling",
        checkedAt: Date.now(),
        revision: 1,
      });
    await ctx.db.insert("queueObservations", {
      userId,
      brandId,
      identity,
      checkedAt: Date.now(),
      observation: {
        identity,
        channelId: destination.channelId,
        organizationId: destination.organizationId,
        checkedAt: Date.now(),
        complete: true,
        providerPosts: [],
        organizationLimit: limit,
      },
    });
  });
}

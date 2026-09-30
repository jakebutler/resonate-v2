import { v } from "convex/values";
export const queueObservationValidator = v.object({
  identity: v.string(),
  channelId: v.string(),
  organizationId: v.string(),
  checkedAt: v.number(),
  complete: v.boolean(),
  providerPosts: v.array(
    v.object({
      id: v.string(),
      channelId: v.string(),
      status: v.string(),
      dueAt: v.optional(v.string()),
    }),
  ),
  organizationLimit: v.optional(v.number()),
  error: v.optional(v.string()),
  apiWindows: v.optional(
    v.array(
      v.object({
        policy: v.string(),
        remaining: v.number(),
        resetsAt: v.number(),
      }),
    ),
  ),
});

import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
export async function priorBufferAttempts(
  ctx: QueryCtx | MutationCtx,
  postId: Id<"v2Posts">,
) {
  const rows = await ctx.db
    .query("v2PublishAttempts")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .order("desc")
    .take(101);
  return {
    rows: rows.filter(
      (r) =>
        r.providerId === "buffer",
    ),
    overflow: rows.length > 100,
  };
}
export async function priorDispatchHold(
  ctx: QueryCtx | MutationCtx,
  postId: Id<"v2Posts">,
) {
  const { rows, overflow } = await priorBufferAttempts(ctx, postId);
  if (overflow)
    return "Attempt history exceeds this bounded dispatch review; reconcile first.";
  if (rows.some((r) => r.status === "pending" || r.status === "ambiguous"))
    return "A prior attempt is pending or uncertain; reconcile before retrying.";
  if (rows.some((r) => r.status === "success" || r.providerPostId))
    return "An accepted provider receipt already exists for this post; inspect delivery history instead of resubmitting.";
  return null;
}

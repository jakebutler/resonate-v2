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
    rows: rows.filter((r) => r.providerId === "buffer"),
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

// A confirmed deletion permits date planning, while submission still retains
// the original no-replay guard. An uncertain or unrelated attempt never does.
export async function providerScheduleHold(
  ctx: QueryCtx | MutationCtx,
  postId: Id<"v2Posts">,
) {
  const state = await ctx.db
    .query("v2ProviderStates")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .order("desc")
    .first();
  if (
    state?.providerId === "buffer" &&
    ["cancelled", "removed"].includes(state.status)
  ) {
    const { rows, overflow } = await priorBufferAttempts(ctx, postId);
    if (
      !overflow &&
      rows.every(
        (r) =>
          !["pending", "ambiguous"].includes(r.status) &&
          (!(r.status === "success" || r.providerPostId) ||
            Boolean(
              state.providerPostId && r.providerPostId === state.providerPostId,
            )),
      )
    )
      return null;
  }
  const hold = await priorDispatchHold(ctx, postId);
  if (hold) return hold;
  if (
    state?.providerId === "buffer" &&
    !["cancelled", "removed", "not-submitted"].includes(state.status) &&
    (state.providerPostId ||
      [
        "submitted",
        "cancel-requested",
        "cancel-intent-recorded",
        "needs-review",
      ].includes(state.status))
  ) {
    return "A provider receipt or uncertain dispatch requires reconciliation before changing dates.";
  }
  return null;
}

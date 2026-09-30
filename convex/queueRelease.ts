import { queueCapacity } from "./queuePlanning";
import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  audit,
  brandIdValidator,
  requireUserId,
  requireBrandAccess,
} from "./campaignAccess";
import { ownedSeries, seriesPost } from "./series";
import { bufferSubmissionContext } from "./publishing";
import {
  dispatchCapacity,
  releasePin,
  reviewReservationsHold,
} from "./queueDispatch";
import { reviewRow } from "./seriesReview";
type Ctx = QueryCtx | MutationCtx;
async function own(ctx: Ctx, userId: string, id: Id<"queueReleaseReviews">) {
  const review = await ctx.db.get(id);
  if (!review || review.userId !== userId)
    throw new Error("Queue review not found");
  const role = await requireBrandAccess(ctx, userId, review.brandId);
  return { review, role };
}
export const prepare = mutation({
  args: {
    brandId: brandIdValidator,
    seriesId: v.optional(v.id("postSeries")),
    postIds: v.array(v.id("v2Posts")),
  },
  returns: v.id("queueReleaseReviews"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const role = await requireBrandAccess(ctx, userId, args.brandId);
    if (
      role.role === "viewer" ||
      !args.postIds.length ||
      args.postIds.length > 20 ||
      new Set(args.postIds).size !== args.postIds.length
    )
      throw new Error("Editor access and 1–20 distinct posts required.");
    const series = args.seriesId
      ? await ownedSeries(ctx, userId, args.seriesId, true)
      : null;
    if (series && series.brandId !== args.brandId)
      throw new Error("Series brand mismatch");
    const rows = [];
    let bytes = 0;
    let remaining: number | null = null;
    let firstCapacity:
      | Awaited<ReturnType<typeof dispatchCapacity>>["capacity"]
      | null = null;
    for (const id of args.postIds) {
      const post = await seriesPost(ctx, userId, args.brandId, id);
      if (post.channelId !== "linkedin")
        throw new Error("Queue review accepts LinkedIn posts only.");
      if (
        series &&
        !(await ctx.db
          .query("seriesPostLinks")
          .withIndex("by_series_and_post", (q) =>
            q.eq("seriesId", series._id).eq("postId", id),
          )
          .first())
      )
        throw new Error("Post is not a series member.");
      const allocation = await dispatchCapacity(
        ctx,
        post,
        firstCapacity ?? undefined,
      );
      firstCapacity ??= allocation.capacity;
      remaining ??= allocation.capacity.projection.availableForBacklog ?? 0;
      let context = await bufferSubmissionContext(
        ctx,
        {
          postId: id,
          userId,
        },
        allocation.capacity,
      );
      let retry = false;
      if (
        !context.eligible &&
        context.reason === "Duplicate submission prevented."
      ) {
        const retryContext = await bufferSubmissionContext(
          ctx,
          { postId: id, userId, retry: true },
          allocation.capacity,
        );
        if (retryContext.eligible) {
          context = retryContext;
          retry = true;
        }
      }
      const pin = await releasePin(ctx, post, allocation.capacity);
      const row = await reviewRow(ctx, post, allocation.capacity);
      const snapshot = {
        ...row.snapshot,
        pin: pin.facts,
        destination: allocation.capacity.destination,
        payloadHash: pin.payloadHash,
        capacity: allocation.capacity.projection,
      };
      const overAllocation =
        context.eligible && !allocation.reservation && remaining <= 0;
      if (context.eligible && !allocation.reservation && !overAllocation)
        remaining--;
      const data = {
        postId: id,
        reviewVersion: pin.version,
        payloadHash: pin.payloadHash,
        retry,
        snapshot,
        status:
          context.eligible && !overAllocation
            ? ("ready" as const)
            : ("held" as const),
        reason: overAllocation
          ? "Selection exceeds capacity after retained reservations."
          : context.eligible
            ? undefined
            : context.reason,
        updatedAt: Date.now(),
      };
      const size = new TextEncoder().encode(JSON.stringify(data)).length;
      if (size > 300000 || (bytes += size) > 6000000)
        throw new Error(
          "Queue packet exceeds bounded review size; select fewer/smaller posts.",
        );
      rows.push(data);
    }
    const reviewId = await ctx.db.insert("queueReleaseReviews", {
      userId,
      brandId: args.brandId,
      seriesId: args.seriesId,
      seriesRevision: series?.revision,
      postIds: args.postIds,
      snapshotId: firstCapacity?.snapshot?._id,
      reservations: firstCapacity?.reservations
        .filter((r) => r.status === "reserved")
        .map((r) => ({
          id: r._id,
          postId: r.postId,
          identity: r.identity,
          updatedAt: r.updatedAt,
        })),
      createdAt: Date.now(),
      status: "reviewed",
    });
    for (const row of rows)
      await ctx.db.insert("queueReleaseRows", { reviewId, ...row });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "queue.review_prepared",
      summary: `Reviewed exactly ${rows.length} payloads/destinations/dates; no provider submission.`,
      metadata: { reviewId, postIds: args.postIds },
    });
    return reviewId;
  },
});
async function rows(ctx: Ctx, id: Id<"queueReleaseReviews">) {
  return ctx.db
    .query("queueReleaseRows")
    .withIndex("by_review", (q) => q.eq("reviewId", id))
    .take(21);
}
export const latest = query({
  args: { brandId: brandIdValidator, seriesId: v.optional(v.id("postSeries")) },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    if (args.seriesId) await ownedSeries(ctx, userId, args.seriesId);
    const recent = await ctx.db
      .query("queueReleaseReviews")
      .withIndex("by_user_and_brand", (q) =>
        q.eq("userId", userId).eq("brandId", args.brandId),
      )
      .order("desc")
      .take(50);
    const review = recent.find((r) => r.seriesId === args.seriesId);
    if (!review) return null;
    const result = await rows(ctx, review._id);
    let stale = Date.now() - review.createdAt > 300000;
    const sharedCapacity = await queueCapacity(ctx, userId, review.brandId);
    let packetHold = await reviewReservationsHold(ctx, review, sharedCapacity);
    if (review.seriesId) {
      const series = await ownedSeries(ctx, userId, review.seriesId);
      if (series.revision !== review.seriesRevision)
        packetHold ??= "Series membership changed; review again.";
    }
    stale ||= Boolean(packetHold);
    const checked = [];
    for (const row of result) {
      let staleReason: string | null =
        row.status === "ready" ? packetHold : null;
      if (row.status === "ready") {
        try {
          const post = await seriesPost(
            ctx,
            userId,
            review.brandId,
            row.postId,
          );
          const capacity = (await dispatchCapacity(ctx, post, sharedCapacity))
            .capacity;
          const pin = await releasePin(ctx, post, capacity);
          const context = await bufferSubmissionContext(
            ctx,
            {
              postId: row.postId,
              userId,
              retry: row.retry,
            },
            capacity,
          );
          if (pin.version !== row.reviewVersion || !context.eligible)
            staleReason ??= !context.eligible
              ? context.reason
              : "Review facts changed; prepare a new review.";
        } catch {
          staleReason = "Post or brand access changed.";
        }
        if (staleReason) stale = true;
      }
      checked.push({ ...row, staleReason });
    }

    return { review, rows: checked, stale };
  },
});
export const read = internalQuery({
  args: { reviewId: v.id("queueReleaseReviews"), userId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { review } = await own(ctx, args.userId, args.reviewId);
    return {
      review,
      rows: await rows(ctx, review._id),
      observation: review.snapshotId
        ? await ctx.db.get(review.snapshotId)
        : null,
    };
  },
});
export const begin = internalMutation({
  args: {
    reviewId: v.id("queueReleaseReviews"),
    userId: v.string(),
    runId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const { review, role } = await own(ctx, args.userId, args.reviewId);
    const result = await rows(ctx, review._id);
    if (role.role === "viewer") throw new Error("Editor access required");
    if (review.status === "complete" || review.status === "stopped")
      return {
        execute: false,
        reason:
          review.reason ??
          "This batch is finished. Prepare a new review for remaining posts.",
      };
    if ((review.claimedUntil ?? 0) > Date.now())
      return {
        execute: false,
        reason:
          "This queue batch is already running; inspect its durable receipts.",
      };
    const sharedCapacity = await queueCapacity(
      ctx,
      args.userId,
      review.brandId,
    );
    let reason: string | null =
      Date.now() - review.createdAt > 300000
        ? "Queue review expired; refresh capacity and prepare a new review."
        : null;
    reason ??= await reviewReservationsHold(ctx, review, sharedCapacity);
    if (review.seriesId) {
      const series = await ownedSeries(ctx, args.userId, review.seriesId, true);
      if (series.revision !== review.seriesRevision)
        reason = "Series membership changed; review again.";
    }
    const dispatchable: Id<"queueReleaseRows">[] = [];
    for (const row of result) {
      if (row.status === "queued") continue;
      if (row.attemptId) {
        const attempt = await ctx.db.get(row.attemptId);
        if (
          row.status === "executing" &&
          attempt?.status === "success" &&
          attempt.providerPostId &&
          !attempt.providerPostId.startsWith("mock-") &&
          ["queued", "publishing", "published"].includes(
            attempt.observedDeliveryStatus ?? "",
          )
        ) {
          await ctx.db.patch(row._id, {
            status: "queued",
            providerPostId: attempt.providerPostId,
            deliveryStatus: attempt.observedDeliveryStatus,
            reason: undefined,
            updatedAt: Date.now(),
          });
          continue;
        }
        reason =
          "Interrupted or uncertain create requires receipt reconciliation; no automatic replay.";
        await ctx.db.patch(row._id, {
          status: "needs-review",
          reason,
          updatedAt: Date.now(),
        });
        continue;
      }
      if (row.status !== "ready") {
        reason ??=
          "Selected rows include holds; prepare a review of eligible posts only.";
        continue;
      }
      const post = await seriesPost(
        ctx,
        args.userId,
        review.brandId,
        row.postId,
      );
      const capacity = (await dispatchCapacity(ctx, post, sharedCapacity))
        .capacity;
      const pin = await releasePin(ctx, post, capacity);
      const context = await bufferSubmissionContext(
        ctx,
        {
          postId: row.postId,
          userId: args.userId,
          retry: row.retry,
        },
        capacity,
      );
      if (row.reviewVersion !== pin.version || !context.eligible) {
        const why = !context.eligible
          ? context.reason
          : "Payload, destination, schedule, article evidence, reservation or capacity review changed.";
        reason ??= why;
        await ctx.db.patch(row._id, {
          status: "held",
          reason: why,
          updatedAt: Date.now(),
        });
      } else dispatchable.push(row._id);
    }
    if (reason) {
      await ctx.db.patch(review._id, {
        status: "stopped",
        reason,
        claimedUntil: undefined,
      });
      return { execute: false, reason };
    }
    await ctx.db.patch(review._id, {
      status: "running",
      runId: args.runId,
      claimedUntil: Date.now() + 300000,
      authorizedAt: review.authorizedAt ?? Date.now(),
      actor: args.userId,
    });
    await audit(ctx, {
      userId: args.userId,
      brandId: review.brandId,
      action: "queue.batch_authorized",
      summary: `Operator authorized only ${review.postIds.length} displayed posts at their saved exact dates.`,
      metadata: {
        reviewId: review._id,
        postIds: review.postIds,
        runId: args.runId,
      },
    });
    return {
      execute: true,
      rowIds: dispatchable,
    };
  },
});
export const finish = internalMutation({
  args: {
    reviewId: v.id("queueReleaseReviews"),
    userId: v.string(),
    runId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { review } = await own(ctx, args.userId, args.reviewId);
    if (review.runId !== args.runId) return null;
    const result = await rows(ctx, review._id);
    const complete = result.every((r) => r.status === "queued");
    for (const row of result.filter((r) => r.status === "ready"))
      await ctx.db.patch(row._id, {
        status: "held",
        reason:
          args.reason ??
          "Execution stopped; refresh and review remaining posts.",
        updatedAt: Date.now(),
      });
    await ctx.db.patch(review._id, {
      status: complete ? "complete" : "stopped",
      claimedUntil: undefined,
      reason: complete
        ? undefined
        : (args.reason ?? "Review remaining held posts."),
    });
    return null;
  },
});
export const hold = internalMutation({
  args: {
    rowId: v.id("queueReleaseRows"),
    userId: v.string(),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.rowId);
    if (!row) throw new Error("Queue row not found");
    await own(ctx, args.userId, row.reviewId);
    if (row.status === "ready")
      await ctx.db.patch(row._id, {
        status: "held",
        reason: args.reason,
        updatedAt: Date.now(),
      });
    return null;
  },
});

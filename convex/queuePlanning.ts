import {priorDispatchHold} from "./bufferAttempts";
import {companionSubmissionHold} from "./articleDependencies";
import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import {
  audit,
  brandIdValidator,
  requireBrandAccess,
  requireUserId,
} from "./campaignAccess";
import { ownedSeries, seriesPost } from "./series";
import { readDestination } from "./bufferDestinations";
import { queueObservationValidator } from "./queueValidators";
import { capacityProjection } from "../lib/queueCapacity";
import { destinationHold, destinationIdentity } from "../lib/bufferContracts";
import { scheduleToUtcIso } from "../lib/schedules";
import { fingerprintPostContent } from "../lib/domain";
import type { Id, Doc } from "./_generated/dataModel";
export async function queueCapacity(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  brandId: Doc<"v2Posts">["brandId"],
) {
  const destination = (await readDestination(ctx, userId, brandId))
    ?.destination;
  if (!destination)
    return {
      projection: capacityProjection(null, undefined, [], []),
      snapshot: null,
      constraint: null,
      reservations: [],
      claims: [],
      destination: null,
    };
  const identity = destinationIdentity(destination);
  const snapshot = await ctx.db
    .query("queueObservations")
    .withIndex("by_user_and_brand", (q) =>
      q.eq("userId", userId).eq("brandId", brandId),
    )
    .order("desc")
    .first();
  const constraint = await ctx.db
    .query("queueConstraints")
    .withIndex("by_user_and_identity", (q) =>
      q.eq("userId", userId).eq("identity", identity),
    )
    .first();
  const reservations = await ctx.db
    .query("queueReservations")
    .withIndex("by_org_and_status", (q) =>
      q.eq("organizationId", destination.organizationId).eq("status","reserved"),
    )
    .take(1001);
  const claims:Doc<"queueDispatchClaims">[]=[];
  for(const status of ["active","uncertain","confirmed"] as const)claims.push(...await ctx.db.query("queueDispatchClaims").withIndex("by_org_and_status",q=>q.eq("organizationId",destination.organizationId).eq("status",status)).take(1001));

  const legacy = [];
  let legacyComplete = true;
  for (const status of ["pending", "ambiguous"] as const) {
    const attempts = await ctx.db
      .query("v2PublishAttempts")
      .withIndex("by_provider_and_status", (q) =>
        q.eq("providerId", "buffer").eq("status", status),
      )
      .take(201);
    if (attempts.length > 200) legacyComplete = false;
    for (const attempt of attempts) {
      if (claims.some((c) => c.attemptId === attempt._id) || attempt.providerPostId?.startsWith("mock-")) continue;
      const attributed = await ctx.db.query("queueDispatchClaims")
        .withIndex("by_attempt", (q) => q.eq("attemptId", attempt._id)).first();
      if (attributed && attributed.organizationId !== destination.organizationId) continue;
      // Only unattributed legacy uncertainty can affect every organization.
      // A pending same-organization attempt without an active claim also holds.
      legacyComplete = false;
      if (
        attempt.userId === userId &&
        attempt.submissionSnapshot.brandId === brandId &&
        !claims.some((c) => c.attemptId === attempt._id)
      )
        legacy.push({
          providerPostId: attempt.providerPostId,
          status: "uncertain" as const,
          channelId: destination.channelId,
          organizationId: destination.organizationId,
          postId: attempt.postId,
        });
    }
  }
  const observation =
    snapshot?.identity === identity
      ? {
          ...snapshot.observation,
          complete:
            snapshot.observation.complete &&
            reservations.length <= 1000 &&
            claims.length <= 1000 &&
            legacyComplete,
        }
      : null;
  const channelLimit =
    constraint && Date.now() - constraint.checkedAt < 30 * 86400000
      ? constraint.channelLimit
      : undefined;
  const projection = capacityProjection(
    observation
      ? {
          ...observation,
          organizationLimit:
            observation.organizationLimit ??
            (channelLimit !== undefined
              ? constraint?.organizationLimit
              : undefined),
        }
      : null,
    channelLimit,
    reservations,
    [...claims, ...legacy],
  );
  const hold = destinationHold(destination, false);
  if (hold) {
    projection.unknown = hold;
    projection.availableForBacklog = null;
  }
  return {
    projection,
    snapshot: snapshot?.identity === identity ? snapshot : null,
    constraint,
    reservations,
    claims: [...claims, ...legacy],
    destination,
  };
}
export async function consumeReservation(
  ctx: MutationCtx,
  postId: Id<"v2Posts">,
  providerPostId: string,
  identity?: string,
) {
  const post = await ctx.db.get(postId);
  if (!post) return;
  const d = (await readDestination(ctx, post.userId, post.brandId))
    ?.destination;
  if (!d && !identity) return;
  const row = await ctx.db
    .query("queueReservations")
    .withIndex("by_post_and_identity", (q) =>
      q.eq("postId", postId).eq("identity", identity ?? destinationIdentity(d!)),
    )
    .first();
  if (row?.status === "reserved") {
    await ctx.db.patch(row._id, {
      status: "consumed",
      providerPostId,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      userId: post.userId,
      brandId: post.brandId,
      postId,
      action: "queue.reservation_consumed",
      summary: "Confirmed provider receipt consumed this local reservation.",
      metadata: { reservationId: row._id, providerPostId },
    });
  }
}
export const record = internalMutation({
  args: {
    userId: v.string(),
    brandId: brandIdValidator,
    observation: queueObservationValidator,
  },
  returns: v.id("queueObservations"),
  handler: async (ctx, args) => {
    await requireBrandAccess(ctx, args.userId, args.brandId);
    const d = (await readDestination(ctx, args.userId, args.brandId))
      ?.destination;
    if (!d || destinationIdentity(d) !== args.observation.identity)
      throw new Error("Destination changed during capacity refresh.");
    if (args.observation.providerPosts.length > 1000)
      throw new Error("Queue observation exceeds bounded storage.");
    return ctx.db.insert("queueObservations", {
      ...args,
      identity: args.observation.identity,
      checkedAt: args.observation.checkedAt,
    });
  },
});
export const context = internalQuery({
  args: { userId: v.string(), brandId: brandIdValidator },
  returns: v.any(),
  handler: async (ctx, args) => {
    await requireBrandAccess(ctx, args.userId, args.brandId);
    return readDestination(ctx, args.userId, args.brandId);
  },
});
export const confirmConstraint = mutation({
  args: {
    brandId: brandIdValidator,
    identity: v.string(),
    channelLimit: v.number(),
    organizationLimit: v.optional(v.number()),
    dailyLimit: v.optional(v.number()),
    evidence: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const role = await requireBrandAccess(ctx, userId, args.brandId);
    const d = (await readDestination(ctx, userId, args.brandId))?.destination;
    if (
      role.role === "viewer" ||
      !d ||
      destinationIdentity(d) !== args.identity ||
      !Number.isSafeInteger(args.channelLimit) ||
      args.channelLimit < 0 ||
      args.channelLimit > 100000 ||
      (args.organizationLimit !== undefined &&
        (!Number.isSafeInteger(args.organizationLimit) ||
          args.organizationLimit < 0)) ||
      (args.dailyLimit !== undefined &&
        (!Number.isSafeInteger(args.dailyLimit) || args.dailyLimit < 0)) ||
      !args.evidence.trim() ||
      args.evidence.length > 500
    )
      throw new Error(
        "Confirm the displayed account's actual plan ceiling and evidence.",
      );
    const old = await ctx.db
      .query("queueConstraints")
      .withIndex("by_user_and_identity", (q) =>
        q.eq("userId", userId).eq("identity", args.identity),
      )
      .first();
    const row = {
      ...args,
      userId,
      channelId: d.channelId,
      organizationId: d.organizationId,
      actor: userId,
      checkedAt: Date.now(),
      revision: (old?.revision ?? 0) + 1,
    };
    if (old) await ctx.db.patch(old._id, row);
    else await ctx.db.insert("queueConstraints", row);
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "queue.constraint_confirmed",
      summary:
        "Operator confirmed a local planning constraint for the displayed account.",
      metadata: {
        identity: args.identity,
        channelLimit: args.channelLimit,
        dailyLimit: args.dailyLimit,
      },
    });
    return null;
  },
});
export const reserve = mutation({
  args: { seriesId: v.id("postSeries"), postId: v.id("v2Posts") },
  returns: v.id("queueReservations"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const series = await ownedSeries(ctx, userId, args.seriesId, true);
    const post = await seriesPost(ctx, userId, series.brandId, args.postId);
    if (
      post.channelId !== "linkedin" ||
      !(await ctx.db
        .query("seriesPostLinks")
        .withIndex("by_series_and_post", (q) =>
          q.eq("seriesId", series._id).eq("postId", post._id),
        )
        .first())
    )
      throw new Error("Reserve a linked LinkedIn post.");
    const d = (await readDestination(ctx, userId, post.brandId))?.destination;
    if (!d)
      throw new Error(
        "Verify the destination before reserving local capacity.",
      );
    const hold = destinationHold(d, false);
    if (hold) throw new Error(hold);
    const state = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .order("desc")
      .first();
    if (
      state?.providerPostId &&
      !["cancelled", "removed"].includes(state.status)
    )
      throw new Error(
        "A provider receipt already holds this post's slot; no additional reservation is needed.",
      );
    const identity = destinationIdentity(d);
    const old = await ctx.db
      .query("queueReservations")
      .withIndex("by_post_and_identity", (q) =>
        q.eq("postId", post._id).eq("identity", identity),
      )
      .first();
    if (old?.status === "consumed")
      throw new Error(
        "This reservation was already consumed by a provider receipt.",
      );
    if (old?.status === "reserved") return old._id;
    const row = {
      userId,
      brandId: post.brandId,
      ...args,
      identity,
      channelId: d.channelId,
      organizationId: d.organizationId,
      status: "reserved" as const,
      actor: userId,
      updatedAt: Date.now(),
    };
    const id = old
      ? (await ctx.db.patch(old._id, row), old._id)
      : await ctx.db.insert("queueReservations", row);
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: post._id,
      action: "queue.reserve",
      summary:
        "Reserved one Resonate planning slot; no remote Buffer slot was reserved.",
      metadata: { reservationId: id, identity },
    });
    return id;
  },
});
export const release = mutation({
  args: { reservationId: v.id("queueReservations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const row = await ctx.db.get(args.reservationId);
    if (!row || row.userId !== userId) throw new Error("Reservation not found");
    await ownedSeries(ctx, userId, row.seriesId, true);
    await ctx.db.patch(row._id, {
      status: "released",
      actor: userId,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      brandId: row.brandId,
      postId: row.postId,
      action: "queue.reservation_released",
      summary:
        "Operator explicitly released a local planning reservation; provider queue unchanged.",
      metadata: args,
    });
    return null;
  },
});
export async function buildQueuePlan(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  args: { brandId: Doc<"v2Posts">["brandId"]; seriesId?: Id<"postSeries"> },
) {
  await requireBrandAccess(ctx, userId, args.brandId);
  if (args.seriesId) {
    const series = await ownedSeries(ctx, userId, args.seriesId);
    if (series.brandId !== args.brandId)
      throw new Error("Series brand mismatch");
  }
  const capacity = await queueCapacity(ctx, userId, args.brandId);
  const rows = await ctx.db
    .query("v2Posts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(501);
  const candidates = [];
  let remaining = capacity.projection.availableForBacklog ?? 0;
  for (const post of rows
    .slice(0, 500)
    .filter((p) => p.brandId === args.brandId && p.channelId === "linkedin")) {
    if (
      args.seriesId &&
      !(await ctx.db
        .query("seriesPostLinks")
        .withIndex("by_series_and_post", (q) =>
          q.eq("seriesId", args.seriesId!).eq("postId", post._id),
        )
        .first())
    )
      continue;
    const intent = await ctx.db
      .query("v2PublishingIntents")
      .withIndex("by_post_and_updated_at", (q) => q.eq("postId", post._id))
      .order("desc")
      .first();
    const state = await ctx.db
      .query("v2ProviderStates")
      .withIndex("by_post", (q) => q.eq("postId", post._id))
      .order("desc")
      .first();
    const priorHold=await priorDispatchHold(ctx,post._id);
    const reservation = capacity.reservations.find(
      (r) => r.postId === post._id && r.status === "reserved",
    );
    let dueAt: string | null = null;
    let reason: string | null = null;
    if (
      post.approvalState !== "approved" ||
      intent?.approvalState !== "approved" ||
      intent.contentFingerprint !==
        fingerprintPostContent({
          title: post.title,
          content: post.content,
          linkedinFirstComment: post.linkedinFirstComment,
        })
    )
      reason = "Editorial approval required.";
    else if (priorHold) reason=priorHold;
    else if (
      state?.providerPostId &&
      !["cancelled", "removed"].includes(state.status)
    )
      reason = `Existing provider receipt: ${state.status}.`;
    else if (!post.scheduledDate || !post.scheduledTime)
      reason = "Save an exact local date and time.";
    else {
      try {
        dueAt = scheduleToUtcIso({
          scheduledDate: post.scheduledDate,
          scheduledTime: post.scheduledTime,
          timezone: post.timezone,
        });
        if (Date.parse(dueAt) <= Date.now())
          reason = "Scheduled time has passed; review a new date explicitly.";
      } catch {
        reason = "Invalid date, IANA timezone or DST local time.";
      }
    }
    reason ??= await companionSubmissionHold(ctx,post);
    reason ??= destinationHold(
      capacity.destination,
      Boolean(post.linkedinFirstComment?.trim()),
    );
    reason ??= capacity.projection.unknown;
    if (!reason) {
      if (reservation)
        reason = "Reserved launch/follow-up slot; review this post explicitly.";
      else if (remaining <= 0)
        reason =
          capacity.projection.channelFree === 0
            ? "Queue full."
            : "Capacity reserved or allocated to another reviewed candidate.";
      else remaining--;
    }
    candidates.push({
      post,
      dueAt,
      eligible: reason === null,
      hold: reason,
      reservationId: reservation?._id,
      providerState: state,
    });
  }
  const ownReservations=capacity.destination?await ctx.db.query("queueReservations").withIndex("by_identity",q=>q.eq("identity",destinationIdentity(capacity.destination!))).order("desc").take(501):[];
  return {
    ...capacity,
    reservations: ownReservations.slice(0,500).filter((r) => r.userId === userId),
    claims: capacity.claims.map((c) => ({
      status: c.status,
      providerPostId: c.providerPostId,
    })),
    candidates,
    partial: rows.length > 500||ownReservations.length>500,
  };
}
export const plan = query({
  args: { brandId: brandIdValidator, seriesId: v.optional(v.id("postSeries")) },
  returns: v.any(),
  handler: async (ctx, args) =>
    buildQueuePlan(ctx, await requireUserId(ctx), args),
});
export const saveDryRun = mutation({
  args: { brandId: brandIdValidator, seriesId: v.optional(v.id("postSeries")) },
  returns: v.id("queuePlans"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const role = await requireBrandAccess(ctx, userId, args.brandId);
    if (role.role === "viewer") throw new Error("Editor access required");
    const plan = await buildQueuePlan(ctx, userId, args);
    const id = await ctx.db.insert("queuePlans", {
      ...args,
      userId,
      checkedAt: Date.now(),
      snapshotId: plan.snapshot?._id,
      capacity: plan.projection,
      rows: plan.candidates.map((row) => ({
        postId: row.post._id,
        dueAt: row.dueAt,
        hold: row.hold,
        eligible: row.eligible,
      })),
    });
    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "queue.dry_run",
      summary:
        "Saved capacity and hold reasons for a read-only queue plan; no provider mutation.",
      metadata: {
        planId: id,
        eligible: plan.candidates.filter((row) => row.eligible).length,
        held: plan.candidates.filter((row) => !row.eligible).length,
      },
    });
    return id;
  },
});
export const lastPlan = query({
  args: { brandId: brandIdValidator },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return ctx.db
      .query("queuePlans")
      .withIndex("by_user_and_brand", (q) =>
        q.eq("userId", userId).eq("brandId", args.brandId),
      )
      .order("desc")
      .first();
  },
});

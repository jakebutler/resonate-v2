import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { scheduleToUtcIso } from "../lib/schedules";
import { queueCapacity } from "./queuePlanning";
import { destinationIdentity } from "../lib/bufferContracts";
import {
  socialReleaseVersion,
  postScheduleVersion,
  linkedInPayload,
} from "../lib/socialPayload";
import { latestPublication } from "./articleDependencies";
import { priorBufferAttempts } from "./bufferAttempts";
import { exactScheduleHold } from "../lib/articleContracts";
export async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export { priorBufferAttempts, priorDispatchHold } from "./bufferAttempts";
export async function dispatchCapacity(
  ctx: QueryCtx | MutationCtx,
  post: Doc<"v2Posts">,
  sharedCapacity?: Awaited<ReturnType<typeof queueCapacity>>,
) {
  const capacity =
    sharedCapacity ?? (await queueCapacity(ctx, post.userId, post.brandId));
  const own = capacity.reservations.find(
    (r) =>
      r.postId === post._id &&
      r.status === "reserved" &&
      r.identity === capacity.snapshot?.identity,
  );
  let reason = capacity.projection.unknown;
  if (
    !reason &&
    (capacity.projection.availableForBacklog ?? 0) + (own ? 1 : 0) <= 0
  )
    reason = "Queue capacity is full or retained for launch reservations.";
  reason ??= exactScheduleHold(post);
  if (!reason && capacity.constraint?.dailyLimit !== undefined) {
    const limit = capacity.constraint.dailyLimit;
    const localDay = (due: string) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: post.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(due));
    const day = localDay(
      scheduleToUtcIso({
        scheduledDate: post.scheduledDate!,
        scheduledTime: post.scheduledTime!,
        timezone: post.timezone,
      }),
    );
    const relevant =
      capacity.snapshot?.observation.providerPosts.filter(
        (p) => p.channelId === capacity.destination?.channelId,
      ) ?? [];
    const ids = new Set(relevant.map((p) => p.id));
    const claims = capacity.claims.filter(
      (c) =>
        c.channelId === capacity.destination?.channelId &&
        (!c.providerPostId || !ids.has(c.providerPostId)),
    );
    if (
      relevant.some((p) => !p.dueAt) ||
      claims.some((c) => !("dueAt" in c) || !c.dueAt)
    )
      reason =
        "Confirmed daily posting ceiling requires complete dated queue/claim evidence.";
    else {
      let used =
        relevant.filter((p) => localDay(p.dueAt!) === day).length +
        claims.filter(
          (c) => localDay((c as Doc<"queueDispatchClaims">).dueAt!) === day,
        ).length;
      const reserved = capacity.reservations.filter(
        (r) =>
          r.status === "reserved" &&
          r.channelId === capacity.destination?.channelId &&
          r.postId !== post._id &&
          !claims.some((c) => c.postId === r.postId),
      );
      if (reserved.length > 100)
        reason =
          "Daily reservation inspection exceeds the bounded review; reconcile first.";
      else
        for (const r of reserved) {
          const p = await ctx.db.get(r.postId);
          if (!p?.scheduledDate || !p.scheduledTime) {
            reason =
              "Reserved post dates are unknown for the confirmed daily posting ceiling.";
            break;
          }
          if (
            localDay(
              scheduleToUtcIso({
                scheduledDate: p.scheduledDate,
                scheduledTime: p.scheduledTime,
                timezone: p.timezone,
              }),
            ) === day
          )
            used++;
        }
      if (!reason && used >= limit)
        reason =
          "Confirmed daily posting ceiling is full or reserved for this exact date.";
    }
  }
  return { capacity, reservation: own ?? null, reason };
}
export async function releasePin(
  ctx: QueryCtx | MutationCtx,
  post: Doc<"v2Posts">,
  capacity: Awaited<ReturnType<typeof queueCapacity>>,
) {
  const parent = post.companionLink
    ? await latestPublication(
        ctx,
        post.companionLink.articlePostId as Id<"v2Posts">,
      )
    : null;
  const reservation = capacity.reservations.find(
    (r) =>
      r.postId === post._id &&
      r.identity === capacity.snapshot?.identity &&
      r.status === "reserved",
  );
  const priorFailure = (await priorBufferAttempts(ctx, post._id)).rows.find(
    (attempt) =>
      !attempt.providerPostId &&
      ["retryable-failure", "permanent-failure"].includes(attempt.status),
  );
  const facts = {
    editorial: await sha256(socialReleaseVersion(post)),
    schedule: postScheduleVersion(post),
    destination: capacity.destination,
    snapshotId: capacity.snapshot?._id ?? null,
    priorFailure: priorFailure
      ? { id: priorFailure._id, status: priorFailure.status }
      : null,
    constraint: capacity.constraint
      ? { id: capacity.constraint._id, revision: capacity.constraint.revision }
      : null,
    articleReceipt: parent
      ? {
          id: parent._id,
          key: parent.key,
          checkedAt: parent.evidence.checkedAt,
        }
      : null,
    reservation: reservation
      ? { id: reservation._id, updatedAt: reservation.updatedAt }
      : null,
  };
  return {
    version: await sha256(JSON.stringify(facts)),
    payloadHash: await sha256(
      JSON.stringify({
        content: linkedInPayload(post.content, post.platformSettings),
        firstComment: post.linkedinFirstComment?.trim() ?? null,
        due: postScheduleVersion(post),
        destination: capacity.destination
          ? destinationIdentity(capacity.destination)
          : null,
      }),
    ),
    facts,
  };
}
export async function allocateDispatch(
  ctx: MutationCtx,
  post: Doc<"v2Posts">,
  intentId: Id<"v2PublishingIntents">,
  attemptId: Id<"v2PublishAttempts">,
  pin: Awaited<ReturnType<typeof releasePin>>,
  capacity: Awaited<ReturnType<typeof queueCapacity>>,
) {
  const d = capacity.destination!;
  const identity = destinationIdentity(d);
  for (const key of [
    `organization:${d.organizationId}`,
    `destination:${identity}`,
  ]) {
    const guard = await ctx.db
      .query("queueDispatchGuards")
      .withIndex("by_identity", (q) => q.eq("identity", key))
      .first();
    if (guard) await ctx.db.patch(guard._id, { revision: guard.revision + 1 });
    else
      await ctx.db.insert("queueDispatchGuards", {
        identity: key,
        revision: 1,
      });
  }
  return ctx.db.insert("queueDispatchClaims", {
    userId: post.userId,
    postId: post._id,
    intentId,
    attemptId,
    identity,
    channelId: d.channelId,
    organizationId: d.organizationId,
    destination: d,
    reviewVersion: pin.version,
    snapshotId: capacity.snapshot!._id,
    dueAt: scheduleToUtcIso({
      scheduledDate: post.scheduledDate!,
      scheduledTime: post.scheduledTime!,
      timezone: post.timezone,
    }),
    status: "active",
    updatedAt: Date.now(),
  });
}
export async function reconcileAllocation(
  ctx: MutationCtx,
  attemptId: Id<"v2PublishAttempts">,
  status: "confirmed" | "released" | "uncertain",
  providerPostId?: string,
) {
  const claim = await ctx.db
    .query("queueDispatchClaims")
    .withIndex("by_attempt", (q) => q.eq("attemptId", attemptId))
    .first();
  if (claim)
    await ctx.db.patch(claim._id, {
      status,
      providerPostId: providerPostId ?? claim.providerPostId,
      updatedAt: Date.now(),
    });
  return claim;
}

/** Permit only this batch's confirmed consumption of the displayed reservation set. */
export async function reviewReservationsHold(
  ctx: QueryCtx | MutationCtx,
  review: Doc<"queueReleaseReviews">,
  capacity: Awaited<ReturnType<typeof queueCapacity>>,
) {
  const rows = await ctx.db
    .query("queueReleaseRows")
    .withIndex("by_review", (q) => q.eq("reviewId", review._id))
    .take(21);
  const ownConsumed = new Set(
    rows
      .filter(
        (r) =>
          r.status === "queued" &&
          r.providerPostId &&
          !r.providerPostId.startsWith("mock-"),
      )
      .map((r) => String(r.postId)),
  );
  const normalize = (
    rows: {
      id?: string;
      _id?: string;
      postId: string;
      identity: string;
      updatedAt: number;
    }[],
  ) =>
    JSON.stringify(
      rows
        .filter((r) => !ownConsumed.has(String(r.postId)))
        .map((r) => [r.id ?? r._id, r.postId, r.identity, r.updatedAt])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  return normalize(review.reservations ?? []) !==
    normalize(capacity.reservations.filter((r) => r.status === "reserved"))
    ? "Reviewed launch reservations changed; prepare a new queue review."
    : null;
}

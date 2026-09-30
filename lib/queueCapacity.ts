export const CAPACITY_MAX_AGE_MS = 5 * 60 * 1000;
export type QueueObservation = {
  identity: string;
  channelId: string;
  organizationId: string;
  checkedAt: number;
  complete: boolean;
  providerPosts: {
    id: string;
    channelId: string;
    status: string;
    dueAt?: string;
  }[];
  organizationLimit?: number;
  error?: string;
  apiWindows?: { policy: string; remaining: number; resetsAt: number }[];
};
export type DispatchAllocation = {
  providerPostId?: string;
  status: "active" | "uncertain" | "confirmed" | "released";
  channelId: string;
  organizationId: string;
  postId: string;
};
export function capacityProjection(
  observation: QueueObservation | null | undefined,
  channelLimit: number | undefined,
  reservations: {
    postId: string;
    providerPostId?: string;
    status: string;
    channelId: string;
    organizationId: string;
  }[],
  claims: DispatchAllocation[],
  now = Date.now(),
) {
  const providerIds = new Set(observation?.providerPosts.map((p) => p.id));
  const activeProvider = (observation?.providerPosts ?? []).filter((p) =>
    ["scheduled", "sending"].includes(p.status),
  );
  const channelUsed = activeProvider.filter(
    (p) => p.channelId === observation?.channelId,
  ).length;
  const organizationUsed = activeProvider.length;
  // Only unreflected dispatch claims count; a provider row consumes the slot once.
  const unresolved = claims.filter(
    (c) =>
      c.status !== "released" &&
      (!c.providerPostId || !providerIds.has(c.providerPostId)),
  );
  const channelClaims = unresolved.filter(
    (c) => c.channelId === observation?.channelId,
  ).length;
  const organizationClaims = unresolved.filter(
    (c) => c.organizationId === observation?.organizationId,
  ).length;
  const claimPosts = new Set(claims.filter(c => c.status !== "released").map((c) => c.postId));
  const unconsumed = reservations.filter(
    (r) =>
      r.status === "reserved" &&
      !claimPosts.has(r.postId) &&
      (!r.providerPostId || !providerIds.has(r.providerPostId)),
  );
  const channelReserved = unconsumed.filter(
    (r) => r.channelId === observation?.channelId,
  ).length;
  const organizationReserved = unconsumed.filter(
    (r) => r.organizationId === observation?.organizationId,
  ).length;
  let unknown: string | null = null;
  if (!observation) unknown = "Capacity has not been checked.";
  else if (!observation.complete)
    unknown = "Provider pagination is incomplete; capacity is unknown.";
  else if (
    now - observation.checkedAt > CAPACITY_MAX_AGE_MS ||
    observation.checkedAt > now + 60000
  )
    unknown = "Capacity observation is stale; refresh before review.";
  else if (
    channelLimit === undefined ||
    !Number.isSafeInteger(channelLimit) ||
    channelLimit < 0
  )
    unknown = "Confirm the destination's per-channel queue ceiling.";
  if (!unknown && observation?.organizationLimit === undefined)
    unknown = "Verify the organization queue ceiling.";
  const channelFree =
    channelLimit === undefined
      ? null
      : Math.max(0, channelLimit - channelUsed - channelClaims);
  const organizationFree =
    observation?.organizationLimit === undefined
      ? null
      : Math.max(
          0,
          observation.organizationLimit - organizationUsed - organizationClaims,
        );
  const available = unknown
    ? null
    : Math.max(
        0,
        Math.min(
          channelFree! - channelReserved,
          organizationFree === null
            ? Infinity
            : organizationFree - organizationReserved,
        ),
      );
  return {
    channelUsed,
    organizationUsed,
    channelFree,
    organizationFree,
    channelReserved,
    organizationReserved,
    channelClaims,
    organizationClaims,
    availableForBacklog: available,
    unknown,
  };
}

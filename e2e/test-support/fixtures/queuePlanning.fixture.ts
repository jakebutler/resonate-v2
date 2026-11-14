import { registerSyncFixture, type SyncFixture } from "./registry";

export type QueuePlanningFixture = {
  /** Every mutation udfPath, in wire order. */
  calls: string[];
  /** Flips the capacity observation stale for the next query round. */
  makeStale: () => void;
};

registerSyncFixture<QueuePlanningFixture>("queue-planning", () => {
  const calls: string[] = [];
  let saved = false;
  let stale = false;
  const destination = {
    channelId: "fixture-page",
    organizationId: "fixture-org",
    displayName: "Corvo Labs",
    handle: "corvo-labs-us",
    accountType: "Page",
    flagsVerified: true,
    disconnected: false,
    locked: false,
    queuePaused: false,
    checkedAt: Date.now(),
    firstComment: {
      value: "unknown",
      source: "unknown",
      checkedAt: Date.now(),
      evidence: "Sanitized fixture",
    },
  };
  const candidates = Array.from({ length: 10 }, (_, n) => ({
    post: {
      _id: `post-${n}`,
      brandId: "corvo",
      channelId: "linkedin",
      title: n < 2 ? `Launch ${n + 1}` : `Backlist ${n - 1}`,
      content: `Exact fixture copy ${n}`,
      scheduledDate: "2030-10-07",
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
    },
    dueAt: "2030-10-07T16:00:00.000Z",
    eligible: n >= 2,
    hold:
      n < 2
        ? "Reserved launch/follow-up slot; review this post explicitly."
        : null,
    ...(n < 2 ? { reservationId: `reservation-${n}` } : {}),
  }));
  return {
    fixture: { calls, makeStale: () => (stale = true) },
    handlers: {
      value: (path) => {
        if (path === "publishing:listBrands")
          return [{ brandId: "corvo", name: "Corvo Labs" }];
        if (path === "series:list") return [];
        if (path === "queuePlanning:lastPlan")
          return saved ? { checkedAt: Date.now(), rows: candidates } : null;
        if (path === "queuePlanning:plan")
          return {
            destination,
            projection: {
              channelUsed: 0,
              organizationUsed: 0,
              channelFree: 10,
              organizationFree: 100,
              channelReserved: 2,
              organizationReserved: 2,
              channelClaims: 0,
              organizationClaims: 0,
              availableForBacklog: stale ? null : 8,
              unknown: stale
                ? "Capacity observation is stale; refresh before review."
                : null,
            },
            snapshot: {
              checkedAt: Date.now() - (stale ? 400000 : 0),
              observation: {
                complete: true,
                organizationLimit: 100,
                apiWindows: [
                  { policy: "day", remaining: 200, resetsAt: Date.now() + 5000 },
                ],
              },
            },
            constraint: {
              channelLimit: 10,
              dailyLimit: 5,
              checkedAt: Date.now(),
              evidence: "Sanitized plan confirmation",
            },
            reservations: [],
            candidates: candidates.map((c) =>
              stale
                ? {
                    ...c,
                    eligible: false,
                    hold: "Capacity observation is stale; refresh before review.",
                  }
                : c,
            ),
            partial: false,
          };
        return null;
      },
      mutation: (path) => {
        calls.push(path);
        if (path === "queuePlanning:saveDryRun") saved = true;
        return "fixture-plan";
      },
    },
  } satisfies SyncFixture<QueuePlanningFixture>;
});

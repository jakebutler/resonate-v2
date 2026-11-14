import { registerSyncFixture, type SyncFixture } from "./registry";

export type QueueReleaseFixture = {
  /** Every mutation and action udfPath, in wire order. */
  calls: string[];
};

registerSyncFixture<QueueReleaseFixture>("queue-release", () => {
  const calls: string[] = [];
  let selected: string[] = [];
  let reviewCount = 0;
  let sent = false;
  const destination = {
    channelId: "fixture-page",
    organizationId: "fixture-org",
    displayName: "Corvo Labs",
    handle: "corvo-labs-us",
    accountType: "page",
    checkedAt: Date.now(),
    firstComment: { value: "unsupported", source: "operator-confirmed" },
  };
  const posts = Array.from({ length: 5 }, (_, n) => ({
    _id: `post-${n}`,
    brandId: "corvo",
    channelId: "linkedin",
    title: n < 2 ? `Launch ${n}` : `Backlog ${n}`,
    content: `Full final copy ${n}: 42%, number 1234 and https://corvolabs.com/blog/2000-01-01-fixture`,
    scheduledDate: "2030-10-07",
    scheduledTime: `09:0${n}`,
    timezone: "America/Los_Angeles",
    approvalState: "approved",
    companionLink: {
      canonicalUrl: "https://corvolabs.com/blog/2000-01-01-fixture",
      placement: "body",
    },
  }));
  return {
    fixture: { calls },
    handlers: {
      value: (path) => {
        if (path === "publishing:listBrands")
          return [{ brandId: "corvo", name: "Corvo Labs" }];
        if (path === "publishing:bufferLiveSubmissionEnabled")
          return { enabled: true };
        if (path === "series:list") return [];
        if (path === "queuePlanning:plan")
          return {
            destination,
            projection: {
              channelUsed: 0,
              organizationUsed: 0,
              channelReserved: 2,
              organizationReserved: 2,
              channelClaims: sent ? 2 : 0,
              organizationClaims: sent ? 2 : 0,
              channelFree: sent ? 8 : 10,
              organizationFree: sent ? 8 : 10,
              availableForBacklog: sent ? 6 : 8,
              unknown: null,
            },
            snapshot: {
              checkedAt: Date.now(),
              observation: { complete: true },
            },
            constraint: {
              channelLimit: 10,
              organizationLimit: 10,
              checkedAt: Date.now(),
            },
            reservations: posts
              .slice(0, 2)
              .map((p) => ({ postId: p._id, status: "reserved" })),
            candidates: posts.map((post, n) => ({
              post,
              dueAt: `2030-10-07T16:0${n}:00.000Z`,
              eligible: n >= 2 && (!sent || n === 4),
              hold:
                n < 2
                  ? "Reserved launch slot"
                  : sent && n === 2
                    ? "Known queued receipt"
                    : sent && n === 3
                      ? "Uncertain attempt: reconcile before retry"
                      : null,
              ...(n < 2 ? { reservationId: `resv-${n}` } : {}),
            })),
            partial: false,
          };
        if (path === "queueRelease:latest")
          return reviewCount
            ? {
                review: {
                  _id: `review-${reviewCount}`,
                  brandId: "corvo",
                  postIds: selected,
                  createdAt: Date.now(),
                  status:
                    sent && reviewCount === 1 ? "stopped" : "reviewed",
                  snapshotId: "capacity-fixture",
                  reservations: ["launch-0", "launch-1"],
                  reason:
                    sent && reviewCount === 1
                      ? "Ambiguous provider response; reconcile known attempt before retry."
                      : undefined,
                },
                stale: false,
                rows: selected.map((id, n) => {
                  const p = posts.find((p) => p._id === id)!;
                  const status =
                    sent && reviewCount === 1
                      ? n === 0
                        ? "queued"
                        : n === 1
                          ? "needs-review"
                          : "held"
                      : "ready";
                  return {
                    _id: `row-${id}`,
                    postId: id,
                    status,
                    deliveryStatus: status === "queued" ? "queued" : undefined,
                    payloadHash: "fixture-exact-payload-sha",
                    providerPostId:
                      status === "queued" ? "external-fixture-1" : undefined,
                    attemptId: n < 2 && sent ? `attempt-${n}` : undefined,
                    reason:
                      status === "needs-review"
                        ? "Uncertain create; inspect the retained attempt."
                        : status === "held"
                          ? "Batch stopped before this row; prepare a new review."
                          : undefined,
                    snapshot: {
                      post: p,
                      finalContent: p.content,
                      destination,
                      dueAt: `2030-10-07T16:0${p._id.slice(-1)}:00.000Z`,
                      articleReceipt: { _id: "publication-fixture" },
                      warnings: [
                        "Review stored source passage; approval is editorial only.",
                      ],
                    },
                  };
                }),
              }
            : null;
        return null;
      },
      mutation: (path, args) => {
        calls.push(path);
        let result: unknown = null;
        if (path === "queueRelease:prepare") {
          selected = (args as { postIds: string[] }).postIds;
          reviewCount++;
          result = `review-${reviewCount}`;
        }
        return result;
      },
      action: (path) => {
        calls.push(path);
        let result: unknown = null;
        if (path === "bufferLive:queueSelected") {
          sent = true;
          result = {
            started: true,
            reason: "Ambiguous response; batch stopped for reconciliation.",
          };
        }
        return result;
      },
    },
  } satisfies SyncFixture<QueueReleaseFixture>;
});

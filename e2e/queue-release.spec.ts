import { test, expect } from "@playwright/test";
test("explicit queue review renders mixed receipts and requires a new selection for remaining posts", async ({
  page,
}) => {
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
  await page.routeWebSocket(/\/api\/.*\/sync/, (socket) => {
    const qs = new Map<number, { queryId: number; udfPath: string }>();
    let version = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
    let tick = 0;
    function value(path: string) {
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
          snapshot: { checkedAt: Date.now(), observation: { complete: true } },
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
                status: sent && reviewCount === 1 ? "stopped" : "reviewed",
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
    }
    function send(querySet = version.querySet) {
      const ts = Buffer.alloc(8);
      ts.writeBigUInt64LE(BigInt(++tick));
      const endVersion = { ...version, querySet, ts: ts.toString("base64") };
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion,
          modifications: [...qs.values()].map((q) => ({
            type: "QueryUpdated",
            queryId: q.queryId,
            value: value(q.udfPath),
            journal: null,
            logLines: [],
          })),
        }),
      );
      version = endVersion;
    }
    socket.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "Authenticate") {
        const startVersion = version;
        version = { ...version, identity: version.identity + 1 };
        socket.send(
          JSON.stringify({
            type: "Transition",
            startVersion,
            endVersion: version,
            modifications: [],
          }),
        );
      }
      if (m.type === "ModifyQuerySet") {
        for (const q of m.modifications) {
          if (q.type === "Add") qs.set(q.queryId, q);
          else qs.delete(q.queryId);
        }
        send(m.newVersion);
      }
      if (m.type === "Mutation" || m.type === "Action") {
        calls.push(m.udfPath);
        let result: unknown = null;
        if (m.udfPath === "queueRelease:prepare") {
          selected = m.args[0].postIds;
          reviewCount++;
          result = `review-${reviewCount}`;
        }
        if (m.udfPath === "bufferLive:queueSelected") {
          sent = true;
          result = {
            started: true,
            reason: "Ambiguous response; batch stopped for reconciliation.",
          };
        }
        socket.send(
          JSON.stringify({
            type: m.type === "Action" ? "ActionResponse" : "MutationResponse",
            requestId: m.requestId,
            success: true,
            result,
            ...(m.type === "Mutation" ? { ts: version.ts } : {}),
            logLines: [],
          }),
        );
        send();
      }
    });
  });
  await page.goto("/queue");
  const panel = page.getByRole("region", { name: "Reviewed queue release" });
  await expect(
    panel.getByText("Select up to 20 approved posts.", { exact: false }),
  ).toBeVisible();
  expect(calls).toEqual([]);
  for (const n of [2, 3, 4])
    await panel
      .getByRole("checkbox", { name: new RegExp(`Backlog ${n}`) })
      .check();
  await panel.getByRole("button", { name: "Review eligible posts" }).click();
  await expect(
    panel.getByText(posts[2].content, { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText(/channel fixture-page · organization fixture-org/).first(),
  ).toBeVisible();
  await expect(
    panel.getByText(
      /2030-10-07 09:02 America\/Los_Angeles · UTC 2030-10-07T16:02/,
    ),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Queue 3 selected posts" }),
  ).toBeDisabled();
  await panel
    .getByRole("checkbox", {
      name: "I reviewed these exact posts, destination accounts and dates.",
    })
    .check();
  await panel.getByRole("button", { name: "Queue 3 selected posts" }).click();
  await expect(
    panel.getByRole("heading", { name: /Backlog 2 · queued/ }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Backlog 3 · needs-review" }),
  ).toBeVisible();
  await expect(
    panel.getByRole("heading", { name: "Backlog 4 · held" }),
  ).toBeVisible();
  await expect(
    panel.getByText(/Provider receipt: external-fixture-1/),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Queue 3 selected posts" }),
  ).toBeDisabled();
  await expect(page.getByText(/Invalid Date/)).toHaveCount(0);
  await page.screenshot({
    path: "test-results/queue-reviewed-mixed-receipts.png",
    fullPage: true,
  });
  await page.reload();
  await expect(
    panel.getByText(/Provider receipt: external-fixture-1/),
  ).toBeVisible();
  await panel.getByRole("checkbox", { name: /Backlog 2/ }).uncheck();
  await panel.getByRole("checkbox", { name: /Backlog 3/ }).uncheck();
  await panel.getByRole("button", { name: "Review eligible posts" }).click();
  await expect(
    panel.getByRole("button", { name: "Queue 1 selected posts" }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("heading", { name: "Backlog 4 · ready" }),
  ).toBeVisible();
  expect(calls).toEqual([
    "queueRelease:prepare",
    "bufferLive:queueSelected",
    "queueRelease:prepare",
  ]);
});

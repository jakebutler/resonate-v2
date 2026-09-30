import { test, expect } from "@playwright/test";
test("queue planning shows eight backlog slots and two durable reservations without submitting posts", async ({
  page,
}) => {
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
  await page.routeWebSocket(/\/api\/.*\/sync/, (socket) => {
    const qs = new Map<number, { queryId: number; udfPath: string }>();
    let version = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
    let tick = 0;
    function val(path: string) {
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
          constraint: { channelLimit: 10, dailyLimit: 5, checkedAt: Date.now(), evidence: "Sanitized plan confirmation" },
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
            value: val(q.udfPath),
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
      if (m.type === "Mutation") {
        calls.push(m.udfPath);
        if (m.udfPath === "queuePlanning:saveDryRun") saved = true;
        socket.send(
          JSON.stringify({
            type: "MutationResponse",
            requestId: m.requestId,
            success: true,
            result: "fixture-plan",
            ts: version.ts,
            logLines: [],
          }),
        );
        send();
      }
    });
  });
  await page.goto("/queue");
  await expect(page.getByText("8 slots available to backlog")).toBeVisible();
  await expect(page.getByText("8 eligible · 2 held")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Corvo Labs — LinkedIn Page" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Local reservations do not reserve slots/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Backlist 1", exact: true }),
  ).toHaveAttribute("href", "/?postId=post-2");
  await page.screenshot({
    path: "test-results/queue-eight-backlist-two-reservations.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save dry-run review" }).click();
  await expect(page.getByText(/Last saved dry run/)).toBeVisible();
  stale = true;
  await page.reload();
  await expect(page.getByText(/Capacity unknown:.*stale/)).toBeVisible();
  await expect(page.getByText("0 eligible · 10 held")).toBeVisible();
  await expect(page.getByText(/Last saved dry run/)).toBeVisible();
  expect(calls).toEqual(["queuePlanning:saveDryRun"]);
});

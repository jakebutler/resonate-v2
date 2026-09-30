import { test, expect } from "@playwright/test";
for (const scenario of [
  {
    url: "/queue?brandId=corvo&seriesId=owned-lower-db",
    path: "queuePlanning:plan",
    args: { brandId: "lower-db", seriesId: "owned-lower-db" },
    shot: "queue-owned-series-brand.png",
  },
  {
    url: "/queue?seriesId=invalid-id",
    path: "queuePlanning:plan",
    args: { brandId: "corvo" },
    shot: "queue-unavailable-series.png",
  },
  {
    url: "/?seriesId=owned-lower-db&seriesId=other",
    path: "publishing:listCalendarItems",
    args: { brandIds: ["lower-db"], seriesId: "owned-lower-db" },
    shot: "calendar-owned-series-brand.png",
  },
])
  test(`owned series URL resolves safely: ${scenario.url}`, async ({
    page,
  }) => {
    const calls: { path: string; args: Record<string, unknown> }[] = [];
    await page.routeWebSocket(/\/api\/.*\/sync/, (socket) => {
      const queries = new Map<
        number,
        { queryId: number; udfPath: string; args: Record<string, unknown> }
      >();
      let version = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
      let tick = 0;
      function value(path: string) {
        if (path === "publishing:listBrands")
          return [
            { brandId: "corvo", name: "Corvo Labs" },
            { brandId: "lower-db", name: "Lower DB" },
          ];
        if (path === "series:list")
          return [
            {
              _id: "owned-lower-db",
              brandId: "lower-db",
              title: "Lower DB series",
            },
            { _id: "other", brandId: "corvo", title: "Other series" },
          ];
        if (path === "publishing:listCalendarItems") return [];
        if (path === "publishing:bufferLiveSubmissionEnabled")
          return { enabled: false };
        if (path === "queuePlanning:plan")
          return {
            projection: {
              unknown: "Destination is unverified; refresh Connections.",
              availableForBacklog: null,
            },
            destination: null,
            snapshot: null,
            constraint: null,
            reservations: [],
            candidates: [],
            partial: false,
          };
        return null;
      }
      function send(querySet = version.querySet) {
        const ts = Buffer.alloc(8);
        ts.writeBigUInt64LE(BigInt(++tick));
        const next = { ...version, querySet, ts: ts.toString("base64") };
        socket.send(
          JSON.stringify({
            type: "Transition",
            startVersion: version,
            endVersion: next,
            modifications: [...queries.values()].map((q) => ({
              type: "QueryUpdated",
              queryId: q.queryId,
              value: value(q.udfPath),
              journal: null,
              logLines: [],
            })),
          }),
        );
        version = next;
      }
      socket.onMessage((raw) => {
        const m = JSON.parse(String(raw));
        if (m.type === "Authenticate") {
          const old = version;
          version = { ...version, identity: version.identity + 1 };
          socket.send(
            JSON.stringify({
              type: "Transition",
              startVersion: old,
              endVersion: version,
              modifications: [],
            }),
          );
        }
        if (m.type === "ModifyQuerySet") {
          for (const q of m.modifications) {
            if (q.type === "Add") {
              queries.set(q.queryId, q);
              calls.push({ path: q.udfPath, args: q.args[0] ?? {} });
            } else queries.delete(q.queryId);
          }
          send(m.newVersion);
        }
      });
    });
    await page.goto(scenario.url);
    await expect
      .poll(() => calls.filter((c) => c.path === scenario.path).length)
      .toBeGreaterThan(0);
    for (const call of calls.filter((c) => c.path === scenario.path))
      expect(call.args).toMatchObject(scenario.args);
    if (scenario.url.includes("invalid-id")) {
      expect(
        calls
          .filter((c) => c.path === scenario.path)
          .every((c) => !c.args.seriesId),
      ).toBe(true);
      await expect(
        page.getByText(
          "This series is unavailable. Showing the accessible brand queue.",
        ),
      ).toBeVisible();
    } else
      await expect(
        page.getByRole("option", { name: "Lower DB series" }),
      ).toHaveCount(1);
    await page.screenshot({
      path: `test-results/${scenario.shot}`,
      fullPage: true,
    });
  });

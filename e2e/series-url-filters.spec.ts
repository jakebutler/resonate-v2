import { test, expect } from "@playwright/test";
import { mockConvexSync } from "./test-support/mockConvexSync";
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
    invalidSeries: true,
  },
  {
    url: "/?seriesId=owned-lower-db&seriesId=other",
    path: "publishing:listCalendarItems",
    args: { brandIds: ["lower-db"], seriesId: "owned-lower-db" },
    shot: "calendar-owned-series-brand.png",
  },
  {
    url: "/?seriesId=invalid-id",
    path: "publishing:listCalendarItems",
    args: { brandIds: ["corvo"] },
    shot: "calendar-unavailable-series.png",
    invalidSeries: true,
    blockedCalendar: true,
  },
])
  test(`owned series URL resolves safely: ${scenario.url}`, async ({
    page,
  }) => {
    const calls: { path: string; args: Record<string, unknown> }[] = [];
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
    await mockConvexSync(page, {
      value,
      onQuery: (path, args) => calls.push({ path, args }),
    });
    await page.goto(scenario.url);

    if (scenario.blockedCalendar) {
      await expect(
        page.getByText(
          "This series is unavailable. Choose an accessible series or All series to view the calendar.",
        ),
      ).toBeVisible();
      expect(calls.filter((c) => c.path === scenario.path)).toHaveLength(0);
    } else {
      await expect
        .poll(() => calls.filter((c) => c.path === scenario.path).length)
        .toBeGreaterThan(0);
      for (const call of calls.filter((c) => c.path === scenario.path))
        expect(call.args).toMatchObject(scenario.args);
      if (scenario.invalidSeries) {
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
    }
    await page.screenshot({
      path: `test-results/${scenario.shot}`,
      fullPage: true,
    });

    if (scenario.blockedCalendar) {
      await page
        .getByRole("combobox", { name: "Calendar series filter" })
        .selectOption("");
      await expect
        .poll(() => calls.filter((c) => c.path === scenario.path).length)
        .toBeGreaterThan(0);
      for (const call of calls.filter((c) => c.path === scenario.path))
        expect(call.args).toMatchObject(scenario.args);
      expect(
        calls
          .filter((c) => c.path === scenario.path)
          .every((c) => !c.args.seriesId),
      ).toBe(true);
      await expect(page.getByText(/This series is unavailable/)).toHaveCount(0);
    }
  });

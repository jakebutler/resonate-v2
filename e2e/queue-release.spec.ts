import { test, expect } from "@playwright/test";
import { mockSyncFixture, type QueueReleaseFixture } from "./test-support/fixtures";

test("explicit queue review renders mixed receipts and requires a new selection for remaining posts", async ({
  page,
}) => {
  const fx = await mockSyncFixture<QueueReleaseFixture>(page, "queue-release");
  await page.goto("/queue");
  const panel = page.getByRole("region", { name: "Reviewed queue release" });
  await expect(
    panel.getByText("Select up to 20 approved posts.", { exact: false }),
  ).toBeVisible();
  expect(fx.calls).toEqual([]);
  for (const n of [2, 3, 4])
    await panel
      .getByRole("checkbox", { name: new RegExp(`Backlog ${n}`) })
      .check();
  await panel.getByRole("button", { name: "Review eligible posts" }).click();
  await expect(
    panel.getByText("Full final copy 2: 42%, number 1234 and https://corvolabs.com/blog/2000-01-01-fixture", { exact: true }),
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
  expect(fx.calls).toEqual([
    "queueRelease:prepare",
    "bufferLive:queueSelected",
    "queueRelease:prepare",
  ]);
});

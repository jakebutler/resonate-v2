import { test, expect } from "@playwright/test";
import { mockSyncFixture, type QueuePlanningFixture } from "./test-support/fixtures";

test("queue planning shows eight backlog slots and two durable reservations without submitting posts", async ({
  page,
}) => {
  const fx = await mockSyncFixture<QueuePlanningFixture>(page, "queue-planning");
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
  fx.makeStale();
  await page.reload();
  await expect(page.getByText(/Capacity unknown:.*stale/)).toBeVisible();
  await expect(page.getByText("0 eligible · 10 held")).toBeVisible();
  await expect(page.getByText(/Last saved dry run/)).toBeVisible();
  expect(fx.calls).toEqual(["queuePlanning:saveDryRun"]);
});

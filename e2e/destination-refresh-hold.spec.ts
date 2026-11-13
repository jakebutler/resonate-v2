import { test, expect } from "@playwright/test";
import { mockSyncFixture } from "./test-support/fixtures";

test("failed destination refresh retains account facts and blocks destination review", async ({
  page,
}) => {
  await mockSyncFixture(page, "destination-refresh-hold");
  await page.goto("/?postId=fixture-social");
  const panel = page.getByLabel("Publishing item detail").getByRole("region", { name: "Buffer destination" });
  await expect(panel.getByText(/Fixture Company/)).toBeVisible();
  await expect(
    panel.getByText("Held: Connection lookup failed; refresh Connections."),
  ).toBeVisible();
  await panel.getByText("Review destination, payload and schedule").click();
  await expect(
    panel.getByRole("button", { name: "Review this destination and schedule" }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Refresh destination" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/destination-refresh-held.png",
    fullPage: true,
  });
});

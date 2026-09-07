import { test, expect } from "@playwright/test";

// Campaign loop surface smoke (C1–C8 spec §6). CI runs without a real Convex
// deployment, so queries stay in loading/undefined states — the assertion is
// that every campaign surface boots, renders its heading, and never crashes.
test.describe("Campaign loop surfaces", () => {
  test("nav exposes Campaigns and the campaigns home boots", async ({ page }) => {
    await page.goto("/campaigns");
    await expect(page.getByRole("heading", { name: "Campaigns" })).toBeVisible();
    await expect(
      page.getByText(/Nothing auto-approves and nothing submits automatically/i)
    ).toBeVisible();
  });

  test("campaign session route boots without crashing on an unknown id", async ({
    page,
  }) => {
    await page.goto("/campaigns/test-campaign");
    // With no reachable Convex the session stays in its loading state; the
    // shell and heading must still render.
    await expect(page.locator("nav[aria-label='workspace surfaces']")).toBeVisible();
  });

  test("shape route boots without crashing", async ({ page }) => {
    await page.goto("/campaigns/test-campaign/shape");
    await expect(page.locator("nav[aria-label='workspace surfaces']")).toBeVisible();
  });

  test("draft set route boots without crashing", async ({ page }) => {
    await page.goto("/campaigns/test-campaign/drafts");
    await expect(page.locator("nav[aria-label='workspace surfaces']")).toBeVisible();
  });

  test("approval queue route boots without crashing", async ({ page }) => {
    await page.goto("/campaigns/test-campaign/queue");
    await expect(page.locator("nav[aria-label='workspace surfaces']")).toBeVisible();
  });

  test("calendar surface still boots alongside campaigns", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav[aria-label='workspace surfaces']")).toBeVisible();
  });
});

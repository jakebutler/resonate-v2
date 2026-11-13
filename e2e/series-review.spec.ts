import { test, expect } from "@playwright/test";
import { mockSyncFixture, type SeriesReviewFixture } from "./test-support/fixtures";

test("durable full review selects three then approves exactly two and material composer edit clears only one", async ({
  page,
}) => {
  const fx = await mockSyncFixture<SeriesReviewFixture>(page, "series-review");
  await page.goto("/series?seriesId=series-fixture");
  let panel = page.getByRole("region", { name: "Selected editorial review" });
  for (let n = 0; n < 3; n++) {
    const cb = panel.getByRole("checkbox", {
      name: new RegExp(`Exact review ${n}`),
    });
    await cb.focus();
    await page.keyboard.press("Space");
    await expect(cb).toBeChecked();
  }
  await panel
    .getByRole("button", { name: "Prepare selected review packet" })
    .click();
  await expect(
    panel.getByText(/Packet packet-fixture · 3 selected/),
  ).toBeVisible();
  await expect(
    panel.getByText(
      "Complete immutable 42% copy 1.\nNumber 1234 and https://example.com/source",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    panel.getByText(/first comment unsupported/).first(),
  ).toBeVisible();
  await expect(
    panel.getByText(/Unvetted source warning/).first(),
  ).toBeVisible();
  await panel.getByRole("checkbox", { name: /Exact review 0/ }).click();
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 0/ }),
  ).not.toBeChecked();
  await expect(
    panel.getByRole("button", { name: "Approve 3 selected versions" }),
  ).toBeDisabled();
  await page.reload();
  panel = page.getByRole("region", { name: "Selected editorial review" });
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 1/ }),
  ).toBeChecked();
  await panel
    .getByRole("button", { name: "Prepare selected review packet" })
    .click();
  await panel
    .getByRole("button", { name: "Approve 2 selected versions" })
    .click();
  await expect(
    panel.getByText(/Approved exactly 2 selected editorial versions/),
  ).toBeVisible();
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 0.*unapproved/ }),
  ).not.toBeChecked();
  await page.screenshot({
    path: "test-results/series-selected-approval.png",
    fullPage: true,
  });
  await panel
    .getByRole("link", { name: "Edit Exact review 1 in composer" })
    .click();
  await page
    .getByRole("textbox", { name: "Content", exact: true })
    .fill("Corrected material copy 43%");
  await page.getByRole("button", { name: "Save Composer Changes" }).click();
  await page.goto("/series?seriesId=series-fixture");
  panel = page.getByRole("region", { name: "Selected editorial review" });
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 1.*unapproved/ }),
  ).toBeChecked();
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 2.*approved/ }),
  ).toBeChecked();
  expect(fx.calls.filter((c) => c.includes("approve"))).toEqual([
    "seriesReview:approve",
  ]);
  expect(
    fx.calls.every(
      (c) => c.startsWith("seriesReview:") || c === "publishing:updateContent",
    ),
  ).toBe(true);
});

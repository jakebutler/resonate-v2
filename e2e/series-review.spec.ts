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
    panel.getByText(/Review packet prepared .* · 3 selected/),
  ).toBeVisible();
  await expect(panel.getByText("Packet ID packet-fixture")).toBeVisible();
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

test("review panel renders human-readable content and demotes internal IDs to support lines", async ({
  page,
}) => {
  await mockSyncFixture<SeriesReviewFixture>(page, "series-review");
  await page.goto("/series?seriesId=series-fixture");
  const panel = page.getByRole("region", { name: "Selected editorial review" });
  for (const n of [0, 1]) {
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
  await expect(panel.getByText(/Review packet prepared/)).toBeVisible();
  // The packet ID appears exactly once — demoted to the monospace support line.
  expect(await panel.getByText("packet-fixture").count()).toBe(1);
  // Source references resolve to titles/topics, not raw IDs.
  await expect(
    panel.getByText(/Freshproof launch campaign/).first(),
  ).toBeVisible();
  await expect(
    panel.getByText(/Launch narrative idea/).first(),
  ).toBeVisible();
  await expect(
    panel.getByText(/Why verification receipts matter/).first(),
  ).toBeVisible();
  // The raw source IDs appear only in the monospace support line, once per row.
  expect(await panel.getByText("campaign-fixture").count()).toBe(2);
  // Citations resolve to the excerpt text and document, with the URI demoted.
  await expect(
    panel
      .getByText(/Excerpt from Launch playbook: “One number or receipt only.”/)
      .first(),
  ).toBeVisible();
  expect(
    await panel.getByText("corpus://corvo/corpus-fixture#excerpt-1").count(),
  ).toBe(2);
  // Blog rows surface the author display name and excerpt.
  await expect(panel.getByText(/Fixture Author/).first()).toBeVisible();
  await expect(
    panel.getByText(/Fixture excerpt for readable review\./),
  ).toBeVisible();
  // Approval names the actor readably; the raw actor ID stays in support.
  await panel
    .getByRole("button", { name: "Approve 2 selected versions" })
    .click();
  await expect(
    panel.getByText(/Editorial version approved by you at/).first(),
  ).toBeVisible();
  expect(await panel.getByText("fixture-editor").count()).toBe(1);
});

test("acting on a stale revision surfaces the re-review state instead of applying", async ({
  page,
}) => {
  const fx = await mockSyncFixture<SeriesReviewFixture>(page, "series-review");
  await page.goto("/series?seriesId=series-fixture");
  const panel = page.getByRole("region", { name: "Selected editorial review" });
  const cb = panel.getByRole("checkbox", { name: /Exact review 1/ });
  await cb.focus();
  await page.keyboard.press("Space");
  await expect(cb).toBeChecked();
  await panel
    .getByRole("button", { name: "Prepare selected review packet" })
    .click();
  const approveButton = panel.getByRole("button", {
    name: "Approve 1 selected versions",
  });
  fx.failNextApproveWith(
    "Selection or series membership changed; prepare a new packet.",
  );
  await approveButton.click();
  // The distinct re-review state replaces a generic failure message.
  await expect(
    panel.getByText(/Content changed — review again/).first(),
  ).toBeVisible();
  // Nothing was applied: no approval message, and the row stays unapproved.
  await expect(panel.getByText(/Approved exactly/)).toHaveCount(0);
  await expect(
    panel.getByRole("checkbox", { name: /Exact review 1.*unapproved/ }),
  ).toBeChecked();
  // Recovery path: prepare a fresh packet and approve succeeds.
  fx.failNextApproveWith(null);
  await panel
    .getByRole("button", { name: "Prepare selected review packet" })
    .click();
  await panel
    .getByRole("button", { name: "Approve 1 selected versions" })
    .click();
  await expect(
    panel.getByText(/Approved exactly 1 selected editorial versions/),
  ).toBeVisible();
});

test("rapid toggles never race the selection revision and approve submits once", async ({
  page,
}) => {
  const fx = await mockSyncFixture<SeriesReviewFixture>(page, "series-review");
  await page.goto("/series?seriesId=series-fixture");
  const panel = page.getByRole("region", { name: "Selected editorial review" });
  const cb0 = panel.getByRole("checkbox", { name: /Exact review 0/ });
  const cb1 = panel.getByRole("checkbox", { name: /Exact review 1/ });
  // Two toggles in quick succession coalesce into one batched select call
  // that flushes before prepare, so the server never sees a stale revision.
  await cb0.focus();
  await page.keyboard.press("Space");
  await cb1.click();
  await expect(cb0).toBeChecked();
  await expect(cb1).toBeChecked();
  await expect(panel.getByText(/Review failed\./)).toHaveCount(0);
  await panel
    .getByRole("button", { name: "Prepare selected review packet" })
    .click();
  expect(
    fx.calls.filter((c) => c === "seriesReview:select").length,
  ).toBe(1);
  // In-flight approval disables the button and submits exactly one mutation.
  const approveButton = panel.getByRole("button", {
    name: "Approve 2 selected versions",
  });
  fx.delayNextApproveMs(500);
  await approveButton.click();
  await expect(approveButton).toBeDisabled();
  await expect(
    panel.getByText(/Approved exactly 2 selected editorial versions/),
  ).toBeVisible();
  expect(fx.calls.filter((c) => c === "seriesReview:approve").length).toBe(1);
});

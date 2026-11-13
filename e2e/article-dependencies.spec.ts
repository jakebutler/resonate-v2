import { test, expect } from "@playwright/test";
import { mockSyncFixture, type ArticleDependenciesFixture } from "./test-support/fixtures";

test("canonical composer reviews final links, independent DST offsets and separate publication evidence", async ({
  page,
}) => {
  const fx = await mockSyncFixture<ArticleDependenciesFixture>(
    page,
    "article-dependencies",
  );
  await page.goto("/?postId=fixture-companion");
  const detail = page.getByLabel("Publishing item detail");
  const dependency = detail.getByRole("region", {
    name: "Article publication dependency",
  });
  await expect(
    dependency.getByText("Held: Production deployment is pending."),
  ).toBeVisible();
  await expect(
    dependency.getByText("pending · Production · commit fixture-merge"),
  ).toBeVisible();
  await dependency.getByText("Review full canonical link proposal").click();
  await expect(
    dependency.getByText(
      `Exact 42% copy.\nhttps://corvolabs.com/blog/2030-03-09-fixture`,
      { exact: true },
    ),
  ).toBeVisible();
  await dependency
    .getByRole("button", { name: "Apply reviewed link proposal" })
    .click();
  await expect(
    detail.getByRole("textbox", { name: "Content", exact: true }),
  ).toHaveValue(`Exact 42% copy.\nhttps://corvolabs.com/blog/2030-03-09-fixture`);
  await dependency.getByText("Preview a local calendar-day offset").click();
  await dependency.getByLabel("Calendar days").fill("1");
  await expect(
    dependency.getByText(
      /2030-03-10 09:00 America\/Los_Angeles · UTC 2030-03-10T16:00/,
    ),
  ).toBeVisible();
  await expect(
    detail.getByRole("textbox", { name: "Date", exact: true }),
  ).toHaveValue("2030-10-07");
  await dependency
    .getByRole("button", { name: "Check article publication (read only)" })
    .click();
  await expect(
    dependency.getByText("success · Production · commit fixture-merge"),
  ).toBeVisible();
  await expect(dependency.getByText(/verified · checked/)).toBeVisible();
  await page.screenshot({
    path: "test-results/article-separate-publication-proof.png",
    fullPage: true,
  });
  fx.expire();
  await page.reload();
  await expect(
    dependency.getByText(/Held: Scheduled time has passed/),
  ).toBeVisible();
  expect(fx.calls).toEqual([
    "articleDependencies:applyLink",
    "articlePublication:refresh",
  ]);
});

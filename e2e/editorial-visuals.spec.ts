import { test, expect } from "@playwright/test";

import { mockSyncFixture, type EditorialVisualsFixture } from "./test-support/fixtures";

/**
 * C5: first browser coverage for the editorial visual composer
 * (`EditorialVisualPanel` inside the saved-post composer at `/?postId=…`).
 *
 * The spec drives the real production flow — plan → select → generate → edit
 * → export → approve — where planning and image dispatch run as Convex
 * actions against qualified routes. The mock image/text provider is the
 * fixture's action handlers, so the panel's own guards (pending attempts,
 * selection confirmation, loaded export preview, budget display) all execute.
 *
 * The panel mounts only when the build baked
 * NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED=1 (the verification workflow's e2e
 * job sets it before `npm run build`); a local build without it fails this
 * spec loudly rather than faking a skip.
 *
 * Failure evidence: Playwright is configured with `screenshot:
 * only-on-failure`; the final assertion pins the exact wire-order call log.
 */

// Wire order the composer contract implies: each stage's mutation is followed
// by its provider dispatch action, and no other mutation or action fires.
const EXPECTED_CALLS = [
  "visualWorkflow:requestPlan",
  "visualTextActions:executeTextAttempt",
  "visualWorkflow:selectScene",
  "visualWorkflow:requestGeneration",
  "visualProviderActions:executeImageAttempt",
  "visualWorkflow:requestEdit",
  "visualProviderActions:executeImageAttempt",
  "visualExports:prepareHero",
  "visualWorkflow:approveHero",
];

test("visual composer plans, selects, generates, edits, exports and approves a hero", async ({
  page,
}) => {
  const fx = await mockSyncFixture<EditorialVisualsFixture>(page, "editorial-visuals");
  await page.goto("/?postId=post-visual");

  const visuals = page.getByRole("region", { name: "Editorial visuals" });
  await expect(visuals).toBeVisible();
  await expect(
    visuals.getByText("Spent $0.00 · Reserved $0.00 · Limit $20.00"),
  ).toBeVisible();

  // Plan: requestPlan mutation, then the mock text provider completes the
  // queued planning attempt and the three-scene plan renders.
  await visuals.getByRole("button", { name: "Plan visuals" }).click();
  const scene1 = visuals.getByRole("article", { name: "Scene 1" });
  await expect(scene1.getByText("Workshop")).toBeVisible();
  await expect(visuals.getByRole("article", { name: "Scene 3" })).toBeVisible();
  await expect(
    visuals.getByText("Brand default: openai · gpt-image-2."),
  ).toBeVisible();

  // Select scene 1: the scene editor appears with generation enabled.
  await scene1.getByRole("button", { name: "Select scene" }).click();
  const generate = visuals.getByRole("button", { name: "Generate this concept" });
  await expect(generate).toBeEnabled();

  // Generate: requestGeneration, then the mock image provider stores and
  // auto-selects an immutable version.
  await generate.click();
  await expect(
    visuals.getByText("Edit parent route: openai · gpt-image-2"),
  ).toBeVisible();
  await expect(
    visuals.getByAltText("Selected hero version"),
  ).toBeVisible();

  // Edit: feedback drives a child version through the same image action.
  await visuals
    .getByLabel("Edit feedback")
    .fill("Change only the raven's grip on the wheel.");
  await visuals.getByRole("button", { name: "Edit selected version" }).click();
  // Version buttons number newest-first: the edited child is "Select version 1"
  // and is auto-selected by the mock provider's completion.
  await expect(
    visuals.getByRole("button", { name: "Select version 1" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    visuals.getByRole("button", { name: "Select version 2" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    visuals.getByText("Previous feedback: Change only the raven's grip on the wheel."),
  ).toBeVisible();

  // Export: the centered 16:9 crop prepares a compliant stored export whose
  // bytes the browser actually loads.
  await visuals.getByRole("button", { name: "Prepare final hero crop" }).click();
  await expect(
    visuals.getByAltText("Final hero crop preview"),
  ).toBeVisible();
  await expect(
    visuals.getByText("1600 × 900 · 98304 bytes · WEBP"),
  ).toBeVisible();

  // Approve: alt text plus the human review checkbox unlock the approval.
  await visuals
    .getByLabel("Descriptive hero alt text")
    .fill("Raven mechanic adjusting a test wheel in a paper workshop");
  await visuals
    .getByRole("checkbox", {
      name: "I reviewed this crop for identity, story and thumbnail readability.",
    })
    .check();
  await visuals.getByRole("button", { name: "Approve hero" }).click();
  await expect(
    visuals.getByText("Hero approval is saved."),
  ).toBeVisible();

  // Mutations and actions asserted via the call log, in wire order.
  expect(fx.calls).toEqual(EXPECTED_CALLS);

  await page.screenshot({
    path: "test-results/editorial-visuals-approved.png",
    fullPage: true,
  });
});

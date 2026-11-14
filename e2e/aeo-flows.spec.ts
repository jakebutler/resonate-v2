import { test, expect } from "@playwright/test";
import { mockConvexSync } from "./test-support/mockConvexSync";

// The /aeo flow family against the shared local-sync harness: fixtures never
// reach a Convex deployment, and every mutation below is a review or a seed —
// nothing approves or publishes (L8).

const brand = "corvo";

function targetFixture(reviewPinned: boolean) {
  return {
    _id: "target-fixture",
    _creationTime: 1,
    userId: "fixture-user",
    brandId: brand,
    siteUrl: "https://freshproof.example.com",
    productIdentifiers: ["FreshProof band"],
    competitorUrls: ["https://competitor-a.com"],
    validation: { state: "validated", checkedAt: 1 },
    reviewPinned,
    createdAt: 1,
    updatedAt: 1,
  };
}

test("intel-citations: a suspect citation renders the mismatch warning and a qualified badge", async ({
  page,
}) => {
  await mockConvexSync(page, {
    value: (path) => {
      if (path === "aeoIntel:getTarget") return targetFixture(true);
      if (path === "aeoIntel:listCrawls") return [];
      if (path === "aeoIntel:listRuns") return [runFixture];
      if (path === "aeoIntel:listFindings") return [suspectFinding, matchFinding];
      return null;
    },
  });

  await page.goto("/aeo/intel");

  // Run-level and per-finding warnings are visible.
  await expect(page.getByText(/Brand mismatch suspected: 1 of 2/)).toBeVisible();
  await expect(page.getByText("Mismatch suspected.")).toBeVisible();
  // The suspect citation is always qualified, never a plain "cited".
  await expect(
    page.getByText("Cited: Corvo Labs (mismatch suspected)", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("Cited: Corvo Labs", { exact: true })
  ).toBeVisible();
});

const planFixture = {
  _id: "plan-fixture",
  _creationTime: 1,
  userId: "fixture-user",
  brandId: brand,
  version: 1,
  status: "draft",
  plan: {
    gaps: [
      {
        title: "Explain the methodology",
        description: "No page describes it",
        priority: 1,
        sourceFindingIds: ["finding-1"],
      },
    ],
    opportunities: [],
    targetKeywords: ["freshproof"],
    targetQuestions: ["What is FreshProof?"],
    brief: {
      audience: "GLP-1 tracker shoppers",
      thesis: "Independent proof beats marketing claims",
      goal: "Own the comparison query",
      window: "Next 30 days",
      channels: ["blog"],
      cta: "Read the evidence",
      metric: "Citations",
      constraints: [],
    },
  },
  createdAt: 1,
};

const suggestionFixture = {
  _id: "suggestion-fixture",
  _creationTime: 1,
  userId: "fixture-user",
  brandId: brand,
  name: "Competitor A",
  url: "https://competitor-a.com",
  status: "suggested",
  evidence: ["discovered via search"],
  frequency: 2,
  phrasings: ["Competitor A alternative"],
  reviewStatus: "unreviewed",
  createdAt: 1,
  updatedAt: 1,
};

// One complete run whose "What is FreshProof" answer described a same-named
// different product (the 2026-11-14 live-proof case): cited, but suspect.
const runFixture = {
  _id: "run-fixture",
  _creationTime: 1,
  userId: "fixture-user",
  brandId: brand,
  kind: "answer-engine",
  status: "complete",
  costCeilingCents: 50,
  questionCount: 2,
  startedAt: 1,
  finishedAt: 2,
  brandMismatchCount: 1,
};

function findingFixture(overrides: Record<string, unknown>) {
  return {
    _id: "finding-fixture",
    _creationTime: 1,
    userId: "fixture-user",
    brandId: brand,
    runId: "run-fixture",
    classification: "opportunity",
    citationStatus: "cited",
    extractability: 0.5,
    summary: "Would you recommend FreshProof?",
    evidence: ["question: Would you recommend FreshProof?", "answer: Yes — FreshProof is..."],
    reviewStatus: "unreviewed",
    createdAt: 1,
    ...overrides,
  };
}

const suspectFinding = findingFixture({
  _id: "finding-suspect",
  summary: "What is FreshProof?",
  evidence: ["question: What is FreshProof?", "answer: FreshProof is a blockchain supply-chain platform..."],
  brandMatch: "suspect",
  brandMatchDetail:
    "Answer names the brand but shares almost none of its topic vocabulary with the target's crawled content (5% overlap).",
});

const matchFinding = findingFixture({
  _id: "finding-match",
  summary: "How does FreshProof compare to its alternatives?",
  evidence: ["question: How does FreshProof compare to its alternatives?", "answer: FreshProof's proofing workflow..."],
  brandMatch: "match",
});

test("connect-target: connect a site, then pin its review", async ({ page }) => {
  const mutations: Array<{ path: string; args: Record<string, unknown> }> = [];
  let connected = false;
  let pinned = false;

  await mockConvexSync(page, {
    value: (path) => {
      if (path === "aeoIntel:getTarget") {
        return connected ? targetFixture(pinned) : null;
      }
      return null;
    },
    mutation: (path, args) => {
      mutations.push({ path, args });
      if (path === "aeoIntel:connectTarget") connected = true;
      if (path === "aeoIntel:pinTargetReview") pinned = true;
      return null;
    },
  });

  await page.goto("/aeo");

  // Unconnected: the connect form is the whole panel.
  await expect(page.getByLabel("Connect target form")).toBeVisible();
  await page.getByLabel("Target site URL").fill("https://freshproof.example.com");
  await page.getByRole("button", { name: "Connect target" }).click();

  // Connected but unpinned: the review gate is visible and blocking.
  await expect(page.getByText(/Review required/)).toBeVisible();
  await page.getByRole("button", { name: "Pin review" }).click();
  await expect(page.getByLabel("Review pinned")).toBeVisible();

  expect(mutations[0]).toMatchObject({
    path: "aeoIntel:connectTarget",
    args: expect.objectContaining({ brandId: brand, siteUrl: "https://freshproof.example.com" }),
  });
  expect(mutations[1]).toMatchObject({
    path: "aeoIntel:pinTargetReview",
    args: { brandId: brand, pinned: true },
  });
});

test("competitor-review: accept and reject suggestions are review-only writes", async ({
  page,
}) => {
  const mutations: Array<{ path: string; args: Record<string, unknown> }> = [];
  let aStatus = "suggested";
  let bStatus = "suggested";

  await mockConvexSync(page, {
    value: (path) => {
      if (path === "aeoIntel:getTarget") return targetFixture(true);
      if (path === "competitorSuggestions:listSuggestions") {
        return [
          { ...suggestionFixture, status: aStatus },
          {
            ...suggestionFixture,
            _id: "suggestion-rejected",
            name: "Competitor B",
            url: "https://competitor-b.com",
            phrasings: ["Competitor B alternative"],
            status: bStatus,
          },
        ];
      }
      return null;
    },
    mutation: (path, args) => {
      mutations.push({ path, args });
      if (path === "competitorSuggestions:reviewSuggestion") {
        if (args.reviewStatus === "accepted") aStatus = "accepted";
        if (args.reviewStatus === "rejected") bStatus = "rejected";
      }
      return null;
    },
  });

  await page.goto("/aeo/competitors");

  await expect(page.getByText("Competitor A", { exact: true })).toBeVisible();
  await expect(page.getByText("Competitor B", { exact: true })).toBeVisible();
  await page
    .locator("li", { hasText: "Competitor A" })
    .getByRole("button", { name: "Accept", exact: true })
    .click();
  // An accepted row leaves the review queue; its URL joins the tracking set.
  await expect(page.getByText("Competitor A", { exact: true })).toBeHidden();

  await page
    .locator("li", { hasText: "Competitor B" })
    .getByRole("button", { name: "Reject", exact: true })
    .click();
  await page.getByLabel("Rejection reason").fill("Not a real competitor");
  await page.getByRole("button", { name: "Record rejection" }).click();
  await expect(page.getByText("Competitor B", { exact: true })).toBeHidden();

  expect(mutations[0]).toMatchObject({
    path: "competitorSuggestions:reviewSuggestion",
    args: { brandId: brand, suggestionId: "suggestion-fixture", reviewStatus: "accepted" },
  });
  expect(mutations[1]).toMatchObject({
    path: "competitorSuggestions:reviewSuggestion",
    args: expect.objectContaining({
      brandId: brand,
      reviewStatus: "rejected",
      reviewNotes: "Not a real competitor",
    }),
  });
  // Review-only: every mutation is a review decision, nothing publishes.
  expect(mutations.every((m) => m.path === "competitorSuggestions:reviewSuggestion")).toBe(true);
});

test("plan-review: accept and change-request stay review states; seeding writes brief fields", async ({
  page,
}) => {
  const mutations: Array<{ path: string; args: Record<string, unknown> }> = [];
  let planStatus = "draft";
  let briefSeeded = false;

  await mockConvexSync(page, {
    value: (path) => {
      if (path === "aeoIntel:getLatestStrategyPlan") {
        return { ...planFixture, status: planStatus };
      }
      if (path === "campaigns:listCampaigns") {
        return [
          {
            _id: "campaign-fixture",
            _creationTime: 1,
            userId: "fixture-user",
            brandId: brand,
            title: "FreshProof launch",
            status: "draft",
            createdAt: 1,
            updatedAt: 1,
          },
        ];
      }
      if (path === "shapes:getBrief" && briefSeeded) {
        return { goal: "Own the comparison query", audience: "GLP-1 tracker shoppers" };
      }
      return null;
    },
    mutation: (path, args) => {
      mutations.push({ path, args });
      if (path === "aeoIntel:saveStrategyPlan") planStatus = String(args.status);
      if (path === "shapes:saveBrief") briefSeeded = true;
      return null;
    },
  });

  await page.goto("/aeo/plan");

  await expect(page.getByText("Own the comparison query")).toBeVisible();

  // Change request: a review note, landing as a new draft version.
  await page.getByRole("button", { name: "Request changes" }).click();
  await page.getByLabel("Change request note").fill("Add a comparison-pages gap");
  await page.getByRole("button", { name: "Submit change request" }).click();
  await expect(page.getByRole("button", { name: "Accept plan" })).toBeVisible();

  // Accept: a review state, not a content approval.
  await page.getByRole("button", { name: "Accept plan" }).click();
  await expect(page.getByLabel(/Plan review state/)).toBeVisible();

  // Seed: brief fields into the brand's campaign — the only content action.
  await page.getByRole("combobox", { name: "Campaign" }).click();
  await page.getByRole("option", { name: "FreshProof launch" }).click();
  await page.getByRole("button", { name: "Seed brief fields" }).click();
  await expect(page.getByText("Brief fields seeded into the campaign.")).toBeVisible({
    timeout: 15_000,
  });

  const saveCalls = mutations.filter((m) => m.path === "aeoIntel:saveStrategyPlan");
  expect(saveCalls[0]).toMatchObject({
    args: expect.objectContaining({ status: "draft", reviewNotes: "Add a comparison-pages gap" }),
  });
  expect(saveCalls[1]).toMatchObject({
    args: expect.objectContaining({ brandId: brand, status: "reviewed" }),
  });
  expect(mutations).toContainEqual({
    path: "shapes:saveBrief",
    args: expect.objectContaining({
      campaignId: "campaign-fixture",
      goal: "Own the comparison query",
      audience: "GLP-1 tracker shoppers",
    }),
  });
  // L8: no approval or publish mutation anywhere in the flow.
  expect(
    mutations.every(
      (m) =>
        m.path === "aeoIntel:saveStrategyPlan" ||
        m.path === "shapes:saveBrief" ||
        m.path === "ideas:create"
    )
  ).toBe(true);
});

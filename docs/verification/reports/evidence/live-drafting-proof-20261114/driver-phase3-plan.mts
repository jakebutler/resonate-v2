/**
 * Live-proof phase 3 driver: the live plan loop on REAL intel findings.
 *
 * plan → seed-campaign-brief → campaign, all through the product's public
 * mutations exactly as the PlanFlow UI calls them:
 *   1. Read the real answer-engine intelFindings for FreshProof (recorded by
 *      the real scheduled batch, run `answerEngine:runAnswerEngineBatch`).
 *   2. Compose a strategy plan whose every item cites REAL finding ids.
 *   3. saveStrategyPlan as draft (v1), then accept as reviewed (v2) — the
 *      append-only review flow with optimistic concurrency.
 *   4. shapes.saveBrief copies plan.brief.goal/audience onto the campaign.
 *   5. Verify: getLatestStrategyPlan + getCampaignSession brief readback.
 *
 * Env: CONVEX_URL, CONVEX_JWT, BRAND_ID, CAMPAIGN_ID. Output: /home/user/work/phase3-receipt.json
 */
import process from "node:process";
import { writeFileSync } from "node:fs";

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../../../../../convex/_generated/api.js");
import type { Id } from "../../../../../convex/_generated/dataModel.js";

const CONVEX_URL = process.env.CONVEX_URL;
const CONVEX_JWT = process.env.CONVEX_JWT;
const BRAND_ID = process.env.BRAND_ID;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;

function fail(reason: string): never {
  console.error(JSON.stringify({ ok: false, reason }, null, 2));
  process.exit(1);
}

if (!CONVEX_URL || !CONVEX_JWT || !BRAND_ID || !CAMPAIGN_ID) {
  fail("Missing one of CONVEX_URL, CONVEX_JWT, BRAND_ID, CAMPAIGN_ID");
}

const client = new ConvexHttpClient(CONVEX_URL);
client.setAuth(CONVEX_JWT);
const BRAND = "freshproof";
// The campaign is provided by the phase-1 run; Convex serializes document ids
// as plain strings on the wire, so this narrows the runtime id for the typed
// mutation args.
const campaignId = CAMPAIGN_ID as Id<"campaigns">;

// 1. Real findings only — refuse to proceed on zero rows.
const findings = await client.query(api.aeoIntel.listFindings, { brandId: BRAND });
if (!findings || findings.length === 0) fail("No intel findings for the brand — run the answer-engine batch first.");
const gaps = findings.filter((f: { classification: string }) => f.classification === "gap");
const opportunities = findings.filter((f: { classification: string }) => f.classification === "opportunity");
const cited = findings.filter((f: { citationStatus: string }) => f.citationStatus === "cited");
const runnerRecorded = findings.filter((f: { source?: string }) => f.source === "runner").length;

// 2. Compose the plan from the real rows: items cite their source finding ids;
// the brief is the analyst's synthesis of the observed evidence.
const plan = {
  gaps: gaps.map((f, index: number) => ({
    title: `Close the observed gap: ${f.summary}`,
    description: "Answer-engine run observed the target missing or uncompetitive for this question; strengthen the linked campaign.",
    priority: index + 1,
    sourceFindingIds: [f._id],
  })),
  opportunities: opportunities.map((f, index: number) => ({
    title: `Double down: ${f.summary}`,
    description: "Answer-engine run observed the target cited and matching on this question; reinforce it in this campaign.",
    priority: index + 1,
    sourceFindingIds: [f._id],
  })),
  targetKeywords: ["freshproof", "fact checking", "citation verification"],
  targetQuestions: findings.map((f) => f.summary),
  brief: {
    goal: cited.length > 0
      ? "Defend and extend the answer-engine visibility the live run observed for FreshProof."
      : "Establish answer-engine visibility for FreshProof where the live run observed none.",
    audience: "Writers and editors who need verifiable factual accuracy before publishing.",
    thesis: "FreshProof turns drafts into verified claims with evidence, and the live intel run shows where answers already cite us and where they do not.",
    window: "Next two weeks (verification proof window).",
    channels: ["corvo-blog", "x", "linkedin"],
    cta: "Follow the build and try FreshProof on your next draft.",
    metric: "Answer-engine citation rate on tracked questions.",
    constraints: ["Every claim must cite a corpus excerpt.", "Nothing publishes without human approval."],
  },
};

// 3. Append-only save: draft v1, then the accept action appends reviewed v2.
const draftId = await client.mutation(api.aeoIntel.saveStrategyPlan, {
  brandId: BRAND,
  status: "draft",
  plan,
});
const draftRow = await client.query(api.aeoIntel.getLatestStrategyPlan, { brandId: BRAND });
if (!draftRow) fail("Strategy plan readback returned null after the draft save");
const reviewedId = await client.mutation(api.aeoIntel.saveStrategyPlan, {
  brandId: BRAND,
  status: "reviewed",
  expectedVersion: draftRow.version,
  plan: draftRow.plan,
});

// 4. Seed the campaign brief — the exact PlanFlow UI call.
await client.mutation(api.shapes.saveBrief, {
  campaignId,
  goal: plan.brief.goal,
  audience: plan.brief.audience,
});

// 5. Verify end to end: plan row + campaign brief readback.
const finalPlan = await client.query(api.aeoIntel.getLatestStrategyPlan, { brandId: BRAND });
const session = await client.query(api.campaigns.getCampaignSession, { campaignId });
if (!session) fail("Campaign session readback returned null");

const receipt = {
  ok: true,
  findingCount: findings.length,
  gapCount: gaps.length,
  opportunityCount: opportunities.length,
  citedCount: cited.length,
  runnerRecordedCount: runnerRecorded,
  draftPlanId: String(draftId),
  reviewedPlanId: String(reviewedId),
  finalPlan: finalPlan
    ? {
        id: String(finalPlan._id),
        version: finalPlan.version,
        status: finalPlan.status,
        gapItems: finalPlan.plan.gaps.length,
        opportunityItems: finalPlan.plan.opportunities.length,
        sourceFindingIdsAllReal: [...finalPlan.plan.gaps, ...finalPlan.plan.opportunities]
          .every((item) =>
            item.sourceFindingIds.every((id) => findings.some((f) => String(f._id) === String(id)))
          ),
        brief: finalPlan.plan.brief,
      }
    : null,
  campaignBrief: session?.brief
    ? { goal: session.brief.goal, audience: session.brief.audience }
    : null,
};
writeFileSync("/home/user/work/phase3-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt, null, 2));

/**
 * Live-proof phase 2 driver: live AI campaign draft generation.
 *
 * Calls draftGeneration.generateLiveDraftSet (real LLM drafting over the
 * citation plumbing; Cortex gateway with OpenAI-compatible fallback) as the
 * authenticated e2e user against the phase-1 campaign. Budget admission
 * happens server-side before any dispatch.
 *
 * EXPECT_REFUSAL=1 expects the budget refusal (deployment ceiling below the
 * estimate) and records it verbatim — nothing is spent or written.
 * Default: the real run; dumps the recorded draft set + cohesion verdict.
 *
 * Env: CONVEX_URL, CONVEX_JWT, CAMPAIGN_ID, [EXPECT_REFUSAL].
 */
import process from "node:process";
import { writeFileSync } from "node:fs";

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../../../../../convex/_generated/api.js");

const CONVEX_URL = process.env.CONVEX_URL;
const CONVEX_JWT = process.env.CONVEX_JWT;
const CAMPAIGN_ID = process.env.CAMPAIGN_ID;
const EXPECT_REFUSAL = process.env.EXPECT_REFUSAL === "1";

function fail(reason: string): never {
  console.error(JSON.stringify({ ok: false, reason }, null, 2));
  process.exit(1);
}

if (!CONVEX_URL || !CONVEX_JWT || !CAMPAIGN_ID) {
  fail("Missing one of CONVEX_URL, CONVEX_JWT, CAMPAIGN_ID");
}

const client = new ConvexHttpClient(CONVEX_URL);
client.setAuth(CONVEX_JWT);

if (EXPECT_REFUSAL) {
  let refused: unknown = null;
  try {
    await client.action(api.draftGeneration.generateLiveDraftSet, { campaignId: CAMPAIGN_ID as never });
    fail("Expected a budget refusal but the action succeeded");
  } catch (error) {
    refused = error instanceof Error ? error.message : String(error);
  }
  const receipt = { ok: true, expected: "budget-refusal", refusalMessage: refused };
  writeFileSync("/home/user/work/phase2-refusal.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify(receipt, null, 2));
  process.exit(0);
}

const startedAt = new Date().toISOString();
const result = await client.action(api.draftGeneration.generateLiveDraftSet, {
  campaignId: CAMPAIGN_ID as never,
});
const finishedAt = new Date().toISOString();

// Dump the recorded draft set as rendered (grounded drafts, unapproved).
const view = await client.query(api.draftSet.getDraftSet, { campaignId: CAMPAIGN_ID as never });

const receipt = {
  ok: true,
  campaignId: CAMPAIGN_ID,
  startedAt,
  finishedAt,
  materializationId: String(result.materializationId),
  draftCount: result.draftCount,
  cohesionPassed: result.cohesionPassed,
  cohesionRunNumber: result.cohesionRunNumber,
  drafts: (view?.drafts ?? []).map((entry: { post: Record<string, unknown>; slot: Record<string, unknown>; seq: number }) => ({
    seq: entry.seq,
    role: entry.slot.role,
    channel: entry.slot.channel,
    title: entry.post.title,
    content: entry.post.content,
    excerptCitations: entry.post.excerptCitations,
    status: entry.post.status,
    approvalState: entry.post.approvalState,
  })),
};
writeFileSync("/home/user/work/phase2-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ ...receipt, drafts: receipt.drafts.map((d: { title: unknown }) => ({ title: d.title })) }, null, 2));

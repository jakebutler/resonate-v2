/**
 * Evidence dump for an existing live draft set (no generation, no spend).
 * Env: CONVEX_URL, CONVEX_JWT, CAMPAIGN_ID. Output: /home/user/work/phase2-receipt.json
 */
import process from "node:process";
import { writeFileSync } from "node:fs";

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../../../../../convex/_generated/api.js");

const client = new ConvexHttpClient(process.env.CONVEX_URL!);
client.setAuth(process.env.CONVEX_JWT!);
const campaignId = process.env.CAMPAIGN_ID!;

const view = await client.query(api.draftSet.getDraftSet, { campaignId: campaignId as never });
if (!view?.materialization) process.exit(1);
const review = await client.query(api.cohesion.getReviewPasses, { campaignId: campaignId as never });
const dump = view.drafts.map((entry: { seq: number; slot: Record<string, unknown>; post: Record<string, unknown> }) => ({
  seq: entry.seq,
  role: entry.slot.role,
  channel: entry.slot.channel,
  title: entry.post.title,
  content: entry.post.content,
  excerptCitations: entry.post.excerptCitations,
  approvalState: entry.post.approvalState,
}));
const receipt = {
  materializationId: String(view.materialization._id),
  mode: view.materialization.mode,
  createdAt: new Date(view.materialization.createdAt as number).toISOString(),
  cohesionRun: review?.latestRun
    ? {
        runNumber: review.latestRun.runNumber,
        passed: review.latestRun.passed,
        checks: review.latestRun.checks,
        autoFixLog: review.latestRun.autoFixLog ?? [],
      }
    : null,
  drafts: dump,
};
writeFileSync("/home/user/work/phase2-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(dump.map((d: { title: unknown; content: string; excerptCitations: unknown }) => ({ title: d.title, chars: d.content?.length, cites: d.excerptCitations })), null, 2));

/**
 * Read-only listing of intel runs and findings for a brand (plan-loop input evidence).
 * Env: CONVEX_URL, CONVEX_JWT, BRAND_ID. Output: /home/user/work/phase3-intel.json
 */
import process from "node:process";
import { writeFileSync } from "node:fs";

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../../../../../convex/_generated/api.js");

const client = new ConvexHttpClient(process.env.CONVEX_URL!);
client.setAuth(process.env.CONVEX_JWT!);
const brandId = process.env.BRAND_ID!;

const runs = await client.query(api.aeoIntel.listRuns, { brandId: brandId as never });
const findings = await client.query(api.aeoIntel.listFindings, { brandId: brandId as never });
const planRow = await client.query(api.aeoIntel.getLatestStrategyPlan, { brandId: brandId as never });
const receipt = {
  runs: (runs ?? []).map((run: Record<string, unknown>) => ({
    id: String(run._id),
    kind: run.kind,
    status: run.status,
    questionCount: run.questionCount,
    startedAt: run.startedAt ? new Date(run.startedAt as number).toISOString() : null,
  })),
  findings: (findings ?? []).map((f: Record<string, unknown>) => ({
    id: String(f._id),
    runId: String(f.runId),
    question: f.question,
    classification: f.classification,
    citationStatus: f.citationStatus,
    extractability: f.extractability,
    brandMatch: f.brandMatch ?? null,
    brandMatchDetail: f.brandMatchDetail ?? null,
    evidence: f.evidence,
  })),
  latestPlan: planRow
    ? { id: String(planRow._id), version: planRow.version, status: planRow.status }
    : null,
};
writeFileSync("/home/user/work/phase3-intel.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ runCount: receipt.runs.length, findingCount: receipt.findings.length, latestPlan: receipt.latestPlan }, null, 2));

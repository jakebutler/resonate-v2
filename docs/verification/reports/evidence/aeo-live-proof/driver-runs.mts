/** AEO live-proof driver: runs + findings detail for spend evidence. */
import process from "node:process";

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../../../../../convex/_generated/api.js");

function fail(reason: string): never {
  console.error(JSON.stringify({ ok: false, reason }, null, 2));
  process.exit(1);
}

const client = new ConvexHttpClient(
  process.env.CONVEX_URL ?? fail("Missing CONVEX_URL")
);
client.setAuth(process.env.CONVEX_JWT ?? fail("Missing CONVEX_JWT"));

const runs = await client.query(api.aeoIntel.listRuns, { brandId: "freshproof" });
console.log("RUNS:", JSON.stringify(runs, null, 2));

const findings = [];
for (const r of runs) {
  const rows = await client.query(api.aeoIntel.listFindings, { brandId: "freshproof" });
  findings.push(...rows
    .filter((f) => String(f.runId) === String(r._id))
    .map((f) => ({
      runId: String(f.runId),
      kind: r.kind,
      classification: f.classification,
      citationStatus: f.citationStatus,
      extractability: f.extractability,
      summary: f.summary.slice(0, 300),
      reviewStatus: f.reviewStatus,
    })));
}
console.log("FINDINGS:", JSON.stringify(findings, null, 2));

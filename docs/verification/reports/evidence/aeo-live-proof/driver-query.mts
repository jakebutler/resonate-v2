/** AEO live-proof driver: query recorded crawls + runs for the freshproof brand. */
import process from "node:process";

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../../../../../convex/_generated/api.js");

const client = new ConvexHttpClient(process.env.CONVEX_URL);
client.setAuth(process.env.CONVEX_JWT);

const crawls = await client.query(api.aeoIntel.listCrawls, { brandId: "freshproof" });
console.log("CRAWLS:", JSON.stringify(
  crawls.map((c) => ({ id: String(c._id), version: c.version, status: c.status, pageCount: c.pageCount, siteUrl: c.siteUrl })),
  null,
  2
));

const runs = await client.query(api.aeoIntel.listRuns, { brandId: "freshproof" });
console.log("RUNS:", JSON.stringify(
  runs.map((r) => ({ id: String(r._id), kind: r.kind, status: r.status, questionCount: r.questionCount ?? r.queryCount, createdAt: r.createdAt })),
  null,
  2
));

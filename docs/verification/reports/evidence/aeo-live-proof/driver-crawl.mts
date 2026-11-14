/**
 * AEO live-proof driver: Firecrawl site crawl + immutable snapshot recording.
 *
 * Runs the repo's own Firecrawl adapter (lib/providerAdapters.firecrawlCrawl)
 * against the connected FreshProof pilot target, then records the immutable
 * crawl snapshot through api.aeoIntel.recordCrawlSnapshot as the authenticated
 * e2e user (Clerk dev-instance JWT, template "convex").
 *
 * Env: CONVEX_URL, CONVEX_JWT (minted live from the signed-in Clerk session),
 * FIRECRAWL_API_KEY
 */
import process from "node:process";

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../../../../../convex/_generated/api.js");
const { firecrawlCrawl } = await import("../../../../../lib/providerAdapters.js");

const CONVEX_URL = process.env.CONVEX_URL;
const CONVEX_JWT = process.env.CONVEX_JWT;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const SITE_URL = process.env.CRAWL_SITE_URL ?? "https://freshproof.io";
const BRAND = "freshproof";
const CRAWL_LIMIT = Number(process.env.CRAWL_LIMIT ?? 5);

function fail(reason: string): never {
  console.error(JSON.stringify({ ok: false, reason }, null, 2));
  process.exit(1);
}

if (!CONVEX_URL || !CONVEX_JWT || !FIRECRAWL_API_KEY) {
  fail("Missing one of CONVEX_URL, CONVEX_JWT, FIRECRAWL_API_KEY");
}

// 1. Authenticated Convex client as the e2e user (JWT minted live from the
// signed-in Clerk session so the aud=convex claim is present).
const client = new ConvexHttpClient(CONVEX_URL);
client.setAuth(CONVEX_JWT);

// 3. Confirm the connected target exists for the brand.
const targetRow = await client.query(api.aeoIntel.getTarget, { brandId: BRAND });
if (!targetRow) fail("No connected target for brand freshproof");
if (!targetRow.reviewPinned) fail("Target review is not pinned; intel reads refuse unpinned targets");

// 4. Real Firecrawl crawl through the repo adapter.
const run = await firecrawlCrawl(
  { env: { FIRECRAWL_API_KEY, FIRECRAWL_MAX_CRAWL_PAGES: String(CRAWL_LIMIT) }, liveProviderValidationApproved: true },
  { url: SITE_URL, limit: CRAWL_LIMIT, pollDelayMs: 2000, maxPolls: 30 }
);
if (!run.ok) {
  fail(`Firecrawl crawl refused/failed: ${run.reason ?? "unknown"} ${JSON.stringify(run.sanitizedResponse)}`);
}
const pages = run.pages ?? [];
if (pages.length === 0) fail("Firecrawl crawl completed with zero pages");

// 5. Map sanitized pages into the immutable snapshot's page shape.
function headingsFromMarkdown(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .filter((line: string) => /^#{1,6}\s/.test(line))
    .map((line: string) => line.replace(/^#{1,6}\s+/, "").trim())
    .filter((h: string) => h.length > 0 && h.length <= 200)
    .slice(0, 20);
}

const snapshotPages = pages.map((page) => ({
  url: page.sourceUrl,
  title: page.title,
  headings: headingsFromMarkdown(page.markdown),
  schemaTypes: [],
  description: page.description,
  contentSample: page.markdown ? page.markdown.slice(0, 2000) : undefined,
}));

// 6. Record the immutable snapshot (append-only; version 1 for this target).
const crawlId = await client.mutation(api.aeoIntel.recordCrawlSnapshot, {
  brandId: BRAND,
  targetId: String(targetRow._id),
  siteUrl: targetRow.siteUrl,
  version: 1,
  status: "complete",
  detail: `Live Firecrawl crawl of ${SITE_URL} (limit ${CRAWL_LIMIT}) via aeo-proof driver on neighborly-bird-443.`,
  pages: snapshotPages,
});

console.log(
  JSON.stringify(
    {
      ok: true,
      crawlId: String(crawlId),
      targetId: String(targetRow._id),
      siteUrl: targetRow.siteUrl,
      version: 1,
      pageCount: snapshotPages.length,
      pages: snapshotPages.map((p) => ({ url: p.url, title: p.title, headings: p.headings.length })),
    },
    null,
    2
  )
);

/**
 * Live-proof phase 1 driver: workspace bootstrap + product-path FreshProof
 * crawl (runner-provenance snapshot) + real-copy corpus + campaign + suggested
 * ideas + accepted shape.
 *
 * Everything runs as the authenticated e2e user through the product's own
 * public functions (no verification-seed fixtures). The corpus excerpts are
 * chunked from the real crawl content the snapshot stored.
 *
 * Env: CONVEX_URL, CONVEX_JWT (browser-minted, template "convex").
 * Optional: CAMPAIGN_TITLE. Output: JSON receipt with the row ids later
 * phases reference.
 */
import process from "node:process";
import { writeFileSync } from "node:fs";

const { ConvexHttpClient } = await import("convex/browser");
const { api } = await import("../../../../../convex/_generated/api.js");
const { firecrawlCrawl } = await import("../../../../../lib/providerAdapters.js");
import dnsPromises from "node:dns/promises";

const CONVEX_URL = process.env.CONVEX_URL;
const CONVEX_JWT = process.env.CONVEX_JWT;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const SITE_URL = "https://freshproof.io";
const BRAND = "freshproof";
const CRAWL_LIMIT = Number(process.env.CRAWL_LIMIT ?? 5);
const CAMPAIGN_TITLE = process.env.CAMPAIGN_TITLE ?? "FreshProof verification push (live drafting proof)";

function fail(reason: string): never {
  console.error(JSON.stringify({ ok: false, reason }, null, 2));
  process.exit(1);
}

if (!CONVEX_URL || !CONVEX_JWT || !FIRECRAWL_API_KEY) {
  fail("Missing one of CONVEX_URL, CONVEX_JWT, FIRECRAWL_API_KEY");
}

const client = new ConvexHttpClient(CONVEX_URL);
client.setAuth(CONVEX_JWT);

// 1. Bootstrap the workspace as the signed-in user (brands + memberships,
// product path — the same mutation the app calls after first sign-in).
const seed = await client.mutation(api.publishing.seedMvpWorkspace, {});
if (!seed?.seeded) fail("seedMvpWorkspace did not confirm");
console.log(JSON.stringify({ step: "workspace-bootstrapped" }));

// 2. Connect the FreshProof pilot target (idempotent update if present).
const targetId = await client.mutation(api.aeoIntel.connectTarget, {
  brandId: BRAND,
  siteUrl: SITE_URL,
  productIdentifiers: ["FreshProof"],
  competitorUrls: [],
});
console.log(JSON.stringify({ step: "target-connected", targetId: String(targetId) }));

// 3. Real Firecrawl crawl through the repo adapter with a real DNS resolver.
// The product's own capture action (aeoCrawl.captureCrawlSnapshot) was tried
// first and failed live: it passes no pollDelayMs, so its 30 status polls burn
// back-to-back before the crawl completes ("Firecrawl crawl did not complete
// within 30 status polls; retry with a smaller limit.") — recorded verbatim in
// the report. The adapter path with pollDelayMs is the #168-proven route.
const dnsLookup = (hostname: string) =>
  dnsPromises.lookup(hostname, { all: true, verbatim: true });
const crawl = await firecrawlCrawl(
  {
    env: { FIRECRAWL_API_KEY, FIRECRAWL_MAX_CRAWL_PAGES: String(CRAWL_LIMIT) },
    liveProviderValidationApproved: true,
    lookup: dnsLookup,
  },
  { url: SITE_URL, limit: CRAWL_LIMIT, pollDelayMs: 2000, maxPolls: 30 }
);
if (!crawl.ok) fail(`Firecrawl crawl refused/failed: ${crawl.reason ?? "unknown"} ${JSON.stringify(crawl.sanitizedResponse)}`);
const pages = crawl.pages ?? [];
if (pages.length === 0) fail("Firecrawl crawl completed with zero pages");

// Dedupe by URL (the adapter dedupes across polls since #173; belt and braces).
const seen = new Set<string>();
const uniquePages = pages.filter((page) => {
  if (seen.has(page.sourceUrl)) return false;
  seen.add(page.sourceUrl);
  return true;
});
if (uniquePages.length === 0) fail("Crawl produced zero unique pages");

// 4. Immutable snapshot of the crawl.
function headingsFromMarkdown(markdown: string | null | undefined): string[] {
  if (!markdown) return [];
  return markdown
    .split("\n")
    .filter((line: string) => /^#{1,6}\s/.test(line))
    .map((line: string) => line.replace(/^#{1,6}\s+/, "").trim())
    .filter((h: string) => h.length > 0 && h.length <= 200)
    .slice(0, 20);
}
const snapshotPages = uniquePages.map((page) => ({
  url: page.sourceUrl,
  title: page.title,
  headings: headingsFromMarkdown(page.markdown),
  schemaTypes: [],
  description: page.description,
  contentSample: page.markdown ? page.markdown.slice(0, 2000) : undefined,
}));
const crawlId = await client.mutation(api.aeoIntel.recordCrawlSnapshot, {
  brandId: BRAND,
  targetId: String(targetId),
  siteUrl: SITE_URL,
  version: 1,
  status: "complete",
  detail: `Live Firecrawl crawl of ${SITE_URL} (limit ${CRAWL_LIMIT}, ${uniquePages.length} unique pages) for the live drafting + plan-loop proof.`,
  pages: snapshotPages,
});
const crawlPages = snapshotPages.map((page) => ({ url: page.url, title: page.title, contentSample: page.contentSample }));
console.log(JSON.stringify({ step: "snapshot-recorded", crawlId: String(crawlId), pageCount: uniquePages.length }));

// 4. Pin the target review — the human gate intel reads require.
await client.mutation(api.aeoIntel.pinTargetReview, { brandId: BRAND, pinned: true });
console.log(JSON.stringify({ step: "target-review-pinned" }));

// 5. Corpus version built from the real site copy stored in the snapshot.
function chunkExcerpts(markdown: string, provenance: string): { text: string; provenance: string; sensitivity: "public-safe" }[] {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((block) => block.replace(/\s+/g, " ").trim())
    .filter((block) => block.length > 80);
  const excerpts: { text: string; provenance: string; sensitivity: "public-safe" }[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current.length + paragraph.length + 1 > 600 && current.length > 0) {
      excerpts.push({ text: current, provenance, sensitivity: "public-safe" });
      current = "";
    }
    current = current ? `${current} ${paragraph}` : paragraph;
    if (current.length > 600) {
      excerpts.push({ text: current, provenance, sensitivity: "public-safe" });
      current = "";
    }
  }
  if (current.length > 0) excerpts.push({ text: current, provenance, sensitivity: "public-safe" });
  return excerpts;
}

const documents = crawlPages
  .filter((page) => page.contentSample && page.contentSample.trim().length > 0)
  .map((page) => {
    const excerpts = chunkExcerpts(page.contentSample!, page.url);
    return {
      name: page.title || page.url,
      kind: "txt" as const,
      meta: { source: "firecrawl-crawl", sourceUrl: page.url },
      excerpts,
    };
  })
  .filter((document) => document.excerpts.length > 0);
if (documents.length === 0) fail("No usable crawl content for the corpus");

const corpusResult = await client.mutation(api.corpora.createCorpusVersion, {
  brandId: BRAND,
  origin: "upload",
  documents,
});
console.log(JSON.stringify({ step: "corpus-created", corpusId: corpusResult.corpusId, version: corpusResult.version, excerptCount: corpusResult.excerptCount }));

// 6. Campaign + corpus attach.
const campaign = await client.mutation(api.campaigns.createCampaign, {
  brandId: BRAND,
  title: CAMPAIGN_TITLE,
});
const campaignId = campaign.campaignId;
await client.mutation(api.campaigns.attachCorpus, { campaignId, corpusId: corpusResult.corpusId as never });
console.log(JSON.stringify({ step: "campaign-ready", campaignId }));

// 7. Suggested ideas in acknowledged mock mode (D-21 server-issued token).
const ack = await client.mutation(api.mockAck.requestMockAcknowledgment, { campaignId });
const suggestions = await client.mutation(api.campaigns.suggestIdeas, {
  campaignId,
  mockAckToken: ack.token,
});
console.log(JSON.stringify({ step: "ideas-suggested", created: suggestions.created, mode: "acknowledged-mock" }));

// 8. Move suggestions into the working set (state member).
const session = await client.query(api.campaigns.getCampaignSession, { campaignId });
const suggested = session.suggested;
const membersBefore = session.workingSet.length;
const need = Math.max(0, 5 - membersBefore);
const added: string[] = [];
for (const entry of suggested.slice(0, need)) {
  await client.mutation(api.campaigns.addIdeaToCampaign, { campaignId, ideaId: String(entry.idea._id) });
  added.push(String(entry.idea._id));
}
console.log(JSON.stringify({ step: "ideas-in-working-set", added: added.length, ideaIds: added }));

// 9. Propose + accept the standard shape (auto-links working-set ideas).
const shape = await client.mutation(api.shapes.proposeShape, { campaignId, preset: "standard" });
const shapeView = await client.query(api.shapes.getCampaignShape, { campaignId });
const unlinked = shapeView.slots.filter((slot) => !slot.ideaId);
for (const slot of unlinked) {
  const idea = suggested[unlinked.indexOf(slot)];
  if (idea) await client.mutation(api.shapes.linkSlotIdea, { shapeId: shape.shapeId, slotId: String(slot._id), ideaId: String(idea.idea._id) });
}
await client.mutation(api.shapes.acceptShape, { shapeId: shape.shapeId });
const acceptedView = await client.query(api.shapes.getCampaignShape, { campaignId });
console.log(JSON.stringify({
  step: "shape-accepted",
  shapeId: shape.shapeId,
  slots: acceptedView.slots.map((slot) => ({ seq: slot.seq, role: slot.role, channel: slot.channel, ideaId: slot.ideaId ? String(slot.ideaId) : null })),
}));

const receipt = {
  ok: true,
  targetId: String(targetId),
  crawlId: String(crawlId),
  crawlPageCount: uniquePages.length,
  crawlRawRows: pages.length,
  corpusId: corpusResult.corpusId,
  corpusVersion: corpusResult.version,
  corpusExcerptCount: corpusResult.excerptCount,
  campaignId,
  suggestedIdeas: suggestions.created,
  ideasAddedToWorkingSet: added.length,
  shapeId: shape.shapeId,
  preset: "standard",
  slotCount: acceptedView.slots.length,
};
writeFileSync("/home/user/work/phase1-receipt.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ ok: true, receipt }));

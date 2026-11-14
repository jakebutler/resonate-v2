import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import type { BrandId } from "../campaignAccess";

const modules = import.meta.glob("../**/*.ts");

const mockLookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);

vi.mock("node:dns/promises", () => ({
  default: { lookup: mockLookup },
  lookup: mockLookup,
}));

async function fixture(userId: string, brands: BrandId[]) {
  const t = convexTest(schema, modules);
  await t.run((ctx) => {
    for (const brandId of brands) {
      ctx.db.insert("v2BrandMemberships", {
        userId,
        brandId,
        role: "owner",
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });
  return { t, user: t.withIdentity({ subject: userId }) };
}

function firecrawlFetchMock() {
  return vi
    .fn()
    .mockResolvedValueOnce(
      new Response("User-agent: *\nAllow: /", { status: 200 })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, id: "crawl-123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          status: "completed",
          data: [
            {
              url: "https://www.freshproof.example/",
              title: "FreshProof claim validation",
              markdown: "# FreshProof claim validation\n\nEvidence-first.",
              metadata: { statusCode: 200 },
            },
            {
              url: "https://www.freshproof.example/pricing",
              title: "Pricing",
              markdown: "# Pricing",
              metadata: { statusCode: 200 },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
}

describe("aeoCrawl.captureCrawlSnapshot", () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.FIRECRAWL_API_KEY = "firecrawl-secret";
    process.env.AEO_DISCOVERY_LIVE_APPROVED = "approved";
  });

  afterAll(() => {
    process.env.FIRECRAWL_API_KEY = originalEnv.FIRECRAWL_API_KEY;
    process.env.AEO_DISCOVERY_LIVE_APPROVED = originalEnv.AEO_DISCOVERY_LIVE_APPROVED;
    vi.unstubAllGlobals();
  });

  it("crawls the connected target and records the next snapshot version in-app", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    const targetId = await user.mutation(api.aeoIntel.connectTarget, {
      brandId: "freshproof",
      siteUrl: "https://www.freshproof.example",
      productIdentifiers: ["FreshProof band"],
      competitorUrls: [],
    });
    const fetchMock = firecrawlFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const crawlId = await user.action(api.aeoCrawl.captureCrawlSnapshot, {
      brandId: "freshproof",
    });
    expect(crawlId).toBeDefined();
    expect(fetchMock).toHaveBeenCalled();

    const crawls = await user.query(api.aeoIntel.listCrawls, { brandId: "freshproof" });
    expect(crawls).toHaveLength(1);
    expect(crawls[0]?.version).toBe(1);
    expect(crawls[0]?.targetId).toBe(targetId);
    const pages = await user.query(api.aeoIntel.listCrawlPages, {
      brandId: "freshproof",
      crawlId: String(crawlId),
    });
    expect(pages.map((page) => page.url)).toEqual([
      "https://www.freshproof.example/",
      "https://www.freshproof.example/pricing",
    ]);
  });

  it("records version 2 after an existing snapshot instead of overwriting", async () => {
    const { user } = await fixture("owner", ["freshproof"]);
    const targetId = await user.mutation(api.aeoIntel.connectTarget, {
      brandId: "freshproof",
      siteUrl: "https://www.freshproof.example",
      productIdentifiers: [],
      competitorUrls: [],
    });
    await user.mutation(api.aeoIntel.recordCrawlSnapshot, {
      brandId: "freshproof",
      targetId,
      siteUrl: "https://www.freshproof.example",
      version: 1,
      status: "complete",
      pages: [],
    });
    vi.stubGlobal("fetch", firecrawlFetchMock());

    await user.action(api.aeoCrawl.captureCrawlSnapshot, { brandId: "freshproof" });

    const crawls = await user.query(api.aeoIntel.listCrawls, { brandId: "freshproof" });
    expect(crawls.map((crawl) => crawl.version).sort()).toEqual([1, 2]);
  });

  it("fails with the SSRF-guard message for a private target", async () => {
    const { t, user } = await fixture("owner", ["freshproof"]);
    // Seed the target directly: connectTarget's entry validation correctly
    // refuses a private host, so this row simulates a legacy stored URL that
    // the capture action must still refuse before any fetch.
    const targetId = await t.run((ctx) =>
      ctx.db.insert("brandTargets", {
        userId: "owner",
        brandId: "freshproof",
        siteUrl: "https://freshproof.example",
        productIdentifiers: [],
        competitorUrls: [],
        createdAt: 1,
        updatedAt: 1,
      })
    );
    await t.run((ctx) => ctx.db.patch(targetId, { siteUrl: "https://127.0.0.1/" }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      user.action(api.aeoCrawl.captureCrawlSnapshot, { brandId: "freshproof" })
    ).rejects.toThrow(/not reachable/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

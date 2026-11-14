import { describe, expect, it, vi } from "vitest";
import { runProviderAdapterContractSuite } from "@/lib/__tests__/helpers/providerAdapterContract";
import {
  FIRECRAWL_SNAPSHOT_MAX_CHARS,
  adapterForProvider,
  dedupePagesByUrl,
  firecrawlProviderAdapter,
  firecrawlRunLimits,
  firecrawlSearch,
  firecrawlCrawl,
  isPrivateSiteHostname,
  robotsAllowsRequest,
  sanitizeFirecrawlPage,
  type ProviderAdapterContext,
} from "@/lib/providerAdapters";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

/** Stand-in for a real DNS lookup: every host resolves to a public address. */
const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];

const approvedContext = (
  fetchImpl: ReturnType<typeof vi.fn>,
  overrides: Record<string, string | undefined> = {}
): ProviderAdapterContext => ({
  env: { FIRECRAWL_API_KEY: "firecrawl-secret", ...overrides },
  liveProviderValidationApproved: true,
  fetchImpl: fetchImpl as unknown as typeof fetch,
  lookup: publicLookup,
});

const blockedContext = (
  fetchImpl: ReturnType<typeof vi.fn>,
  overrides: Record<string, string | undefined> = {}
): ProviderAdapterContext => ({
  env: { FIRECRAWL_API_KEY: "firecrawl-secret", ...overrides },
  liveProviderValidationApproved: false,
  fetchImpl: fetchImpl as unknown as typeof fetch,
  lookup: publicLookup,
});

describe("firecrawl adapter contract", () => {
  it("is routed from the adapter registry", () => {
    expect(adapterForProvider("firecrawl")).toBe(firecrawlProviderAdapter);
  });

  runProviderAdapterContractSuite(firecrawlProviderAdapter, {
    approvedContext: (overrides = {}) => approvedContext(vi.fn(), overrides),
    blockedContext: (overrides = {}) => blockedContext(vi.fn(), overrides),
  });
});

describe("firecrawl validateConnection", () => {
  it("fails closed without a credential and never fetches", async () => {
    const fetchImpl = vi.fn();
    await expect(
      firecrawlProviderAdapter.validateConnection({
        env: {},
        liveProviderValidationApproved: true,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "FIRECRAWL_API_KEY is not configured in server secret scope.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("requires explicit runtime approval", async () => {
    const fetchImpl = vi.fn();
    await expect(
      firecrawlProviderAdapter.validateConnection(blockedContext(fetchImpl))
    ).resolves.toMatchObject({
      ok: false,
      reason: "Live provider validation requires explicit approval.",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("performs a read-only credit-usage check when approved", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ success: true, data: { remaining_credits: 987, plan_credits: 1000 } })
    );
    const result = await firecrawlProviderAdapter.validateConnection(approvedContext(fetchImpl));
    expect(result.ok).toBe(true);
    expect(result.accountLabel).toContain("987");
    expect(JSON.stringify(result.sanitizedResponse)).not.toMatch(/firecrawl-secret/i);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("https://api.firecrawl.dev/v1/team/credit-usage");
    expect((init as RequestInit).method).toBeUndefined();
  });

  it("reports a failed reachability check without leaking the key", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({ error: "Unauthorized" }, 401)
    );
    const result = await firecrawlProviderAdapter.validateConnection(approvedContext(fetchImpl));
    expect(result.ok).toBe(false);
    expect(result.sanitizedResponse.status).toBe(401);
    expect(JSON.stringify(result.sanitizedResponse)).not.toMatch(/firecrawl-secret/i);
  });
});

describe("firecrawl crawl gating", () => {
  it("refuses to crawl without approval and without dispatching", async () => {
    const fetchImpl = vi.fn();
    const result = await firecrawlCrawl(blockedContext(fetchImpl), {
      url: "https://freshproof.example.com/",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("Live provider validation requires explicit approval.");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to crawl without a credential", async () => {
    const fetchImpl = vi.fn();
    const result = await firecrawlCrawl(
      approvedContext(fetchImpl, { FIRECRAWL_API_KEY: undefined }),
      { url: "https://freshproof.example.com/" }
    );
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses non-public crawl targets before any dispatch", async () => {
    const fetchImpl = vi.fn();
    for (const [url, reason] of [
      ["http://localhost:3000/", "Only https URLs are supported."],
      ["http://127.0.0.1/", "Only https URLs are supported."],
      ["http://192.168.1.10/", "Only https URLs are supported."],
      ["ftp://freshproof.example.com/file", "Only https URLs are supported."],
      ["not-a-url", "Invalid URL."],
      ["https://localhost:3000/", "That host is not reachable for ingest."],
      ["https://192.168.1.10/", "That host is not reachable for ingest."],
    ] as const) {
      const result = await firecrawlCrawl(approvedContext(fetchImpl), { url });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe(`Crawl target rejected by the SSRF guard: ${reason}`);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses to crawl when no DNS resolver is configured (fail closed)", async () => {
    const fetchImpl = vi.fn();
    const context = approvedContext(fetchImpl);
    delete context.lookup;
    const result = await firecrawlCrawl(context, {
      url: "https://freshproof.example.com/",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(
      "Crawl refused: no DNS resolver configured for outbound URL validation."
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a private-address crawl target through the robots path before fetching", async () => {
    // Regression: the robots.txt pre-fetch used to bypass validateRemoteUrl
    // entirely — a public hostname resolving to a private address reached the
    // fetch. The guard must run first and the robots fetch must never fire.
    const fetchImpl = vi.fn();
    const privateLookup = async () => [{ address: "10.1.2.3", family: 4 as const }];
    const context = approvedContext(fetchImpl);
    context.lookup = privateLookup;
    const result = await firecrawlCrawl(context, {
      url: "https://freshproof.example.com/",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(
      "Crawl target rejected by the SSRF guard: That host is not reachable for ingest."
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a crawl target whose DNS resolves only to IPv6 loopback", async () => {
    const fetchImpl = vi.fn();
    const loopbackLookup = async () => [{ address: "::1", family: 6 as const }];
    const context = approvedContext(fetchImpl);
    context.lookup = loopbackLookup;
    const result = await firecrawlCrawl(context, {
      url: "https://freshproof.example.com/",
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses crawl limits above the per-run ceiling before dispatch", async () => {
    const fetchImpl = vi.fn();
    const result = await firecrawlCrawl(approvedContext(fetchImpl), {
      url: "https://freshproof.example.com/",
      limit: 51,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("per-run ceiling of 50 pages");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("honors an env-raised ceiling", () => {
    expect(
      firecrawlRunLimits({ env: { FIRECRAWL_MAX_CRAWL_PAGES: "500" } })
    ).toEqual({ maxCrawlPages: 500, maxSearchResults: 10 });
    expect(
      firecrawlRunLimits({ env: { FIRECRAWL_MAX_CRAWL_PAGES: "-3" } })
    ).toEqual({ maxCrawlPages: 50, maxSearchResults: 10 });
  });
});

describe("firecrawl crawl robots.txt handling", () => {
  it("refuses to crawl when robots.txt disallows the path", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse("User-agent: *\nDisallow: /"));
    const result = await firecrawlCrawl(approvedContext(fetchImpl), {
      url: "https://freshproof.example.com/private/page",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("robots.txt disallows crawling /private/page.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses to crawl when robots.txt is unreachable", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(textResponse("server error", 500));
    const result = await firecrawlCrawl(approvedContext(fetchImpl), {
      url: "https://freshproof.example.com/",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("robots.txt could not be fetched (HTTP 500)");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("crawls when robots.txt is absent (404)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse("not found", 404))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, id: "crawl-123" })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "completed",
          data: [{ url: "https://freshproof.example.com/", markdown: "# Home", metadata: {} }],
        })
      );
    const result = await firecrawlCrawl(approvedContext(fetchImpl), { url: "https://freshproof.example.com/" });
    expect(result.ok).toBe(true);
    expect(result.pages).toHaveLength(1);
  });
});

describe("firecrawl crawl execution", () => {
  function successfulCrawlFetch() {
    return vi
      .fn()
      .mockResolvedValueOnce(
        textResponse("User-agent: *\nAllow: /")
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, id: "crawl-123" }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "completed",
          data: [
            {
              url: "https://freshproof.example.com/",
              title: "FreshProof",
              markdown: "# Home",
              rawHtml: "<html><body>secret stuff</body></html>",
              metadata: { statusCode: 200, apiKey: "leak-me" },
            },
          ],
        })
      );
  }

  it("returns sanitized snapshot pages only", async () => {
    const fetchImpl = successfulCrawlFetch();
    const result = await firecrawlCrawl(approvedContext(fetchImpl), {
      url: "https://freshproof.example.com/",
    });
    expect(result.ok).toBe(true);
    expect(result.pages).toEqual([
      {
        sourceUrl: "https://freshproof.example.com/",
        title: "FreshProof",
        description: undefined,
        markdown: "# Home",
        statusCode: 200,
      },
    ]);
    const crawlInit = fetchImpl.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(crawlInit.body))).toMatchObject({
      url: "https://freshproof.example.com/",
      limit: 50,
      scrapeOptions: { formats: ["markdown"] },
    });
    expect(fetchImpl.mock.calls[1][0]).toBe("https://api.firecrawl.dev/v1/crawl");
  });

  it("truncates oversized markdown in snapshots", () => {
    const sanitized = sanitizeFirecrawlPage({
      url: "https://freshproof.example.com/big",
      markdown: "a".repeat(FIRECRAWL_SNAPSHOT_MAX_CHARS + 10),
    });
    expect(sanitized.markdown?.length).toBeLessThanOrEqual(FIRECRAWL_SNAPSHOT_MAX_CHARS + 3);
  });

  it("reports a failed crawl job", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse("User-agent: *\nAllow: /"))
      .mockResolvedValueOnce(jsonResponse({ success: true, id: "crawl-123" }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, status: "failed", data: [] })
      );
    const result = await firecrawlCrawl(approvedContext(fetchImpl), {
      url: "https://freshproof.example.com/",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("ended with status failed");
  });

  it("gives up after the poll bound instead of polling forever", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse("User-agent: *\nAllow: /"))
      .mockResolvedValueOnce(jsonResponse({ success: true, id: "crawl-123" }));
    const polling = () =>
      jsonResponse({ success: true, status: "scraping", data: [] });
    for (let i = 0; i < 5; i++) fetchImpl.mockResolvedValueOnce(polling());
    const result = await firecrawlCrawl(approvedContext(fetchImpl), {
      url: "https://freshproof.example.com/",
      maxPolls: 5,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2 + 5);
  });
});

describe("firecrawl crawl poll dedupe", () => {
  it("keeps the first occurrence when pages repeat across polls", () => {
    const page = (url: string) => ({
      sourceUrl: url,
      title: `Page ${url}`,
      description: undefined,
      markdown: "# x",
      statusCode: 200,
    });
    const deduped = dedupePagesByUrl([
      page("https://freshproof.example.com/a"),
      page("https://freshproof.example.com/b"),
      page("https://freshproof.example.com/a"),
    ]);
    expect(deduped.map((p) => p.sourceUrl)).toEqual([
      "https://freshproof.example.com/a",
      "https://freshproof.example.com/b",
    ]);
  });

  it("does not persist re-served pages from later polls", async () => {
    // Live proof of the bug: 5 unique URLs persisted as 10 rows because every
    // poll re-served the pages collected so far. Poll 2 below re-serves the
    // two pages from poll 1 alongside one new page — the result must hold 3.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse("User-agent: *\nAllow: /"))
      .mockResolvedValueOnce(jsonResponse({ success: true, id: "crawl-123" }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "scraping",
          next: "page-2",
          data: [
            { url: "https://freshproof.example.com/", markdown: "# Home" },
            { url: "https://freshproof.example.com/about", markdown: "# About" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: "completed",
          data: [
            { url: "https://freshproof.example.com/", markdown: "# Home" },
            { url: "https://freshproof.example.com/about", markdown: "# About" },
            { url: "https://freshproof.example.com/pricing", markdown: "# Pricing" },
          ],
        })
      );
    const result = await firecrawlCrawl(approvedContext(fetchImpl), {
      url: "https://freshproof.example.com/",
      pollDelayMs: 0,
    });
    expect(result.ok).toBe(true);
    expect(result.pages?.map((page) => page.sourceUrl)).toEqual([
      "https://freshproof.example.com/",
      "https://freshproof.example.com/about",
      "https://freshproof.example.com/pricing",
    ]);
  });
});

describe("firecrawl search gating", () => {
  it("refuses to search without approval and without dispatching", async () => {
    const fetchImpl = vi.fn();
    const result = await firecrawlSearch(blockedContext(fetchImpl), {
      query: "GLP-1 supplement verification",
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses search limits above the per-run ceiling", async () => {
    const fetchImpl = vi.fn();
    const result = await firecrawlSearch(approvedContext(fetchImpl), {
      query: "GLP-1 supplement verification",
      limit: 11,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("per-run ceiling of 10 results");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns sanitized search results", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [
          {
            url: "https://freshproof.example.com/guide",
            title: "Verification guide",
            description: "How to verify a supplement.",
            markdown: "should not survive into search results",
          },
        ],
      })
    );
    const result = await firecrawlSearch(approvedContext(fetchImpl), {
      query: "GLP-1 supplement verification",
      limit: 5,
    });
    expect(result.ok).toBe(true);
    expect(result.results).toEqual([
      {
        url: "https://freshproof.example.com/guide",
        title: "Verification guide",
        description: "How to verify a supplement.",
      },
    ]);
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      query: "GLP-1 supplement verification",
      limit: 5,
    });
  });
});

describe("robotsAllowsRequest", () => {
  it("uses the specific agent group over the wildcard group", () => {
    const body = "User-agent: *\nDisallow: /\n\nUser-agent: resonate-v2\nAllow: /";
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/any/page" })
    ).toEqual({ allowed: true });
  });

  it("falls back to the wildcard group", () => {
    const body = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private";
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/private/x" })
    ).toMatchObject({ allowed: false });
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/public" })
    ).toEqual({ allowed: true });
  });

  it("applies longest-match-wins with allow/disallow ties going to allow", () => {
    const body = "User-agent: *\nDisallow: /\nAllow: /public";
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/public/page" })
    ).toEqual({ allowed: true });
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/internal/page" })
    ).toMatchObject({ allowed: false });
  });

  it("supports wildcard and end-anchor patterns", () => {
    const body = "User-agent: *\nDisallow: /*.pdf$\n";
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/files/a.pdf" })
    ).toMatchObject({ allowed: false });
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/files/a.pdf.htm" })
    ).toEqual({ allowed: true });
  });

  it("ignores comments and unknown fields", () => {
    const body = "# comment\nUser-agent: *\nSitemap: https://x/sitemap.xml\nDisallow: /private # trailing";
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/open" })
    ).toEqual({ allowed: true });
    expect(
      robotsAllowsRequest({ robotsStatus: 200, robotsBody: body, pathname: "/private" })
    ).toMatchObject({ allowed: false });
  });
});

describe("isPrivateSiteHostname", () => {
  it("blocks loopback, RFC1918, link-local, and local-suffix hosts", () => {
    for (const host of [
      "localhost",
      "sub.localhost",
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.1.1",
      "0.0.0.0",
      "db.internal",
      "myserver.local",
      "::1",
    ]) {
      expect(isPrivateSiteHostname(host)).toBe(true);
    }
  });

  it("allows public hosts and non-private ranges", () => {
    for (const host of [
      "freshproof.example.com",
      "www.thelowerdb.com",
      "172.32.0.1",
      "172.15.0.1",
      "11.0.0.1",
      "api.firecrawl.dev",
    ]) {
      expect(isPrivateSiteHostname(host)).toBe(false);
    }
  });
});

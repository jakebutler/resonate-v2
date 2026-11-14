import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAction, useQuery } from "convex/react";
import { IntelFlow } from "@/components/aeo/IntelFlow";

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    aeoIntel: {
      getTarget: "aeoIntel:getTarget",
      listCrawls: "aeoIntel:listCrawls",
      listRuns: "aeoIntel:listRuns",
      listFindings: "aeoIntel:listFindings",
      listCrawlPages: "aeoIntel:listCrawlPages",
    },
    aeoCrawl: {
      captureCrawlSnapshot: "aeoCrawl:captureCrawlSnapshot",
    },
  },
}));

vi.mock("@/components/aeo/AeoWorkspaceChrome", () => ({
  useAeoBrand: () => ({ brandId: "freshproof", brandName: "FreshProof" }),
}));

const crawlRows = [
  // listCrawls arrives newest-first: v2 is the newest snapshot.
  { _id: "crawl_2", version: 2, createdAt: 200, status: "complete", siteUrl: "https://www.freshproof.example" },
  { _id: "crawl_1", version: 1, createdAt: 100, status: "complete", siteUrl: "https://www.freshproof.example" },
];

const newestCrawlPages = [
  {
    _id: "page_1",
    url: "https://www.freshproof.example/",
    title: "FreshProof claim validation",
    headings: ["evidence review"],
    schemaTypes: [],
    createdAt: 200,
  },
  {
    _id: "page_2",
    url: "https://www.freshproof.example/pricing",
    title: "Pricing",
    headings: [],
    schemaTypes: [],
    createdAt: 200,
  },
];

describe("IntelFlow snapshot pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAction).mockReturnValue(vi.fn());
    vi.mocked(useQuery).mockImplementation((reference: unknown) => {
      switch (reference) {
        case "aeoIntel:getTarget":
          return null;
        case "aeoIntel:listCrawls":
          return crawlRows;
        case "aeoIntel:listRuns":
          return [];
        case "aeoIntel:listFindings":
          return [];
        case "aeoIntel:listCrawlPages":
          return newestCrawlPages;
        default:
          return undefined;
      }
    });
  });

  it("loads the newest snapshot's pages without an explicit selection", () => {
    // Regression: the pages query was gated on an explicit snapshot selection,
    // so the panel's default view (the newest snapshot) rendered
    // "0 pages crawled" until the user clicked a version.
    render(<IntelFlow />);

    const pagesCalls = vi
      .mocked(useQuery)
      .mock.calls.filter(([reference]) => reference === "aeoIntel:listCrawlPages");
    expect(pagesCalls.length).toBeGreaterThan(0);
    expect(pagesCalls[0]).toEqual([
      "aeoIntel:listCrawlPages",
      { brandId: "freshproof", crawlId: "crawl_2" },
    ]);
  });

  it("shows the default-selected newest snapshot's page count", () => {
    render(<IntelFlow />);
    expect(screen.getByText(/2 pages crawled/)).toBeDefined();
  });
});

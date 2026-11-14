import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAction, useQuery } from "convex/react";
import { IntelFlow } from "@/components/aeo/IntelFlow";
import type { Doc, Id } from "@/convex/_generated/dataModel";

// The /aeo/intel page harness: IntelFlow is the page body; the Convex query
// boundary and the brand context are mocked, the citation mapping and the
// CitationResultsPanel render for real.
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

const runId = "run-1" as Id<"intelRuns">;

function runRow(overrides: Partial<Doc<"intelRuns">> = {}): Doc<"intelRuns"> {
  return {
    _id: runId,
    _creationTime: 1,
    userId: "owner",
    brandId: "freshproof",
    kind: "answer-engine",
    status: "complete",
    costCeilingCents: 50,
    questionCount: 2,
    startedAt: 1,
    finishedAt: 2,
    ...overrides,
  } as Doc<"intelRuns">;
}

function findingRow(overrides: Partial<Doc<"intelFindings">>): Doc<"intelFindings"> {
  return {
    _id: "finding" as Id<"intelFindings">,
    _creationTime: 1,
    userId: "owner",
    brandId: "freshproof",
    runId,
    classification: "opportunity",
    citationStatus: "cited",
    extractability: 50,
    summary: "Would you recommend FreshProof?",
    evidence: ["question: q", "answer: a"],
    reviewStatus: "unreviewed",
    createdAt: 1,
    ...overrides,
  } as Doc<"intelFindings">;
}

function mockQueries(rows: {
  target?: Doc<"brandTargets">;
  runs: Doc<"intelRuns">[];
  findings: Doc<"intelFindings">[];
}) {
  vi.mocked(useQuery).mockImplementation(((query: unknown) => {
    if (query === "aeoIntel:getTarget") return rows.target ?? null;
    if (query === "aeoIntel:listCrawls") return [];
    if (query === "aeoIntel:listRuns") return rows.runs;
    if (query === "aeoIntel:listFindings") return rows.findings;
    return undefined;
  }) as typeof useQuery);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAction).mockReturnValue(vi.fn());
});

describe("IntelFlow snapshot pages", () => {
  beforeEach(() => {
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

describe("IntelFlow (the /aeo/intel surface)", () => {
  it("renders the mismatch warning and qualifies the citation when a cited answer is suspect", () => {
    mockQueries({
      runs: [runRow({ brandMismatchCount: 1 })],
      findings: [
        findingRow({
          _id: "f-suspect" as Id<"intelFindings">,
          brandMatch: "suspect",
          brandMatchDetail:
            "Answer names the brand but shares almost none of its topic vocabulary with the target's crawled content (5% overlap).",
        }),
        findingRow({
          _id: "f-match" as Id<"intelFindings">,
          summary: "What is FreshProof and what does it do?",
          brandMatch: "match",
        }),
      ],
    });

    render(<IntelFlow />);

    // Run-level and per-finding warnings are both visible.
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(screen.getByText(/Brand mismatch suspected: 1 of 2/)).toBeInTheDocument();
    expect(screen.getByText(/Mismatch suspected\./)).toBeInTheDocument();
    // The suspect citation is always qualified; the matched one stays plain.
    expect(
      screen.getByText("Cited: FreshProof (mismatch suspected)")
    ).toBeInTheDocument();
    expect(screen.getByText("Cited: FreshProof")).toBeInTheDocument();
  });

  it("renders no warning when every citation matches the target", () => {
    mockQueries({
      runs: [runRow()],
      findings: [findingRow({ brandMatch: "match" })],
    });

    render(<IntelFlow />);

    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    expect(screen.getByText("Cited: FreshProof")).toBeInTheDocument();
    expect(screen.queryByText(/mismatch suspected/i)).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import {
  CRAWL_CONTENT_SAMPLE_MAX_CHARS,
  crawlCapturePagesFromFirecrawl,
  extractMarkdownHeadings,
} from "@/lib/aeoCrawl";
import type { SanitizedFirecrawlPage } from "@/lib/providerAdapters";

const page = (overrides: Partial<SanitizedFirecrawlPage> = {}): SanitizedFirecrawlPage => ({
  sourceUrl: "https://freshproof.example.com/",
  title: "FreshProof",
  description: "Claim validation",
  markdown: "# Home\n\nBody text.\n\n## Evidence review\n\nMore text.",
  statusCode: 200,
  ...overrides,
});

describe("extractMarkdownHeadings", () => {
  it("extracts ATX headings of any level", () => {
    expect(extractMarkdownHeadings("# A\n\ntext\n\n### C\n\n## B")).toEqual([
      "A",
      "C",
      "B",
    ]);
  });

  it("ignores hash runs inside code fences or prose", () => {
    expect(extractMarkdownHeadings("not a heading\n#tag in prose")).toEqual([]);
  });

  it("returns nothing without markdown", () => {
    expect(extractMarkdownHeadings(undefined)).toEqual([]);
  });
});

describe("crawlCapturePagesFromFirecrawl", () => {
  it("maps sanitized pages into the crawlPages storage shape", () => {
    expect(
      crawlCapturePagesFromFirecrawl([
        page({ markdown: "# Home\n\nFirst.\n\n## Evidence review" }),
      ])
    ).toEqual([
      {
        url: "https://freshproof.example.com/",
        title: "FreshProof",
        headings: ["Home", "Evidence review"],
        schemaTypes: [],
        description: "Claim validation",
        contentSample: "# Home\n\nFirst.\n\n## Evidence review",
      },
    ]);
  });

  it("drops pages without a URL instead of storing junk rows", () => {
    expect(
      crawlCapturePagesFromFirecrawl([page({ sourceUrl: "" }), page()])
    ).toHaveLength(1);
  });

  it("caps the content sample", () => {
    const long = "a".repeat(CRAWL_CONTENT_SAMPLE_MAX_CHARS + 500);
    const [mapped] = crawlCapturePagesFromFirecrawl([page({ markdown: long })]);
    expect(mapped?.contentSample?.length).toBe(CRAWL_CONTENT_SAMPLE_MAX_CHARS);
  });
});

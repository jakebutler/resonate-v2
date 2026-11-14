import type { SanitizedFirecrawlPage } from "./providerAdapters";

/**
 * Pure mapping from sanitized Firecrawl pages to the `crawlPages` shape the
 * AEO intel layer stores (convex/aeoIntel.ts `crawlPageInput`). Used by the
 * in-app crawl-capture action; kept pure so the mapping is unit-testable.
 */

export const CRAWL_CONTENT_SAMPLE_MAX_CHARS = 2000;

export type CrawlCapturePage = {
  url: string;
  title?: string;
  headings: string[];
  schemaTypes: string[];
  description?: string;
  contentSample?: string;
};

/** Extracts ATX headings (`#`–`######` lines) from a markdown document. */
export function extractMarkdownHeadings(markdown: string | undefined): string[] {
  if (typeof markdown !== "string") return [];
  const headings: string[] = [];
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const text = match[1]?.trim();
    if (text) headings.push(text);
  }
  return headings;
}

export function crawlCapturePageFromFirecrawl(
  page: SanitizedFirecrawlPage
): CrawlCapturePage {
  return {
    url: page.sourceUrl,
    title: page.title,
    headings: extractMarkdownHeadings(page.markdown),
    // Firecrawl's markdown scrape option carries no structured-data info;
    // schema coverage is a later crawl-format concern, not silently guessed.
    schemaTypes: [],
    description: page.description,
    contentSample: page.markdown
      ? page.markdown.slice(0, CRAWL_CONTENT_SAMPLE_MAX_CHARS)
      : undefined,
  };
}

export function crawlCapturePagesFromFirecrawl(
  pages: SanitizedFirecrawlPage[]
): CrawlCapturePage[] {
  return pages
    .filter((page) => page.sourceUrl)
    .map(crawlCapturePageFromFirecrawl);
}

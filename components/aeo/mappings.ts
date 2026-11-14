import type { Doc } from "@/convex/_generated/dataModel";
import { stripResponseFormatInstruction } from "@/lib/competitorDiscovery";
import type {
  BrandTarget,
  CitationRun,
  CompetitorComparison,
  ConnectionValidation,
  CrawlPage,
  CrawlSnapshot,
  Gap,
  GapPriority,
  KeywordGap,
  StrategyPlan,
  SuggestedCompetitor,
  CompetitorSets,
} from "./types";

type BrandTargetRow = Doc<"brandTargets">;
type SiteCrawlRow = Doc<"siteCrawls">;
type CrawlPageRow = Doc<"crawlPages">;
type IntelRunRow = Doc<"intelRuns">;
type IntelFindingRow = Doc<"intelFindings">;
type StrategyPlanRow = Doc<"strategyPlans">;
type SuggestionRow = Doc<"competitorSuggestions">;
type KeywordGapRow = Doc<"keywordGaps">;

/** The target's hostname without "www." — the display/matching convention used
 * by the data model's competitor names. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * The data model stores one validation per target (the envelope validated at
 * connect time); until per-provider checks exist, both provider rows honestly
 * mirror that single stored state.
 */
function storedValidationToConnection(
  validation: BrandTargetRow["validation"]
): ConnectionValidation {
  if (!validation) return { state: "unvalidated" };
  return {
    state:
      validation.state === "validated"
        ? "valid"
        : validation.state === "failed"
          ? "invalid"
          : "unvalidated",
    detail: validation.detail,
    checkedAt: validation.checkedAt,
  };
}

export function targetRowToBrandTarget(row: BrandTargetRow): BrandTarget {
  return {
    siteUrl: row.siteUrl,
    productIdentifiers: row.productIdentifiers,
    competitorUrls: row.competitorUrls,
    connections: {
      firecrawl: storedValidationToConnection(row.validation),
      answerEngine: storedValidationToConnection(row.validation),
    },
    reviewPinned: row.reviewPinned ?? false,
  };
}

export function crawlPageRowToCrawlPage(row: CrawlPageRow): CrawlPage {
  return {
    url: row.url,
    title: row.title ?? row.url,
    metaDescription: row.description,
    headingCount: row.headings.length,
    schemaTypes: row.schemaTypes,
  };
}

export function crawlRowToSnapshot(
  row: SiteCrawlRow,
  pages: CrawlPageRow[]
): CrawlSnapshot {
  return {
    id: row._id,
    version: row.version,
    crawledAt: row.createdAt,
    pages: pages.map(crawlPageRowToCrawlPage),
  };
}

/**
 * Extractability drives gap priority: easily extractable content that is not
 * yet cited is the fastest win; a cited finding is already landing.
 */
export function gapPriorityForFinding(row: IntelFindingRow): GapPriority {
  if (row.citationStatus !== "cited" && row.extractability >= 0.7) {
    return "high";
  }
  if (row.extractability >= 0.4) return "medium";
  return "low";
}

export function findingRowToGap(row: IntelFindingRow): Gap {
  return {
    id: row._id,
    kind: row.classification,
    priority: gapPriorityForFinding(row),
    title: row.summary,
    detail: row.evidence.join(" · "),
    // The data model records questions and evidence, not keywords; none are
    // invented here.
    keywords: [],
  };
}

/**
 * Maps a completed answer-engine run's findings onto the citation panel. The
 * model stores per-finding citation status, so the brand row reflects that
 * status; citations are not attributed to competitors per finding today.
 */
export function runRowsToCitationRun(
  run: IntelRunRow,
  findings: IntelFindingRow[],
  brandName: string
): CitationRun {
  return {
    id: run._id,
    ranAt: run.finishedAt ?? run.startedAt,
    brandMismatchCount: run.brandMismatchCount,
    results: findings.map((finding) => ({
      question: finding.summary,
      citedBrands: finding.citationStatus === "cited" ? [brandName] : [],
      citedCompetitors: [],
      extractabilityScore: finding.extractability,
      brandMatch: finding.brandMatch,
      brandMatchDetail: finding.brandMatchDetail,
      // recordFinding stores the question at evidence[0] and a truncated
      // answer excerpt at evidence[1].
      answerExcerpt: finding.evidence[1],
    })),
  };
}

function latestCompleteCrawl(
  crawls: SiteCrawlRow[],
  siteUrl: string
): SiteCrawlRow | undefined {
  return crawls
    .filter((crawl) => crawl.siteUrl === siteUrl && crawl.status === "complete")
    .sort((a, b) => b.version - a.version)[0];
}

/**
 * Builds the comparison from real rows only: the target's latest complete
 * crawl plus any tracked competitor that has its own crawl snapshot. Competitor
 * citation counts stay 0 because answer-engine findings attribute citations to
 * the target only — a future run kind would have to count them per domain.
 */
export function buildCompetitorComparison(input: {
  brandName: string;
  siteUrl: string;
  crawls: SiteCrawlRow[];
  findings: IntelFindingRow[];
  competitorUrls: string[];
}): CompetitorComparison | null {
  const targetCrawl = latestCompleteCrawl(input.crawls, input.siteUrl);
  if (!targetCrawl) return null;
  // A citation suspected of describing a different product is not a citation
  // of this brand — it must not inflate the target's citation count.
  const targetCitationCount = input.findings.filter(
    (finding) => finding.citationStatus === "cited" && finding.brandMatch !== "suspect"
  ).length;
  return {
    target: {
      name: input.brandName,
      domain: hostOf(input.siteUrl),
      pageCount: targetCrawl.pageCount,
      citationCount: targetCitationCount,
    },
    competitors: input.competitorUrls.map((url) => {
      const domain = hostOf(url);
      return {
        name: domain,
        domain,
        pageCount: latestCompleteCrawl(input.crawls, url)?.pageCount ?? 0,
        citationCount: 0,
      };
    }),
  };
}

/**
 * The review queue: confirmed competitors come from brandTargets.competitorUrls
 * (the tracking set accept writes into); only rows still awaiting review stay
 * suggestions — an accepted row's URL has already joined the tracking set.
 */
export function suggestionRowsToSets(
  rows: SuggestionRow[],
  competitorUrls: string[]
): CompetitorSets {
  const confirmed = competitorUrls.map((url) => ({
    id: url,
    name: hostOf(url),
    domain: hostOf(url),
  }));
  const suggestions: SuggestedCompetitor[] = rows
    .filter((row) => row.status === "suggested")
    .map((row) => {
      // Stored labels and phrasings from before the topic split may carry
      // the provider's response-format instruction — plumbing that never
      // renders.
      const phrasings = row.phrasings
        .map(stripResponseFormatInstruction)
        .filter((phrasing) => phrasing !== "");
      return {
        id: row._id,
        name: row.name,
        domain: hostOf(row.url),
        evidence: {
          source:
            stripResponseFormatInstruction(row.evidence[0] ?? "") ||
            "Discovery pass",
          occurrences: row.frequency,
          examplePhrasing: phrasings[0],
        },
        status: "pending" as const,
      };
    });
  return { confirmed, suggestions };
}

/**
 * Maps a stored keyword-gap row onto the display type. The row already holds
 * the honest verdict and its sources; nothing is added or inferred here.
 */
export function keywordGapRowToKeywordGap(row: KeywordGapRow): KeywordGap {
  return {
    id: row._id,
    keyword: row.keyword,
    status: row.status,
    signal: row.signal,
    questions: row.evidence.filter((line) => line.endsWith("?")),
    sourcePageUrls: row.sourcePageUrls,
    fromPlan: row.fromPlan,
    evidence: row.evidence,
    ...(row.searchedAt !== undefined ? { searchedAt: row.searchedAt } : {}),
  };
}

export function planRowToStrategyPlan(row: StrategyPlanRow): {
  plan: StrategyPlan;
  gapTitles: Record<string, string>;
} {
  const items = [...row.plan.gaps, ...row.plan.opportunities].sort(
    (a, b) => a.priority - b.priority
  );
  const gapTitles = Object.fromEntries(
    items.flatMap((item) =>
      item.sourceFindingIds.map((findingId) => [findingId, item.title])
    )
  );
  return {
    plan: {
      id: row._id,
      brief: row.plan.brief,
      priorityIds: items.flatMap((item) => item.sourceFindingIds),
      // Plans are append-only versions: "reviewed"/"accepted" status means a
      // human reviewed this version; a change request lands as a new draft
      // version with the note in reviewNotes.
      reviewState: row.status === "draft" ? "unreviewed" : "accepted",
    },
    gapTitles,
  };
}

export type { BrandTargetRow, SiteCrawlRow, IntelRunRow, IntelFindingRow, StrategyPlanRow, SuggestionRow, KeywordGapRow };

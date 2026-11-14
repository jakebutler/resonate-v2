/**
 * Loading-state envelope for every AEO/SEO panel. Loading, error and empty are
 * states of the props, not runtime guesses, so a panel cannot render data that
 * has not arrived.
 */
export type Loadable<T> =
  | { status: "loading" }
  | { status: "error"; message: string; onRetry?: () => void }
  | { status: "ready"; data: T };

/** Read-only vendor validation states, mirroring the provider-adapter pattern. */
export type ValidationState = "unvalidated" | "valid" | "invalid";

export type ConnectionValidation = {
  state: ValidationState;
  detail?: string;
  checkedAt?: number;
};

/**
 * The connected target for one brand: the site (or app/product) being
 * marketed, the competitors named at connect time, and the read-only
 * validation state of each data provider behind the intel runs.
 */
export type BrandTarget = {
  siteUrl: string;
  productIdentifiers: string[];
  competitorUrls: string[];
  connections: {
    firecrawl: ConnectionValidation;
    answerEngine: ConnectionValidation;
  };
  /** Set by the review-pin flow; nothing acts on an unpinned target. */
  reviewPinned: boolean;
};

export type ConnectTargetInput = {
  siteUrl: string;
  competitorUrls: string[];
};

export type CrawlPage = {
  url: string;
  title: string;
  metaDescription?: string;
  headingCount: number;
  schemaTypes: string[];
};

/** One immutable crawl version; new snapshots are versions, never edits. */
export type CrawlSnapshot = {
  id: string;
  version: number;
  crawledAt: number;
  pages: CrawlPage[];
};

export type CompetitorCitationRow = {
  name: string;
  domain: string;
  pageCount: number;
  citationCount: number;
};

export type CompetitorComparison = {
  target: CompetitorCitationRow;
  competitors: CompetitorCitationRow[];
};

export type CitationQuestionResult = {
  question: string;
  citedBrands: string[];
  citedCompetitors: string[];
  /** 0–1 extractability score against the connected target's content. */
  extractabilityScore?: number;
  answerExcerpt?: string;
  /**
   * Brand-mismatch classification for a cited answer. "suspect" means the
   * cited content may describe a different product with the same name —
   * the citation must always be displayed with that qualifier.
   */
  brandMatch?: BrandMatchVerdict;
  brandMatchDetail?: string;
};

/** Verdict of the answer-engine brand-mismatch heuristic (lib/answerEngine). */
export type BrandMatchVerdict = "match" | "suspect" | "unknown";

export type CitationRun = {
  id: string;
  ranAt: number;
  results: CitationQuestionResult[];
  /** How many cited answers in this run are suspected of a brand mismatch. */
  brandMismatchCount?: number;
};

/** Evidence-cited competitor proposal from a discovery pass. */
export type SuggestedCompetitor = {
  id: string;
  name: string;
  domain: string;
  evidence: {
    source: string;
    occurrences: number;
    examplePhrasing?: string;
  };
  status: "pending" | "accepted" | "rejected";
  rejectionReason?: string;
};

export type ConfirmedCompetitor = {
  id: string;
  name: string;
  domain: string;
  addedFromSuggestion?: boolean;
};

export type CompetitorSets = {
  confirmed: ConfirmedCompetitor[];
  suggestions: SuggestedCompetitor[];
};

export type GapKind = "gap" | "opportunity";

export type GapPriority = "high" | "medium" | "low";

export type Gap = {
  id: string;
  kind: GapKind;
  priority: GapPriority;
  title: string;
  detail: string;
  keywords: string[];
};

/** Brief fields mapped to the Marketing Director's required brief set. */
export type StrategyPlanBrief = {
  goal: string;
  audience: string;
  thesis: string;
  window: string;
  channels: string[];
  cta: string;
  metric: string;
  constraints: string[];
};

export type StrategyPlan = {
  id: string;
  brief: StrategyPlanBrief;
  /** Gap ids the plan prioritizes, in priority order. */
  priorityIds: string[];
  reviewState: "unreviewed" | "accepted" | "changes-requested";
};

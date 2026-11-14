// Keyword-gap research (SEO half of AEO/SEO).
//
// The system has no search-volume vendor: Firecrawl exposes site crawl and
// search-result listings, never demand metrics. Candidates are therefore
// derived only from data the system already holds — target crawl pages,
// answer-engine questions, competitor-discovery phrasings, and saved plan
// keywords — and demand-adjacent signals are honest absence signals from real
// runs: which audit questions the target was NOT cited in, and which search
// results do not surface the target's domain. Every pure function here is
// fixture-testable and shared by the run action and the UI mapping.

import { competitorNameFromUrl } from "./answerEngine";
import { stripResponseFormatInstruction } from "./competitorDiscovery";

export type KeywordPresence = "present" | "absent" | "unproven";

export type KeywordSignal = "answer-engine" | "search" | "derived";

/** Where one candidate keyword came from — every source names a real row. */
export type KeywordSource =
  | { kind: "crawl-page"; pageUrl: string }
  | { kind: "question"; findingId: string }
  | { kind: "competitor-topic"; suggestionId: string }
  | { kind: "plan-keyword" };

export type KeywordCandidate = {
  keyword: string;
  origin: "crawl" | "question" | "competitor" | "plan";
  sources: KeywordSource[];
};

export type KeywordResearchRunLimits = {
  maxSearchQueries: number;
  runCeilingCents: number;
  costPerQueryCents: number;
  staleRunMs: number;
  maxCandidates: number;
};

const DEFAULT_MAX_SEARCH_QUERIES = 5;
const DEFAULT_RUN_CEILING_CENTS = 50;
const DEFAULT_COST_PER_QUERY_CENTS = 2;
const DEFAULT_STALE_RUN_MS = 30 * 60 * 1000;
const DEFAULT_MAX_CANDIDATES = 25;

function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function keywordRunLimits(env: Record<string, string | undefined>): KeywordResearchRunLimits {
  return {
    maxSearchQueries: positiveIntFromEnv(env.AEO_KEYWORD_MAX_SEARCH_QUERIES, DEFAULT_MAX_SEARCH_QUERIES),
    runCeilingCents: positiveIntFromEnv(env.AEO_KEYWORD_RUN_CEILING_CENTS, DEFAULT_RUN_CEILING_CENTS),
    costPerQueryCents: positiveIntFromEnv(env.AEO_KEYWORD_COST_PER_QUERY_CENTS, DEFAULT_COST_PER_QUERY_CENTS),
    staleRunMs: positiveIntFromEnv(env.AEO_KEYWORD_STALE_RUN_MS, DEFAULT_STALE_RUN_MS),
    maxCandidates: positiveIntFromEnv(env.AEO_KEYWORD_MAX_CANDIDATES, DEFAULT_MAX_CANDIDATES),
  };
}

/** Canonical form used for dedupe and matching; the stored keyword stays verbatim. */
export function normalizeKeyword(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Derivable phrases only: too-short fragments and nav-scale strings are not phrases. */
function isDerivablePhrase(text: string): boolean {
  const normalized = normalizeKeyword(text);
  return normalized.length >= 3 && normalized.length <= 120;
}

export type KeywordResearchInput = {
  pages: Array<{ url: string; title?: string; headings: string[] }>;
  findings: Array<{ _id: string; summary: string }>;
  /** Competitor-discovery rows with their stored phrasings. */
  suggestions: Array<{ _id: string; phrasings: string[] }>;
  planKeywords: string[];
};

/**
 * Derives candidate keywords from real rows only. Nothing is invented: every
 * candidate is a phrase the system observed — a page title or heading, an
 * audit question, a discovery phrasing, or a saved plan keyword — and carries
 * the rows it came from. Duplicates collapse onto the first origin; the set
 * is capped so one huge crawl cannot flood the run.
 */
export function deriveKeywordCandidates(
  input: KeywordResearchInput,
  maxCandidates: number
): KeywordCandidate[] {
  const byKeyword = new Map<string, KeywordCandidate>();

  function add(keyword: string, origin: KeywordCandidate["origin"], source: KeywordSource): void {
    const normalized = normalizeKeyword(keyword);
    if (!isDerivablePhrase(keyword) || byKeyword.has(normalized)) return;
    byKeyword.set(normalized, { keyword: keyword.trim(), origin, sources: [source] });
  }

  for (const page of input.pages) {
    if (page.title) add(page.title, "crawl", { kind: "crawl-page", pageUrl: page.url });
    for (const heading of page.headings) {
      add(heading, "crawl", { kind: "crawl-page", pageUrl: page.url });
    }
  }
  for (const finding of input.findings) {
    add(finding.summary, "question", { kind: "question", findingId: finding._id });
  }
  for (const suggestion of input.suggestions) {
    for (const phrasing of suggestion.phrasings) {
      // Discovery phrasings may predate the topic split and carry the
      // provider's response-format instruction; the user-facing topic is the
      // phrase without it.
      const cleaned = stripResponseFormatInstruction(phrasing);
      if (cleaned) add(cleaned, "competitor", { kind: "competitor-topic", suggestionId: suggestion._id });
    }
  }
  for (const keyword of input.planKeywords) {
    add(keyword, "plan", { kind: "plan-keyword" });
  }
  return [...byKeyword.values()].slice(0, maxCandidates);
}

export type CitationFinding = {
  _id: string;
  summary: string;
  citationStatus: "cited" | "uncited" | "not-observed";
  brandMatch?: "match" | "suspect" | "unknown";
};

function keywordMatchesFinding(keyword: string, question: string): boolean {
  const normalizedKeyword = normalizeKeyword(keyword);
  const normalizedQuestion = normalizeKeyword(question);
  return normalizedQuestion.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedQuestion);
}

/**
 * Absence-of-citation from real answer-engine runs. "present" only when a run
 * observed the keyword and cited the brand (a suspect citation describes
 * possibly another product, so it never counts as presence); observed but
 * uncited is "absent"; no run ever asked about it is "unproven" — never
 * "absent", because absence without observation is not evidence.
 */
export function keywordCitationStatus(keyword: string, findings: CitationFinding[]): KeywordPresence {
  const observed = findings.filter((finding) => keywordMatchesFinding(keyword, finding.summary));
  if (observed.length === 0) return "unproven";
  const cited = observed.some(
    (finding) => finding.citationStatus === "cited" && finding.brandMatch !== "suspect"
  );
  return cited ? "present" : "absent";
}

/**
 * Absence-from-search: whether the target's own domain surfaces in the real
 * search results a budgeted Firecrawl search returned for the keyword.
 */
export function keywordSearchPresence(
  keyword: string,
  results: Array<{ url: string }>,
  targetSiteUrl: string
): KeywordPresence {
  const targetHost = competitorNameFromUrl(targetSiteUrl);
  const present = results.some((result) => competitorNameFromUrl(result.url) === targetHost);
  return present ? "present" : "absent";
}

export type KeywordResearchRunPlan =
  | {
      ok: true;
      candidateCount: number;
      searchQueryCount: number;
      estimatedCostCents: number;
      ceilingCents: number;
    }
  | {
      ok: false;
      reason: "no-candidates" | "budget-exceeded";
      candidateCount: number;
      estimatedCostCents: number;
      ceilingCents: number;
    };

/**
 * Budget admission, mirroring the discovery precedent: refuse before any
 * dispatch when there is nothing to research or the planned spend exceeds the
 * run ceiling.
 */
export function planKeywordResearchRun(input: {
  candidateCount: number;
  limits: KeywordResearchRunLimits;
}): KeywordResearchRunPlan {
  const { candidateCount, limits } = input;
  if (candidateCount === 0) {
    return { ok: false, reason: "no-candidates", candidateCount, estimatedCostCents: 0, ceilingCents: limits.runCeilingCents };
  }
  const searchQueryCount = Math.min(candidateCount, limits.maxSearchQueries);
  const estimatedCostCents = searchQueryCount * limits.costPerQueryCents;
  if (estimatedCostCents > limits.runCeilingCents) {
    return {
      ok: false,
      reason: "budget-exceeded",
      candidateCount,
      estimatedCostCents,
      ceilingCents: limits.runCeilingCents,
    };
  }
  return { ok: true, candidateCount, searchQueryCount, estimatedCostCents, ceilingCents: limits.runCeilingCents };
}

/**
 * Search order for the budgeted leg: the observed gaps first — absent and
 * unproven candidates are exactly what the marketer is missing — then the
 * rest in derivation order.
 */
export function keywordSearchOrder(candidates: KeywordCandidate[]): KeywordCandidate[] {
  const absentFirst = new Map<KeywordCandidate["origin"], number>([
    ["question", 0],
    ["plan", 1],
    ["competitor", 2],
    ["crawl", 3],
  ]);
  return [...candidates].sort((a, b) => (absentFirst.get(a.origin) ?? 9) - (absentFirst.get(b.origin) ?? 9));
}

/**
 * Merges researched keywords into a plan's target keywords: the observed
 * gaps (absent first, then unproven, then present) ahead of the keywords the
 * plan already carried. Deduplication is by normalized phrase, so reseeding
 * after a re-run never stacks duplicates.
 */
export function mergePlanTargetKeywords(
  existing: string[],
  gaps: Array<{ keyword: string; status: KeywordPresence }>
): string[] {
  const rank: Record<KeywordPresence, number> = { absent: 0, unproven: 1, present: 2 };
  const seen = new Set(existing.map(normalizeKeyword));
  const merged: string[] = [...existing];
  for (const gap of [...gaps].sort((a, b) => rank[a.status] - rank[b.status])) {
    const normalized = normalizeKeyword(gap.keyword);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    merged.push(gap.keyword);
  }
  return merged;
}

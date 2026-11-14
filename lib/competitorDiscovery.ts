// Competitor discovery pass (A5).
//
// A budgeted batch asks Firecrawl search and the Cortex/Pioneer gateway which
// products, alternatives, and tools surface for a brand's category and target
// questions. Every surfaced candidate becomes a reviewable
// `competitorSuggestions` row carrying its source evidence — which query or
// answer surfaced it, how often, in what phrasing. Nothing here proposes,
// accepts, or adds anything automatically: candidates are evidence, the
// review queue is the instruction path.

import { competitorNameFromUrl } from "./answerEngine";

// Per-run budget admission mirrors the answer-engine precedent: refuse before
// any dispatch when the estimated cost exceeds the run ceiling.
const DEFAULT_MAX_QUERIES = 4;
const DEFAULT_RUN_CEILING_CENTS = 50;
const DEFAULT_COST_PER_QUERY_CENTS = 2;

export type DiscoveryRunLimits = {
  maxQueries: number;
  runCeilingCents: number;
  costPerQueryCents: number;
};

function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function discoveryRunLimits(env: Record<string, string | undefined>): DiscoveryRunLimits {
  return {
    maxQueries: positiveIntFromEnv(env.AEO_DISCOVERY_MAX_QUERIES, DEFAULT_MAX_QUERIES),
    runCeilingCents: positiveIntFromEnv(env.AEO_DISCOVERY_RUN_CEILING_CENTS, DEFAULT_RUN_CEILING_CENTS),
    costPerQueryCents: positiveIntFromEnv(
      env.AEO_DISCOVERY_COST_PER_QUERY_CENTS,
      DEFAULT_COST_PER_QUERY_CENTS
    ),
  };
}

export type DiscoveryQuery = {
  /** Which leg of the pass produced it — a Firecrawl search or a gateway ask. */
  channel: "search" | "answer-engine";
  /** The exact search query or question text (recorded as the phrasing). */
  prompt: string;
};

/**
 * The discovery query set for a brand target: category/alternatives phrasings
 * across search and the gateway question set. The full set is returned in
 * priority order; callers cap it to the run's query budget.
 */
export function buildDiscoveryQueries(input: {
  brandName: string;
  productIdentifiers: string[];
}): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [
    {
      channel: "search",
      prompt: `best alternatives to ${input.brandName}`,
    },
    {
      channel: "answer-engine",
      prompt: `Which tools or products would you recommend instead of ${input.brandName}? Reply with a JSON array of objects with "name" and "url".`,
    },
  ];
  for (const identifier of input.productIdentifiers) {
    queries.push({
      channel: "search",
      prompt: `best ${identifier} tools and alternatives`,
    });
    queries.push({
      channel: "answer-engine",
      prompt: `Which tools or products would you recommend for ${identifier}? Reply with a JSON array of objects with "name" and "url".`,
    });
  }
  return queries;
}

export type DiscoveryRunPlan =
  | {
      ok: true;
      queryCount: number;
      estimatedCostCents: number;
      ceilingCents: number;
    }
  | {
      ok: false;
      reason: "no-queries" | "budget-exceeded";
      queryCount: number;
      estimatedCostCents: number;
      ceilingCents: number;
    };

export function planDiscoveryRun(input: {
  queryCount: number;
  limits: DiscoveryRunLimits;
}): DiscoveryRunPlan {
  const estimatedCostCents = input.queryCount * input.limits.costPerQueryCents;
  if (input.queryCount <= 0) {
    return {
      ok: false,
      reason: "no-queries",
      queryCount: input.queryCount,
      estimatedCostCents,
      ceilingCents: input.limits.runCeilingCents,
    };
  }
  if (estimatedCostCents > input.limits.runCeilingCents) {
    return {
      ok: false,
      reason: "budget-exceeded",
      queryCount: input.queryCount,
      estimatedCostCents,
      ceilingCents: input.limits.runCeilingCents,
    };
  }
  return {
    ok: true,
    queryCount: input.queryCount,
    estimatedCostCents,
    ceilingCents: input.limits.runCeilingCents,
  };
}

export type ParsedDiscoveryCandidate = { name: string; url: string };

function httpUrl(raw: unknown): URL | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  return name && name.length <= 100 ? name : null;
}

/**
 * Parse a gateway answer into candidate competitors. The answer is expected to
 * carry a JSON array of {name, url}; when the JSON is absent or malformed the
 * parser falls back to any http(s) URLs mentioned in the prose (the URL's
 * host becomes the name). It never fabricates candidates — unparseable text
 * yields an empty list.
 */
export function parseDiscoveryAnswer(answer: string): ParsedDiscoveryCandidate[] {
  const jsonMatch = /\[[\s\S]*\]/.exec(answer);
  if (jsonMatch) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = null;
    }
    if (Array.isArray(parsed)) {
      const candidates: ParsedDiscoveryCandidate[] = [];
      for (const entry of parsed) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const record = entry as Record<string, unknown>;
        const url = httpUrl(record.url);
        if (!url) continue;
        const name = cleanName(record.name) ?? competitorNameFromUrl(url.toString());
        candidates.push({ name, url: url.toString() });
      }
      return candidates;
    }
  }
  const seen = new Set<string>();
  const candidates: ParsedDiscoveryCandidate[] = [];
  for (const match of answer.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) {
    const url = httpUrl(match[0]);
    if (!url) continue;
    const key = url.hostname;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push({ name: competitorNameFromUrl(url.toString()), url: url.toString() });
  }
  return candidates;
}

/**
 * The stored evidence entry for one candidate from one query: which channel
 * and phrasing surfaced it, and what exactly was seen. Every suggestion cites
 * this — a suggestion without evidence is a bug, not a feature.
 */
export function discoveryEvidenceLabel(
  query: DiscoveryQuery,
  detail: { url: string; title?: string; description?: string }
): string {
  const source = query.channel === "search" ? "firecrawl search" : "answer-engine";
  const parts = [detail.url];
  if (detail.title) parts.push(detail.title);
  if (detail.description) parts.push(detail.description);
  return `${source} (${query.prompt}) → ${parts.join(" — ")}`;
}

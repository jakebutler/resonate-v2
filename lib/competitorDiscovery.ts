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
// A discovery run that has not reached a terminal state within this window is
// treated as crashed: without the bound, one stuck "running" row would make
// hasRunningDiscoveryRun refuse every future daily cycle.
const DEFAULT_STALE_RUN_MS = 30 * 60 * 1000;

export type DiscoveryRunLimits = {
  maxQueries: number;
  runCeilingCents: number;
  costPerQueryCents: number;
  staleRunMs: number;
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
    staleRunMs: positiveIntFromEnv(env.AEO_DISCOVERY_STALE_RUN_MS, DEFAULT_STALE_RUN_MS),
  };
}

export type DiscoveryQuery = {
  /** Which leg of the pass produced it — a Firecrawl search or a gateway ask. */
  channel: "search" | "answer-engine";
  /** The exact search query or question text sent to the provider. */
  prompt: string;
  /**
   * The user-facing phrasing of the same query, shown in the review queue.
   * answer-engine prompts carry response-format instructions the marketer
   * never chose — those stay on the wire, never in the UI.
   */
  topic: string;
};

/**
 * The discovery query set for a brand target: category/alternatives phrasings
 * across search and the gateway question set. The full set is returned in
 * priority order; callers cap it to the run's query budget.
 */
const ANSWER_ENGINE_FORMAT_INSTRUCTION =
  ' Reply with a JSON array of objects with "name" and "url".';

function answerEngineQuery(about: string): DiscoveryQuery {
  const question = `Which tools or products would you recommend ${about}?`;
  return {
    channel: "answer-engine",
    prompt: `${question}${ANSWER_ENGINE_FORMAT_INSTRUCTION}`,
    topic: question,
  };
}

/**
 * Removes the provider's response-format instruction from a stored phrasing or
 * evidence label. Suggestions stored before the topic split carry the raw
 * instruction text; the review queue renders none of it, old rows or new.
 */
export function stripResponseFormatInstruction(text: string): string {
  return text.split(ANSWER_ENGINE_FORMAT_INSTRUCTION).join("").trim();
}

export function buildDiscoveryQueries(input: {
  brandName: string;
  productIdentifiers: string[];
}): DiscoveryQuery[] {
  const queries: DiscoveryQuery[] = [
    {
      channel: "search",
      prompt: `best alternatives to ${input.brandName}`,
      topic: `best alternatives to ${input.brandName}`,
    },
    answerEngineQuery(`instead of ${input.brandName}`),
  ];
  for (const identifier of input.productIdentifiers) {
    queries.push({
      channel: "search",
      prompt: `best ${identifier} tools and alternatives`,
      topic: `best ${identifier} tools and alternatives`,
    });
    queries.push(answerEngineQuery(`for ${identifier}`));
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
  // The user-facing topic, never the wire prompt: the stored label renders in
  // the review queue, and answer-engine prompts carry response-format
  // instructions that are plumbing, not evidence.
  return `${source} (${query.topic}) → ${parts.join(" — ")}`;
}

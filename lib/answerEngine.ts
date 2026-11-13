// Answer-engine visibility checks (A3).
//
// A budgeted, cron-driven batch asks a per-brand question set through the
// existing Cortex/Pioneer gateway and records which products the answers
// cite, as reviewable `intelRuns`/`intelFindings` rows. It follows the
// provider-adapter contract: server-scope credential, injected fetch,
// explicit runtime gate, per-run cost ceiling, and sanitized findings only.
// Nothing here dispatches at import time — every network call happens inside
// a function invoked with an AnswerEngineContext.

import { BRANDS, type BrandId } from "./domain";

// Cortex gateway — the same OpenAI-compatible endpoint lib/cortex.ts uses.
const DEFAULT_CORTEX_BASE_URL = "https://cortex.corvolabs.com";

// Answer excerpts stored in findings are capped so one long answer cannot
// inflate a stored finding (FIRECRAWL_SNAPSHOT_MAX_CHARS precedent).
export const ANSWER_ENGINE_EXCERPT_MAX_CHARS = 500;

const DEFAULT_MAX_QUESTIONS = 6;
const DEFAULT_RUN_CEILING_CENTS = 50;
const DEFAULT_COST_PER_QUESTION_CENTS = 2;

export type AnswerEngineContext = {
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

export type AnswerEngineRunLimits = {
  maxQuestions: number;
  runCeilingCents: number;
  costPerQuestionCents: number;
};

function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function answerEngineRunLimits(env: Record<string, string | undefined>): AnswerEngineRunLimits {
  return {
    maxQuestions: positiveIntFromEnv(env.AEO_ANSWER_ENGINE_MAX_QUESTIONS, DEFAULT_MAX_QUESTIONS),
    runCeilingCents: positiveIntFromEnv(env.AEO_ANSWER_ENGINE_RUN_CEILING_CENTS, DEFAULT_RUN_CEILING_CENTS),
    costPerQuestionCents: positiveIntFromEnv(
      env.AEO_ANSWER_ENGINE_COST_PER_QUESTION_CENTS,
      DEFAULT_COST_PER_QUESTION_CENTS
    ),
  };
}

/** The gateway credential is the same server-scope secret the Cortex chat path uses. */
export function answerEngineCredential(env: Record<string, string | undefined>): {
  apiKey: string;
  baseUrl: string;
  model: string;
} | null {
  const cortexKey = env.CORTEX_API_KEY?.trim();
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const modelOverride = env.AEO_ANSWER_ENGINE_MODEL?.trim();
  if (cortexKey) {
    return {
      apiKey: cortexKey,
      baseUrl: env.CORTEX_BASE_URL?.trim() || DEFAULT_CORTEX_BASE_URL,
      model: modelOverride || "claude-sonnet-4.6",
    };
  }
  if (openAiKey) {
    return { apiKey: openAiKey, baseUrl: "https://api.openai.com", model: modelOverride || "gpt-4o" };
  }
  return null;
}

export function brandNameFor(brandId: BrandId): string {
  return BRANDS.find((brand) => brand.id === brandId)?.name ?? brandId;
}

/** A display/matching name for a competitor URL: its hostname without "www.". */
export function competitorNameFromUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return rawUrl.toLowerCase();
  }
}

export function competitorNamesFromUrls(urls: string[]): string[] {
  return [...new Set(urls.map(competitorNameFromUrl).filter(Boolean))];
}

export type AnswerEngineQuestion = {
  question: string;
  /** Which phrasing produced the question (brand, recommendation, identifier, competitor). */
  phrasing: "brand" | "recommendation" | "identifier" | "competitor";
};

/**
 * The per-brand question set (spec A3): "which tools would you recommend for
 * X?" asked in brand, identifier, and competitor phrasings. The full set is
 * returned in priority order; callers cap it to the run's question budget.
 */
export function buildAnswerEngineQuestions(input: {
  brandName: string;
  productIdentifiers: string[];
  competitorUrls: string[];
}): AnswerEngineQuestion[] {
  const questions: AnswerEngineQuestion[] = [
    { question: `What is ${input.brandName} and what does it do?`, phrasing: "brand" },
    { question: `Would you recommend ${input.brandName}?`, phrasing: "recommendation" },
  ];
  for (const identifier of input.productIdentifiers) {
    questions.push({
      question: `Which tools or products would you recommend for ${identifier}?`,
      phrasing: "identifier",
    });
  }
  for (const name of competitorNamesFromUrls(input.competitorUrls)) {
    questions.push({ question: `What alternatives are there to ${name}?`, phrasing: "competitor" });
  }
  return questions;
}

export type AnswerEngineRunPlan =
  | {
      ok: true;
      questionCount: number;
      estimatedCostCents: number;
      ceilingCents: number;
    }
  | {
      ok: false;
      reason: "no-questions" | "budget-exceeded";
      questionCount: number;
      estimatedCostCents: number;
      ceilingCents: number;
    };

/**
 * Per-run budget admission: refuse before any dispatch when the estimated
 * cost (questions x per-question estimate) exceeds the run ceiling.
 */
export function planAnswerEngineRun(input: {
  questionCount: number;
  limits: AnswerEngineRunLimits;
}): AnswerEngineRunPlan {
  const estimatedCostCents = input.questionCount * input.limits.costPerQuestionCents;
  if (input.questionCount <= 0) {
    return {
      ok: false,
      reason: "no-questions",
      questionCount: input.questionCount,
      estimatedCostCents,
      ceilingCents: input.limits.runCeilingCents,
    };
  }
  if (estimatedCostCents > input.limits.runCeilingCents) {
    return {
      ok: false,
      reason: "budget-exceeded",
      questionCount: input.questionCount,
      estimatedCostCents,
      ceilingCents: input.limits.runCeilingCents,
    };
  }
  return {
    ok: true,
    questionCount: input.questionCount,
    estimatedCostCents,
    ceilingCents: input.limits.runCeilingCents,
  };
}

const ANSWER_ENGINE_SYSTEM_PROMPT =
  "You are an answer engine. Answer the user's question directly and concretely, " +
  "naming the specific products, tools, or companies you would recommend. Prefer a " +
  "short, quotable first sentence followed by brief supporting points.";

export type AnswerEngineAskResult = { ok: true; answer: string } | { ok: false; reason: string };

/**
 * Ask one question through the Cortex/Pioneer gateway. The credential gate is
 * fail-closed: without a key the call refuses with an explicit reason and
 * fetch is never invoked.
 */
export async function askAnswerEngine(
  context: AnswerEngineContext,
  input: { question: string }
): Promise<AnswerEngineAskResult> {
  const config = answerEngineCredential(context.env);
  if (!config) {
    return {
      ok: false,
      reason: "Answer-engine checks require CORTEX_API_KEY or OPENAI_API_KEY; credentials are not configured.",
    };
  }
  const fetchImpl = context.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: ANSWER_ENGINE_SYSTEM_PROMPT },
          { role: "user", content: input.question },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    return { ok: false, reason: `Gateway request failed: ${error instanceof Error ? error.message : "unknown"}` };
  }
  if (!response.ok) {
    return { ok: false, reason: `Gateway returned HTTP ${response.status}.` };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "Gateway returned a non-JSON response." };
  }
  const answer = (body as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message
    ?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    return { ok: false, reason: "Gateway response contained no answer text." };
  }
  return { ok: true, answer };
}

function hasWordMatch(textLower: string, name: string): boolean {
  const needle = name.toLowerCase().trim();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(textLower);
}

function mentionsAny(textLower: string, names: string[]): boolean {
  return names.some((name) => hasWordMatch(textLower, name));
}

export type AnswerTargetPage = {
  title?: string;
  headings: string[];
  description?: string;
  contentSample?: string;
};

export type AnswerCitationAnalysis = {
  citationStatus: "cited" | "uncited" | "not-observed";
  extractability: number;
  classification: "gap" | "opportunity";
};

// A small stopword set so content-coverage measures topic words only.
const CONTENT_TERM_STOPWORDS = new Set([
  "what", "which", "would", "there", "with", "that", "this", "from", "your",
  "about", "recommend", "tools", "products", "alternatives", "does",
]);

function contentTerms(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (word) => word.length > 3 && !CONTENT_TERM_STOPWORDS.has(word)
  );
}

/**
 * Lexical coverage of the question's topic words by the connected target's
 * crawled content (0–1). 0 when there is no crawl snapshot yet.
 */
export function contentCoverage(question: string, pages: AnswerTargetPage[]): number {
  if (!pages.length) return 0;
  const terms = [...new Set(contentTerms(question))];
  if (!terms.length) return 0;
  const haystack = pages
    .map((page) =>
      [page.title, ...page.headings, page.description, page.contentSample]
        .filter((part): part is string => typeof part === "string")
        .join(" ")
        .toLowerCase()
    )
    .join(" ");
  const present = terms.filter((term) => haystack.includes(term)).length;
  return present / terms.length;
}

/**
 * How quotable the answer's brand mention is (0–1): subject in the first
 * sentence, list-like structure, and a subject echo later in the answer.
 * 0 when the subject is never mentioned.
 */
function answerStructureScore(answer: string, subjectNames: string[]): number {
  const textLower = answer.toLowerCase();
  if (!mentionsAny(textLower, subjectNames.map((name) => name.toLowerCase()))) return 0;
  const firstSentenceEnd = textLower.search(/[.!?]/);
  const firstSentence = firstSentenceEnd === -1 ? textLower : textLower.slice(0, firstSentenceEnd + 1);
  const listLike = /^\s*([-*\d]|#{1,3}\s)/m.test(answer);
  const echoed = mentionsAny(textLower.slice(firstSentence.length), subjectNames.map((name) => name.toLowerCase()));
  let score = 0;
  if (mentionsAny(firstSentence, subjectNames.map((name) => name.toLowerCase()))) score += 0.4;
  if (listLike) score += 0.3;
  if (echoed) score += 0.3;
  return score;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Extractability heuristic (the computeBotLikelihood precedent: a documented,
 * bounded heuristic, not ground truth). Cited answers score for quotability
 * weighted against the connected target's content coverage; answers that
 * never cite the brand score only for the target's content readiness, since
 * there is no brand answer to lift.
 */
export function analyzeAnswerCitation(input: {
  answer: string;
  question: string;
  brandName: string;
  productIdentifiers: string[];
  competitorNames: string[];
  targetPages: AnswerTargetPage[];
}): AnswerCitationAnalysis {
  const textLower = input.answer.toLowerCase();
  const brandSubjects = [input.brandName, ...input.productIdentifiers];
  const cited = mentionsAny(textLower, brandSubjects.map((name) => name.toLowerCase()));
  const structure = answerStructureScore(input.answer, brandSubjects);
  const coverage = contentCoverage(input.question, input.targetPages);
  if (cited) {
    return {
      citationStatus: "cited",
      // 70% quotability of the answer itself, 30% whether the target's
      // content can back the citation.
      extractability: round2(Math.min(1, 0.7 * structure + 0.3 * coverage)),
      classification: "opportunity",
    };
  }
  return {
    citationStatus: mentionsAny(textLower, input.competitorNames.map((name) => name.toLowerCase()))
      ? "uncited"
      : "not-observed",
    extractability: round2(0.3 * coverage),
    classification: "gap",
  };
}

export function truncateAnswerExcerpt(answer: string): string {
  return answer.length > ANSWER_ENGINE_EXCERPT_MAX_CHARS
    ? `${answer.slice(0, ANSWER_ENGINE_EXCERPT_MAX_CHARS)}...`
    : answer;
}

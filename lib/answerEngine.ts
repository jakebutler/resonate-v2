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

// Depth bounds: the default question depth sits inside a bounded 10–20 set
// (marketer-council audit-depth finding) so a run is deep enough to matter
// while the per-run ceiling stays in control; a configured depth above the
// cap clamps down rather than silently spending more.
export const ANSWER_ENGINE_MAX_QUESTIONS_CAP = 20;
const DEFAULT_MAX_QUESTIONS = 12;
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
    maxQuestions: Math.min(
      ANSWER_ENGINE_MAX_QUESTIONS_CAP,
      positiveIntFromEnv(env.AEO_ANSWER_ENGINE_MAX_QUESTIONS, DEFAULT_MAX_QUESTIONS)
    ),
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
  /** Which phrasing produced the question (brand, recommendation, identifier, competitor, depth). */
  phrasing: "brand" | "recommendation" | "identifier" | "competitor" | "depth";
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
  // Generic brand-depth phrasings keep the set usable for a brand with few
  // identifiers or tracked competitors — without them, raising the question
  // depth would only ever ask the same two brand questions.
  const depthQuestions: AnswerEngineQuestion[] = [
    { question: `What problems does ${input.brandName} solve?`, phrasing: "depth" },
    { question: `Who should use ${input.brandName}?`, phrasing: "depth" },
    { question: `What do users say about ${input.brandName}?`, phrasing: "depth" },
    { question: `Is ${input.brandName} worth trying?`, phrasing: "depth" },
    { question: `How does ${input.brandName} compare to its alternatives?`, phrasing: "depth" },
    { question: `What makes ${input.brandName} different from other options?`, phrasing: "depth" },
    { question: `What are the strengths and weaknesses of ${input.brandName}?`, phrasing: "depth" },
    { question: `Would ${input.brandName} be a good choice for a small team?`, phrasing: "depth" },
  ];
  questions.push(...depthQuestions);
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
  classification: "gap" | "opportunity" | "needs-review";
  /**
   * Set only when the answer cites the brand: whether the cited content is
   * actually about the connected target. A suspect citation must never be
   * displayed as a plain "cited" (the trust-blocker finding).
   */
  brandMatch?: BrandMatchAssessment;
};

export type BrandMatchVerdict = "match" | "suspect" | "unknown";

export type BrandMatchAssessment = {
  verdict: BrandMatchVerdict;
  /** Human-readable reason, stored with the finding and shown in the intel UI. */
  detail: string;
};

// Brand-mismatch disambiguation thresholds (the extractability precedent: a
// documented, bounded heuristic, not ground truth). A cited answer that shares
// almost none of its topic vocabulary with the target's crawled content is
// probably describing a different product that happens to share the brand
// name — the homonym case seen in the 2026-11-14 live proof (a blockchain/
// supply-chain "FreshProof" recorded as a clean citation).
const BRAND_MATCH_MIN_ANSWER_TERMS = 6;
const BRAND_MATCH_SUSPECT_OVERLAP = 0.2;
const BRAND_MATCH_MATCH_OVERLAP = 0.4;

/** Topic-word vocabulary of the target's crawled content. */
function targetVocabulary(pages: AnswerTargetPage[]): Set<string> {
  const joined = pages
    .map((page) =>
      [page.title, ...page.headings, page.description, page.contentSample]
        .filter((part): part is string => typeof part === "string")
        .join(" ")
    )
    .join(" ");
  return new Set(contentTerms(joined));
}

/**
 * Whether a cited answer is actually about the connected target. The gateway
 * returns prose (no citation URLs), so the verdict is a heuristic over three
 * signals, strongest first:
 *
 * - the answer cites the target's own domain, or names one of the target's
 *   product identifiers — treat as a match;
 * - otherwise, vocabulary overlap between the answer and the target's crawl:
 *   high overlap → match, near-zero overlap → suspect (a homonym brand),
 *   in between or too little text on either side → unknown.
 */
export function assessAnswerBrandMatch(input: {
  answer: string;
  productIdentifiers: string[];
  targetDomain: string;
  targetPages: AnswerTargetPage[];
}): BrandMatchAssessment {
  const textLower = input.answer.toLowerCase();
  const domain = input.targetDomain.toLowerCase().trim();
  if (domain && hasWordMatch(textLower, domain)) {
    return { verdict: "match", detail: `Answer cites the target's domain (${domain}).` };
  }
  const identifiers = input.productIdentifiers.map((id) => id.toLowerCase().trim()).filter(Boolean);
  if (identifiers.length && mentionsAny(textLower, identifiers)) {
    return { verdict: "match", detail: "Answer names one of the target's product identifiers." };
  }
  const crawlVocabulary = targetVocabulary(input.targetPages);
  const answerTerms = [...new Set(contentTerms(input.answer))];
  if (!crawlVocabulary.size || answerTerms.length < BRAND_MATCH_MIN_ANSWER_TERMS) {
    return {
      verdict: "unknown",
      detail: "Not enough crawled content or answer text to verify the citation against the target.",
    };
  }
  const overlap = answerTerms.filter((term) => crawlVocabulary.has(term)).length / answerTerms.length;
  const percent = Math.round(overlap * 100);
  if (overlap < BRAND_MATCH_SUSPECT_OVERLAP) {
    return {
      verdict: "suspect",
      detail:
        `Answer names the brand but shares almost none of its topic vocabulary with the ` +
        `target's crawled content (${percent}% overlap) — it may describe a different product with the same name.`,
    };
  }
  if (overlap >= BRAND_MATCH_MATCH_OVERLAP) {
    return {
      verdict: "match",
      detail: `Answer vocabulary overlaps the target's crawled content (${percent}% overlap).`,
    };
  }
  return {
    verdict: "unknown",
    detail: `Citation could not be confidently verified against the target's crawled content (${percent}% overlap).`,
  };
}

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
  targetDomain: string;
  targetPages: AnswerTargetPage[];
}): AnswerCitationAnalysis {
  const textLower = input.answer.toLowerCase();
  const brandSubjects = [input.brandName, ...input.productIdentifiers];
  const cited = mentionsAny(textLower, brandSubjects.map((name) => name.toLowerCase()));
  const structure = answerStructureScore(input.answer, brandSubjects);
  const coverage = contentCoverage(input.question, input.targetPages);
  if (cited) {
    const brandMatch = assessAnswerBrandMatch({
      answer: input.answer,
      productIdentifiers: input.productIdentifiers,
      targetDomain: input.targetDomain,
      targetPages: input.targetPages,
    });
    return {
      citationStatus: "cited",
      // 70% quotability of the answer itself, 30% whether the target's
      // content can back the citation.
      extractability: round2(Math.min(1, 0.7 * structure + 0.3 * coverage)),
      // A suspect citation is never an unflagged opportunity: it comes back
      // "needs-review" so every consumer (gaps list, strategy plan) treats
      // it as unverified until a human confirms which product was cited.
      classification: brandMatch.verdict === "suspect" ? "needs-review" : "opportunity",
      brandMatch,
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

/**
 * Stored extractability scale: an integer 0–100. The heuristics above score
 * 0–1; every write boundary converts through this helper so neither the
 * runner nor a manual caller can persist an unbounded or fractional value.
 */
export function extractabilityToStorage(score01: number): number {
  return Math.max(0, Math.min(100, Math.round(score01 * 100)));
}

/**
 * Validates the stored scale at every write boundary (runner and manual rows
 * alike). Returns the value so the call site can inline it in the insert.
 */
export function validateStoredExtractability(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
    throw new Error("Extractability must be an integer from 0 to 100.");
  }
  return value;
}

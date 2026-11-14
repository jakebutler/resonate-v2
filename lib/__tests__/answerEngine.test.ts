import { describe, expect, it, vi } from "vitest";
import {
  ANSWER_ENGINE_EXCERPT_MAX_CHARS,
  ANSWER_ENGINE_MAX_QUESTIONS_CAP,
  analyzeAnswerCitation,
  answerEngineCredential,
  answerEngineRunLimits,
  askAnswerEngine,
  assessAnswerBrandMatch,
  brandNameFor,
  buildAnswerEngineQuestions,
  competitorNamesFromUrls,
  contentCoverage,
  extractabilityToStorage,
  planAnswerEngineRun,
  truncateAnswerExcerpt,
  validateStoredExtractability,
} from "@/lib/answerEngine";

const BASE_LIMITS = {
  maxQuestions: 12,
  runCeilingCents: 50,
  costPerQuestionCents: 2,
};

describe("answerEngineRunLimits", () => {
  it("falls back to documented defaults without env vars", () => {
    expect(answerEngineRunLimits({})).toEqual(BASE_LIMITS);
  });

  it("reads positive integer overrides and ignores junk", () => {
    expect(
      answerEngineRunLimits({
        AEO_ANSWER_ENGINE_MAX_QUESTIONS: "3",
        AEO_ANSWER_ENGINE_RUN_CEILING_CENTS: "10",
        AEO_ANSWER_ENGINE_COST_PER_QUESTION_CENTS: "5",
      })
    ).toEqual({ maxQuestions: 3, runCeilingCents: 10, costPerQuestionCents: 5 });
    expect(
      answerEngineRunLimits({ AEO_ANSWER_ENGINE_MAX_QUESTIONS: "-4" }).maxQuestions
    ).toBe(BASE_LIMITS.maxQuestions);
  });

  it("clamps the question depth to the bounded cap", () => {
    expect(answerEngineRunLimits({ AEO_ANSWER_ENGINE_MAX_QUESTIONS: "25" }).maxQuestions).toBe(
      ANSWER_ENGINE_MAX_QUESTIONS_CAP
    );
    expect(answerEngineRunLimits({}).maxQuestions).toBeLessThanOrEqual(ANSWER_ENGINE_MAX_QUESTIONS_CAP);
    expect(answerEngineRunLimits({}).maxQuestions).toBeGreaterThanOrEqual(10);
  });
});

describe("answerEngineCredential", () => {
  it("prefers the Cortex key and base URL", () => {
    expect(
      answerEngineCredential({ CORTEX_API_KEY: "cortex-key", CORTEX_BASE_URL: "https://cortex.example" })
    ).toEqual({ apiKey: "cortex-key", baseUrl: "https://cortex.example", model: "claude-sonnet-4.6" });
  });

  it("falls back to OpenAI and honors a model override", () => {
    expect(answerEngineCredential({ OPENAI_API_KEY: "oai", AEO_ANSWER_ENGINE_MODEL: "gpt-4o-mini" })).toEqual({
      apiKey: "oai",
      baseUrl: "https://api.openai.com",
      model: "gpt-4o-mini",
    });
  });

  it("returns null without any credential", () => {
    expect(answerEngineCredential({})).toBeNull();
  });
});

describe("buildAnswerEngineQuestions", () => {
  it("asks brand, recommendation, identifier, and competitor phrasings in order", () => {
    const questions = buildAnswerEngineQuestions({
      brandName: "FreshProof",
      productIdentifiers: ["FreshProof band"],
      competitorUrls: ["https://www.competitor.example/path", "https://other.example"],
    });
    expect(questions.map((q) => q.phrasing).slice(0, 5)).toEqual([
      "brand",
      "recommendation",
      "identifier",
      "competitor",
      "competitor",
    ]);
    expect(questions[0].question).toBe("What is FreshProof and what does it do?");
    expect(questions[2].question).toBe(
      "Which tools or products would you recommend for FreshProof band?"
    );
    expect(questions[3].question).toBe("What alternatives are there to competitor.example?");
  });

  it("fills the depth bound with generic brand phrasings so depth is reachable", () => {
    const sparse = buildAnswerEngineQuestions({
      brandName: "FreshProof",
      productIdentifiers: [],
      competitorUrls: [],
    });
    // A brand with no identifiers or competitors still reaches the 10–20
    // audit-depth set through the generic phrasings.
    expect(sparse.length).toBeGreaterThanOrEqual(10);
    expect(sparse.length).toBeLessThanOrEqual(ANSWER_ENGINE_MAX_QUESTIONS_CAP);
    expect(sparse.slice(0, 2).map((q) => q.phrasing)).toEqual(["brand", "recommendation"]);
    expect(sparse.slice(2).every((q) => q.phrasing === "depth")).toBe(true);
  });
});

describe("planAnswerEngineRun", () => {
  it("admits a run within the ceiling", () => {
    expect(planAnswerEngineRun({ questionCount: 4, limits: BASE_LIMITS })).toEqual({
      ok: true,
      questionCount: 4,
      estimatedCostCents: 8,
      ceilingCents: 50,
    });
  });

  it("refuses before dispatch when the estimate exceeds the run ceiling", () => {
    const plan = planAnswerEngineRun({
      questionCount: 30,
      limits: { ...BASE_LIMITS, runCeilingCents: 50, costPerQuestionCents: 2 },
    });
    expect(plan).toMatchObject({ ok: false, reason: "budget-exceeded", estimatedCostCents: 60 });
  });

  it("admits a full-depth (20-question) run that fits the ceiling, per question", () => {
    const plan = planAnswerEngineRun({
      questionCount: ANSWER_ENGINE_MAX_QUESTIONS_CAP,
      limits: { maxQuestions: ANSWER_ENGINE_MAX_QUESTIONS_CAP, runCeilingCents: 50, costPerQuestionCents: 2 },
    });
    expect(plan).toEqual({ ok: true, questionCount: 20, estimatedCostCents: 40, ceilingCents: 50 });
  });

  it("fails a 20-question run closed with a clear refusal when the ceiling cannot fit it", () => {
    const plan = planAnswerEngineRun({
      questionCount: ANSWER_ENGINE_MAX_QUESTIONS_CAP,
      limits: { maxQuestions: ANSWER_ENGINE_MAX_QUESTIONS_CAP, runCeilingCents: 50, costPerQuestionCents: 3 },
    });
    expect(plan).toMatchObject({
      ok: false,
      reason: "budget-exceeded",
      questionCount: 20,
      estimatedCostCents: 60,
      ceilingCents: 50,
    });
  });

  it("refuses a run with no questions", () => {
    expect(planAnswerEngineRun({ questionCount: 0, limits: BASE_LIMITS })).toMatchObject({
      ok: false,
      reason: "no-questions",
    });
  });
});

describe("askAnswerEngine", () => {
  it("fails closed without a credential and never fetches", async () => {
    const fetchMock = vi.fn();
    const result = await askAnswerEngine({ env: {}, fetchImpl: fetchMock as unknown as typeof fetch }, {
      question: "What is FreshProof?",
    });
    expect(result).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the gateway chat completions endpoint and returns the answer text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: "FreshProof validates claims." } }] }),
        { status: 200 }
      )
    );
    const result = await askAnswerEngine(
      { env: { CORTEX_API_KEY: "k", CORTEX_BASE_URL: "https://cortex.example" }, fetchImpl: fetchMock as unknown as typeof fetch },
      { question: "What is FreshProof?" }
    );
    expect(result).toEqual({ ok: true, answer: "FreshProof validates claims." });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cortex.example/v1/chat/completions");
    expect(JSON.parse(init.body).messages.at(-1)).toEqual({
      role: "user",
      content: "What is FreshProof?",
    });
  });

  it("reports gateway HTTP errors explicitly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 502 }));
    const result = await askAnswerEngine(
      { env: { OPENAI_API_KEY: "k" }, fetchImpl: fetchMock as unknown as typeof fetch },
      { question: "q" }
    );
    expect(result).toMatchObject({ ok: false, reason: "Gateway returned HTTP 502." });
  });

  it("reports transport failures explicitly", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await askAnswerEngine(
      { env: { OPENAI_API_KEY: "k" }, fetchImpl: fetchMock as unknown as typeof fetch },
      { question: "q" }
    );
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("boom");
  });

  it("refuses a response with no answer text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 })
    );
    const result = await askAnswerEngine(
      { env: { OPENAI_API_KEY: "k" }, fetchImpl: fetchMock as unknown as typeof fetch },
      { question: "q" }
    );
    expect(result).toMatchObject({ ok: false, reason: "Gateway response contained no answer text." });
  });
});

describe("analyzeAnswerCitation", () => {
  const base = {
    question: "Would you recommend FreshProof?",
    brandName: "FreshProof",
    productIdentifiers: ["FreshProof band"],
    competitorNames: competitorNamesFromUrls(["https://competitor.example"]),
    targetDomain: "freshproof.example",
  };

  it("marks a brand mention as cited and an opportunity", () => {
    const analysis = analyzeAnswerCitation({
      ...base,
      answer: "FreshProof is a solid choice for claim validation.",
      targetPages: [],
    });
    expect(analysis).toMatchObject({
      citationStatus: "cited",
      classification: "opportunity",
    });
    expect(analysis.extractability).toBeGreaterThan(0);
  });

  it("marks a competitor-only answer as uncited and a gap", () => {
    const analysis = analyzeAnswerCitation({
      ...base,
      answer: "I would recommend competitor.example for this.",
      targetPages: [],
    });
    expect(analysis).toMatchObject({
      citationStatus: "uncited",
      classification: "gap",
    });
  });

  it("marks an answer naming neither as not-observed and a gap", () => {
    const analysis = analyzeAnswerCitation({
      ...base,
      answer: "There are many options on the market today.",
      targetPages: [],
    });
    expect(analysis).toMatchObject({ citationStatus: "not-observed", classification: "gap" });
  });

  it("scores extractability against the connected target's crawled content", () => {
    const answer = "FreshProof is the best option. It offers:\n- claim validation\n- evidence review";
    const withCoverage = analyzeAnswerCitation({
      ...base,
      answer,
      targetPages: [
        {
          title: "FreshProof claim validation",
          headings: ["evidence review"],
          contentSample: "FreshProof band validates claims with third-party evidence.",
        },
      ],
    });
    const withoutCoverage = analyzeAnswerCitation({ ...base, answer, targetPages: [] });
    expect(withCoverage.extractability).toBeGreaterThan(withoutCoverage.extractability);
  });

  it("scores zero extractability structure when the brand is absent", () => {
    const analysis = analyzeAnswerCitation({
      ...base,
      answer: "Nothing relevant here.",
      targetPages: [],
    });
    expect(analysis.extractability).toBe(0);
  });

  it("carries a suspect brand-match verdict on a cited answer describing the wrong product", () => {
    // The 2026-11-14 live-proof case: the answer names the brand but describes
    // a blockchain/supply-chain product, while the crawl is a design-proofing
    // tool. This must classify as suspect, never a plain "cited".
    const analysis = analyzeAnswerCitation({
      ...base,
      answer:
        "FreshProof is a blockchain-based platform designed for supply chain traceability " +
        "and authenticity verification. It helps businesses track and verify the origin, " +
        "journey, and authenticity of their products using blockchain technology to provide " +
        "tamper-proof records.",
      targetPages: [
        {
          title: "FreshProof online proofing",
          headings: ["design review"],
          description: "Real-time feedback and collaboration for creative teams.",
          contentSample: "Streamline your design review process with proofing tools.",
        },
      ],
    });
    expect(analysis.citationStatus).toBe("cited");
    expect(analysis.brandMatch).toMatchObject({ verdict: "suspect" });
    // A suspect answer is never an unflagged opportunity: it classifies as
    // needs-review so every downstream surface treats it as unverified.
    expect(analysis.classification).toBe("needs-review");
  });

  it("keeps a cited answer with an unknown verdict an opportunity", () => {
    const analysis = analyzeAnswerCitation({
      ...base,
      answer: "FreshProof is a solid choice for claim validation.",
      targetPages: [],
    });
    expect(analysis.classification).toBe("opportunity");
  });
});

describe("stored extractability scale", () => {
  it("converts the 0–1 heuristic score to an integer 0–100", () => {
    expect(extractabilityToStorage(0)).toBe(0);
    expect(extractabilityToStorage(0.79)).toBe(79);
    expect(extractabilityToStorage(0.555)).toBe(56);
    expect(extractabilityToStorage(1)).toBe(100);
  });

  it("clamps out-of-range heuristic scores", () => {
    expect(extractabilityToStorage(-0.2)).toBe(0);
    expect(extractabilityToStorage(1.4)).toBe(100);
  });

  it("accepts only in-range integers at the write boundary", () => {
    expect(validateStoredExtractability(0)).toBe(0);
    expect(validateStoredExtractability(100)).toBe(100);
    expect(() => validateStoredExtractability(-1)).toThrow(/integer from 0 to 100/);
    expect(() => validateStoredExtractability(101)).toThrow(/integer from 0 to 100/);
    expect(() => validateStoredExtractability(0.5)).toThrow(/integer from 0 to 100/);
  });
});

describe("assessAnswerBrandMatch", () => {
  const designProofingPages = [
    {
      title: "FreshProof online proofing",
      headings: ["design review", "feedback management"],
      description: "Real-time collaboration for creative teams and design review.",
      contentSample: "Streamline your design review process with proofing and collaboration tools.",
    },
  ];
  const wrongProductAnswer =
    "FreshProof is a blockchain-based platform designed for supply chain traceability " +
    "and authenticity verification. It helps businesses track and verify the origin of " +
    "their products using tamper-proof blockchain records.";

  it("matches when the answer cites the target's domain", () => {
    expect(
      assessAnswerBrandMatch({
        answer: "FreshProof (freshproof.example) is the strongest option for design review.",
        productIdentifiers: [],
        targetDomain: "freshproof.example",
        targetPages: [],
      })
    ).toMatchObject({ verdict: "match" });
  });

  it("matches when the answer names a product identifier", () => {
    expect(
      assessAnswerBrandMatch({
        answer: "The FreshProof band validates claims with third-party evidence.",
        productIdentifiers: ["FreshProof band"],
        targetDomain: "freshproof.example",
        targetPages: [],
      })
    ).toMatchObject({ verdict: "match" });
  });

  it("matches a same-product answer through crawl vocabulary overlap", () => {
    const assessment = assessAnswerBrandMatch({
      answer:
        "FreshProof is an online proofing tool that streamlines design review with " +
        "real-time feedback and collaboration for creative teams.",
      productIdentifiers: [],
      targetDomain: "freshproof.example",
      targetPages: designProofingPages,
    });
    expect(assessment.verdict).toBe("match");
    expect(assessment.detail).toContain("overlap");
  });

  it("flags a homonym answer as suspect against the target's crawl", () => {
    const assessment = assessAnswerBrandMatch({
      answer: wrongProductAnswer,
      productIdentifiers: [],
      targetDomain: "freshproof.example",
      targetPages: designProofingPages,
    });
    expect(assessment.verdict).toBe("suspect");
    expect(assessment.detail).toContain("different product");
  });

  it("stays unknown when there is no crawl content to compare against", () => {
    expect(
      assessAnswerBrandMatch({
        answer: wrongProductAnswer,
        productIdentifiers: [],
        targetDomain: "freshproof.example",
        targetPages: [],
      })
    ).toMatchObject({ verdict: "unknown" });
  });

  it("stays unknown when the answer is too short to compare", () => {
    expect(
      assessAnswerBrandMatch({
        answer: "FreshProof is great.",
        productIdentifiers: [],
        targetDomain: "freshproof.example",
        targetPages: designProofingPages,
      })
    ).toMatchObject({ verdict: "unknown" });
  });
});

describe("contentCoverage", () => {
  it("is zero without pages or topic terms", () => {
    expect(contentCoverage("Would you recommend FreshProof?", [])).toBe(0);
  });

  it("measures the fraction of topic words present in the target pages", () => {
    const pages = [{ title: "Claim validation guide", headings: [], contentSample: "evidence review process" }];
    expect(contentCoverage("How does claim validation and evidence review work?", pages)).toBeGreaterThan(0);
    expect(contentCoverage("How does claim validation and evidence review work?", pages)).toBeLessThan(1);
    expect(contentCoverage("Completely unrelated topic about quantum physics", pages)).toBe(0);
  });
});

describe("truncateAnswerExcerpt", () => {
  it("caps stored excerpts at the snapshot bound", () => {
    expect(truncateAnswerExcerpt("a".repeat(ANSWER_ENGINE_EXCERPT_MAX_CHARS + 10)).length).toBe(
      ANSWER_ENGINE_EXCERPT_MAX_CHARS + 3
    );
    expect(truncateAnswerExcerpt("short")).toBe("short");
  });
});

describe("brandNameFor", () => {
  it("resolves the display name from the hard-coded brand list", () => {
    expect(brandNameFor("freshproof")).toBe("FreshProof");
    expect(brandNameFor("lower-db")).toBe("the lower dB");
  });
});

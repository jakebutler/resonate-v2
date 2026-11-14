import { describe, expect, it } from "vitest";
import {
  deriveKeywordCandidates,
  keywordCitationStatus,
  keywordRunLimits,
  keywordSearchOrder,
  keywordSearchPresence,
  mergePlanTargetKeywords,
  normalizeKeyword,
  planKeywordResearchRun,
  type CitationFinding,
} from "../keywordResearch";

// Offline fixtures only — every candidate in these tests is a phrase the
// fixture rows already contain, mirroring the never-invented rule.
const FIXTURE_INPUT = {
  pages: [
    {
      url: "https://www.freshproof.example/pricing",
      title: "FreshProof claim validation pricing",
      headings: ["How claim validation works", "Pricing"],
    },
  ],
  findings: [
    { _id: "finding_1", summary: "How claim validation works" },
    { _id: "finding_2", summary: "Is FreshProof cheaper than manual review?" },
  ],
  suggestions: [{ _id: "sugg_1", phrasings: ["Manual review alternatives"] }],
  planKeywords: ["claim validation tooling"],
};

describe("deriveKeywordCandidates", () => {
  it("derives candidates only from the supplied rows, carrying their sources", () => {
    const candidates = deriveKeywordCandidates(FIXTURE_INPUT, 25);
    const titles = candidates.map((candidate) => candidate.keyword);

    expect(titles).toContain("FreshProof claim validation pricing");
    expect(titles).toContain("How claim validation works");
    expect(titles).toContain("Is FreshProof cheaper than manual review?");
    expect(titles).toContain("Manual review alternatives");
    expect(titles).toContain("claim validation tooling");
    // Nothing invented: every candidate maps back to a fixture row.
    expect(titles.length).toBe(new Set(titles.map((t) => normalizeKeyword(t))).size);
  });

  it("cites the originating rows for each candidate", () => {
    const candidates = deriveKeywordCandidates(FIXTURE_INPUT, 25);
    const question = candidates.find((c) => c.keyword === "Is FreshProof cheaper than manual review?");
    expect(question?.origin).toBe("question");
    expect(question?.sources).toEqual([{ kind: "question", findingId: "finding_2" }]);

    const crawl = candidates.find((c) => c.keyword === "FreshProof claim validation pricing");
    expect(crawl?.origin).toBe("crawl");
    expect(crawl?.sources).toEqual([
      { kind: "crawl-page", pageUrl: "https://www.freshproof.example/pricing" },
    ]);

    const competitor = candidates.find((c) => c.keyword === "Manual review alternatives");
    expect(competitor?.origin).toBe("competitor");
    expect(competitor?.sources).toEqual([{ kind: "competitor-topic", suggestionId: "sugg_1" }]);

    const plan = candidates.find((c) => c.keyword === "claim validation tooling");
    expect(plan?.origin).toBe("plan");
  });

  it("collapses duplicates across sources onto the first origin", () => {
    const candidates = deriveKeywordCandidates(
      {
        pages: [{ url: "https://x.example/a", title: "Claim validation", headings: [] }],
        findings: [{ _id: "finding_9", summary: "Claim validation" }],
        suggestions: [],
        planKeywords: [],
      },
      25
    );
    expect(candidates).toHaveLength(1);
    // Crawl pages are read before questions, so the crawl origin wins.
    expect(candidates[0].origin).toBe("crawl");
    expect(candidates[0].sources).toEqual([
      { kind: "crawl-page", pageUrl: "https://x.example/a" },
    ]);
  });

  it("caps the candidate set at maxCandidates", () => {
    const pages = Array.from({ length: 10 }, (_, i) => ({
      url: `https://x.example/${i}`,
      title: `Distinct page title number ${i}`,
      headings: [],
    }));
    const candidates = deriveKeywordCandidates({ ...FIXTURE_INPUT, pages }, 4);
    expect(candidates).toHaveLength(4);
  });

  it("does not derive candidates from an empty corpus", () => {
    const candidates = deriveKeywordCandidates(
      { pages: [], findings: [], suggestions: [], planKeywords: [] },
      25
    );
    expect(candidates).toEqual([]);
  });
});

describe("keywordCitationStatus (absence-of-citation)", () => {
  const findings: CitationFinding[] = [
    { _id: "f1", summary: "How claim validation works", citationStatus: "cited", brandMatch: "match" },
    { _id: "f2", summary: "Is FreshProof cheaper than manual review?", citationStatus: "uncited", brandMatch: "match" },
  ];

  it("returns present when an observed run cited the brand", () => {
    expect(keywordCitationStatus("How claim validation works", findings)).toBe("present");
  });

  it("returns absent when the keyword was observed without a citation", () => {
    expect(keywordCitationStatus("Is FreshProof cheaper than manual review?", findings)).toBe("absent");
  });

  it("never counts a suspect citation as presence", () => {
    const suspect: CitationFinding[] = [
      { _id: "f3", summary: "How claim validation works", citationStatus: "cited", brandMatch: "suspect" },
    ];
    expect(keywordCitationStatus("How claim validation works", suspect)).toBe("absent");
  });

  it("returns unproven — never absent — when no run ever asked about the keyword", () => {
    expect(keywordCitationStatus("Something never asked", findings)).toBe("unproven");
  });
});

describe("keywordSearchPresence", () => {
  it("returns absent when the target domain does not surface in the real results", () => {
    const results = [{ url: "https://competitor.example/a" }, { url: "https://other.example/b" }];
    expect(keywordSearchPresence("claim validation", results, "https://www.freshproof.example")).toBe("absent");
  });

  it("returns present when the target's own domain is in the results", () => {
    const results = [{ url: "https://competitor.example/a" }, { url: "https://freshproof.example/home" }];
    expect(keywordSearchPresence("claim validation", results, "https://www.freshproof.example")).toBe("present");
  });
});

describe("planKeywordResearchRun (budget admission)", () => {
  const limits = keywordRunLimits({});

  it("refuses before dispatch when there is nothing to research", () => {
    const plan = planKeywordResearchRun({ candidateCount: 0, limits });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.reason).toBe("no-candidates");
  });

  it("admits a run within the ceiling and caps search queries", () => {
    const plan = planKeywordResearchRun({ candidateCount: 20, limits });
    expect(plan).toEqual({
      ok: true,
      candidateCount: 20,
      searchQueryCount: 5,
      estimatedCostCents: 10,
      ceilingCents: 50,
    });
  });

  it("refuses when planned spend exceeds the ceiling", () => {
    const tight = keywordRunLimits({ AEO_KEYWORD_RUN_CEILING_CENTS: "5", AEO_KEYWORD_COST_PER_QUERY_CENTS: "2" });
    const plan = planKeywordResearchRun({ candidateCount: 10, limits: tight });
    expect(plan.ok).toBe(false);
    if (!plan.ok) {
      expect(plan.reason).toBe("budget-exceeded");
      expect(plan.estimatedCostCents).toBe(10);
      expect(plan.ceilingCents).toBe(5);
    }
  });

  it("falls back to defaults for absent or junk env values", () => {
    expect(keywordRunLimits({}).maxSearchQueries).toBe(5);
    expect(keywordRunLimits({ AEO_KEYWORD_MAX_SEARCH_QUERIES: "not-a-number" }).maxSearchQueries).toBe(5);
  });
});

describe("keywordSearchOrder", () => {
  it("orders question-origin candidates first for the budgeted leg", () => {
    const ordered = keywordSearchOrder([
      { keyword: "Crawl phrase", origin: "crawl", sources: [] },
      { keyword: "Question phrase", origin: "question", sources: [] },
      { keyword: "Plan phrase", origin: "plan", sources: [] },
    ]);
    expect(ordered.map((c) => c.origin)).toEqual(["question", "plan", "crawl"]);
  });
});

describe("mergePlanTargetKeywords", () => {
  it("merges absent gaps first and dedupes by normalized phrase", () => {
    const merged = mergePlanTargetKeywords(
      ["Claim validation", "pricing page"],
      [
        { keyword: "claim validation", status: "present" },
        { keyword: "manual review alternatives", status: "absent" },
        { keyword: "unobserved phrase", status: "unproven" },
      ]
    );
    expect(merged).toEqual([
      "Claim validation",
      "pricing page",
      "manual review alternatives",
      "unobserved phrase",
    ]);
  });

  it("does not stack duplicates when reseeding after a re-run", () => {
    const gaps = [{ keyword: "manual review alternatives", status: "absent" as const }];
    const once = mergePlanTargetKeywords([], gaps);
    expect(mergePlanTargetKeywords(once, gaps)).toEqual(once);
  });
});

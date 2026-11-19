import type { CriterionOutcome, CriterionResult } from "./verificationRunner";
import type { VerificationFeatureReport, VerificationReceipt } from "./verificationReportData";

/** Production evidence for the curated AEO/SEO card on /verification. */
const SOURCE_DOC = "docs/verification/reports/2026-11-19-freshproof-production-research.md";
const CRAWL_ID = "wn7bx9mbdr2w55dy8gn1fcmg9d8jed2r";
const KEYWORD_RUN_ID = "wh71487stn7h0yhjte49669wcn8jeqdp";
const BASELINE_VISIBILITY_RUN_ID = "wh7dkbp73s2td73731156kk2718jh6kn";
const POST_BIO_VISIBILITY_RUN_ID = "wh71w1dnbs5zmvjhyj4v8vrqkh8jge1g";
const DISCOVERY_RUN_ID = "wh72c0pms1gfddxw6zz87qws6d8jh6s6";

function criterion(
  id: string,
  name: string,
  details: string,
  evidence: string,
  outcome: CriterionOutcome = "PASS",
): CriterionResult {
  return {
    criterionId: id,
    name,
    runner: "contract",
    tier: "live-receipt",
    outcome,
    ...(outcome === "PASS" ? { evidence, details } : { evidence: "", details: `${details} ${evidence}` }),
  };
}

const receipts: VerificationReceipt[] = [
  {
    label: "FreshProof crawl",
    runId: CRAWL_ID,
    status: "Complete · five pages",
  },
  {
    label: "SEO keyword research",
    runId: KEYWORD_RUN_ID,
    spendCents: 10,
    ceilingCents: 10,
    status: "Complete · five search checks",
  },
  {
    label: "Visibility before the Sessionize update",
    runId: BASELINE_VISIBILITY_RUN_ID,
    spendCents: 24,
    ceilingCents: 24,
    status: "Complete · 12 answers",
  },
  {
    label: "Visibility after the Sessionize update",
    runId: POST_BIO_VISIBILITY_RUN_ID,
    spendCents: 24,
    ceilingCents: 24,
    status: "Complete · 12 answers, zero freshproof.io citations",
  },
  {
    label: "Production competitor discovery",
    runId: DISCOVERY_RUN_ID,
    spendCents: 2,
    ceilingCents: 8,
    status: "Complete · one search, zero eligible excerpts",
  },
  {
    label: "ProofMyText positive control",
    status: "Failed · rejected on both live screening calls",
  },
];

export function aeoSeoFeatureReport(): VerificationFeatureReport {
  return {
    kind: "curated",
    featureId: "aeo-seo",
    name: "AEO / SEO intelligence",
    description: "Production crawl, SEO keyword research, web-grounded visibility, and competitor discovery evidence for FreshProof.",
    buyerSummary:
      "Production completed the crawl, keyword research, and both 12-question visibility runs. Neither run cited freshproof.io. " +
      "The competitor screener rejected a qualifying product in two live controls. The weekly jobs are paused.",
    status: "issues",
    startedAt: "2026-11-19T19:12:50.742Z",
    finishedAt: "2026-11-19T19:17:35.235Z",
    results: [
      criterion(
        "aeo-firecrawl-crawl",
        "Production crawl saved five FreshProof pages",
        "The completed Firecrawl snapshot contains the homepage and four article pages.",
        `Production crawl snapshot ${CRAWL_ID}, version 1.`,
      ),
      criterion(
        "aeo-keyword-research",
        "Production keyword research records search coverage",
        "Five searched queries did not surface freshproof.io. Twenty candidates remain unproven.",
        `Production run ${KEYWORD_RUN_ID}. See /aeo/gaps?brand=freshproof.`,
      ),
      criterion(
        "aeo-answer-engine-visibility",
        "Production visibility captures sources for the original comparison",
        "The 12-question run saved all 12 answers. All nine bare-name questions cited the UK delivery service. Zero answers cited freshproof.io.",
        `Production run ${BASELINE_VISIBILITY_RUN_ID}. See /aeo/intel?brand=freshproof.`,
      ),
      criterion(
        "aeo-sessionize-retrieval",
        "The answer engine can retrieve the updated Sessionize profile",
        "The first probe retrieved the earlier bio. The second probe read the current pre-publication description and identified the FreshProof link.",
        "One grounded response on each probe, using the production adapter and model. The second response cited https://sessionize.com/jakebutler/.",
      ),
      criterion(
        "aeo-post-bio-visibility",
        "The repeated questions surface freshproof.io",
        "All 12 questions were repeated in order after the retrieval check passed. Zero answers cited freshproof.io. The category-qualified definition still described post-publication monitoring, and 10 answers cited the UK delivery service.",
        `Production run ${POST_BIO_VISIBILITY_RUN_ID}. The baseline had zero freshproof.io citations and nine UK delivery citations.`,
        "FAIL",
      ),
      criterion(
        "aeo-competitor-discovery",
        "Discovery skips screening when search has no qualifying evidence",
        "The strict production trial completed after one search and queued zero suggestions.",
        `Production run ${DISCOVERY_RUN_ID}. The model screening call was skipped.`,
      ),
      criterion(
        "aeo-competitor-positive-control",
        "Discovery can queue a real qualifying product",
        "Firecrawl found ProofMyText and the excerpt filter admitted it. The production screening model returned an empty list twice, including with explicit draft-intake evidence. The review queue stayed empty in the isolated test.",
        "See the positive and negative controls in the evidence report. No candidates were written to the production queue during the controls.",
        "FAIL",
      ),
    ],
    reportPath: SOURCE_DOC,
    receipts,
    sourceDoc: SOURCE_DOC,
  };
}

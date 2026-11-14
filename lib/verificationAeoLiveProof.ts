import type { CriterionResult, CriterionOutcome } from "./verificationRunner";
import type { VerificationFeatureReport, VerificationReceipt } from "./verificationReportData";

/**
 * Curated AEO/SEO live-proof entry for the /verification report.
 *
 * AEO/SEO has no verification manifest: its proof is the committed live run
 * report `docs/verification/reports/2026-11-14-aeo-live-proof.md`, which
 * records a Firecrawl crawl, an answer-engine visibility run, and a
 * competitor-discovery cycle against a real dev deployment. This entry
 * transcribes that report's structured facts verbatim — run ids, spend,
 * timestamps — so the buyer surface can show them without scraping GitHub.
 * Re-run the live proof and update this file alongside the new report.
 */

const SOURCE_DOC = "docs/verification/reports/2026-11-14-aeo-live-proof.md";
const RUN_DATE = "2026-11-14";
const EVIDENCE_DIR = "docs/verification/reports/evidence/aeo-live-proof";

function criterion(
  id: string,
  name: string,
  details: string,
  evidence: string,
): CriterionResult {
  return {
    criterionId: id,
    name,
    runner: "contract",
    tier: "live-receipt",
    outcome: "PASS" satisfies CriterionOutcome,
    evidence,
    details,
  };
}

const receipts: VerificationReceipt[] = [
  {
    label: "Answer-engine visibility run",
    runId: "ms73vpw9sgj9w061qz8h2f04558j6rhd",
    spendCents: 4,
    ceilingCents: 50,
    status: "complete",
  },
  {
    label: "Competitor discovery cycle",
    runId: "ms71w1hpmtvw00xkb04q7sdw1n8j65xs",
    spendCents: 4,
    ceilingCents: 50,
    status: "complete",
  },
  {
    label: "Firecrawl crawl of the pilot target",
    status: "complete (free-tier crawl)",
  },
];

export function aeoSeoFeatureReport(): VerificationFeatureReport {
  return {
    kind: "curated",
    featureId: "aeo-seo",
    name: "AEO / SEO intelligence",
    description:
      "Live proof from a real dev deployment: the pilot site was connected, crawled with Firecrawl, " +
      "measured for AI answer-engine visibility, and compared against discovered competitors.",
    buyerSummary:
      "You can connect your site, see whether AI answer engines cite your brand, discover and " +
      "review competitors, and plan strategy from real data. A live run on a real deployment " +
      "(2026-11-14) proved the whole chain with a real crawl of the pilot site and real AI answers " +
      "— total spend about 8 cents, every run id and receipt recorded below.",
    status: "verified",
    startedAt: `${RUN_DATE}T07:55:00.000Z`,
    finishedAt: `${RUN_DATE}T07:55:00.000Z`,
    results: [
      criterion(
        "aeo-connect-target",
        "Connect the pilot target and pin its review",
        "The FreshProof pilot target was connected to https://freshproof.io through a real Clerk dev sign-in as the e2e user, and its review was pinned.",
        `Screenshots: ${EVIDENCE_DIR}/tc-1-home-signed-in.png, ${EVIDENCE_DIR}/tc-2-aeo-connect-connected.png, ${EVIDENCE_DIR}/tc-3-aeo-review-pinned.png`,
      ),
      criterion(
        "aeo-firecrawl-crawl",
        "Live Firecrawl crawl with an immutable snapshot",
        `Real crawl of https://freshproof.io (limit 5, 2 s poll interval); snapshot qh73md07v596xk3f2qzdxw1sa18j6c81 v1 recorded via recordCrawlSnapshot, status complete. Pages captured: /, /blog, /pricing, /terms, /sitemap.xml.`,
        `Driver: ${EVIDENCE_DIR}/driver-crawl.mts`,
      ),
      criterion(
        "aeo-answer-engine-visibility",
        "Answer-engine visibility run cites the brand",
        "Run ms73vpw9sgj9w061qz8h2f04558j6rhd (status complete, ceiling 50¢): both questions cited FreshProof, classification opportunity, extractability 0.79 and 0.58.",
        `Visible on /aeo/intel with quoted answers; screenshots ${EVIDENCE_DIR}/tc-7-intel.png, ${EVIDENCE_DIR}/tc-7-gaps.png, ${EVIDENCE_DIR}/tc-7-plan.png`,
      ),
      criterion(
        "aeo-competitor-discovery",
        "Competitor discovery proposes and human review decides",
        "Run ms71w1hpmtvw00xkb04q7sdw1n8j65xs (status complete) proposed 15 deduplicated suggestions; the review UI accepted slickwrite.com and gingersoftware.com and recorded a reasoned rejection for prowritingaid.com.",
        `Screenshots: ${EVIDENCE_DIR}/tc-4-competitors-review-queue.png, ${EVIDENCE_DIR}/tc-5-competitors-after-review.png, ${EVIDENCE_DIR}/tc-6-competitors-reject-recorded.png`,
      ),
    ],
    reportPath: SOURCE_DOC,
    receipts,
    sourceDoc: SOURCE_DOC,
  };
}

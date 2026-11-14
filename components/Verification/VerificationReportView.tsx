import { Badge } from "@/components/ui/badge";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import type { CriterionResult } from "@/lib/verificationRunner";
import {
  formatVerificationDate,
  formatVerificationTime,
  type VerificationFeatureReport,
  type VerificationFeatureStatus,
  type VerificationLoadError,
  type VerificationReportData,
} from "@/lib/verificationReportData";

/**
 * Buyer-facing verification report (presentational).
 *
 * A trust surface: every outcome is shown as-is — including FAIL, ABSENT and
 * UNPROVEN — with the evidence a skeptical customer needs to check a claim.
 * Pure over its props, so tests can render it with fixtures shaped by the
 * real runner and manifest outputs.
 */

const OUTCOME_BADGE: Record<CriterionResult["outcome"], { label: string; className: string }> = {
  PASS: { label: "PASS", className: "bg-emerald-100 text-emerald-800" },
  FAIL: { label: "FAIL", className: "bg-destructive/10 text-destructive" },
  ABSENT: { label: "ABSENT", className: "border-border text-muted-foreground" },
  UNPROVEN: { label: "UNPROVEN", className: "bg-[#fff8f0] text-[#8a4b00]" },
};

const TIER_BADGE: Record<CriterionResult["tier"], { label: string; className: string }> = {
  "live-receipt": { label: "live · receipt on file", className: tokens.pillActive },
  "offline-fixture": { label: "offline · fixture", className: tokens.pillIdle },
  "offline-contract": { label: "offline · contract", className: tokens.pillIdle },
};

const STATUS_BADGE: Record<VerificationFeatureStatus, { label: string; className: string }> = {
  verified: { label: "Verified", className: "bg-emerald-100 text-emerald-800" },
  issues: { label: "Needs attention", className: "bg-destructive/10 text-destructive" },
  unverified: { label: "Not yet verified", className: "border-border text-muted-foreground" },
};

export function VerificationReportView({ data }: { data: VerificationReportData }) {
  if (data.features.length === 0) {
    return (
      <div
        className={cn(tokens.panel, "flex flex-col items-center gap-2 p-10 text-center")}
        data-testid="verification-empty"
      >
        <p className="font-medium">No verification results yet</p>
        <p className={cn("max-w-md text-sm", tokens.textMuted)}>
          This report reads the feature-verification workflow&apos;s committed run
          files (docs/verification/*/latest.json). None are on file in this build.
          Run <code>npm run verify:feature -- &lt;featureId&gt;</code> and commit the
          report to populate this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="verification-report">
      {data.loadErrors.length > 0 ? (
        <div className={cn(tokens.panel, "space-y-2 p-4")} data-testid="verification-load-errors">
          <p className="text-sm font-semibold text-[#8a4b00]">
            Some verification files could not be read
          </p>
          {data.loadErrors.map((loadError) => (
            <LoadErrorRow key={loadError.path} loadError={loadError} />
          ))}
        </div>
      ) : null}

      {data.features.map((feature) => (
        <FeatureCard key={feature.featureId} feature={feature} />
      ))}
    </div>
  );
}

function LoadErrorRow({ loadError }: { loadError: VerificationLoadError }) {
  return (
    <div className={cn("rounded-md border px-3 py-2 text-sm", tokens.noticeWarning)}>
      <span className="font-medium">{loadError.path}</span> — {loadError.error}
    </div>
  );
}

function FeatureCard({ feature }: { feature: VerificationFeatureReport }) {
  const status = STATUS_BADGE[feature.status];
  const runDate = formatVerificationDate(feature.finishedAt);
  const runTime = formatVerificationTime(feature.finishedAt);

  return (
    <article className={cn(tokens.panel, "space-y-4 p-5")} data-testid={`feature-${feature.featureId}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{feature.name}</h2>
          <p className={cn("mt-0.5 text-xs", tokens.textSubtle)}>
            Feature id: <code>{feature.featureId}</code>
            {runDate && runTime
              ? ` · last run ${runDate} at ${runTime}`
              : " · no run on file"}
          </p>
        </div>
        <Badge className={cn("h-6 rounded-md px-2 text-xs", status.className)}>{status.label}</Badge>
      </header>

      <section aria-label={`What this proves: ${feature.name}`}>
        <h3 className={cn("text-sm font-semibold", tokens.accent)}>What this proves</h3>
        <p className={cn("mt-1 text-sm", tokens.text)}>{feature.buyerSummary}</p>
        {feature.description ? (
          <p className={cn("mt-1 text-xs", tokens.textSubtle)}>{feature.description}</p>
        ) : null}
      </section>

      {feature.receipts.length > 0 ? <ReceiptTable feature={feature} /> : null}

      {feature.results.length > 0 ? (
        <section aria-label={`Criteria for ${feature.name}`}>
          <h3 className={cn("text-sm font-semibold", tokens.accent)}>Proof, criterion by criterion</h3>
          <ul className="mt-2 space-y-2">
            {feature.results.map((result) => (
              <CriterionRow key={result.criterionId} result={result} />
            ))}
          </ul>
        </section>
      ) : null}

      {feature.reportPath ? (
        <p className={cn("text-xs", tokens.textSubtle)}>
          Full report on file: <code>{feature.reportPath}</code>
        </p>
      ) : null}
    </article>
  );
}

function ReceiptTable({ feature }: { feature: VerificationFeatureReport }) {
  return (
    <section aria-label={`Receipts for ${feature.name}`}>
      <h3 className={cn("text-sm font-semibold", tokens.accent)}>Live-run receipts</h3>
      <table className="mt-2 w-full text-left text-sm">
        <thead>
          <tr className={cn("border-b text-xs uppercase tracking-wide", tokens.textSubtle)}>
            <th className="py-1 pr-3 font-medium">Run</th>
            <th className="py-1 pr-3 font-medium">Run id</th>
            <th className="py-1 pr-3 font-medium">Spend</th>
            <th className="py-1 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {feature.receipts.map((receipt) => (
            <tr key={receipt.label} className="border-b border-black/5 last:border-0">
              <td className="py-1.5 pr-3">{receipt.label}</td>
              <td className="py-1.5 pr-3">
                {receipt.runId ? <code className="text-xs">{receipt.runId}</code> : "—"}
              </td>
              <td className="py-1.5 pr-3">
                {receipt.spendCents != null
                  ? `${receipt.spendCents}¢ of ${receipt.ceilingCents ?? "?"}¢ cap`
                  : "—"}
              </td>
              <td className="py-1.5">{receipt.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CriterionRow({ result }: { result: CriterionResult }) {
  const outcome = OUTCOME_BADGE[result.outcome];
  const tier = TIER_BADGE[result.tier];

  return (
    <li className="rounded-lg border border-black/10 p-3" data-testid={`criterion-${result.criterionId}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("rounded-md", outcome.className)}>{outcome.label}</Badge>
        <Badge variant="outline" className={cn("rounded-4xl border", tier.className)}>
          {tier.label}
        </Badge>
        <span className="text-sm font-medium">{result.name}</span>
      </div>
      <p className={cn("mt-1.5 text-sm", tokens.textMuted)}>{result.details}</p>
      {result.missingComponent ? (
        <p className={cn("mt-1 text-xs", tokens.textSubtle)}>Missing: {result.missingComponent}</p>
      ) : null}
      {result.evidence ? (
        <details className="mt-2">
          <summary className={cn("cursor-pointer text-xs", tokens.accent)}>
            Show evidence
          </summary>
          <pre className="mt-1 overflow-x-auto rounded-md bg-black/[0.04] p-2 text-xs whitespace-pre-wrap">
            {result.evidence}
          </pre>
        </details>
      ) : null}
    </li>
  );
}

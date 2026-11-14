import { Suspense } from "react";
import { ShieldCheck } from "lucide-react";
import { Shell } from "@/components/shell/Shell";
import { PageHeader } from "@/components/shell/PageHeader";
import { tokens } from "@/components/shell/tokens";
import { VerificationReportView } from "@/components/Verification/VerificationReportView";
import { VerificationSkeleton } from "@/components/Verification/VerificationSkeleton";
import { loadVerificationReportData } from "@/lib/verificationReportData";

export const metadata = {
  title: "Verification report — Resonate",
  description:
    "What the feature-verification workflow proves about Resonate's features, with per-criterion evidence, live-run receipts, and honest gaps.",
};

/**
 * Buyer-facing verification report: reads the committed structured run files
 * the feature-verification workflow publishes (docs/verification/<featureId>/latest.json)
 * at build time. No network fetches — the data ships with the repo.
 */
export default function VerificationPage() {
  return (
    <Shell activeSurface="verification">
      <main className={tokens.maxWidth}>
        <PageHeader
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Verification"
          title="Feature verification report"
          description="Every claim Resonate makes about what its features can do, checked by an automated verification workflow on every change. Each result below carries its evidence: what was run, when, on what tier (live with a receipt, or offline), and what could not be proven yet."
        />
        <div className="mt-5">
          <Suspense fallback={<VerificationSkeleton />}>
            <VerificationReportContent />
          </Suspense>
        </div>
      </main>
    </Shell>
  );
}

async function VerificationReportContent() {
  const data = await loadVerificationReportData();
  return <VerificationReportView data={data} />;
}

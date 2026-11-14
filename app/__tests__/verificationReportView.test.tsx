import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { parseVerificationManifest } from "@/lib/verificationManifest";
import { runVerification, type CriterionExecutor, type ExecutorResult } from "@/lib/verificationRunner";
import { buildVerificationReportData } from "@/lib/verificationReportData";
import { aeoSeoFeatureReport } from "@/lib/verificationAeoLiveProof";
import { VerificationReportView } from "@/components/Verification/VerificationReportView";
import { VerificationSkeleton } from "@/components/Verification/VerificationSkeleton";
import campaignsManifestJson from "../../verification/campaigns.manifest.json";
import smokeManifestJson from "../../verification/smoke.manifest.json";

vi.mock("@clerk/nextjs", () => ({ UserButton: () => <div data-testid="user-button" /> }));

const campaignsManifest = parseVerificationManifest(campaignsManifestJson);
const smokeManifest = parseVerificationManifest(smokeManifestJson);

function executorWhere(
  overrides: Record<string, ExecutorResult>,
): CriterionExecutor {
  return async (criterion) =>
    overrides[criterion.id] ?? {
      outcome: "PASS",
      evidence: "$ npx vitest run convex/__tests__/campaignVerification.test.ts\nexit code: 0\nTests 7 passed (7)",
    };
}

async function dataWithOverrides(overrides: Record<string, ExecutorResult>) {
  const run = await runVerification(campaignsManifest, executorWhere(overrides));
  return buildVerificationReportData({
    manifests: [campaignsManifest],
    runsByFeatureId: { campaigns: run },
    loadErrors: [],
    curatedFeatures: [aeoSeoFeatureReport()],
  });
}

function withShell(children: ReactNode): ReactNode {
  return <div data-testid="shell">{children}</div>;
}

describe("VerificationReportView — the four outcome states", () => {
  it("renders PASS, FAIL, ABSENT and UNPROVEN criteria from real runner shapes", async () => {
    // The campaigns manifest's dependency ladder yields FAIL/ABSENT/UNPROVEN;
    // the smoke manifest's all-pass run contributes the PASS outcome.
    const [campaignsRun, smokeRun] = await Promise.all([
      runVerification(campaignsManifest, executorWhere({
        "campaign-fixture-harness": { outcome: "PASS", evidence: "   " },
        "campaign-data-layer": { outcome: "FAIL", details: "`npx vitest run` exited 1." },
      })),
      runVerification(smokeManifest, executorWhere({})),
    ]);
    const data = buildVerificationReportData({
      manifests: [campaignsManifest, smokeManifest],
      runsByFeatureId: { campaigns: campaignsRun, smoke: smokeRun },
      loadErrors: [],
      curatedFeatures: [],
    });

    render(withShell(<VerificationReportView data={data} />));

    const featureCard = screen.getByTestId("feature-campaigns");
    expect(within(featureCard).getByText("FAIL")).toBeInTheDocument();
    // Both campaign-session (dependency skipped) and campaign-shape (transitively skipped) go ABSENT.
    expect(within(featureCard).getAllByText("ABSENT").length).toBeGreaterThan(0);
    expect(within(featureCard).getByText("UNPROVEN")).toBeInTheDocument();
    expect(within(screen.getByTestId("feature-smoke")).getAllByText("PASS").length).toBeGreaterThan(0);

    // A FAIL surfaces its details; an ABSENT names its missing component.
    expect(within(featureCard).getByText(/exited 1/)).toBeInTheDocument();
    expect(within(featureCard).getByText(/Missing: criterion "campaign-data-layer" did not pass/)).toBeInTheDocument();
    // The feature is judged by its worst outcomes, not its passes.
    expect(within(featureCard).getByText("Needs attention")).toBeInTheDocument();
  });

  it("renders each qualification tier's live-vs-offline badge", async () => {
    const data = await dataWithOverrides({});
    render(withShell(<VerificationReportView data={data} />));

    const featureCard = screen.getByTestId("feature-campaigns");
    expect(within(featureCard).getAllByText("offline · fixture").length).toBeGreaterThan(0);
    // The curated AEO/SEO entry carries the live tier.
    const aeoCard = screen.getByTestId("feature-aeo-seo");
    expect(within(aeoCard).getAllByText("live · receipt on file").length).toBeGreaterThan(0);
  });
});

describe("VerificationReportView — evidence and receipts", () => {
  it("exposes evidence behind a disclosure and renders the buyer-facing summary", async () => {
    const data = await dataWithOverrides({});
    render(withShell(<VerificationReportView data={data} />));

    const featureCard = screen.getByTestId("feature-campaigns");
    expect(featureCard.textContent).toContain("What this proves");
    expect(featureCard.textContent).toContain("brief a multi-post campaign once");
    expect(within(featureCard).getAllByText("Show evidence").length).toBeGreaterThan(0);
    expect(featureCard.textContent).toContain("$ npx vitest run convex/__tests__/campaignVerification.test.ts");
  });

  it("renders the AEO/SEO receipts table with run ids and spend", () => {
    render(withShell(<VerificationReportView data={buildVerificationReportData({
      manifests: [],
      runsByFeatureId: {},
      loadErrors: [],
      curatedFeatures: [aeoSeoFeatureReport()],
    })} />));

    const aeoCard = screen.getByTestId("feature-aeo-seo");
    expect(within(aeoCard).getByText("Answer-engine visibility run")).toBeInTheDocument();
    expect(within(aeoCard).getByText("ms73vpw9sgj9w061qz8h2f04558j6rhd")).toBeInTheDocument();
    // Both the visibility run and the discovery cycle spent 4¢ of a 50¢ cap.
    expect(within(aeoCard).getAllByText("4¢ of 50¢ cap").length).toBeGreaterThan(0);
    expect(aeoCard.textContent).toContain("last run 2026-11-14");
  });

  it("shows an evidence-free PASS as UNPROVEN and judges the feature honestly", async () => {
    // The runner core rejects a PASS without proof — no evidence, no claim.
    const run = await runVerification(campaignsManifest, async (criterion) =>
      criterion.id === "campaign-fixture-harness"
        ? { outcome: "PASS", evidence: "" }
        : { outcome: "PASS", evidence: "$ npx vitest run\nexit code: 0\nTests 3 passed (3)" },
    );
    const harness = run.results.find((result) => result.criterionId === "campaign-fixture-harness");
    expect(harness?.outcome).toBe("UNPROVEN");
    expect(run.summary.unproven).toBe(1);

    const data = buildVerificationReportData({
      manifests: [campaignsManifest],
      runsByFeatureId: { campaigns: run },
      loadErrors: [],
      curatedFeatures: [],
    });
    render(withShell(<VerificationReportView data={data} />));

    const featureCard = screen.getByTestId("feature-campaigns");
    expect(within(featureCard).getAllByText("UNPROVEN").length).toBeGreaterThan(0);
    expect(within(featureCard).getByText("Needs attention")).toBeInTheDocument();
  });
});

describe("VerificationReportView — off-happy paths", () => {
  it("renders the empty state when no verification data exists at all", () => {
    render(withShell(<VerificationReportView data={{ features: [], loadErrors: [] }} />));
    expect(screen.getByTestId("verification-empty")).toBeInTheDocument();
    expect(screen.getByTestId("verification-empty").textContent).toContain("No verification results yet");
  });

  it("renders unreadable verification files as an explicit error panel", () => {
    render(withShell(<VerificationReportView
      data={{
        features: [aeoSeoFeatureReport()],
        loadErrors: [{ path: "docs/verification/campaigns/latest.json", error: "Unexpected token" }],
      }}
    />));

    const errors = screen.getByTestId("verification-load-errors");
    expect(within(errors).getByText("docs/verification/campaigns/latest.json")).toBeInTheDocument();
    expect(within(errors).getByText(/Unexpected token/)).toBeInTheDocument();
    // The report still renders the features it could load.
    expect(screen.getByTestId("feature-aeo-seo")).toBeInTheDocument();
  });

  it("renders an unverified feature without timestamps or criteria", async () => {
    const data = buildVerificationReportData({
      manifests: [campaignsManifest],
      runsByFeatureId: { campaigns: null },
      loadErrors: [],
      curatedFeatures: [],
    });
    render(withShell(<VerificationReportView data={data} />));

    const featureCard = screen.getByTestId("feature-campaigns");
    expect(within(featureCard).getByText("Not yet verified")).toBeInTheDocument();
    expect(featureCard.textContent).toContain("no run on file");
    expect(within(featureCard).queryAllByText("Show evidence")).toHaveLength(0);
  });
});

describe("VerificationSkeleton", () => {
  it("renders a loading skeleton mirroring the report layout", () => {
    render(withShell(<VerificationSkeleton />));
    expect(screen.getByTestId("verification-skeleton")).toBeInTheDocument();
    expect(screen.getByTestId("verification-skeleton").getAttribute("aria-busy")).toBe("true");
  });
});

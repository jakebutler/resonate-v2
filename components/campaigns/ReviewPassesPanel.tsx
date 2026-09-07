"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";

type Check = {
  id: string;
  label: string;
  passed: boolean;
  blocking: boolean;
};

type LatestRun = {
  _id: string;
  checks: Check[];
  autoFixLog: { checkId: string; note: string; fixedAt: number }[];
  passed: boolean;
};

type SeoAeoEntry = {
  postId: string;
  title: string;
  questions: string[];
  extractableAnswer: string;
};

type BotLikelihoodEntry = {
  postId: string;
  title: string;
  score: number;
  band: string;
};

type ReviewPassesData = {
  campaign: { _id: string };
  materialization: { _id: string; mode: string } | null;
  latestRun: LatestRun | null;
  seoAeo: SeoAeoEntry[];
  botLikelihood: BotLikelihoodEntry[];
  draftCount?: number;
} | null | undefined;

type ReviewPassesPanelProps = {
  campaignId: string;
  onGateResolved?: (passed: boolean) => void;
};

export function ReviewPassesPanel({
  campaignId,
  onGateResolved,
}: ReviewPassesPanelProps) {
  const typedCampaignId = campaignId as never;
  const data = useQuery(api.cohesion.getReviewPasses, {
    campaignId: typedCampaignId,
  }) as ReviewPassesData;

  const runCohesionGate = useMutation(api.cohesion.runCohesionGate);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(null), 3600);
  }

  async function handleRunGate() {
    setRunning(true);
    try {
      const result = await runCohesionGate({ campaignId: typedCampaignId });
      showToast(
        result.passed
          ? `Cohesion gate passing (run #${result.runNumber}) — ${result.autoFixLog.length} auto-fix(es) applied with notes.`
          : `Cohesion gate is blocking (run #${result.runNumber}) — resolve the failures to materialize.`
      );
      onGateResolved?.(result.passed);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : "Gate run failed.");
    } finally {
      setRunning(false);
    }
  }

  if (data === undefined) {
    return (
      <p className={cn("text-sm", tokens.textMuted)}>Loading review passes…</p>
    );
  }
  const review = data;
  if (!review || !review.materialization) {
    return null;
  }

  return (
    <section className="mt-6 space-y-4" aria-label="Review passes" data-testid="review-passes">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">Review passes</h2>
        <p className={cn("text-sm", tokens.textMuted)}>
          Set-level checks run across the whole batch — cohesion can block
          materialization; the SEO/AEO and humanizer surfaces are placeholders
          for the skill packs.
        </p>
      </div>

      <div className={cn(tokens.panel, "p-4")} data-testid="cohesion-panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Cohesion gate</h3>
          <div className="flex items-center gap-2">
            {review.latestRun ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-normal",
                  review.latestRun.passed
                    ? "bg-[#e2f2e6] text-[#1d5c31]"
                    : "bg-[#fde5ee] text-[#a11441]"
                )}
                data-testid="gate-status"
              >
                {review.latestRun.passed ? "passing" : "blocking"}
              </span>
            ) : null}
            <Button
              variant="accent"
              size="xs"
              disabled={running}
              onClick={() => void handleRunGate()}
              data-testid="run-cohesion-gate"
            >
              {running
                ? "Running…"
                : data.latestRun
                  ? "Run again"
                  : "Run cohesion gate"}
            </Button>
          </div>
        </div>
        {review.latestRun ? (
          <>
            <ul className="mt-2 space-y-1.5" data-testid="cohesion-checks">
              {review.latestRun.checks.map((check) => (
                <li key={check.id} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                      check.passed
                        ? "bg-[#e2f2e6] text-[#1d5c31]"
                        : "bg-[#fde8e2] text-[#78290f]"
                    )}
                  >
                    {check.passed ? "✓" : "!"}
                  </span>
                  <span className="flex-1">
                    {check.label}
                    {review.latestRun?.autoFixLog
                      .filter((fix) => fix.checkId === check.id)
                      .map((fix, index) => (
                        <span
                          key={index}
                          className={cn("mt-0.5 block text-xs", tokens.textMuted)}
                          data-testid="auto-fix-note"
                        >
                          {fix.note}
                        </span>
                      ))}
                  </span>
                </li>
              ))}
            </ul>
            {review.latestRun.autoFixLog.length > 0 ? (
              <p className={cn("mt-2 text-xs", tokens.textMuted)}>
                Auto-fixes applied mechanically — no manual buttons. The notes
                above explain what changed and why.
              </p>
            ) : null}
          </>
        ) : (
          <p className={cn("mt-2 text-sm", tokens.textMuted)}>
            Not run yet. The gate checks: exactly one pillar, exactly one CTA,
            no repeated framing openers, satellites referencing the pillar
            claim. Mechanical violations auto-resolve with notes.
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cn(tokens.panel, "p-4")} data-testid="seo-aeo-panel">
          <h3 className="text-sm font-semibold">SEO / AEO pass</h3>
          <p className={cn("mt-0.5 text-xs", tokens.textMuted)}>
            Placeholder surface — the real extraction skill pack arrives with
            the agent layer.
          </p>
          <ul className="mt-2 space-y-2">
            {review.seoAeo.map((entry) => (
              <li key={entry.postId} className="border-t pt-2 text-sm first:border-none first:pt-0" style={{ borderColor: "rgba(0,0,0,0.06)" }}>
                <b className="text-[13px]">{entry.title}</b>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {entry.questions.map((question) => (
                    <span
                      key={question}
                      className="rounded-full bg-[#e2eff1] px-2 py-0.5 text-[11px] font-normal text-[#0e4a54]"
                    >
                      {question}
                    </span>
                  ))}
                </div>
                <p className={cn("mt-1 text-xs", tokens.textMuted)}>
                  extractable answer: “{entry.extractableAnswer}”
                </p>
              </li>
            ))}
          </ul>
        </div>

        <div className={cn(tokens.panel, "p-4")} data-testid="humanizer-panel">
          <h3 className="text-sm font-semibold">Humanizer pass</h3>
          <p className={cn("mt-0.5 text-xs", tokens.textMuted)}>
            Placeholder bot-likelihood meter — the real loop is a bounded
            editor pass.
          </p>
          <ul className="mt-2 space-y-2">
            {review.botLikelihood.map((entry) => (
              <li key={entry.postId} className="flex items-center gap-2 text-sm">
                <b className="text-[13px]">{entry.title.slice(0, 42)}…</b>
                <span className="flex flex-1 items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#e2eff1]">
                    <span
                      className={cn(
                        "block h-full rounded-full",
                        entry.band === "elevated" ? "bg-[#d81e5b]" : "bg-[#1d7a3e]"
                      )}
                      style={{ width: `${entry.score}%` }}
                    />
                  </span>
                  <span className={cn("text-xs", tokens.textMuted)}>
                    {entry.score}% placeholder bot-likelihood
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {toast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 max-w-sm rounded-lg bg-[#001524] px-4 py-3 text-sm text-[#ffecd1] shadow-lg"
          data-testid="review-toast"
        >
          {toast}
        </div>
      ) : null}
    </section>
  );
}

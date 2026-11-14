"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel, LoadableSection } from "./PanelStates";
import type { KeywordGap, KeywordPresence, KeywordSignal, Loadable } from "./types";

const STATUS_BADGE: Record<
  KeywordPresence,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  // "absent" is the actionable gap: observed without the target cited/surfaced.
  absent: { label: "Missing", variant: "destructive" },
  present: { label: "Present", variant: "default" },
  // "unproven" is explicitly NOT absence: no real signal has observed it yet.
  unproven: { label: "Unproven", variant: "outline" },
};

const SIGNAL_LABEL: Record<KeywordSignal, string> = {
  "answer-engine": "Answer-engine run",
  search: "Search results",
  derived: "Derived — no signal has observed this yet",
};

/** Missing = observed by a real run without the target cited or surfaced. */
export function missingKeywordCount(gaps: KeywordGap[]): number {
  return gaps.filter((gap) => gap.status === "absent").length;
}

/**
 * The keyword-gap view: "you're missing these N queries", each candidate with
 * its honest status and the questions/pages it came from. The only action is
 * running more research — a budget-admitted, read-only intel run (L8).
 */
export function KeywordGapsPanel({
  gaps,
  runPending = false,
  runEnabled = true,
  onRun,
}: {
  gaps: Loadable<KeywordGap[]>;
  /** True while the research action is in flight; disables the run button. */
  runPending?: boolean;
  /** False when the run's env gates fail closed; the panel explains why. */
  runEnabled?: boolean;
  onRun?: () => void;
}) {
  return (
    <AeoPanel
      ariaLabel="Keyword gaps"
      title="Keyword gaps"
      description="Candidate queries derived only from real data — crawl pages, audit questions, competitor topics, and plan keywords — with honest presence signals. No search-volume metrics are invented."
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p aria-live="polite" className="text-sm font-medium">
          {gaps.status === "ready" && gaps.data.length > 0
            ? `You're missing ${missingKeywordCount(gaps.data)} of ${gaps.data.length} researched quer${gaps.data.length === 1 ? "y" : "ies"}.`
            : null}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={!onRun || runPending || !runEnabled}
          onClick={() => onRun?.()}
        >
          {runPending ? "Researching…" : "Run keyword research"}
        </Button>
      </div>
      {runEnabled ? null : (
        <p className={cn("mb-3 text-xs", tokens.textMuted)}>
          Keyword research runs are disabled on this deployment (server env
          AEO_KEYWORD_RESEARCH_ENABLED), or Firecrawl is not configured.
        </p>
      )}
      <LoadableSection
        value={gaps}
        loadingLabel="Loading keyword gaps"
        emptyTitle="No keyword gaps researched yet"
        emptyDescription="Run keyword research to derive candidate queries from your crawl, audit questions, and competitor topics."
      >
        {(loaded) => (
          <ul className="space-y-2">
            {loaded.map((gap) => {
              const status = STATUS_BADGE[gap.status];
              return (
                <li
                  key={gap.id}
                  className="rounded border border-black/10 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={status.variant}
                        aria-label={`${status.label}: ${gap.keyword}`}
                      >
                        {status.label}
                      </Badge>
                      <Badge variant="outline" aria-label={`Signal: ${SIGNAL_LABEL[gap.signal]}`}>
                        {SIGNAL_LABEL[gap.signal]}
                      </Badge>
                      {gap.fromPlan ? (
                        <Badge variant="secondary" aria-label="From the saved plan">
                          From plan
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1 text-sm font-medium">{gap.keyword}</p>
                  {gap.questions.length > 0 ? (
                    <p className={cn("mt-1 text-xs", tokens.textMuted)}>
                      From audit question{gap.questions.length === 1 ? "" : "s"}:{" "}
                      {gap.questions.join(" · ")}
                    </p>
                  ) : null}
                  {gap.evidence
                    .filter((line) => !line.endsWith("?"))
                    .map((line, index) => (
                      <p key={index} className={cn("text-xs", tokens.textSubtle)}>
                        {line}
                      </p>
                    ))}
                  {gap.sourcePageUrls.length > 0 ? (
                    <p className={cn("mt-1 text-xs", tokens.textSubtle)}>
                      Source page{gap.sourcePageUrls.length === 1 ? "" : "s"}:{" "}
                      {gap.sourcePageUrls.join(", ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </LoadableSection>
    </AeoPanel>
  );
}

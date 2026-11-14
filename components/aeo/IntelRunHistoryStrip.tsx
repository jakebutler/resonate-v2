"use client";

import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel } from "./PanelStates";
import type { Loadable } from "./types";
import type { Doc } from "@/convex/_generated/dataModel";

type IntelRunRow = Doc<"intelRuns">;

/** Newest first, so the strip's recent-run list reads latest-on-top. */
function sortRunsNewestFirst(runs: IntelRunRow[]): IntelRunRow[] {
  return [...runs].sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * The /aeo surface spends real money on crawls and answer-engine calls, so
 * the intel step shows its run history and budget honestly. Runs record a
 * per-run cost ceiling, not a metered spend — the strip says "ceiling" and
 * never invents a spend number the data model does not carry.
 */
export function IntelRunHistoryStrip({
  runs,
}: {
  runs: Loadable<IntelRunRow[]>;
}) {
  return (
    <AeoPanel
      ariaLabel="Intel run history and budget"
      title="Run history and budget"
      description="The cron-driven intel cycles behind this surface, with their per-run budget ceilings."
    >
      {runs.status === "loading" ? (
        <p role="status" className={cn("text-sm", tokens.textMuted)}>
          Loading run history…
        </p>
      ) : runs.status === "error" ? (
        <p role="alert" className="text-sm">
          Run history could not be loaded — {runs.message}
        </p>
      ) : runs.data.length === 0 ? (
        <p className={cn("text-sm", tokens.textMuted)}>
          No intel runs yet — the daily cycle records one run per batch it
          starts.
        </p>
      ) : (
        (() => {
          const rows = sortRunsNewestFirst(runs.data);
          const totalCeilingCents = rows.reduce(
            (sum, run) => sum + run.costCeilingCents,
            0
          );
          return (
            <div className="space-y-2">
              <p className={cn("text-sm", tokens.textMuted)}>
                {rows.length} run{rows.length === 1 ? "" : "s"} · total budget
                ceiling {totalCeilingCents}¢ (ceilings, not metered spend)
              </p>
              <ul className="space-y-1">
                {rows.map((run) => (
                  <li
                    key={run._id}
                    className={cn("text-xs", tokens.textSubtle)}
                  >
                    <span className="font-mono">{run._id}</span> · {run.kind} ·{" "}
                    {run.status} · ceiling {run.costCeilingCents}¢ ·{" "}
                    {run.questionCount} question
                    {run.questionCount === 1 ? "" : "s"} · started{" "}
                    {new Date(run.startedAt).toLocaleString()}
                    {run.finishedAt
                      ? ` · finished ${new Date(run.finishedAt).toLocaleString()}`
                      : " · running"}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()
      )}
    </AeoPanel>
  );
}

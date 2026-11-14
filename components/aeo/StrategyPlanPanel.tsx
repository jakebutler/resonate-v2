"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel, PanelError, PanelLoading } from "./PanelStates";
import type { Loadable, StrategyPlan } from "./types";

const REVIEW_BADGE: Record<
  StrategyPlan["reviewState"],
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  unreviewed: { label: "Awaiting review", variant: "secondary" },
  accepted: { label: "Accepted", variant: "default" },
  "changes-requested": { label: "Changes requested", variant: "destructive" },
};

const BRIEF_ROWS: Array<{ key: keyof StrategyPlan["brief"]; label: string }> = [
  { key: "goal", label: "Goal" },
  { key: "audience", label: "Audience" },
  { key: "thesis", label: "Thesis" },
  { key: "window", label: "Time window" },
  { key: "channels", label: "Channels" },
  { key: "cta", label: "CTA" },
  { key: "metric", label: "Success metric" },
  { key: "constraints", label: "Constraints" },
];

function BriefValue({ value }: { value: string | string[] }) {
  const text = Array.isArray(value) ? value.join(", ") : value;
  return <dd className="text-sm">{text === "" ? "—" : text}</dd>;
}

/**
 * The reviewable strategy plan. Actions are review-only: they resolve the
 * plan's review state — seeding ideas or briefs happens in the flows that
 * consume an accepted plan, never automatically here.
 */
export function StrategyPlanPanel({
  plan,
  gapTitles,
  gapWarnings,
  reviewPending = false,
  onAccept,
  onRequestChanges,
}: {
  plan: Loadable<StrategyPlan | null>;
  /** Gap id → human title from the same intel run; ids render when absent. */
  gapTitles?: Record<string, string>;
  /**
   * Gap id → mismatch warning for findings a run flagged suspect. A cited
   * answer suspected of describing a different product carries the same
   * warning here that the intel screen shows.
   */
  gapWarnings?: Record<string, string>;
  /** True while the plan-review mutation is in flight; disables Accept. */
  reviewPending?: boolean;
  onAccept?: (planId: string) => void;
  onRequestChanges?: (planId: string, note: string) => void;
}) {
  const [changeNote, setChangeNote] = useState("");
  const [changesOpen, setChangesOpen] = useState(false);
  return (
    <AeoPanel
      ariaLabel="Strategy plan"
      title="Strategy plan"
      description="The reviewable plan built from the prioritized gaps."
    >
      {plan.status === "loading" ? (
        <PanelLoading label="Loading strategy plan" />
      ) : plan.status === "error" ? (
        <PanelError message={plan.message} onRetry={plan.onRetry} />
      ) : plan.data === null ? (
        <p className={cn("text-sm", tokens.textMuted)}>
          No strategy plan yet — run an intel cycle and review its gaps first.
        </p>
      ) : (
        (() => {
          const loaded = plan.data;
          const review = REVIEW_BADGE[loaded.reviewState];
          return (
            <div className="space-y-3">
              <Badge variant={review.variant} aria-label={`Plan review state: ${review.label}`}>
                {review.label}
              </Badge>
              <dl className="space-y-1">
                {BRIEF_ROWS.map(({ key, label }) => (
                  <div key={key} className="grid grid-cols-[160px_minmax(0,1fr)] gap-2">
                    <dt className={cn("text-sm", tokens.textMuted)}>{label}</dt>
                    <BriefValue value={loaded.brief[key]} />
                  </div>
                ))}
              </dl>
              {loaded.priorityIds.length > 0 ? (
                <div className={cn("text-sm", tokens.textMuted)}>
                  <p>
                    Prioritizes {loaded.priorityIds.length} gap
                    {loaded.priorityIds.length === 1 ? "" : "s"}:
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {loaded.priorityIds.map((id) => {
                      const warning = gapWarnings?.[id];
                      return (
                        <li key={id}>
                          {gapTitles?.[id] ?? id}
                          {warning ? (
                            <span role="alert" className={cn(tokens.noticeWarning, "ml-2 text-xs")}>
                              Brand mismatch suspected: {warning}
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {loaded.reviewState === "unreviewed" ||
              loaded.reviewState === "changes-requested" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!onAccept || reviewPending}
                    onClick={() => onAccept?.(loaded.id)}
                  >
                    Accept plan
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setChangesOpen((open) => !open)}
                  >
                    Request changes
                  </Button>
                </div>
              ) : null}
              {changesOpen ? (
                <div className="space-y-2">
                  <label className="block space-y-1">
                    <span className="text-sm font-medium">What should change?</span>
                    <textarea
                      className="w-full rounded border border-black/10 p-2 text-sm"
                      value={changeNote}
                      onChange={(event) => setChangeNote(event.target.value)}
                      aria-label="Change request note"
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={changeNote.trim() === "" || !onRequestChanges || reviewPending}
                    onClick={() => {
                      onRequestChanges?.(loaded.id, changeNote.trim());
                      setChangeNote("");
                      setChangesOpen(false);
                    }}
                  >
                    Submit change request
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })()
      )}
    </AeoPanel>
  );
}

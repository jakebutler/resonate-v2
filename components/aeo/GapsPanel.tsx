"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel, LoadableSection } from "./PanelStates";
import type { Gap, GapPriority, Loadable } from "./types";

const PRIORITY_ORDER: Record<GapPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Highest priority first; high-priority gaps before opportunities at the same priority. */
export function sortGaps(gaps: Gap[]): Gap[] {
  return [...gaps].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      (a.kind === b.kind ? 0 : a.kind === "gap" ? -1 : 1),
  );
}

/**
 * Prioritized keyword and question gaps. Every action here only seeds
 * captured ideas — nothing downstream is approved or scheduled by it.
 */
export function GapsPanel({
  gaps,
  onSeedIdea,
}: {
  gaps: Loadable<Gap[]>;
  onSeedIdea?: (gap: Gap) => void;
}) {
  return (
    <AeoPanel
      ariaLabel="Keyword gaps"
      title="Gaps and opportunities"
      description="Prioritized keyword and question gaps from the intel runs."
    >
      <LoadableSection
        value={gaps}
        loadingLabel="Loading gaps"
        emptyTitle="No gaps identified yet"
        emptyDescription="Run an intel cycle to surface keyword and question gaps."
      >
        {(loaded) => (
          <ul className="space-y-2">
            {sortGaps(loaded).map((gap) => (
              <li
                key={gap.id}
                className="rounded border border-black/10 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={gap.kind === "gap" ? "destructive" : "secondary"}
                      aria-label={`${gap.kind}: ${gap.title}`}
                    >
                      {gap.kind === "gap" ? "Gap" : "Opportunity"}
                    </Badge>
                    <Badge
                      variant="outline"
                      aria-label={`${gap.priority} priority`}
                    >
                      {gap.priority}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!onSeedIdea}
                    onClick={() => onSeedIdea?.(gap)}
                  >
                    Seed captured idea
                  </Button>
                </div>
                <p className="mt-1 text-sm font-medium">{gap.title}</p>
                <p className={cn("text-sm", tokens.textMuted)}>{gap.detail}</p>
                {gap.keywords.length > 0 ? (
                  <p className={cn("mt-1 text-xs", tokens.textSubtle)}>
                    {gap.keywords.join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </LoadableSection>
    </AeoPanel>
  );
}

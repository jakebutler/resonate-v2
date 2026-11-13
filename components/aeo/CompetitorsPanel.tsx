"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel, LoadableSection } from "./PanelStates";
import type { CompetitorSets, Loadable } from "./types";

/**
 * Competitor review: the reviewable suggested-competitor queue beside the
 * confirmed set. Accepting or rejecting is always an explicit human action;
 * a rejection records its reason so discovery does not re-propose it.
 */
export function CompetitorsPanel({
  sets,
  onAccept,
  onReject,
}: {
  sets: Loadable<CompetitorSets>;
  onAccept?: (suggestionId: string) => void;
  onReject?: (suggestionId: string, reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  return (
    <AeoPanel
      ariaLabel="Competitor review"
      title="Competitors"
      description="Suggested competitors from discovery, beside the confirmed set."
    >
      <LoadableSection
        value={sets}
        loadingLabel="Loading competitor sets"
        emptyTitle="No competitors tracked yet"
        emptyDescription="Competitors named at connect time appear here; discovery suggests more over time."
        isEmpty={({ confirmed, suggestions }) =>
          confirmed.length === 0 && suggestions.length === 0
        }
      >
        {({ confirmed, suggestions }) => (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Confirmed</h4>
              {confirmed.length === 0 ? (
                <p className={cn("text-sm", tokens.textMuted)}>
                  No confirmed competitors yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {confirmed.map((competitor) => (
                    <li
                      key={competitor.id}
                      className="rounded border border-black/10 px-3 py-2"
                    >
                      <p className="text-sm font-medium">{competitor.name}</p>
                      <p className={cn("text-xs break-all", tokens.textSubtle)}>
                        {competitor.domain}
                        {competitor.addedFromSuggestion
                          ? " · accepted from a suggestion"
                          : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Suggested</h4>
              {suggestions.length === 0 ? (
                <p className={cn("text-sm", tokens.textMuted)}>
                  No suggestions waiting for review.
                </p>
              ) : (
                <ul className="space-y-2">
                  {suggestions.map((suggestion) => (
                    <li
                      key={suggestion.id}
                      className="rounded border border-black/10 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">
                            {suggestion.name}
                          </p>
                          <p className={cn("text-xs break-all", tokens.textSubtle)}>
                            {suggestion.domain}
                          </p>
                        </div>
                        {suggestion.status === "accepted" ? (
                          <Badge aria-label={`Accepted: ${suggestion.name}`}>
                            Accepted
                          </Badge>
                        ) : suggestion.status === "rejected" ? (
                          <Badge
                            variant="outline"
                            aria-label={`Rejected: ${suggestion.name}`}
                          >
                            Rejected
                          </Badge>
                        ) : null}
                      </div>
                      <p className={cn("mt-1 text-xs", tokens.textSubtle)}>
                        {suggestion.evidence.occurrences}× in{" "}
                        {suggestion.evidence.source}
                        {suggestion.evidence.examplePhrasing
                          ? ` — “${suggestion.evidence.examplePhrasing}”`
                          : ""}
                      </p>
                      {suggestion.status === "rejected" &&
                      suggestion.rejectionReason ? (
                        <p className={cn("mt-1 text-xs", tokens.textMuted)}>
                          Rejected: {suggestion.rejectionReason}
                        </p>
                      ) : null}
                      {suggestion.status === "pending" ? (
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            disabled={!onAccept}
                            onClick={() => onAccept?.(suggestion.id)}
                          >
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setRejecting({ id: suggestion.id, reason: "" })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      ) : null}
                      {rejecting?.id === suggestion.id ? (
                        <div className="mt-2 space-y-2">
                          <Input
                            value={rejecting.reason}
                            onChange={(event) =>
                              setRejecting({
                                id: suggestion.id,
                                reason: event.target.value,
                              })
                            }
                            placeholder="Why reject this suggestion?"
                            aria-label="Rejection reason"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              rejecting.reason.trim() === "" || !onReject
                            }
                            onClick={() => {
                              onReject?.(suggestion.id, rejecting.reason.trim());
                              setRejecting(null);
                            }}
                          >
                            Record rejection
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </LoadableSection>
    </AeoPanel>
  );
}

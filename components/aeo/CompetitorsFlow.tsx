"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CompetitorsPanel } from "./CompetitorsPanel";
import { MutationFeedbackBar, useAeoMutation } from "./mutationFeedback";
import { suggestionRowsToSets } from "./mappings";
import { useAeoBrand } from "./AeoWorkspaceChrome";
import type { CompetitorSets, Loadable } from "./types";
import type { FunctionArgs } from "convex/server";
import type { OptimisticLocalStore } from "convex/browser";

/**
 * Competitor review step: the suggestion queue is review-only here — the
 * mutation's accept path is the one write into the tracking set, and a reject
 * records the reason so discovery never re-proposes it. Accepts and rejects
 * apply optimistically; a rejected mutation rolls the queue back and surfaces
 * the failure with a Retry.
 */
/**
 * Optimistic review state: the row leaves the pending queue immediately and
 * Convex restores it if the mutation fails (rolling the patch back).
 */
function applyReviewStateOptimistically(
  localStore: OptimisticLocalStore,
  args: FunctionArgs<typeof api.competitorSuggestions.reviewSuggestion>
) {
  const current = localStore.getQuery(
    api.competitorSuggestions.listSuggestions,
    { brandId: args.brandId }
  );
  if (current !== undefined) {
    localStore.setQuery(
      api.competitorSuggestions.listSuggestions,
      { brandId: args.brandId },
      current.map((row) =>
        row._id === args.suggestionId &&
        (args.reviewStatus === "accepted" || args.reviewStatus === "rejected")
          ? { ...row, status: args.reviewStatus }
          : row
      )
    );
  }
}

export function CompetitorsFlow() {
  const { brandId } = useAeoBrand();
  const targetRow = useQuery(api.aeoIntel.getTarget, { brandId });
  const suggestionRows = useQuery(api.competitorSuggestions.listSuggestions, {
    brandId,
  });
  const review = useAeoMutation(
    useMutation(api.competitorSuggestions.reviewSuggestion),
    applyReviewStateOptimistically
  );

  // List query: undefined is pending; null is the sync fixture's empty-set
  // convention — normalize so derivations always see an array.
  const sets: Loadable<CompetitorSets> =
    targetRow === undefined || suggestionRows === undefined
      ? { status: "loading" }
      : {
          status: "ready",
          data: suggestionRowsToSets(
            suggestionRows ?? [],
            targetRow?.competitorUrls ?? []
          ),
        };

  return (
    <>
      <CompetitorsPanel
        sets={sets}
        reviewPending={review.state.status === "pending"}
        onAccept={(suggestionId) => {
          void review.run({
            brandId,
            suggestionId,
            reviewStatus: "accepted",
          });
        }}
        onReject={(suggestionId, reason) => {
          void review.run({
            brandId,
            suggestionId,
            reviewStatus: "rejected",
            reviewNotes: reason,
          });
        }}
      />
      <MutationFeedbackBar
        state={review.state}
        onRetry={review.state.status === "error" ? review.retry : undefined}
      />
    </>
  );
}

"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CompetitorsPanel } from "./CompetitorsPanel";
import { suggestionRowsToSets } from "./mappings";
import { useAeoBrand } from "./AeoWorkspaceChrome";
import type { CompetitorSets, Loadable } from "./types";

/**
 * Competitor review step: the suggestion queue is review-only here — the
 * mutation's accept path is the one write into the tracking set, and a reject
 * records the reason so discovery never re-proposes it.
 */
export function CompetitorsFlow() {
  const { brandId } = useAeoBrand();
  const targetRow = useQuery(api.aeoIntel.getTarget, { brandId });
  const suggestionRows = useQuery(api.competitorSuggestions.listSuggestions, {
    brandId,
  });
  const reviewSuggestion = useMutation(
    api.competitorSuggestions.reviewSuggestion
  );

  const sets: Loadable<CompetitorSets> =
    targetRow === undefined || suggestionRows === undefined
      ? { status: "loading" }
      : {
          status: "ready",
          data: suggestionRowsToSets(
            suggestionRows,
            targetRow?.competitorUrls ?? []
          ),
        };

  return (
    <CompetitorsPanel
      sets={sets}
      onAccept={(suggestionId) => {
        void reviewSuggestion({ brandId, suggestionId, reviewStatus: "accepted" });
      }}
      onReject={(suggestionId, reason) => {
        void reviewSuggestion({
          brandId,
          suggestionId,
          reviewStatus: "rejected",
          reviewNotes: reason,
        });
      }}
    />
  );
}

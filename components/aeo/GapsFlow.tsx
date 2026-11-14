"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GapsPanel } from "./GapsPanel";
import { KeywordGapsPanel } from "./KeywordGapsPanel";
import { MutationFeedbackBar, useAeoMutation, type AeoMutationState } from "./mutationFeedback";
import { findingRowToGap, keywordGapRowToKeywordGap } from "./mappings";
import { useAeoBrand } from "./AeoWorkspaceChrome";
import type { Gap, KeywordGap, Loadable } from "./types";

/**
 * Gaps step: the reviewable output of the intel cycles, plus the keyword-gap
 * view derived from real data. The only actions are seeding a captured idea
 * and running budget-admitted keyword research — both read-only intel moves,
 * never an auto-approved draft or publication (L8). Run failures surface
 * through the shared feedback bar, including the fail-closed gate reasons.
 */
export function GapsFlow() {
  const { brandId } = useAeoBrand();
  const findingRows = useQuery(api.aeoIntel.listFindings, { brandId });
  const keywordGapRows = useQuery(api.keywordResearch.listKeywordGaps, { brandId });
  const runKeywordResearch = useAction(api.keywordResearch.runKeywordResearch);
  const seedIdea = useAeoMutation(useMutation(api.ideas.create));

  const [runState, setRunState] = useState<AeoMutationState>({ status: "idle" });

  const gaps: Loadable<Gap[]> =
    findingRows === undefined
      ? { status: "loading" }
      : { status: "ready", data: findingRows.map(findingRowToGap) };

  const keywordGaps: Loadable<KeywordGap[]> =
    keywordGapRows === undefined
      ? { status: "loading" }
      : { status: "ready", data: keywordGapRows.map(keywordGapRowToKeywordGap) };

  const runResearch = () => {
    if (runState.status === "pending") return;
    setRunState({ status: "pending" });
    runKeywordResearch({ brandId })
      .then(() => setRunState({ status: "success" }))
      .catch((error: unknown) => {
        setRunState({
          status: "error",
          message:
            error instanceof Error ? error.message : "Keyword research failed.",
        });
      });
  };

  return (
    <>
      <GapsPanel
        gaps={gaps}
        seedPending={seedIdea.state.status === "pending"}
        onSeedIdea={(gap) => {
          void seedIdea.run({
            brandId,
            content: [gap.title, gap.detail].filter(Boolean).join("\n\n"),
            tags: ["aeo-gap", gap.kind, gap.priority],
            sourceTitle: gap.title,
          });
        }}
      />
      <KeywordGapsPanel
        gaps={keywordGaps}
        runPending={runState.status === "pending"}
        onRun={runResearch}
      />
      <MutationFeedbackBar
        state={seedIdea.state}
        successLabel="Idea captured to the inbox."
        onRetry={seedIdea.state.status === "error" ? seedIdea.retry : undefined}
      />
      <MutationFeedbackBar
        state={runState}
        successLabel="Keyword research recorded."
        onRetry={runState.status === "error" ? runResearch : undefined}
      />
    </>
  );
}

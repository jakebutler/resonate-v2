"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GapsPanel } from "./GapsPanel";
import { MutationFeedbackBar, useAeoMutation } from "./mutationFeedback";
import { findingRowToGap } from "./mappings";
import { useAeoBrand } from "./AeoWorkspaceChrome";
import type { Gap, Loadable } from "./types";

/**
 * Gaps step: the reviewable output of the intel cycles. The only action is
 * seeding a captured idea — an inbox idea for a human to act on, never an
 * auto-approved draft (L8). Seeding reports pending/success/failure through
 * the shared feedback bar.
 */
export function GapsFlow() {
  const { brandId } = useAeoBrand();
  const findingRows = useQuery(api.aeoIntel.listFindings, { brandId });
  const seedIdea = useAeoMutation(useMutation(api.ideas.create));

  const gaps: Loadable<Gap[]> =
    findingRows === undefined
      ? { status: "loading" }
      : { status: "ready", data: findingRows.map(findingRowToGap) };

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
      <MutationFeedbackBar
        state={seedIdea.state}
        successLabel="Idea captured to the inbox."
        onRetry={seedIdea.state.status === "error" ? seedIdea.retry : undefined}
      />
    </>
  );
}

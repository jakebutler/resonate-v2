"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConnectTargetPanel } from "./ConnectTargetPanel";
import { MutationFeedbackBar, useAeoMutation } from "./mutationFeedback";
import { targetRowToBrandTarget } from "./mappings";
import { useAeoBrand } from "./AeoWorkspaceChrome";
import type { BrandTarget, Loadable } from "./types";

/**
 * Connect step: connect a target and pin its review. Both mutations report
 * pending/error through the shared feedback bar — a failed connect or pin
 * shows what happened and offers a Retry instead of failing silently.
 */
export function ConnectFlow() {
  const { brandId, brandName } = useAeoBrand();
  const targetRow = useQuery(api.aeoIntel.getTarget, { brandId });
  const connect = useAeoMutation(useMutation(api.aeoIntel.connectTarget));
  const pin = useAeoMutation(useMutation(api.aeoIntel.pinTargetReview));

  const target: Loadable<BrandTarget | null> =
    targetRow === undefined
      ? { status: "loading" }
      : {
          status: "ready",
          data: targetRow === null ? null : targetRowToBrandTarget(targetRow),
        };

  return (
    <>
      <ConnectTargetPanel
        brandName={brandName}
        target={target}
        connectPending={connect.state.status === "pending"}
        pinPending={pin.state.status === "pending"}
        onConnect={(input) => {
          void connect.run({
            brandId,
            siteUrl: input.siteUrl,
            productIdentifiers: [],
            competitorUrls: input.competitorUrls,
          });
        }}
        onPinReview={() => {
          void pin.run({ brandId, pinned: true });
        }}
      />
      <MutationFeedbackBar
        state={connect.state}
        onRetry={connect.state.status === "error" ? connect.retry : undefined}
      />
      <MutationFeedbackBar
        state={pin.state}
        onRetry={pin.state.status === "error" ? pin.retry : undefined}
      />
    </>
  );
}

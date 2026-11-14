"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ConnectTargetPanel } from "./ConnectTargetPanel";
import { targetRowToBrandTarget } from "./mappings";
import { useAeoBrand } from "./AeoWorkspaceChrome";
import type { BrandTarget, Loadable } from "./types";

export function ConnectFlow() {
  const { brandId, brandName } = useAeoBrand();
  const targetRow = useQuery(api.aeoIntel.getTarget, { brandId });
  const connectTarget = useMutation(api.aeoIntel.connectTarget);
  const pinTargetReview = useMutation(api.aeoIntel.pinTargetReview);

  const target: Loadable<BrandTarget | null> =
    targetRow === undefined
      ? { status: "loading" }
      : {
          status: "ready",
          data: targetRow === null ? null : targetRowToBrandTarget(targetRow),
        };

  return (
    <ConnectTargetPanel
      brandName={brandName}
      target={target}
      onConnect={(input) => {
        void connectTarget({
          brandId,
          siteUrl: input.siteUrl,
          productIdentifiers: [],
          competitorUrls: input.competitorUrls,
        });
      }}
      onPinReview={() => {
        void pinTargetReview({ brandId, pinned: true });
      }}
    />
  );
}

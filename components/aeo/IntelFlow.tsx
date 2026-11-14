"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CitationResultsPanel } from "./CitationResultsPanel";
import { CompetitorComparisonPanel } from "./CompetitorComparisonPanel";
import { IntelRunHistoryStrip } from "./IntelRunHistoryStrip";
import { SnapshotBrowserPanel } from "./SnapshotBrowserPanel";
import {
  buildCompetitorComparison,
  crawlRowToSnapshot,
  runRowsToCitationRun,
} from "./mappings";
import { useAeoBrand } from "./AeoWorkspaceChrome";
import type { CitationRun, CompetitorComparison, CrawlSnapshot, Loadable } from "./types";

/**
 * Intel step: answer-engine citations, the competitor comparison, and the
 * crawl snapshots behind them. Read-only — runs are cron-driven and
 * budget-gated; the surface reviews their output.
 */
export function IntelFlow() {
  const { brandId, brandName } = useAeoBrand();
  const targetRow = useQuery(api.aeoIntel.getTarget, { brandId });
  const crawlRows = useQuery(api.aeoIntel.listCrawls, { brandId });
  const runRows = useQuery(api.aeoIntel.listRuns, { brandId });
  const findingRows = useQuery(api.aeoIntel.listFindings, { brandId });
  const [selectedCrawlId, setSelectedCrawlId] = useState<string | undefined>(
    undefined
  );
  // The panel defaults to the newest snapshot when nothing is selected, so
  // the pages query must gate on that same default — gating only on the
  // explicit selection left the default view at "0 pages crawled".
  // listCrawls is newest-first, so the default is its first row.
  const newestCrawlId = crawlRows?.[0]?._id;
  const activeCrawlId = selectedCrawlId ?? newestCrawlId;
  const selectedPageRows = useQuery(
    api.aeoIntel.listCrawlPages,
    activeCrawlId ? { brandId, crawlId: activeCrawlId } : "skip"
  );
  const captureCrawl = useAction(api.aeoCrawl.captureCrawlSnapshot);
  const [capturePending, setCapturePending] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const captureSnapshot = () => {
    if (capturePending) return;
    setCapturePending(true);
    setCaptureError(null);
    captureCrawl({ brandId })
      .catch((error: unknown) => {
        setCaptureError(
          error instanceof Error ? error.message : "Crawl capture failed."
        );
      })
      .finally(() => setCapturePending(false));
  };

  const loading =
    targetRow === undefined ||
    crawlRows === undefined ||
    runRows === undefined ||
    findingRows === undefined;

  // List queries: `undefined` is pending (the gate above); `null` is the sync
  // fixture convention for an empty result set — normalize it so derivations
  // always see an array. Real Convex list queries never return null.
  const crawlList = crawlRows ?? [];
  const runList = runRows ?? [];
  const findingList = findingRows ?? [];
  const pageList = selectedPageRows ?? [];

  const latestCompleteRun = runList
    .filter((run) => run.kind === "answer-engine" && run.status === "complete")
    .sort((a, b) => b.startedAt - a.startedAt)[0];

  const run: Loadable<CitationRun | null> = loading
    ? { status: "loading" }
    : latestCompleteRun
      ? {
          status: "ready",
          data: runRowsToCitationRun(
            latestCompleteRun,
            findingList.filter((finding) => finding.runId === latestCompleteRun._id),
            brandName
          ),
        }
      : { status: "ready", data: null };

  const comparison: Loadable<CompetitorComparison | null> = loading
    ? { status: "loading" }
    : {
        status: "ready",
        data: targetRow
          ? buildCompetitorComparison({
              brandName,
              siteUrl: targetRow.siteUrl,
              crawls: crawlList,
              findings: findingList,
              competitorUrls: targetRow.competitorUrls,
            })
          : null,
      };

  const snapshots: Loadable<CrawlSnapshot[]> = loading
    ? { status: "loading" }
    : {
        status: "ready",
        data: crawlList.map((crawl) =>
          crawlRowToSnapshot(
            crawl,
            activeCrawlId === crawl._id ? pageList : [],
            {
              // The selected (or default-newest) snapshot renders a loading
              // state while its pages query re-subscribes — never a false
              // "0 pages crawled" flash on a version switch.
              pagesLoading:
                selectedPageRows === undefined && activeCrawlId === crawl._id,
            }
          )
        ),
      };

  return (
    <>
      <IntelRunHistoryStrip
        runs={
          loading
            ? { status: "loading" }
            : // `loading` already gates on runRows being loaded; the fallback
              // only satisfies the typechecker.
              { status: "ready", data: runList }
        }
      />
      <CitationResultsPanel run={run} />
      <CompetitorComparisonPanel comparison={comparison} />
      <SnapshotBrowserPanel
        snapshots={snapshots}
        selectedId={activeCrawlId}
        onSelectSnapshot={setSelectedCrawlId}
        onCaptureCrawl={captureSnapshot}
        capturePending={capturePending}
        captureError={captureError}
      />
    </>
  );
}

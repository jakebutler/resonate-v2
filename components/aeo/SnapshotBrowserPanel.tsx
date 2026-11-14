"use client";

import { Button } from "@/components/ui/button";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel, LoadableSection } from "./PanelStates";
import type { CrawlSnapshot, Loadable } from "./types";

/**
 * Snapshot browser for the intel step: pick a crawl version, read its page
 * inventory. Snapshots are immutable versions — new crawls add versions, they
 * never edit old ones.
 */
export function SnapshotBrowserPanel({
  snapshots,
  selectedId,
  onSelectSnapshot,
  onCaptureCrawl,
  capturePending = false,
  captureError = null,
}: {
  snapshots: Loadable<CrawlSnapshot[]>;
  selectedId?: string;
  onSelectSnapshot?: (id: string) => void;
  onCaptureCrawl?: () => void;
  capturePending?: boolean;
  captureError?: string | null;
}) {
  return (
    <AeoPanel
      ariaLabel="Crawl snapshots"
      title="Crawl snapshots"
      description="Immutable versions of the target and competitor site crawls."
    >
      <LoadableSection
        value={snapshots}
        loadingLabel="Loading crawl snapshots"
        emptyTitle="No crawl snapshots yet"
        emptyDescription="Connect and pin a target, then run a crawl to capture its first snapshot."
      >
        {(loaded) => {
          // Newest-first default (the list arrives newest-first) — kept in
          // lockstep with IntelFlow's default selection so the default view
          // and its loaded pages always agree.
          const selected =
            loaded.find((snapshot) => snapshot.id === selectedId) ?? loaded[0];
          return (
            <div className="space-y-3">
              {onCaptureCrawl ? (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    onClick={onCaptureCrawl}
                    disabled={capturePending}
                  >
                    {capturePending ? "Capturing crawl…" : "Capture snapshot"}
                  </Button>
                  {captureError ? (
                    <p role="alert" className="text-sm text-red-600">
                      {captureError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div
                role="tablist"
                aria-label="Snapshot versions"
                className="flex flex-wrap gap-2"
              >
                {loaded.map((snapshot) => {
                  const active = snapshot.id === selected.id;
                  return (
                    <Button
                      key={snapshot.id}
                      variant="outline"
                      size="sm"
                      aria-selected={active}
                      className={cn(!active && tokens.pillIdle, active && tokens.pillActive)}
                      onClick={() => onSelectSnapshot?.(snapshot.id)}
                    >
                      v{snapshot.version}
                    </Button>
                  );
                })}
              </div>
              <p className={cn("text-sm", tokens.textMuted)}>
                {selected.pages.length} page
                {selected.pages.length === 1 ? "" : "s"} crawled ·{" "}
                {new Date(selected.crawledAt).toLocaleString()}
              </p>
              <ul className="space-y-2">
                {selected.pages.map((page) => (
                  <li
                    key={page.url}
                    className="rounded border border-black/10 px-3 py-2"
                  >
                    <p className="text-sm font-medium break-all">
                      {page.title}
                    </p>
                    <p className={cn("text-xs break-all", tokens.textSubtle)}>
                      {page.url}
                    </p>
                    {page.metaDescription ? (
                      <p className={cn("mt-1 text-sm", tokens.textMuted)}>
                        {page.metaDescription}
                      </p>
                    ) : null}
                    <p className={cn("mt-1 text-xs", tokens.textSubtle)}>
                      {page.headingCount} headings
                      {page.schemaTypes.length > 0
                        ? ` · schema: ${page.schemaTypes.join(", ")}`
                        : " · no structured data"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          );
        }}
      </LoadableSection>
    </AeoPanel>
  );
}

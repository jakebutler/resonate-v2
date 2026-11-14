"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { tokens } from "@/components/shell/tokens";
import { cn } from "@/lib/utils";
import { AeoPanel, LoadableSection } from "./PanelStates";
import type { CrawlSnapshot, Loadable } from "./types";

const TABLIST_LABEL = "Snapshot versions";
const PANEL_ID = "snapshot-page-panel";
const tabId = (snapshotId: string) => `snapshot-tab-${snapshotId}`;

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
            <SnapshotTabs
              loaded={loaded}
              selected={selected}
              onSelectSnapshot={onSelectSnapshot}
              onCaptureCrawl={onCaptureCrawl}
              capturePending={capturePending}
              captureError={captureError}
            />
          );
        }}
      </LoadableSection>
    </AeoPanel>
  );
}

/**
 * The snapshot version switcher as a real ARIA tablist: role="tab" buttons
 * control a role="tabpanel" page inventory, with roving tabindex and
 * Left/Right/Home/End arrow-key navigation per the WAI-ARIA tabs pattern.
 */
function SnapshotTabs({
  loaded,
  selected,
  onSelectSnapshot,
  onCaptureCrawl,
  capturePending = false,
  captureError = null,
}: {
  loaded: CrawlSnapshot[];
  selected: CrawlSnapshot;
  onSelectSnapshot?: (id: string) => void;
  onCaptureCrawl?: () => void;
  capturePending?: boolean;
  captureError?: string | null;
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Selection follows focus (automatic activation) and wraps, so arrow keys
  // always move and the roving tabindex keeps exactly one tab stop.
  const moveSelection = (index: number) => {
    if (loaded.length === 0) return;
    const wrapped = (index + loaded.length) % loaded.length;
    onSelectSnapshot?.(loaded[wrapped].id);
    tabRefs.current[wrapped]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowRight") moveSelection(index + 1);
    else if (event.key === "ArrowLeft") moveSelection(index - 1);
    else if (event.key === "Home") moveSelection(0);
    else if (event.key === "End") moveSelection(loaded.length - 1);
    else return;
    event.preventDefault();
  };

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
        aria-label={TABLIST_LABEL}
        className="flex flex-wrap gap-2"
      >
        {loaded.map((snapshot, index) => {
          const active = snapshot.id === selected.id;
          return (
            <Button
              key={snapshot.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              variant="outline"
              size="sm"
              role="tab"
              id={tabId(snapshot.id)}
              aria-selected={active}
              aria-controls={PANEL_ID}
              tabIndex={active ? 0 : -1}
              className={cn(!active && tokens.pillIdle, active && tokens.pillActive)}
              onClick={() => onSelectSnapshot?.(snapshot.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              v{snapshot.version}
            </Button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={PANEL_ID}
        aria-labelledby={tabId(selected.id)}
        className="space-y-2"
      >
        {selected.pagesLoading ? (
          <p role="status" className={cn("text-sm", tokens.textMuted)}>
            Loading pages…
          </p>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}

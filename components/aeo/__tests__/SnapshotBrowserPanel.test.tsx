import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SnapshotBrowserPanel } from "@/components/aeo/SnapshotBrowserPanel";
import type { CrawlPage, CrawlSnapshot, Loadable } from "@/components/aeo/types";

function page(title: string): CrawlPage {
  return {
    url: `https://example.com/${title}`,
    title,
    headingCount: 1,
    schemaTypes: [],
  };
}

function snapshot(
  id: string,
  version: number,
  overrides: Partial<CrawlSnapshot> = {}
): CrawlSnapshot {
  return {
    id,
    version,
    crawledAt: 1_700_000_000_000,
    pages: [page("home")],
    ...overrides,
  };
}

function ready(snapshots: CrawlSnapshot[]): Loadable<CrawlSnapshot[]> {
  return { status: "ready", data: snapshots };
}

// Two versions, newest first — the order listCrawls arrives in.
const two = [snapshot("crawl_2", 2), snapshot("crawl_1", 1)];

describe("SnapshotBrowserPanel tab semantics", () => {
  it("renders a real tablist: role=tab buttons controlling a tabpanel", () => {
    render(
      <SnapshotBrowserPanel
        snapshots={ready(two)}
        selectedId="crawl_2"
        onSelectSnapshot={() => {}}
      />
    );

    const tabs = screen.getAllByRole("tab", { name: /v[12]/ });
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    // Every tab controls the same panel; the panel labels back to the
    // selected tab.
    for (const tab of tabs) {
      expect(tab).toHaveAttribute("aria-controls", "snapshot-page-panel");
    }
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      "snapshot-tab-crawl_2"
    );
  });

  it("keeps one tab stop: the selected tab is tabbable, the rest are not", () => {
    render(
      <SnapshotBrowserPanel
        snapshots={ready(two)}
        selectedId="crawl_2"
        onSelectSnapshot={() => {}}
      />
    );
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("tabindex", "0");
    expect(screen.getAllByRole("tab")[1]).toHaveAttribute("tabindex", "-1");
  });

  it("clicking a tab selects it", () => {
    const onSelect = vi.fn();
    render(
      <SnapshotBrowserPanel
        snapshots={ready(two)}
        selectedId="crawl_2"
        onSelectSnapshot={onSelect}
      />
    );
    fireEvent.click(screen.getByRole("tab", { name: "v1" }));
    expect(onSelect).toHaveBeenCalledWith("crawl_1");
  });

  it("arrow keys move the selection with automatic activation, wrapping at the ends", () => {
    const onSelect = vi.fn();
    render(
      <SnapshotBrowserPanel
        snapshots={ready(two)}
        selectedId="crawl_2"
        onSelectSnapshot={onSelect}
      />
    );
    const tabs = screen.getAllByRole("tab");

    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(onSelect).toHaveBeenLastCalledWith("crawl_1");

    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    // Wraps: left from the newest (first) lands on the last tab.
    expect(onSelect).toHaveBeenLastCalledWith("crawl_1");
  });
});

describe("SnapshotBrowserPanel loading-aware page count", () => {
  it("shows a loading state instead of a false '0 pages crawled' while pages load", () => {
    render(
      <SnapshotBrowserPanel
        snapshots={ready([
          snapshot("crawl_2", 2, { pages: [], pagesLoading: true }),
        ])}
        selectedId="crawl_2"
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading pages…");
    expect(screen.queryByText(/0 pages crawled/)).not.toBeInTheDocument();
  });

  it("renders the real page count once pages are loaded", () => {
    render(
      <SnapshotBrowserPanel
        snapshots={ready([
          snapshot("crawl_2", 2, { pages: [page("home"), page("pricing")] }),
        ])}
        selectedId="crawl_2"
      />
    );
    expect(screen.getByText(/2 pages crawled/)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SnapshotBrowserPanel } from "@/components/aeo/SnapshotBrowserPanel";
import type { CrawlSnapshot } from "@/components/aeo/types";

const snapshots: CrawlSnapshot[] = [
  // Production order: listCrawls is newest-first (verified in
  // convex/__tests__/aeoIntel.test.ts — versions [3, 2, 1]).
  {
    id: "snap_2",
    version: 2,
    crawledAt: Date.parse("2026-11-10T00:00:00Z"),
    pages: [
      {
        url: "https://freshproof.example.com/",
        title: "FreshProof home",
        headingCount: 7,
        schemaTypes: [],
      },
      {
        url: "https://freshproof.example.com/pricing",
        title: "Pricing",
        headingCount: 3,
        schemaTypes: ["FAQPage"],
      },
    ],
  },
  {
    id: "snap_1",
    version: 1,
    crawledAt: Date.parse("2026-11-01T00:00:00Z"),
    pages: [
      {
        url: "https://freshproof.example.com/",
        title: "FreshProof home",
        metaDescription: "GLP-1 tracking, evidenced.",
        headingCount: 5,
        schemaTypes: ["Organization"],
      },
    ],
  },
];

describe("SnapshotBrowserPanel", () => {
  it("renders a loading skeleton while snapshots arrive", () => {
    render(<SnapshotBrowserPanel snapshots={{ status: "loading" }} />);
    expect(screen.getByRole("status", { name: "Loading crawl snapshots" })).toBeInTheDocument();
  });

  it("renders the error state with retry", () => {
    const onRetry = vi.fn();
    render(
      <SnapshotBrowserPanel
        snapshots={{ status: "error", message: "Crawl list failed", onRetry }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Crawl list failed");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the empty state when no snapshots exist", () => {
    render(<SnapshotBrowserPanel snapshots={{ status: "ready", data: [] }} />);
    expect(screen.getByText("No crawl snapshots yet")).toBeInTheDocument();
  });

  it("defaults to the newest snapshot and switches versions on select", () => {
    const onSelectSnapshot = vi.fn();
    render(
      <SnapshotBrowserPanel
        snapshots={{ status: "ready", data: snapshots }}
        onSelectSnapshot={onSelectSnapshot}
      />,
    );
    expect(screen.getByText(/2 pages crawled/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "v1" }));
    expect(onSelectSnapshot).toHaveBeenCalledWith("snap_1");
  });

  it("honors an explicit selected snapshot id", () => {
    render(
      <SnapshotBrowserPanel
        snapshots={{ status: "ready", data: snapshots }}
        selectedId="snap_1"
      />,
    );
    expect(screen.getByText(/1 page crawled/)).toBeInTheDocument();
  });

  it("flags pages without structured data", () => {
    render(
      <SnapshotBrowserPanel
        snapshots={{ status: "ready", data: snapshots }}
        selectedId="snap_2"
      />,
    );
    expect(screen.getByText(/no structured data/)).toBeInTheDocument();
    expect(screen.getByText(/schema: FAQPage/)).toBeInTheDocument();
  });
});

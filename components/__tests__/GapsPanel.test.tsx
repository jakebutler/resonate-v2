import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GapsPanel, sortGaps } from "@/components/aeo/GapsPanel";
import type { Gap } from "@/components/aeo/types";

const gaps: Gap[] = [
  {
    id: "g_low",
    kind: "opportunity",
    priority: "low",
    title: "Low-priority opportunity",
    detail: "Expand the FAQ.",
    keywords: ["glp-1 app"],
  },
  {
    id: "g_high",
    kind: "gap",
    priority: "high",
    title: "No dosage answer page",
    detail: "Answer engines quote competitors for dosage questions.",
    keywords: ["dosage tracking"],
  },
  {
    id: "g_med",
    kind: "gap",
    priority: "medium",
    title: "Thin comparison content",
    detail: "No head-to-head page exists.",
    keywords: [],
  },
];

describe("sortGaps", () => {
  it("orders by priority, gaps before opportunities at the same priority", () => {
    expect(sortGaps(gaps).map((gap) => gap.id)).toEqual([
      "g_high",
      "g_med",
      "g_low",
    ]);
  });
});

describe("GapsPanel", () => {
  it("renders a loading skeleton while gaps arrive", () => {
    render(<GapsPanel gaps={{ status: "loading" }} />);
    expect(screen.getByRole("status", { name: "Loading gaps" })).toBeInTheDocument();
  });

  it("renders the error state", () => {
    render(<GapsPanel gaps={{ status: "error", message: "Gap query failed" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Gap query failed");
  });

  it("renders the empty state when no gaps exist", () => {
    render(<GapsPanel gaps={{ status: "ready", data: [] }} />);
    expect(screen.getByText("No gaps identified yet")).toBeInTheDocument();
  });

  it("renders prioritized gaps with kind and priority badges", () => {
    render(<GapsPanel gaps={{ status: "ready", data: gaps }} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("No dosage answer page");
    expect(screen.getByLabelText("gap: No dosage answer page")).toBeInTheDocument();
    expect(screen.getByLabelText("high priority")).toBeInTheDocument();
    expect(screen.getByLabelText("opportunity: Low-priority opportunity")).toBeInTheDocument();
  });

  it("renders a suspect citation as needs-review with the mismatch warning", () => {
    render(
      <GapsPanel
        gaps={{
          status: "ready",
          data: [
            {
              id: "g_suspect",
              kind: "needs-review",
              priority: "medium",
              title: "What is FreshProof?",
              detail: "Cited, but the answer may describe another product.",
              keywords: [],
              brandMatch: "suspect",
              brandMatchDetail: "5% topic-vocabulary overlap with the crawl.",
            },
          ],
        }}
      />
    );
    expect(screen.getByLabelText("needs-review: What is FreshProof?")).toHaveTextContent(
      "Needs review"
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Brand mismatch suspected");
    expect(alert).toHaveTextContent("5% topic-vocabulary overlap");
  });

  it("seeds a captured idea for a specific gap", () => {
    const onSeedIdea = vi.fn();
    render(<GapsPanel gaps={{ status: "ready", data: gaps }} onSeedIdea={onSeedIdea} />);
    fireEvent.click(screen.getAllByRole("button", { name: "Seed captured idea" })[0]);
    expect(onSeedIdea).toHaveBeenCalledWith(gaps[1]);
  });

  it("disables seeding when no wiring is provided", () => {
    render(<GapsPanel gaps={{ status: "ready", data: gaps }} />);
    expect(
      screen.getAllByRole("button", { name: "Seed captured idea" })[0],
    ).toBeDisabled();
  });
});

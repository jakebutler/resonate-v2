import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompetitorComparisonPanel } from "@/components/aeo/CompetitorComparisonPanel";
import { GapsPanel } from "@/components/aeo/GapsPanel";
import { IntelRunHistoryStrip } from "@/components/aeo/IntelRunHistoryStrip";
import type {
  CompetitorComparison,
  Gap,
  Loadable,
} from "@/components/aeo/types";
import type { Doc } from "@/convex/_generated/dataModel";

const comparison: Loadable<CompetitorComparison | null> = {
  status: "ready",
  data: {
    target: {
      name: "FreshProof",
      domain: "freshproof.example.com",
      pageCount: 12,
      citationCount: 3,
      crawled: true,
    },
    competitors: [
      {
        name: "competitor-a.com",
        domain: "competitor-a.com",
        pageCount: 0,
        citationCount: 0,
        crawled: false,
      },
      {
        name: "competitor-b.com",
        domain: "competitor-b.com",
        pageCount: 7,
        citationCount: 0,
        crawled: true,
      },
    ],
  },
};

describe("CompetitorComparisonPanel zero rows", () => {
  it("renders an explicit not-crawled state instead of meaningless zeros", () => {
    render(<CompetitorComparisonPanel comparison={comparison} />);
    expect(screen.getByText("Not crawled yet")).toBeInTheDocument();
    // The never-crawled competitor's zeros never render.
    expect(screen.getAllByText("Not crawled yet")).toHaveLength(1);
  });

  it("still renders real numbers for crawled competitors", () => {
    render(<CompetitorComparisonPanel comparison={comparison} />);
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});

describe("GapsPanel seed-idea duplicate guard", () => {
  const gap: Gap = {
    id: "gap-1",
    kind: "gap",
    priority: "high",
    title: "No comparison page",
    detail: "Competitors compare, we do not",
    keywords: [],
  };

  it("disables seeding after success — the idea row already exists", () => {
    render(
      <GapsPanel
        gaps={{ status: "ready", data: [gap] }}
        seedSucceeded
        onSeedIdea={() => {}}
      />
    );
    const button = screen.getByRole("button", { name: "Idea captured" });
    expect(button).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Seed captured idea" })
    ).not.toBeInTheDocument();
  });

  it("seeding stays enabled before any capture", () => {
    render(
      <GapsPanel
        gaps={{ status: "ready", data: [gap] }}
        onSeedIdea={() => {}}
      />
    );
    expect(
      screen.getByRole("button", { name: "Seed captured idea" })
    ).toBeEnabled();
  });
});

describe("IntelRunHistoryStrip", () => {
  function runRow(overrides: Partial<Doc<"intelRuns">> = {}): Doc<"intelRuns"> {
    return {
      _id: "run-1" as Doc<"intelRuns">["_id"],
      _creationTime: 1,
      userId: "owner",
      brandId: "freshproof",
      kind: "answer-engine",
      status: "complete",
      costCeilingCents: 50,
      questionCount: 2,
      startedAt: 1_700_000_000_000,
      finishedAt: 1_700_000_100_000,
      ...overrides,
    } as Doc<"intelRuns">;
  }

  it("shows the run count and total budget ceiling, never a metered spend", () => {
    render(
      <IntelRunHistoryStrip
        runs={{
          status: "ready",
          data: [
            runRow(),
            runRow({ _id: "run-2" as Doc<"intelRuns">["_id"], costCeilingCents: 30 }),
          ],
        }}
      />
    );
    expect(screen.getByText(/2 runs · total budget ceiling 80¢/)).toBeInTheDocument();
    expect(screen.getByText(/ceilings, not metered spend/)).toBeInTheDocument();
    expect(screen.getByText("run-1")).toBeInTheDocument();
  });

  it("admits when no runs exist instead of showing zeros", () => {
    render(<IntelRunHistoryStrip runs={{ status: "ready", data: [] }} />);
    expect(screen.getByText(/No intel runs yet/)).toBeInTheDocument();
  });

  it("renders a loading state while run history loads", () => {
    render(<IntelRunHistoryStrip runs={{ status: "loading" }} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading run history…"
    );
  });
});

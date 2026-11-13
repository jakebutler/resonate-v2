import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompetitorComparisonPanel } from "@/components/aeo/CompetitorComparisonPanel";
import type { CompetitorComparison } from "@/components/aeo/types";

const comparison: CompetitorComparison = {
  target: {
    name: "FreshProof",
    domain: "freshproof.example.com",
    pageCount: 42,
    citationCount: 7,
  },
  competitors: [
    {
      name: "TrackGLP",
      domain: "trackglp.com",
      pageCount: 120,
      citationCount: 19,
    },
  ],
};

describe("CompetitorComparisonPanel", () => {
  it("renders a loading skeleton while the comparison arrives", () => {
    render(<CompetitorComparisonPanel comparison={{ status: "loading" }} />);
    expect(
      screen.getByRole("status", { name: "Loading competitor comparison" }),
    ).toBeInTheDocument();
  });

  it("renders the error state", () => {
    render(
      <CompetitorComparisonPanel
        comparison={{ status: "error", message: "Comparison unavailable" }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Comparison unavailable");
  });

  it("renders the empty state when no comparison exists", () => {
    render(<CompetitorComparisonPanel comparison={{ status: "ready", data: null }} />);
    expect(screen.getByText("No comparison yet")).toBeInTheDocument();
  });

  it("marks the target row and lists competitors", () => {
    render(<CompetitorComparisonPanel comparison={{ status: "ready", data: comparison }} />);
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("FreshProof");
    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(table).toHaveTextContent("TrackGLP");
    expect(table).toHaveTextContent("19");
  });
});

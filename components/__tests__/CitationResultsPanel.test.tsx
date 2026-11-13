import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CitationResultsPanel } from "@/components/aeo/CitationResultsPanel";
import type { CitationRun } from "@/components/aeo/types";

const run: CitationRun = {
  id: "run_1",
  ranAt: Date.parse("2026-11-12T00:00:00Z"),
  results: [
    {
      question: "Which tools would you recommend for GLP-1 tracking?",
      citedBrands: ["FreshProof"],
      citedCompetitors: ["TrackGLP"],
      extractabilityScore: 0.62,
      answerExcerpt: "FreshProof tracks doses with cited sources.",
    },
    {
      question: "What is the best free GLP-1 app?",
      citedBrands: [],
      citedCompetitors: [],
    },
  ],
};

describe("CitationResultsPanel", () => {
  it("renders a loading skeleton while the run arrives", () => {
    render(<CitationResultsPanel run={{ status: "loading" }} />);
    expect(
      screen.getByRole("status", { name: "Loading citation results" }),
    ).toBeInTheDocument();
  });

  it("renders the error state", () => {
    render(<CitationResultsPanel run={{ status: "error", message: "Run failed" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Run failed");
  });

  it("renders the empty state when no run exists", () => {
    render(<CitationResultsPanel run={{ status: "ready", data: null }} />);
    expect(screen.getByText("No citation results yet")).toBeInTheDocument();
  });

  it("renders citations, extractability, and a not-cited fallback", () => {
    render(<CitationResultsPanel run={{ status: "ready", data: run }} />);
    expect(screen.getByLabelText("Cited: FreshProof")).toBeInTheDocument();
    expect(screen.getByLabelText("Competitor cited: TrackGLP")).toBeInTheDocument();
    expect(screen.getByText(/Extractability 62%/)).toBeInTheDocument();
    expect(screen.getByLabelText("No citation for this brand")).toBeInTheDocument();
    expect(screen.getByText(/FreshProof tracks doses/)).toBeInTheDocument();
  });
});

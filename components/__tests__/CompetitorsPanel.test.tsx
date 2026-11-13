import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CompetitorsPanel } from "@/components/aeo/CompetitorsPanel";
import type { CompetitorSets } from "@/components/aeo/types";

const sets: CompetitorSets = {
  confirmed: [
    {
      id: "c_1",
      name: "TrackGLP",
      domain: "trackglp.com",
      addedFromSuggestion: true,
    },
  ],
  suggestions: [
    {
      id: "s_1",
      name: "DosePilot",
      domain: "dosepilot.app",
      evidence: {
        source: "answer-engine checks",
        occurrences: 3,
        examplePhrasing: "alternatives like DosePilot",
      },
      status: "pending",
    },
    {
      id: "s_2",
      name: "Gluely",
      domain: "gluely.io",
      evidence: { source: "site crawl", occurrences: 1 },
      status: "rejected",
      rejectionReason: "Not a direct competitor",
    },
  ],
};

describe("CompetitorsPanel", () => {
  it("renders a loading skeleton while the sets arrive", () => {
    render(<CompetitorsPanel sets={{ status: "loading" }} />);
    expect(
      screen.getByRole("status", { name: "Loading competitor sets" }),
    ).toBeInTheDocument();
  });

  it("renders the error state", () => {
    render(<CompetitorsPanel sets={{ status: "error", message: "Sets unavailable" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sets unavailable");
  });

  it("renders the empty state when nothing is tracked", () => {
    render(
      <CompetitorsPanel
        sets={{ status: "ready", data: { confirmed: [], suggestions: [] } }}
      />,
    );
    expect(screen.getByText("No competitors tracked yet")).toBeInTheDocument();
  });

  it("renders the confirmed set beside the suggested queue with evidence", () => {
    render(<CompetitorsPanel sets={{ status: "ready", data: sets }} />);
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText("Suggested")).toBeInTheDocument();
    expect(screen.getByText("TrackGLP")).toBeInTheDocument();
    expect(screen.getByText(/accepted from a suggestion/)).toBeInTheDocument();
    expect(screen.getByText(/3× in answer-engine checks/)).toBeInTheDocument();
    expect(screen.getByText(/Rejected: Not a direct competitor/)).toBeInTheDocument();
    expect(screen.getByLabelText("Rejected: Gluely")).toBeInTheDocument();
  });

  it("accepts a pending suggestion on demand", () => {
    const onAccept = vi.fn();
    render(
      <CompetitorsPanel sets={{ status: "ready", data: sets }} onAccept={onAccept} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(onAccept).toHaveBeenCalledWith("s_1");
  });

  it("requires a reason before recording a rejection", () => {
    const onReject = vi.fn();
    render(
      <CompetitorsPanel sets={{ status: "ready", data: sets }} onReject={onReject} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const record = screen.getByRole("button", { name: "Record rejection" });
    expect(record).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Already covered by TrackGLP" },
    });
    fireEvent.click(record);
    expect(onReject).toHaveBeenCalledWith("s_1", "Already covered by TrackGLP");
  });

  it("disables actions when no wiring is provided", () => {
    render(<CompetitorsPanel sets={{ status: "ready", data: sets }} />);
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });
});

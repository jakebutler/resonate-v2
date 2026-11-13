import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StrategyPlanPanel } from "@/components/aeo/StrategyPlanPanel";
import type { StrategyPlan } from "@/components/aeo/types";

const plan: StrategyPlan = {
  id: "plan_1",
  brief: {
    goal: "Grow FreshProof answer-engine citations",
    audience: "GLP-1 patients researching trackers",
    thesis: "Cited, evidence-first content wins extracts",
    window: "2026 Q4",
    channels: ["corvo-blog", "linkedin"],
    cta: "Join the waitlist",
    metric: "Citation share across the question set",
    constraints: ["Never make claims without cited sources"],
  },
  priorityIds: ["g_high", "g_med"],
  reviewState: "unreviewed",
};

describe("StrategyPlanPanel", () => {
  it("renders a loading skeleton while the plan arrives", () => {
    render(<StrategyPlanPanel plan={{ status: "loading" }} />);
    expect(
      screen.getByRole("status", { name: "Loading strategy plan" }),
    ).toBeInTheDocument();
  });

  it("renders the error state", () => {
    render(<StrategyPlanPanel plan={{ status: "error", message: "Plan load failed" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Plan load failed");
  });

  it("renders the empty state when no plan exists", () => {
    render(<StrategyPlanPanel plan={{ status: "ready", data: null }} />);
    expect(screen.getByText(/No strategy plan yet/)).toBeInTheDocument();
  });

  it("renders every brief field and the prioritized gaps", () => {
    render(<StrategyPlanPanel plan={{ status: "ready", data: plan }} />);
    expect(screen.getByText("Goal")).toBeInTheDocument();
    expect(screen.getByText(/Grow FreshProof answer-engine citations/)).toBeInTheDocument();
    expect(screen.getByText("corvo-blog, linkedin")).toBeInTheDocument();
    expect(screen.getByText(/Prioritizes 2 gaps/)).toBeInTheDocument();
    expect(screen.getByLabelText("Plan review state: Awaiting review")).toBeInTheDocument();
  });

  it("accepts a plan on demand", () => {
    const onAccept = vi.fn();
    render(<StrategyPlanPanel plan={{ status: "ready", data: plan }} onAccept={onAccept} />);
    fireEvent.click(screen.getByRole("button", { name: "Accept plan" }));
    expect(onAccept).toHaveBeenCalledWith("plan_1");
  });

  it("requires a note before submitting a change request", () => {
    const onRequestChanges = vi.fn();
    render(
      <StrategyPlanPanel
        plan={{ status: "ready", data: plan }}
        onRequestChanges={onRequestChanges}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    const submit = screen.getByRole("button", { name: "Submit change request" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Change request note"), {
      target: { value: "Narrow the window to December" },
    });
    fireEvent.click(submit);
    expect(onRequestChanges).toHaveBeenCalledWith("plan_1", "Narrow the window to December");
  });

  it("hides review actions for an accepted plan", () => {
    render(
      <StrategyPlanPanel
        plan={{ status: "ready", data: { ...plan, reviewState: "accepted" } }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Accept plan" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Plan review state: Accepted")).toBeInTheDocument();
  });
});

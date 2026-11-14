import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StrategyPlanPanel } from "@/components/aeo/StrategyPlanPanel";
import type { Loadable, StrategyPlan } from "@/components/aeo/types";

const noPlan: Loadable<StrategyPlan | null> = { status: "ready", data: null };

const acceptedPlan: Loadable<StrategyPlan | null> = {
  status: "ready",
  data: {
    id: "plan-1",
    reviewState: "accepted",
    priorityIds: [],
    brief: {
      goal: "Own the comparison query",
      audience: "GLP-1 tracker shoppers",
      thesis: "Independent proof beats marketing claims",
      window: "Next 30 days",
      channels: ["blog"],
      cta: "Read the evidence",
      metric: "Citations",
      constraints: [],
    },
  },
};

const intelCycle = {
  schedule: "daily at 07:35 UTC (cron)",
  lastRun: {
    startedAt: 1_700_000_000_000,
    finishedAt: 1_700_000_100_000,
    status: "complete" as const,
  },
};

describe("StrategyPlanPanel plan dead-end", () => {
  it("shows the cron schedule and the last run's status from run records", () => {
    render(
      <StrategyPlanPanel plan={noPlan} intelCycle={intelCycle} />
    );
    expect(screen.getByText(/Intel cycles run daily at 07:35 UTC \(cron\)/)).toBeInTheDocument();
    expect(screen.getByText(/last run .* — completed/)).toBeInTheDocument();
  });

  it("admits when no run has been recorded yet", () => {
    render(
      <StrategyPlanPanel
        plan={noPlan}
        intelCycle={{ schedule: "daily at 07:35 UTC (cron)", lastRun: null }}
      />
    );
    expect(screen.getByText(/no intel run recorded yet/)).toBeInTheDocument();
  });

  it("no longer instructs an action no control can perform", () => {
    render(<StrategyPlanPanel plan={noPlan} />);
    // The old empty state told the user to "run an intel cycle" — runs are
    // cron-only, so no control could do that.
    expect(screen.queryByText(/run an intel cycle/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No strategy plan yet/)).toBeInTheDocument();
  });

  it("keeps the review state rendering intact for a real plan", () => {
    render(<StrategyPlanPanel plan={acceptedPlan} intelCycle={intelCycle} />);
    expect(screen.getByLabelText(/Plan review state/)).toBeInTheDocument();
    expect(screen.getByText("Own the comparison query")).toBeInTheDocument();
  });
});

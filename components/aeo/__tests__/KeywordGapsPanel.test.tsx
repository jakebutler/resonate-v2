import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeywordGapsPanel, missingKeywordCount } from "@/components/aeo/KeywordGapsPanel";
import type { KeywordGap, Loadable } from "@/components/aeo/types";

// Harness for the keyword-gap view: the panel is presentational, so the
// Loadable boundary and gap rows are exercised directly with fixtures.

function gap(overrides: Partial<KeywordGap>): KeywordGap {
  return {
    id: "gap_1",
    keyword: "claim validation tooling",
    status: "absent",
    signal: "search",
    questions: [],
    sourcePageUrls: [],
    fromPlan: false,
    evidence: [],
    ...overrides,
  };
}

const ready = (data: KeywordGap[]): Loadable<KeywordGap[]> => ({ status: "ready", data });

describe("missingKeywordCount", () => {
  it("counts only absent gaps — unproven is not a missing-query claim", () => {
    expect(
      missingKeywordCount([
        gap({ status: "absent" }),
        gap({ status: "unproven" }),
        gap({ status: "present" }),
      ])
    ).toBe(1);
  });
});

describe("KeywordGapsPanel", () => {
  it("renders the loading state while gaps are in flight", () => {
    render(<KeywordGapsPanel gaps={{ status: "loading" }} />);
    expect(screen.getByRole("status", { name: /loading keyword gaps/i })).toBeInTheDocument();
  });

  it("renders an empty state with a call to run research", () => {
    render(<KeywordGapsPanel gaps={ready([])} />);
    expect(screen.getByText(/no keyword gaps researched yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run keyword research/i })).toBeInTheDocument();
  });

  it("renders the missing-N summary and per-keyword statuses", () => {
    render(
      <KeywordGapsPanel
        gaps={ready([
          gap({ id: "a", keyword: "missing query", status: "absent", questions: ["Which tools validate claims?"] }),
          gap({ id: "b", keyword: "present query", status: "present", signal: "answer-engine" }),
          gap({ id: "c", keyword: "unproven query", status: "unproven" }),
        ])}
      />
    );
    expect(screen.getByText(/you're missing 1 of 3 researched queries/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/missing: missing query/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/present: present query/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/unproven: unproven query/i)).toBeInTheDocument();
    expect(screen.getByText(/which tools validate claims\?/i)).toBeInTheDocument();
  });

  it("disables the run button while a run is pending and shows researching", () => {
    const onRun = vi.fn();
    render(<KeywordGapsPanel gaps={ready([])} runPending onRun={onRun} />);
    const button = screen.getByRole("button", { name: /researching/i });
    expect(button).toBeDisabled();
    expect(onRun).not.toHaveBeenCalled();
  });

  it("explains the fail-closed gate when runs are disabled", () => {
    render(<KeywordGapsPanel gaps={ready([])} runEnabled={false} onRun={() => {}} />);
    expect(screen.getByText(/runs are disabled on this deployment/i)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: /run keyword research/i });
    expect(button).toBeDisabled();
  });
});

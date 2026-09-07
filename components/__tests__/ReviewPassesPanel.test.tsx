import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewPassesPanel } from "@/components/campaigns/ReviewPassesPanel";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    cohesion: {
      getReviewPasses: "cohesion:getReviewPasses",
      runCohesionGate: "cohesion:runCohesionGate",
    },
  },
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

const passingData = {
  campaign: { _id: "campaign_1" },
  materialization: { _id: "mat_1", mode: "mock" },
  latestRun: {
    _id: "run_1",
    passed: true,
    checks: [
      { id: "one-pillar", label: "Exactly one pillar anchors the set.", passed: true, blocking: true },
      {
        id: "one-cta",
        label: "Exactly one CTA makes the ask.",
        passed: true,
        blocking: true,
      },
    ],
    autoFixLog: [
      {
        checkId: "one-cta",
        note: "CTA slot — not in initial generation; created automatically by the cohesion gate.",
        fixedAt: Date.now(),
      },
    ],
  },
  seoAeo: [
    {
      postId: "post_1",
      title: "Acting without observation",
      questions: ["what is acting without observation?"],
      extractableAnswer: "An approval gate without observation is acting without ReAct.",
    },
  ],
  botLikelihood: [
    { postId: "post_1", title: "Acting without observation", score: 28, band: "low" },
  ],
};

describe("ReviewPassesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "cohesion:getReviewPasses") return passingData;
      return undefined;
    });
    useMutationMock.mockReturnValue(
      vi.fn().mockResolvedValue({ runNumber: 1, passed: true, autoFixLog: [] })
    );
  });

  it("renders cohesion checks with pass icons and auto-fix notes", () => {
    render(<ReviewPassesPanel campaignId="campaign_1" />);
    expect(screen.getByTestId("cohesion-panel")).toBeDefined();
    expect(screen.getByText("Exactly one pillar anchors the set.")).toBeDefined();
    const notes = screen.getAllByTestId("auto-fix-note");
    expect(notes[0].textContent).toMatch(/created automatically/);
    expect(screen.getByTestId("gate-status").textContent).toBe("passing");
  });

  it("renders the SEO/AEO and humanizer placeholder surfaces", () => {
    render(<ReviewPassesPanel campaignId="campaign_1" />);
    expect(screen.getByTestId("seo-aeo-panel")).toBeDefined();
    expect(screen.getByTestId("humanizer-panel")).toBeDefined();
    expect(screen.getByText(/Placeholder surface/)).toBeDefined();
    expect(screen.getByText(/28% placeholder bot-likelihood/)).toBeDefined();
    expect(screen.getByText("what is acting without observation?")).toBeDefined();
  });

  it("runs the gate and reports the outcome", async () => {
    const runGate = vi
      .fn()
      .mockResolvedValue({ runNumber: 2, passed: true, autoFixLog: [] });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "cohesion:runCohesionGate" ? runGate : vi.fn()) as never);
    const onGateResolved = vi.fn();

    render(<ReviewPassesPanel campaignId="campaign_1" onGateResolved={onGateResolved} />);
    fireEvent.click(screen.getByTestId("run-cohesion-gate"));

    await waitFor(() => {
      expect(runGate).toHaveBeenCalledWith({ campaignId: "campaign_1" });
    });
    await waitFor(() => {
      expect(onGateResolved).toHaveBeenCalledWith(true);
    });
  });

  it("renders nothing before a draft set exists", () => {
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "cohesion:getReviewPasses")
        return { ...passingData, materialization: null, latestRun: null, seoAeo: [], botLikelihood: [] };
      return undefined;
    });
    const { container } = render(<ReviewPassesPanel campaignId="campaign_1" />);
    expect(container.querySelector("[data-testid='cohesion-panel']")).toBeNull();
  });
});

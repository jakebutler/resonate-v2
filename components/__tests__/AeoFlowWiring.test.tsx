import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/aeo",
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    aeoIntel: {
      getTarget: "aeoIntel:getTarget",
      listFindings: "aeoIntel:listFindings",
      getLatestStrategyPlan: "aeoIntel:getLatestStrategyPlan",
      connectTarget: "aeoIntel:connectTarget",
      pinTargetReview: "aeoIntel:pinTargetReview",
      saveStrategyPlan: "aeoIntel:saveStrategyPlan",
    },
    competitorSuggestions: {
      listSuggestions: "competitorSuggestions:listSuggestions",
      reviewSuggestion: "competitorSuggestions:reviewSuggestion",
    },
    campaigns: {
      listCampaigns: "campaigns:listCampaigns",
    },
    ideas: {
      create: "ideas:create",
    },
    shapes: {
      saveBrief: "shapes:saveBrief",
    },
  },
}));

import { ConnectFlow } from "@/components/aeo/ConnectFlow";
import { CompetitorsFlow } from "@/components/aeo/CompetitorsFlow";
import { GapsFlow } from "@/components/aeo/GapsFlow";
import { PlanFlow } from "@/components/aeo/PlanFlow";
import { AeoWorkspaceChrome } from "@/components/aeo/AeoWorkspaceChrome";

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

/** A mocked mutation callable that also carries the withOptimisticUpdate API. */
function mutationMock(impl: (args: never) => Promise<unknown>) {
  const fn = vi.fn(impl);
  (fn as unknown as { withOptimisticUpdate: () => typeof fn }).withOptimisticUpdate =
    () => fn;
  return fn;
}

// Radix Select calls scrollIntoView on mount of the selected option; jsdom
// does not implement it.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

const targetRow = {
  _id: "target-1",
  _creationTime: 1,
  userId: "user-1",
  brandId: "corvo",
  siteUrl: "https://freshproof.example.com",
  productIdentifiers: ["FreshProof band"],
  competitorUrls: ["https://competitor-a.com"],
  validation: { state: "validated" as const, checkedAt: 1 },
  createdAt: 1,
  updatedAt: 1,
};

const findingRows = [
  {
    _id: "finding-1",
    _creationTime: 1,
    userId: "user-1",
    brandId: "corvo",
    runId: "run-1",
    question: "What is FreshProof?",
    classification: "product-gap" as const,
    citationStatus: "uncited" as const,
    extractability: 0.8,
    summary: "No third-party pages describe FreshProof's methodology",
    evidence: ["What is FreshProof?", "No answer mentioned FreshProof"],
    reviewStatus: "unreviewed" as const,
    createdAt: 1,
    updatedAt: 1,
  },
];

const planRow = {
  _id: "plan-1",
  _creationTime: 1,
  userId: "user-1",
  brandId: "corvo",
  version: 1,
  status: "draft" as const,
  reviewNotes: undefined,
  plan: {
    gaps: [
      {
        title: "Explain the methodology",
        description: "No page describes it",
        priority: 1,
        sourceFindingIds: ["finding-1"],
      },
    ],
    opportunities: [],
    targetKeywords: ["freshproof"],
    targetQuestions: ["What is FreshProof?"],
    brief: {
      audience: "GLP-1 tracker shoppers",
      thesis: "Independent proof beats marketing claims",
      goal: "Own the comparison query",
      window: "Next 30 days",
      channels: ["blog"],
      cta: "Read the evidence",
      metric: "Citations",
      constraints: [],
    },
  },
  createdAt: 1,
};

const suggestionRows = [
  {
    _id: "suggestion-1",
    _creationTime: 1,
    userId: "user-1",
    brandId: "corvo",
    name: "Competitor A",
    url: "https://competitor-a.com",
    status: "suggested" as const,
    evidence: ["discovered via search"],
    frequency: 2,
    phrasings: ["Competitor A alternative"],
    reviewStatus: "unreviewed" as const,
    createdAt: 1,
    updatedAt: 1,
  },
];

const campaignRows = [
  { _id: "campaign-1", _creationTime: 1, userId: "user-1", brandId: "corvo", title: "FreshProof launch", status: "draft" as const, createdAt: 1, updatedAt: 1 },
];

function renderFlow(ui: React.ReactElement) {
  return render(<AeoWorkspaceChrome>{ui}</AeoWorkspaceChrome>);
}

describe("AEO flow wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockReturnValue(undefined);
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue(null));
  });

  it("pins the review so the intel cycles are allowed to read the target", async () => {
    const pinTargetReview = vi.fn().mockResolvedValue(null);
    useMutationMock.mockImplementation((reference: unknown) =>
      reference === "aeoIntel:pinTargetReview" ? pinTargetReview : vi.fn()
    );
    useQueryMock.mockImplementation((reference: unknown) =>
      reference === "aeoIntel:getTarget" ? targetRow : undefined
    );

    renderFlow(<ConnectFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Pin review" }));
    await waitFor(() =>
      expect(pinTargetReview).toHaveBeenCalledWith({ brandId: "corvo", pinned: true })
    );
  });

  it("connects a target with the form input and never auto-pins", async () => {
    const connectTarget = vi.fn().mockResolvedValue("target-1");
    useMutationMock.mockImplementation((reference: unknown) =>
      reference === "aeoIntel:connectTarget" ? connectTarget : vi.fn()
    );
    useQueryMock.mockImplementation((reference: unknown) =>
      reference === "aeoIntel:getTarget" ? null : undefined
    );

    renderFlow(<ConnectFlow />);
    fireEvent.change(screen.getByLabelText("Target site URL"), {
      target: { value: "https://freshproof.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect target" }));
    await waitFor(() =>
      expect(connectTarget).toHaveBeenCalledWith({
        brandId: "corvo",
        siteUrl: "https://freshproof.example.com",
        productIdentifiers: [],
        competitorUrls: [],
      })
    );
    expect(connectTarget.mock.calls[0][0]).not.toHaveProperty("reviewPinned");
  });

  it("wires accept and reject to the review-only suggestion mutation", async () => {
    const reviewSuggestion = mutationMock(async () => null);
    useMutationMock.mockImplementation((reference: unknown) =>
      reference === "competitorSuggestions:reviewSuggestion" ? reviewSuggestion : vi.fn()
    );
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "aeoIntel:getTarget") return targetRow;
      if (reference === "competitorSuggestions:listSuggestions") return suggestionRows;
      return undefined;
    });

    renderFlow(<CompetitorsFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(reviewSuggestion).toHaveBeenCalledWith({
        brandId: "corvo",
        suggestionId: "suggestion-1",
        reviewStatus: "accepted",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Not a real competitor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record rejection" }));
    await waitFor(() =>
      expect(reviewSuggestion).toHaveBeenCalledWith({
        brandId: "corvo",
        suggestionId: "suggestion-1",
        reviewStatus: "rejected",
        reviewNotes: "Not a real competitor",
      })
    );
  });

  it("shows a retryable error when the review mutation rejects, and retries it", async () => {
    const reviewSuggestion = mutationMock(async () => {
      if (reviewSuggestion.mock.calls.length <= 1) {
        throw new Error("Competitor suggestion not found");
      }
      return null;
    });
    useMutationMock.mockImplementation((reference: unknown) =>
      reference === "competitorSuggestions:reviewSuggestion" ? reviewSuggestion : vi.fn()
    );
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "aeoIntel:getTarget") return targetRow;
      if (reference === "competitorSuggestions:listSuggestions") return suggestionRows;
      return undefined;
    });

    renderFlow(<CompetitorsFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    // The rejection is never swallowed: a visible alert explains it and offers
    // a Retry that re-runs the same mutation.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Competitor suggestion not found");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(reviewSuggestion).toHaveBeenCalledTimes(2));
    expect(reviewSuggestion.mock.calls[0][0]).toMatchObject({
      brandId: "corvo",
      suggestionId: "suggestion-1",
      reviewStatus: "accepted",
    });
    expect(reviewSuggestion.mock.calls[1][0]).toEqual(reviewSuggestion.mock.calls[0][0]);
  });

  it("accepts and change-requests plans as review states, never approving content", async () => {
    const saveStrategyPlan = vi.fn().mockResolvedValue("plan-2");
    useMutationMock.mockImplementation((reference: unknown) =>
      reference === "aeoIntel:saveStrategyPlan" ? saveStrategyPlan : vi.fn()
    );
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "aeoIntel:getLatestStrategyPlan") return planRow;
      if (reference === "campaigns:listCampaigns") return campaignRows;
      return undefined;
    });

    renderFlow(<PlanFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Accept plan" }));
    await waitFor(() => {
      const call = saveStrategyPlan.mock.calls[0][0];
      expect(call).toMatchObject({ brandId: "corvo", status: "reviewed" });
      expect(call).not.toHaveProperty("reviewNotes");
    });

    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    fireEvent.change(screen.getByLabelText("Change request note"), {
      target: { value: "Add a gap for comparison pages" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit change request" }));
    await waitFor(() =>
      expect(saveStrategyPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: "corvo",
          status: "draft",
          reviewNotes: "Add a gap for comparison pages",
        })
      )
    );
    expect(
      saveStrategyPlan.mock.calls.every((call) => {
        const status = (call[0] as { status: string }).status;
        return status === "draft" || status === "reviewed";
      })
    ).toBe(true);
  });

  it("seeds campaign brief fields with the brand's own campaign id", async () => {
    const saveBrief = vi.fn().mockResolvedValue(null);
    useMutationMock.mockImplementation((reference: unknown) =>
      reference === "shapes:saveBrief" ? saveBrief : vi.fn()
    );
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "aeoIntel:getLatestStrategyPlan") return planRow;
      if (reference === "campaigns:listCampaigns") return campaignRows;
      return undefined;
    });

    renderFlow(<PlanFlow />);
    fireEvent.click(screen.getByRole("combobox", { name: "Campaign" }));
    fireEvent.click(screen.getByRole("option", { name: "FreshProof launch" }));
    fireEvent.click(screen.getByRole("button", { name: "Seed brief fields" }));
    await waitFor(() =>
      expect(saveBrief).toHaveBeenCalledWith({
        campaignId: "campaign-1",
        goal: "Own the comparison query",
        audience: "GLP-1 tracker shoppers",
      })
    );
  });

  it("seeds captured ideas from gaps into the idea inbox only", async () => {
    const createIdea = vi.fn().mockResolvedValue("idea-1");
    useMutationMock.mockImplementation((reference: unknown) =>
      reference === "ideas:create" ? createIdea : vi.fn()
    );
    useQueryMock.mockImplementation((reference: unknown) =>
      reference === "aeoIntel:listFindings" ? findingRows : undefined
    );

    renderFlow(<GapsFlow />);
    fireEvent.click(screen.getByRole("button", { name: "Seed captured idea" }));
    await waitFor(() =>
      expect(createIdea).toHaveBeenCalledWith({
        brandId: "corvo",
        content:
          "No third-party pages describe FreshProof's methodology\n\nWhat is FreshProof? · No answer mentioned FreshProof",
        tags: ["aeo-gap", "product-gap", "high"],
        sourceTitle: "No third-party pages describe FreshProof's methodology",
      })
    );
  });
});

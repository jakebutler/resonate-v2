import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DraftSetView } from "@/components/campaigns/DraftSetView";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    draftSet: {
      getDraftSet: "draftSet:getDraftSet",
      generateDraftSet: "draftSet:generateDraftSet",
    },
    cohesion: {
      getReviewPasses: "cohesion:getReviewPasses",
      runCohesionGate: "cohesion:runCohesionGate",
    },
  },
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

const emptyView = {
  campaign: { _id: "campaign_1", title: "Draft set campaign" },
  materialization: null,
  drafts: [],
};

const generatedView = {
  campaign: { _id: "campaign_1", title: "Draft set campaign" },
  materialization: { _id: "mat_1", mode: "mock" },
  drafts: [
    {
      post: {
        _id: "post_1",
        title: "Acting without observation",
        content:
          "An approval gate without observation is acting without ReAct. [THESIS: state the core claim] [EVIDENCE: corpus://corvo/c1#excerpt-1]",
        approvalState: "unapproved",
        channelId: "corvo-blog",
      },
      slot: { role: "pillar" as const, channel: "corvo-blog", mediaType: "article" },
      seq: 1,
    },
    {
      post: {
        _id: "post_2",
        title: "Traces are eval fixtures waiting to be promoted",
        content: "A failed agent run is a test case you haven't copied yet. [ANGLE: worktree-local traces]",
        approvalState: "unapproved",
        channelId: "linkedin",
      },
      slot: { role: "satellite" as const, channel: "linkedin", mediaType: "post" },
      seq: 2,
    },
  ],
};

describe("DraftSetView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "draftSet:getDraftSet") return generatedView;
      if (reference === "cohesion:getReviewPasses") return null;
      return undefined;
    });
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({ draftCount: 5 }));
  });

  it("renders draft cards with role chips, unapproved badges, and sequence numbers", () => {
    render(<DraftSetView campaignId="campaign_1" />);
    expect(screen.getAllByTestId("draft-card")).toHaveLength(2);
    const badges = screen.getAllByTestId("approval-badge");
    expect(badges.every((badge) => badge.textContent === "unapproved")).toBe(true);
    expect(screen.getByText(/#1 in publishing sequence/)).toBeDefined();
    expect(screen.getByText(/#2 in publishing sequence/)).toBeDefined();
  });

  it("highlights placeholder tokens in the copy", () => {
    render(<DraftSetView campaignId="campaign_1" />);
    expect(screen.getByText(/\[THESIS: state the core claim\]/)).toBeDefined();
    expect(screen.getByText(/\[EVIDENCE: corpus:\/\/corvo\/c1#excerpt-1\]/)).toBeDefined();
  });

  it("gates generation behind an explicit mock-mode acknowledgment", async () => {
    const generate = vi.fn().mockResolvedValue({ draftCount: 5, alreadyGenerated: false });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "draftSet:generateDraftSet" ? generate : vi.fn()) as never);

    render(<DraftSetView campaignId="campaign_1" />);
    fireEvent.click(screen.getByTestId("generate-draft-set"));
    const confirm = await screen.findByTestId("draft-mock-confirm");
    expect(confirm.textContent).toContain("mock mode");

    fireEvent.click(screen.getByText("Run in mock mode"));
    await waitFor(() => {
      expect(generate).toHaveBeenCalledWith({
        campaignId: "campaign_1",
        mockAcknowledged: true,
      });
    });
  });

  it("shows the empty state before generation", () => {
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "draftSet:getDraftSet") return emptyView;
      if (reference === "cohesion:getReviewPasses") return null;
      return undefined;
    });
    render(<DraftSetView campaignId="campaign_1" />);
    expect(screen.getByText(/No draft set yet/)).toBeDefined();
    expect(screen.getByTestId("generate-draft-set").textContent).toBe(
      "Generate draft set"
    );
  });
});

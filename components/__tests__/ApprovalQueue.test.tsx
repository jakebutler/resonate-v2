import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalQueue } from "@/components/campaigns/ApprovalQueue";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    queue: {
      getCampaignQueue: "queue:getCampaignQueue",
      materializeDraftSet: "queue:materializeDraftSet",
    },
    publishing: {
      setApproval: "publishing:setApproval",
    },
  },
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

const queueEntries = [
  {
    postId: "post_1",
    seq: 1,
    role: "pillar",
    mediaType: "article",
    channel: "corvo-blog",
    title: "Acting without observation",
    content: "[THESIS: the core claim] Long-form body.",
    approvalState: "unapproved",
    status: "scheduled",
    scheduledDate: "2026-09-09",
    scheduledTime: "09:00",
  },
  {
    postId: "post_2",
    seq: 2,
    role: "hook",
    mediaType: "post",
    channel: "x",
    title: "Prompt roulette is action without reasoning",
    content: "Prompt roulette. [ANGLE: sharpen]",
    approvalState: "unapproved",
    status: "scheduled",
    scheduledDate: "2026-09-09",
    scheduledTime: "13:30",
  },
  {
    postId: "post_3",
    seq: 3,
    role: "satellite",
    mediaType: "post",
    channel: "linkedin",
    title: "Traces are eval fixtures",
    content: "A failed run is a test case.",
    approvalState: "approved",
    status: "scheduled",
    scheduledDate: "2026-09-10",
    scheduledTime: "09:00",
  },
];

const queueView = {
  campaign: { _id: "campaign_1", title: "Queue campaign" },
  queue: queueEntries,
  approvedCount: 1,
  totalCount: 3,
  nextSeq: 1,
  allApproved: false,
  materialized: true,
};

describe("ApprovalQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "queue:getCampaignQueue") return queueView;
      return undefined;
    });
    useMutationMock.mockReturnValue(
      vi.fn().mockResolvedValue({ materialized: true })
    );
  });

  it("renders expandable rows with role chips, schedule, and approval badges", () => {
    render(<ApprovalQueue campaignId="campaign_1" />);
    expect(screen.getAllByTestId("queue-row")).toHaveLength(3);
    expect(screen.getAllByTestId("queue-approval-badge").map((badge) => badge.textContent)).toEqual([
      "unapproved",
      "unapproved",
      "approved",
    ]);
    expect(screen.getByText(/2026-09-09 09:00/)).toBeDefined();
    expect(screen.getAllByText("Review ▾").length).toBe(3);
  });

  it("shows the queue banner with approved count and next in publishing sequence", () => {
    render(<ApprovalQueue campaignId="campaign_1" />);
    const banner = screen.getByTestId("queue-banner");
    expect(banner.textContent).toContain("1 of 3 approved");
    expect(banner.textContent).toContain("#1 Acting without observation");
  });

  it("expands a row to inline review and approves to advance to the next draft", async () => {
    const setApproval = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "publishing:setApproval" ? setApproval : vi.fn()) as never);

    render(<ApprovalQueue campaignId="campaign_1" />);
    // The hook post (seq 2) is a short-form draft: inline review + approve.
    const hookRow = screen.getAllByTestId("queue-row")[1]!;
    fireEvent.click(within(hookRow).getByText("Review ▾"));

    const expanded = screen.getByTestId("queue-expand");
    expect(expanded.textContent).toContain("Prompt roulette");

    fireEvent.click(within(hookRow).getByTestId("approve-draft"));
    await waitFor(() => {
      expect(setApproval).toHaveBeenCalledWith({
        postId: "post_2",
        approvalState: "approved",
      });
    });
    const toast = await screen.findByTestId("queue-toast");
    // With the static fixture, post_1 remains unapproved, so the queue
    // advances to the first unapproved entry in publishing sequence.
    expect(toast.textContent).toContain("Approved — 2 of 3");
    expect(toast.textContent).toContain("Next in sequence: #1");
  });

  it("routes long-form to the composer instead of inline approve", () => {
    render(<ApprovalQueue campaignId="campaign_1" />);
    const firstRow = screen.getAllByTestId("queue-row")[0]!;
    fireEvent.click(within(firstRow).getByText("Review ▾"));
    const expanded = screen.getByTestId("queue-expand");
    const link = expanded.querySelector("a[href='/editor/post_1']");
    expect(link).not.toBeNull();
    expect(within(expanded).queryByTestId("approve-draft")).toBeNull();
  });

  it("shows the fully-approved end state with no auto-submit", () => {
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "queue:getCampaignQueue")
        return {
          ...queueView,
          approvedCount: 3,
          nextSeq: null,
          allApproved: true,
        };
      return undefined;
    });
    render(<ApprovalQueue campaignId="campaign_1" />);
    const banner = screen.getByTestId("queue-banner");
    expect(banner.textContent).toContain("Campaign fully approved");
    expect(banner.textContent).toContain("Nothing submits automatically");
  });

  it("materializes the batch when the gate has passed", async () => {
    const materialize = vi.fn().mockResolvedValue({ materialized: true, draftCount: 3 });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "queue:materializeDraftSet" ? materialize : vi.fn()) as never);

    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "queue:getCampaignQueue") return { ...queueView, materialized: false };
      return undefined;
    });

    render(<ApprovalQueue campaignId="campaign_1" />);
    fireEvent.click(screen.getByTestId("materialize-button"));
    await waitFor(() => {
      expect(materialize).toHaveBeenCalledWith({ campaignId: "campaign_1" });
    });
  });

  it("prompts to run the cohesion gate when not yet materialized", () => {
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "queue:getCampaignQueue") return { ...queueView, materialized: false };
      return undefined;
    });
    render(<ApprovalQueue campaignId="campaign_1" />);
    expect(screen.getByText(/cohesion gate passes/)).toBeDefined();
    // The button is enabled pre-materialization; the server refuses while the
    // gate is blocking, so the block is real, not cosmetic.
    expect((screen.getByTestId("materialize-button") as HTMLButtonElement).disabled).toBe(false);
  });
});

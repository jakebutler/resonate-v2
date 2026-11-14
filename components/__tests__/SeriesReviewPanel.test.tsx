import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeriesReviewPanel } from "@/components/SeriesReviewPanel";
import { useMutation, useQuery } from "convex/react";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    seriesReview: {
      selection: "seriesReview:selection",
      packet: "seriesReview:packet",
      select: "seriesReview:select",
      prepare: "seriesReview:prepare",
      approve: "seriesReview:approve",
    },
  },
}));

const useQueryMock = vi.mocked(useQuery);
const useMutationMock = vi.mocked(useMutation);

const posts = [
  { _id: "post_1", title: "Post one", channelId: "linkedin", approvalState: "unapproved" },
  { _id: "post_2", title: "Post two", channelId: "x", approvalState: "unapproved" },
];

const selection = { postIds: ["post_1", "post_2"], revision: 2 };

function rowFixture(postId: string, requiresMarkerConfirmation: boolean) {
  return {
    _id: `row_${postId}`,
    postId,
    snapshot: {
      requiresMarkerConfirmation,
      warnings: requiresMarkerConfirmation
        ? ["Evidence markers remain in the final copy. Check the source passages and publication formatting."]
        : [],
      finalContent: requiresMarkerConfirmation
        ? "Copy with [EVIDENCE: corpus://corvo/c1#excerpt-1] inside."
        : "Clean copy.",
      citations: [],
      holds: [],
      dueAt: "ok",
      post: {
        _id: postId,
        title: `Post ${postId}`,
        channelId: "linkedin",
        approvalState: "unapproved",
        status: "scheduled",
        scheduledDate: "2030-10-07",
        scheduledTime: "09:00",
        timezone: "UTC",
        linkedinFirstComment: null,
      },
      providerState: null,
      approvalError: null,
    },
  };
}

const review = {
  packet: {
    _id: "packet_1",
    createdAt: Date.now(),
    selectionRevision: 3,
    status: "prepared",
  },
  rows: [rowFixture("post_1", true), rowFixture("post_2", false)],
  stale: false,
};

function renderPanel() {
  return render(<SeriesReviewPanel seriesId={"series_1" as never} posts={posts as never} />);
}

describe("SeriesReviewPanel selection persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "seriesReview:selection") return selection;
      if (reference === "seriesReview:packet") return null;
      return undefined;
    });
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({}));
  });
  afterEach(() => vi.useRealTimers());

  it("batches checkbox toggles into one server write after toggling pauses", async () => {
    vi.useFakeTimers();
    const select = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "seriesReview:select" ? select : vi.fn()) as never);

    renderPanel();
    const checkboxes = screen.getAllByRole("checkbox");
    // Deselect both quickly — rapid toggles must not fire one write each.
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);
    expect(select).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(600);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith({
      seriesId: "series_1",
      postIds: [],
      expectedRevision: 2,
    });
  });

  it("drops the per-toggle 'Selection saved' nudge", async () => {
    vi.useFakeTimers();
    renderPanel();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    await vi.advanceTimersByTimeAsync(600);
    // The alert region stays silent; status lives in the checkbox state.
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("flushes a pending selection before preparing the packet", async () => {
    vi.useFakeTimers();
    const select = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "seriesReview:select"
        ? select
        : reference === "seriesReview:prepare"
          ? prepare
          : vi.fn()) as never);

    renderPanel();
    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByText("Prepare selected review packet"));
    await vi.advanceTimersByTimeAsync(0);
    // The flush landed with the settled selection, and no timer write follows.
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith({
      seriesId: "series_1",
      postIds: ["post_2"],
      expectedRevision: 2,
    });
    expect(prepare).toHaveBeenCalledWith({
      seriesId: "series_1",
      expectedRevision: 3,
    });
    await vi.advanceTimersByTimeAsync(700);
    expect(select).toHaveBeenCalledTimes(1);
  });
});

describe("SeriesReviewPanel marker hold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQueryMock.mockImplementation((reference: unknown) => {
      if (reference === "seriesReview:selection") return selection;
      if (reference === "seriesReview:packet") return review;
      return undefined;
    });
    useMutationMock.mockReturnValue(vi.fn().mockResolvedValue({ approved: true }));
  });

  it("keeps the approve CTA blocked while marker rows are unconfirmed", () => {
    renderPanel();
    const approveButton = screen
      .getAllByRole("button")
      .find((b) => b.textContent!.includes("Confirm evidence markers"))!;
    expect(approveButton.disabled).toBe(true);
    expect(approveButton.textContent).toContain("1 row");
    // The unconfirmed marker row offers its explicit confirmation.
    expect(screen.getByTestId("confirm-markers-post_1")).toBeDefined();
    expect(screen.queryByTestId("confirm-markers-post_2")).toBeNull();
  });

  it("sends the explicit marker confirmation with the approval", async () => {
    const approve = vi.fn().mockResolvedValue({ approved: true });
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "seriesReview:approve" ? approve : vi.fn()) as never);

    renderPanel();
    fireEvent.click(
      within(screen.getByTestId("confirm-markers-post_1")).getByRole("checkbox")
    );
    const approveButton = screen
      .getAllByRole("button")
      .find((b) => b.textContent!.startsWith("Approve 2 selected versions"))!;
    expect(approveButton.disabled).toBe(false);
    fireEvent.click(approveButton);
    await vi.waitFor(() => {
      expect(approve).toHaveBeenCalledWith({
        packetId: "packet_1",
        expectedSelectionRevision: 3,
        markerConfirmations: ["post_1"],
      });
    });
  });
});

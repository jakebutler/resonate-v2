import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeriesWorkspace } from "@/components/SeriesWorkspace";
import { useMutation, usePaginatedQuery, useQuery, useConvexAuth } from "convex/react";

vi.mock("convex/react", () => ({
  useConvexAuth: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  usePaginatedQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    series: {
      list: "series:list",
      get: "series:get",
      entries: "series:entries",
      picker: "series:picker",
      attach: "series:attach",
      addCompanions: "series:addCompanions",
      detach: "series:detach",
      move: "series:move",
    },
  },
}));

vi.mock("@/components/SeriesReviewPanel", () => ({
  SeriesReviewPanel: () => <div data-testid="series-review-panel" />,
}));

vi.mock("@/components/PreparedPackageImport", () => ({
  PreparedPackageImport: () => <div data-testid="prepared-package-import" />,
}));

const useQueryMock = vi.mocked(useQuery);
const usePaginatedQueryMock = vi.mocked(usePaginatedQuery);
const useMutationMock = vi.mocked(useMutation);
const useConvexAuthMock = vi.mocked(useConvexAuth);

const seriesList = [
  { _id: "series_1", title: "Series A", brandId: "corvo" },
  { _id: "series_2", title: "Series B", brandId: "corvo" },
];

const entry = {
  _id: "entry_1",
  seriesId: "series_1",
  key: "k1",
  sequence: 1,
  articlePostId: "post_1",
  companionPostIds: ["post_2"],
  posts: [
    {
      post: {
        _id: "post_1",
        title: "Article one",
        channelId: "corvo-blog",
        approvalState: "approved",
        status: "scheduled",
        scheduledDate: "2030-10-07",
        scheduledTime: "09:00",
        timezone: "UTC",
        content: "Article copy",
      },
      providerState: null,
      articlePublication: null,
    },
    {
      post: {
        _id: "post_2",
        title: "Companion one",
        channelId: "linkedin",
        approvalState: "unapproved",
        status: "scheduled",
        scheduledDate: "2030-10-08",
        scheduledTime: "10:00",
        timezone: "UTC",
        content: "Companion copy",
      },
      providerState: null,
      articlePublication: null,
    },
  ],
};

const pickerPosts = [
  {
    _id: "post_9",
    title: "Standalone article",
    channelId: "corvo-blog",
    approvalState: "unapproved",
    status: "draft",
    content: "",
  },
  {
    _id: "post_8",
    title: "Standalone companion",
    channelId: "linkedin",
    approvalState: "unapproved",
    status: "draft",
    content: "",
  },
];

function mockQueries({
  entryPage = [entry],
  entryStatus = "Exhausted",
  entriesLoading = false,
  seriesDetail = seriesList[0],
} = {}) {
  useQueryMock.mockImplementation((reference: unknown) => {
    if (reference === "series:list") return seriesList;
    if (reference === "series:get") return seriesDetail;
    return undefined;
  });
  usePaginatedQueryMock.mockImplementation(((reference: unknown) => {
    if (reference === "series:entries")
      return {
        results: entryPage,
        status: entryStatus,
        isLoading: entriesLoading,
        loadMore: vi.fn(),
      };
    return { results: pickerPosts, status: "Exhausted", isLoading: false, loadMore: vi.fn() };
  }) as never);
  useMutationMock.mockReturnValue(vi.fn().mockResolvedValue(undefined));
}

describe("SeriesWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConvexAuthMock.mockReturnValue({ isAuthenticated: true } as never);
    mockQueries();
  });

  it("renders the progress block as a labeled stat grid, not a run-on line", () => {
    render(<SeriesWorkspace initialSeriesId="series_1" />);
    const progress = screen.getByTestId("series-progress");
    expect(progress.tagName).toBe("DL");
    // One stat tile per count, each with its own label and value.
    expect(screen.getByTestId("series-stat-articles").textContent).toContain("1");
    expect(screen.getByTestId("series-stat-companions").textContent).toContain("1");
    expect(screen.getByTestId("series-stat-approved").textContent).toContain("1");
    expect(screen.getByTestId("series-stat-held").textContent).toContain("0");
    // Each stat is its own labeled tile (dt/dd pair), not one run-on line.
    expect(screen.getByTestId("series-stat-articles").tagName).toBe("DIV");
    expect(
      within(screen.getByTestId("series-stat-companions")).getByText("Companions")
        .tagName
    ).toBe("DT");
  });

  it("shows a loading state for progress instead of zeroed counts", () => {
    mockQueries({ entriesLoading: true });
    render(<SeriesWorkspace initialSeriesId="series_1" />);
    expect(screen.getByTestId("series-progress-loading")).toBeDefined();
    expect(screen.queryByTestId("series-progress")).toBeNull();
  });

  it("discloses when counts cover only the loaded page of entries", () => {
    mockQueries({ entryStatus: "CanLoadMore" });
    render(<SeriesWorkspace initialSeriesId="series_1" />);
    expect(screen.getByText(/Counts cover the 1 loaded entries/)).toBeDefined();
  });

  it("shows an empty state when the series has no entries", () => {
    mockQueries({ entryPage: [] });
    render(<SeriesWorkspace initialSeriesId="series_1" />);
    expect(screen.getByTestId("series-empty").textContent).toContain(
      "No entries in this series yet"
    );
  });

  it("detaches an entry only after a second confirming click", async () => {
    const detach = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "series:detach" ? detach : vi.fn()) as never);

    render(<SeriesWorkspace initialSeriesId="series_1" />);
    const detachButton = screen.getAllByTestId("detach-entry")[0]!;
    fireEvent.click(detachButton);
    // First click arms; nothing is sent yet.
    expect(detach).not.toHaveBeenCalled();
    expect(detachButton.textContent).toContain("Confirm detach entry?");

    fireEvent.click(detachButton);
    await waitFor(() => {
      expect(detach).toHaveBeenCalledWith({ seriesId: "series_1", entryId: "entry_1" });
    });
  });

  it("detaches a companion only after a second confirming click", async () => {
    const detach = vi.fn().mockResolvedValue(undefined);
    useMutationMock.mockImplementation(((reference: unknown) =>
      reference === "series:detach" ? detach : vi.fn()) as never);

    render(<SeriesWorkspace initialSeriesId="series_1" />);
    const companionButton = screen.getAllByTestId("detach-companion")[0]!;
    fireEvent.click(companionButton);
    expect(detach).not.toHaveBeenCalled();

    fireEvent.click(companionButton);
    await waitFor(() => {
      expect(detach).toHaveBeenCalledWith({
        seriesId: "series_1",
        entryId: "entry_1",
        postId: "post_2",
      });
    });
  });

  it("lists entries with post links and per-row detach controls", () => {
    render(<SeriesWorkspace initialSeriesId="series_1" />);
    expect(screen.getByText("Article one").closest("a")).not.toBeNull();
    expect(screen.getByText("Companion one").closest("a")).not.toBeNull();
    expect(screen.getAllByTestId("detach-entry")).toHaveLength(1);
    expect(screen.getAllByTestId("detach-companion")).toHaveLength(1);
  });
});

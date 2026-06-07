import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { PersistedPublishingPanel } from "@/components/PersistedPublishingPanel";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/components/SocialConnectionsPanel", () => ({
  SocialConnectionsPanel: () => <div data-testid="social-connections-panel">Connections</div>,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    publishing: {
      listBrands: "publishing:listBrands",
      listCalendarItems: "publishing:listCalendarItems",
      seedMvpWorkspace: "publishing:seedMvpWorkspace",
      createPostWithIntent: "publishing:createPostWithIntent",
      setApproval: "publishing:setApproval",
      reschedule: "publishing:reschedule",
      updateContent: "publishing:updateContent",
      updateBlogMetadata: "publishing:updateBlogMetadata",
      submitMockProvider: "publishing:submitMockProvider",
      recordProviderIntent: "publishing:recordProviderIntent",
      recordGithubPr: "publishing:recordGithubPr",
      recordBlogPrStatus: "publishing:recordBlogPrStatus",
      deletePost: "publishing:deletePost",
    },
    posts: {
      generateUploadUrl: "posts:generateUploadUrl",
      getFileUrl: "posts:getFileUrl",
    },
  },
}));

const seedWorkspaceMock = vi.fn().mockResolvedValue({ seeded: true });
const createPostWithIntentMock = vi.fn().mockResolvedValue({
  postId: "post_new",
  intentId: "intent_new",
});
const setApprovalMock = vi.fn().mockResolvedValue(undefined);
const rescheduleMock = vi.fn().mockResolvedValue(undefined);
const updateContentMock = vi.fn().mockResolvedValue(undefined);
const submitMockProviderMock = vi.fn().mockResolvedValue({
  submitted: true,
  attemptId: "attempt_1",
});
const recordProviderIntentMock = vi.fn().mockResolvedValue({
  recorded: true,
  intentType: "cancel",
});
const recordGithubPrMock = vi.fn().mockResolvedValue({
  recorded: true,
  attemptId: "attempt_pr_1",
});
const updateBlogMetadataMock = vi.fn().mockResolvedValue({ updated: true });
const recordBlogPrStatusMock = vi.fn().mockResolvedValue({
  updated: true,
  prStatus: "open",
});
const generateUploadUrlMock = vi.fn().mockResolvedValue("https://upload.example");
const deletePostMock = vi.fn().mockResolvedValue({ deleted: true });

const unapprovedItem = {
  post: {
    _id: "post_1",
    brandId: "corvo",
    channelId: "linkedin",
    platformId: "linkedin",
    title: "Scheduled LinkedIn validation item",
    content: "Visible before approval, blocked before submit.",
    status: "scheduled",
    approvalState: "unapproved",
    scheduledDate: "2026-06-12",
    scheduledTime: "09:00",
    timezone: "America/Los_Angeles",
    updatedAt: 10,
  },
  intent: {
    _id: "intent_1",
    scheduledDate: "2026-06-12",
    scheduledTime: "09:00",
    timezone: "America/Los_Angeles",
  },
  providerState: {
    providerId: "mock",
    status: "not-submitted",
  },
  attemptCount: 0,
  lastAttempt: null,
  attempts: [],
  auditEvents: [
    {
      _id: "audit_1",
      action: "post.create",
      summary: "Created v2 post and publishing intent.",
      createdAt: 1812758400000,
    },
  ],
};

const approvedItem = {
  ...unapprovedItem,
  post: {
    ...unapprovedItem.post,
    _id: "post_2",
    title: "Approved Reddit validation item",
    brandId: "freshproof",
    channelId: "reddit",
    platformId: "reddit",
    approvalState: "approved",
    status: "scheduled",
  },
};

const retryableItem = {
  ...approvedItem,
  post: {
    ...approvedItem.post,
    _id: "post_3",
    title: "Retryable LinkedIn validation item",
    brandId: "corvo",
    channelId: "linkedin",
    platformId: "linkedin",
    status: "failed",
  },
  providerState: {
    providerId: "mock",
    status: "failed",
    lastResponseSummary: "Mock provider result: retryable-failure.",
  },
  attemptCount: 1,
  lastAttempt: {
    status: "retryable-failure",
  },
  attempts: [
    {
      _id: "attempt_1",
      providerId: "mock",
      status: "retryable-failure",
      idempotencyKey: "intent_1:fingerprint",
      retryCount: 0,
      sanitizedResponse: {
        providerPostId: "mock-post_3",
        accessToken: "[redacted]",
      },
      createdAt: 1812762000000,
    },
  ],
  auditEvents: [
    {
      _id: "audit_2",
      action: "provider.mock_submit",
      summary: "Mock provider result: retryable-failure.",
      createdAt: 1812762000000,
    },
  ],
};

const blogItem = {
  ...approvedItem,
  post: {
    ...approvedItem.post,
    _id: "post_4",
    title: "Approved Corvo Blog PR item",
    brandId: "corvo",
    channelId: "corvo-blog",
    platformId: "corvo-blog",
    sourceIdeaId: "idea-blog-1",
    sourceResearchBriefId: "brief-1",
    blogExcerpt: "A concise summary for the Corvo Labs blog.",
    blogAuthor: "Jake Butler",
    blogCategory: "strategy",
    blogTags: ["Corvo Labs", "Publishing"],
    blogSlug: "approved-corvo-blog-pr-item",
    heroImageUrl: "https://cdn.example/hero.jpg",
  },
  intent: {
    ...approvedItem.intent,
    _id: "intent_4",
  },
  providerState: {
    providerId: "github-pr",
    status: "not-submitted",
    prUrl: undefined,
  },
  attemptCount: 0,
  lastAttempt: null,
  attempts: [],
  auditEvents: [
    {
      _id: "audit_4",
      action: "post.create",
      summary: "Created Corvo Blog publishing intent.",
      createdAt: 1812765600000,
    },
  ],
};

const blogItemWithPr = {
  ...blogItem,
  post: {
    ...blogItem.post,
    _id: "post_5",
    title: "Approved Corvo Blog PR item with PR",
    status: "pr-created",
    prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/53",
    branchName: "resonate/blog-post-2026-06-12-approved-corvo-blog-pr-item",
    blogPrNumber: 53,
    blogPrStatus: "open",
  },
  intent: { ...blogItem.intent, _id: "intent_5" },
  providerState: {
    providerId: "github-pr",
    status: "submitted",
    prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/53",
  },
  auditEvents: blogItem.auditEvents,
};

describe("PersistedPublishingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") {
        return [
          { brandId: "personal", name: "Personal" },
          { brandId: "corvo", name: "Corvo Labs" },
          { brandId: "lower-db", name: "the lower dB" },
          { brandId: "freshproof", name: "FreshProof" },
        ];
      }
      if (reference === "publishing:listCalendarItems") {
        return [unapprovedItem, approvedItem, retryableItem, blogItem];
      }
      return undefined;
    });
    vi.mocked(useMutation).mockImplementation((reference) => {
      switch (reference) {
        case "publishing:seedMvpWorkspace":
          return seedWorkspaceMock;
        case "publishing:createPostWithIntent":
          return createPostWithIntentMock;
        case "publishing:setApproval":
          return setApprovalMock;
        case "publishing:reschedule":
          return rescheduleMock;
        case "publishing:updateContent":
          return updateContentMock;
        case "publishing:submitMockProvider":
          return submitMockProviderMock;
        case "publishing:recordProviderIntent":
          return recordProviderIntentMock;
        case "publishing:recordGithubPr":
          return recordGithubPrMock;
        case "publishing:updateBlogMetadata":
          return updateBlogMetadataMock;
        case "publishing:recordBlogPrStatus":
          return recordBlogPrStatusMock;
        case "publishing:deletePost":
          return deletePostMock;
        case "posts:generateUploadUrl":
          return generateUploadUrlMock;
        default:
          throw new Error(`Unexpected mutation reference: ${String(reference)}`);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders publishing calendar items with approval and submission state", () => {
    render(<PersistedPublishingPanel />);

    expect(screen.getByText("Publishing calendar")).toBeInTheDocument();
    expect(screen.getByTestId("social-connections-panel")).toBeInTheDocument();
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText(/display timezone:/i)).toBeInTheDocument();
    expect(screen.getAllByText("Scheduled LinkedIn validation item")).toHaveLength(2);
    expect(screen.getAllByText("Approved Reddit validation item")).toHaveLength(2);
    expect(screen.getAllByText("not-submitted").length).toBeGreaterThanOrEqual(2);
  });

  it("supports month and week calendar navigation", () => {
    render(<PersistedPublishingPanel />);

    expect(screen.getByText("June 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "week" }));
    expect(screen.getByText("Jun 7 - Jun 13, 2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /next week/i }));
    expect(screen.getByText("Jun 14 - Jun 20, 2026")).toBeInTheDocument();
    expect(screen.getByText("No scheduled items in this week.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "month" }));
    fireEvent.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByText("May 2026")).toBeInTheDocument();
  });

  it("passes brand, platform, and status filters to the calendar query", () => {
    render(<PersistedPublishingPanel />);

    expect(useQuery).toHaveBeenLastCalledWith("publishing:listCalendarItems", {
      brandIds: ["corvo"],
      platformIds: ["linkedin", "reddit", "corvo-blog"],
      statuses: ["draft", "scheduled", "submitted", "needs-review"],
    });

    fireEvent.click(screen.getByText("FreshProof"));
    fireEvent.click(screen.getByText("YouTube"));
    fireEvent.click(screen.getByText("Published"));

    expect(useQuery).toHaveBeenLastCalledWith("publishing:listCalendarItems", {
      brandIds: ["corvo", "freshproof"],
      platformIds: ["linkedin", "reddit", "corvo-blog", "youtube"],
      statuses: ["draft", "scheduled", "submitted", "needs-review", "published"],
    });
  });

  it("creates blank posts from the zero-state actions", async () => {
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") {
        return [{ brandId: "corvo", name: "Corvo Labs" }];
      }
      if (reference === "publishing:listCalendarItems") return [];
      return undefined;
    });

    render(<PersistedPublishingPanel />);

    fireEvent.click(screen.getByRole("button", { name: /create a linkedin post/i }));
    await waitFor(() =>
      expect(createPostWithIntentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: "corvo",
          channelId: "linkedin",
          content: "",
          title: "Untitled LinkedIn post",
        })
      )
    );
  });

  it("shows repair workspace only in dev mode", async () => {
    const { rerender } = render(<PersistedPublishingPanel />);
    expect(screen.queryByRole("button", { name: /repair workspace/i })).not.toBeInTheDocument();

    rerender(<PersistedPublishingPanel devMode />);
    fireEvent.click(screen.getByRole("button", { name: /repair workspace/i }));
    await waitFor(() => expect(seedWorkspaceMock).toHaveBeenCalledWith({}));
  });

  it("blocks simulated submission until approval in dev mode", async () => {
    render(<PersistedPublishingPanel devMode />);

    const submitButtons = screen.getAllByRole("button", { name: /simulate submission/i });
    expect(submitButtons[0]).toBeDisabled();
    expect(submitButtons[1]).not.toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Approve Scheduled LinkedIn validation item" })
    );
    await waitFor(() =>
      expect(setApprovalMock).toHaveBeenCalledWith({
        postId: "post_1",
        approvalState: "approved",
      })
    );

    fireEvent.click(submitButtons[1]);
    await waitFor(() =>
      expect(submitMockProviderMock).toHaveBeenCalledWith({
        postId: "post_2",
        mode: "success",
      })
    );
  });

  it("hides simulation controls outside dev mode", () => {
    render(<PersistedPublishingPanel />);
    expect(screen.queryByRole("button", { name: /simulate submission/i })).not.toBeInTheDocument();
  });

  it("records cancel intents from the visible range agenda in dev mode", async () => {
    render(<PersistedPublishingPanel devMode />);

    fireEvent.click(screen.getAllByRole("button", { name: /cancel intent/i })[1]);
    await waitFor(() =>
      expect(recordProviderIntentMock).toHaveBeenCalledWith({
        postId: "post_2",
        intentType: "cancel",
      })
    );
    expect(
      await screen.findByText("Recorded a cancel intent for operator follow-up.")
    ).toBeInTheDocument();
  });

  it("retries retryable simulated attempts explicitly in dev mode", async () => {
    render(<PersistedPublishingPanel devMode />);

    fireEvent.click(screen.getByRole("button", { name: /retry simulation/i }));
    await waitFor(() =>
      expect(submitMockProviderMock).toHaveBeenCalledWith({
        postId: "post_3",
        mode: "success",
        retry: true,
      })
    );
  });

  it("opens item detail with debug sections only in dev mode", async () => {
    render(<PersistedPublishingPanel devMode />);

    fireEvent.click(
      screen.getByRole("button", { name: "Inspect Retryable LinkedIn validation item" })
    );

    const detail = screen.getByLabelText("Publishing item detail");
    expect(detail).toBeInTheDocument();
    expect(within(detail).getByText("Provider Attempts")).toBeInTheDocument();
    expect(within(detail).getByText("Audit Trail")).toBeInTheDocument();
    expect(within(detail).getByText("intent_1:fingerprint")).toBeInTheDocument();
    expect(within(detail).getByText("provider.mock_submit")).toBeInTheDocument();
    expect(
      within(detail).getAllByText(/Mock provider result: retryable-failure/).length
    ).toBeGreaterThan(0);
    expect(within(detail).getByText(/\[redacted\]/)).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Retry simulation" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close publishing detail" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect Scheduled LinkedIn validation item" })
    );

    const unapprovedDetail = screen.getByLabelText("Publishing item detail");
    expect(
      within(unapprovedDetail).getByRole("button", { name: "Simulate submission" })
    ).toBeDisabled();
  });

  it("shows simulated badge when provider state is simulated", async () => {
    const simulatedItem = {
      ...approvedItem,
      providerState: {
        providerId: "mock",
        status: "submitted",
        simulated: true,
      },
    };
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") return [{ brandId: "corvo", name: "Corvo Labs" }];
      if (reference === "publishing:listCalendarItems") return [simulatedItem];
      return undefined;
    });

    render(<PersistedPublishingPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Details Approved Reddit validation item" })
    );
    expect(
      within(screen.getByLabelText("Publishing item detail")).getByText(
        /Simulated submission — no post was sent to Reddit/
      )
    ).toBeInTheDocument();
  });

  it("creates a Corvo Blog PR and records sanitized metadata from the detail surface", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/42",
            branchName: "resonate/blog-post-2026-06-12-approved-corvo-blog-pr-item",
            sanitizedResponse: {
              repo: "jakebutler/corvo-labs-dot-com",
              prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/42",
              branchName: "resonate/blog-post-2026-06-12-approved-corvo-blog-pr-item",
              number: 42,
              state: "open",
              scheduleTrigger: "pr-body",
              scheduledDate: "2026-06-12",
              scheduledTime: "09:00",
              timezone: "America/Los_Angeles",
            },
          }),
          { status: 200 }
        )
      )
    );

    render(<PersistedPublishingPanel devMode />);

    fireEvent.click(screen.getByRole("button", { name: "Details Approved Corvo Blog PR item" }));
    const detail = screen.getByLabelText("Publishing item detail");
    expect(within(detail).getByText("Source idea")).toBeInTheDocument();
    expect(within(detail).getByText("idea-blog-1")).toBeInTheDocument();
    expect(within(detail).getByText("brief-1")).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Open PR" }));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/publish",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const publishPayload = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string
    );
    expect(publishPayload).toMatchObject({
      title: "Approved Corvo Blog PR item",
      scheduledDate: "2026-06-12",
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
      scheduleTrigger: "pr-body",
      status: "draft",
      excerpt: "A concise summary for the Corvo Labs blog.",
      author: "Jake Butler",
      category: "strategy",
      tags: ["Corvo Labs", "Publishing"],
    });
    expect(publishPayload.images[0]).toMatchObject({
      sourceUrl: "https://cdn.example/hero.jpg",
      isCover: true,
    });

    await waitFor(() =>
      expect(recordGithubPrMock).toHaveBeenCalledWith({
        postId: "post_4",
        result: {
          prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/42",
          branchName: "resonate/blog-post-2026-06-12-approved-corvo-blog-pr-item",
          prNumber: 42,
          prStatus: "open",
          sanitizedResponse: expect.objectContaining({
            repo: "jakebutler/corvo-labs-dot-com",
            number: 42,
            state: "open",
          }),
        },
      })
    );
    expect(
      await screen.findByText(
        "Opened Corvo Blog PR: https://github.com/jakebutler/corvo-labs-dot-com/pull/42"
      )
    ).toBeInTheDocument();
  });

  it("checks blog PR status and records it in Convex", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            prNumber: 53,
            prStatus: "merged",
            prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/53",
          }),
          { status: 200 }
        )
      )
    );
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") return [{ brandId: "corvo", name: "Corvo Labs" }];
      if (reference === "publishing:listCalendarItems") return [blogItemWithPr];
      return undefined;
    });

    render(<PersistedPublishingPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Details Approved Corvo Blog PR item with PR" })
    );
    fireEvent.click(
      within(screen.getByLabelText("Publishing item detail")).getByRole("button", {
        name: "Check PR status",
      })
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/blog-pr-status",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/53",
          }),
        })
      )
    );
    await waitFor(() =>
      expect(recordBlogPrStatusMock).toHaveBeenCalledWith({
        postId: "post_5",
        prStatus: "merged",
        prNumber: 53,
      })
    );
  });

  it("saves content edits through the single composer and clears approval", async () => {
    render(<PersistedPublishingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Inspect Approved Reddit validation item" }));
    const detail = screen.getByLabelText("Publishing item detail");
    expect(within(detail).getByText("Composer")).toBeInTheDocument();

    fireEvent.change(within(detail).getByLabelText("Content"), {
      target: { value: "Updated Reddit post body that needs review again." },
    });
    expect(within(detail).getByText("Content or metadata changed: saving will clear approval.")).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Save Composer Changes" }));

    await waitFor(() =>
      expect(updateContentMock).toHaveBeenCalledWith({
        postId: "post_2",
        title: "Approved Reddit validation item",
        content: "Updated Reddit post body that needs review again.",
      })
    );
    expect(rescheduleMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Saved composer changes and cleared approval for re-review.")
    ).toBeInTheDocument();
  });

  it("saves date-only composer edits without clearing approval", async () => {
    render(<PersistedPublishingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Inspect Approved Reddit validation item" }));
    const detail = screen.getByLabelText("Publishing item detail");

    fireEvent.change(within(detail).getByLabelText("Date"), {
      target: { value: "2026-06-19" },
    });
    fireEvent.change(within(detail).getByLabelText("Time"), {
      target: { value: "13:15" },
    });
    expect(within(detail).getByText("Schedule-only change: approval is preserved.")).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Save Composer Changes" }));

    await waitFor(() =>
      expect(rescheduleMock).toHaveBeenCalledWith({
        postId: "post_2",
        scheduledDate: "2026-06-19",
        scheduledTime: "13:15",
        timezone: "America/Los_Angeles",
      })
    );
    expect(updateContentMock).not.toHaveBeenCalled();
    expect(await screen.findByText("Saved date/time changes without changing approval.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not call GitHub when rescheduling a blog post without a PR URL", async () => {
    render(<PersistedPublishingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Details Approved Corvo Blog PR item" }));
    const detail = screen.getByLabelText("Publishing item detail");
    fireEvent.change(within(detail).getByLabelText("Date"), { target: { value: "2026-06-21" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Composer Changes" }));
    await waitFor(() =>
      expect(rescheduleMock).toHaveBeenCalledWith(
        expect.objectContaining({ postId: "post_4", scheduledDate: "2026-06-21" })
      )
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reschedules blog posts with an open PR through Convex without client GitHub calls", async () => {
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") return [{ brandId: "corvo", name: "Corvo Labs" }];
      if (reference === "publishing:listCalendarItems") return [blogItemWithPr];
      return undefined;
    });
    render(<PersistedPublishingPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Details Approved Corvo Blog PR item with PR" })
    );
    const detail = screen.getByLabelText("Publishing item detail");
    fireEvent.change(within(detail).getByLabelText("Date"), { target: { value: "2026-06-22" } });
    fireEvent.change(within(detail).getByLabelText("Time"), { target: { value: "11:00" } });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Composer Changes" }));
    await waitFor(() =>
      expect(rescheduleMock).toHaveBeenCalledWith({
        postId: "post_5",
        scheduledDate: "2026-06-22",
        scheduledTime: "11:00",
        timezone: "America/Los_Angeles",
      })
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("deletes a draft from the detail drawer", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PersistedPublishingPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Details Scheduled LinkedIn validation item" })
    );
    const detail = screen.getByLabelText("Publishing item detail");
    fireEvent.click(
      within(detail).getByRole("button", {
        name: "Delete Scheduled LinkedIn validation item",
      })
    );
    await waitFor(() =>
      expect(deletePostMock).toHaveBeenCalledWith({ postId: "post_1" })
    );
  });

  it("selects a post when initialPostId matches a visible calendar item", () => {
    render(<PersistedPublishingPanel initialPostId="post_2" />);
    const detail = screen.getByLabelText("Publishing item detail");
    expect(within(detail).getByRole("heading", { level: 3, name: "Approved Reddit validation item" })).toBeInTheDocument();
  });

  it("renders ISO scheduled dates on the calendar grid and composer", async () => {
    const isoItem = {
      ...unapprovedItem,
      post: {
        ...unapprovedItem.post,
        scheduledDate: "2026-06-12T09:00:00.000Z",
      },
      intent: {
        ...unapprovedItem.intent,
        scheduledDate: "2026-06-12T09:00:00.000Z",
      },
    };
    vi.mocked(useQuery).mockImplementation((query) => {
      if (query === "publishing:listBrands") {
        return [
          { brandId: "personal", name: "Personal" },
          { brandId: "corvo", name: "Corvo Labs" },
          { brandId: "lower-db", name: "the lower dB" },
          { brandId: "freshproof", name: "FreshProof" },
        ];
      }
      if (query === "publishing:listCalendarItems") return [isoItem];
      return undefined;
    });

    render(<PersistedPublishingPanel />);
    expect(await screen.findByRole("button", { name: "Inspect Scheduled LinkedIn validation item" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect Scheduled LinkedIn validation item" }));
    expect(screen.getByLabelText("Date")).toHaveValue("2026-06-12");
  });

});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAction, useMutation, useQuery } from "convex/react";
import { PersistedPublishingPanel } from "@/components/PersistedPublishingPanel";

vi.mock("@/components/BufferDestinationPanel",()=>({BufferDestinationPanel:()=>null}));
vi.mock("@/components/ArticleDependencyPanel",()=>({ArticleDependencyPanel:()=>null}));
vi.mock("@/components/DeliveryReceiptPanel",()=>({DeliveryReceiptPanel:()=>null}));
vi.mock("convex/react", () => ({
  useAction: vi.fn(),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
  // The panel skips its queries until Convex has the Clerk token, so the
  // default here must report an authenticated session.
  useConvexAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true })),
}));

vi.mock("@/components/SocialConnectionsPanel", () => ({
  SocialConnectionsPanel: () => <div data-testid="social-connections-panel">Connections</div>,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    articlePublication:{refresh:"articlePublication:refresh"},
    series: {list:"series:list"},
    publishing: {
      listBrands: "publishing:listBrands",
      getPostById: "publishing:getPostById",
      listCalendarItems: "publishing:listCalendarItems",
      getPostAuditTrail: "publishing:getPostAuditTrail",
      seedMvpWorkspace: "publishing:seedMvpWorkspace",
      createPostWithIntent: "publishing:createPostWithIntent",
      setApproval: "publishing:setApproval",
      reschedule: "publishing:reschedule",
      updateContent: "publishing:updateContent",
      updateBlogMetadata: "publishing:updateBlogMetadata",
      submitMockProvider: "publishing:submitMockProvider",
      recordProviderIntent: "publishing:recordProviderIntent",
      bufferLiveSubmissionEnabled: "publishing:bufferLiveSubmissionEnabled",
      recordGithubPr: "publishing:recordGithubPr",
      recordBlogPrStatus: "publishing:recordBlogPrStatus",
      deletePost: "publishing:deletePost",
    },
    blogHero: {prepare: "blogHero:prepare"},
    bufferLive: {
      submit: "bufferLive:submit",
      cancelOrUnpublish: "bufferLive:cancelOrUnpublish",
    },
    v2Storage: {
      generateUploadUrl: "v2Storage:generateUploadUrl",
      getFileUrl: "v2Storage:getFileUrl",
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
const submitBufferLiveMock = vi.fn().mockResolvedValue({
  submitted: true,
  liveGateOff: false,
  attemptId: "attempt_buffer_1",
  providerPostId: "buffer-1",
});
const cancelBufferLiveMock = vi.fn().mockResolvedValue({
  recorded: true,
  ok: true,
  liveGateOff: false,
});
let bufferLiveEnabledMock = false;
const recordProviderIntentMock = vi.fn().mockResolvedValue({
  recorded: true,
  intentType: "cancel",
});
const recordGithubPrMock = vi.fn().mockResolvedValue({
  recorded: true,
  attemptId: "attempt_pr_1",
});
const updateBlogMetadataMock = vi.fn().mockResolvedValue({ updated: true });
const checkArticlePublicationMock=vi.fn().mockResolvedValue({recorded:true,reason:"Production deployment is pending."});
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
    blogPublicationIntent: "published", coverImageAlt: "Reviewed hero",
    heroImageStorageId: "source", preparedHero: {sourceStorageId: "source", storageId: "prepared", width:1600, height:900, mimeType:"image/webp", byteLength:1000, sha256:"hash", crop:"centre"},
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
    bufferLiveEnabledMock = false;
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(useQuery).mockImplementation((reference, args) => {
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
      if (reference === "publishing:getPostAuditTrail") {
        // The list query no longer ships attempt rows / audit events; the
        // drawer loads the trail per open post.
        const items = [unapprovedItem, approvedItem, retryableItem, blogItem];
        const match = items.find(
          (entry) => entry.post._id === (args as { postId?: string })?.postId
        );
        return {
          attempts: match?.attempts ?? [],
          auditEvents: match?.auditEvents ?? [],
        };
      }
      if (reference === "publishing:bufferLiveSubmissionEnabled") {
        return { enabled: bufferLiveEnabledMock };
      }
      return undefined;
    });
    vi.mocked(useAction).mockImplementation((reference) => {
      switch (reference) {
        case "articlePublication:refresh":return checkArticlePublicationMock;
        case "blogHero:prepare":
          return vi.fn().mockResolvedValue(null);
        case "bufferLive:submit":
          return submitBufferLiveMock;
        case "bufferLive:cancelOrUnpublish":
          return cancelBufferLiveMock;
        default:
          throw new Error(`Unexpected action reference: ${String(reference)}`);
      }
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
        case "v2Storage:generateUploadUrl":
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

    expect(useQuery).toHaveBeenCalledWith("publishing:listCalendarItems", {
      brandIds: ["corvo"],
      platformIds: ["linkedin", "reddit", "corvo-blog"],
      statuses: ["draft", "scheduled", "submitted", "queued", "publishing", "published", "cancel-requested", "cancelled", "removed", "provider-draft", "needs-review", "pr-created"],
    });

    fireEvent.click(screen.getByText("FreshProof"));
    fireEvent.click(screen.getByText("YouTube"));
    fireEvent.click(screen.getByRole("checkbox", {name:"Published",exact:true}));

    const calendarCalls = vi
      .mocked(useQuery)
      .mock.calls.filter((call) => call[0] === "publishing:listCalendarItems");
    expect(calendarCalls.at(-1)).toEqual([
      "publishing:listCalendarItems",
      {
        brandIds: ["corvo", "freshproof"],
        platformIds: ["linkedin", "reddit", "corvo-blog", "youtube"],
        statuses: ["draft", "scheduled", "submitted", "queued", "publishing", "cancel-requested", "cancelled", "removed", "provider-draft", "needs-review", "pr-created"],
      },
    ]);
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
      postId: "post_4",

    });
    expect(publishPayload).not.toHaveProperty("title");
    expect(publishPayload).not.toHaveProperty("excerpt");
    expect(publishPayload).not.toHaveProperty("tags");

    await waitFor(() =>
      expect(recordGithubPrMock).toHaveBeenCalledWith({
        postId: "post_4",
        result: {
          artifact: undefined,
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

  it("disables Open PR and shows loading while the PR request is in flight", async () => {
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => fetchPromise)
    );

    render(<PersistedPublishingPanel devMode />);

    fireEvent.click(screen.getByRole("button", { name: "Details Approved Corvo Blog PR item" }));
    const detail = screen.getByLabelText("Publishing item detail");
    fireEvent.click(within(detail).getByRole("button", { name: "Open PR" }));

    await waitFor(() => {
      const loadingButton = within(detail).getByRole("button", { name: /Opening/i });
      expect(loadingButton).toBeDisabled();
      expect(loadingButton).toHaveAttribute("aria-busy", "true");
    });

    resolveFetch?.(
      new Response(
        JSON.stringify({
          prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/42",
          branchName: "resonate/blog-post-2026-06-12-approved-corvo-blog-pr-item",
          sanitizedResponse: {
            number: 42,
            state: "open",
          },
        }),
        { status: 200 }
      )
    );

    expect(
      await screen.findByText(
        "Opened Corvo Blog PR: https://github.com/jakebutler/corvo-labs-dot-com/pull/42"
      )
    ).toBeInTheDocument();

    await waitFor(() => {
      const openPrButton = within(detail).getByRole("button", { name: "Open PR" });
      expect(openPrButton).not.toBeDisabled();
      expect(openPrButton).not.toHaveAttribute("aria-busy");
    });
  });

  it("keeps Open PR loading per post when a second blog PR is started", async () => {
    const secondBlogItem = {
      ...blogItem,
      post: {
        ...blogItem.post,
        _id: "post_4b",
        title: "Second Corvo Blog PR item",
        blogSlug: "second-corvo-blog-pr-item",
      },
      intent: { ...blogItem.intent, _id: "intent_4b" },
    };
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") {
        return [{ brandId: "corvo", name: "Corvo Labs" }];
      }
      if (reference === "publishing:listCalendarItems") {
        return [blogItem, secondBlogItem];
      }
      return undefined;
    });

    const resolvers: Array<(value: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          })
      )
    );

    render(<PersistedPublishingPanel devMode />);

    fireEvent.click(screen.getByRole("button", { name: "Details Approved Corvo Blog PR item" }));
    fireEvent.click(
      within(screen.getByLabelText("Publishing item detail")).getByRole("button", {
        name: "Open PR",
      })
    );
    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Publishing item detail")).getByRole("button", {
          name: /Opening/i,
        })
      ).toBeDisabled()
    );

    fireEvent.click(screen.getByRole("button", { name: "Details Second Corvo Blog PR item" }));
    const secondDetail = screen.getByLabelText("Publishing item detail");
    fireEvent.click(within(secondDetail).getByRole("button", { name: "Open PR" }));
    await waitFor(() =>
      expect(within(secondDetail).getByRole("button", { name: /Opening/i })).toBeDisabled()
    );

    expect(fetch).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Details Approved Corvo Blog PR item" }));
    const firstDetailAgain = screen.getByLabelText("Publishing item detail");
    await waitFor(() => {
      const firstLoading = within(firstDetailAgain).getByRole("button", { name: /Opening/i });
      expect(firstLoading).toBeDisabled();
      expect(firstLoading).toHaveAttribute("aria-busy", "true");
    });

    resolvers[0]?.(
      new Response(
        JSON.stringify({
          prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/42",
          branchName: "resonate/blog-a",
          sanitizedResponse: { number: 42, state: "open" },
        }),
        { status: 200 }
      )
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Opened Corvo Blog PR: https://github.com/jakebutler/corvo-labs-dot-com/pull/42"
        )
      ).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Details Second Corvo Blog PR item" }));
    expect(
      within(screen.getByLabelText("Publishing item detail")).getByRole("button", {
        name: /Opening/i,
      })
    ).toBeDisabled();

    resolvers[1]?.(
      new Response(
        JSON.stringify({
          prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/43",
          branchName: "resonate/blog-b",
          sanitizedResponse: { number: 43, state: "open" },
        }),
        { status: 200 }
      )
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "Opened Corvo Blog PR: https://github.com/jakebutler/corvo-labs-dot-com/pull/43"
        )
      ).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Details Approved Corvo Blog PR item" }));
    await waitFor(() => {
      const firstButton = within(screen.getByLabelText("Publishing item detail")).getByRole(
        "button",
        { name: "Open PR" }
      );
      expect(firstButton).not.toBeDisabled();
      expect(firstButton).not.toHaveAttribute("aria-busy");
    });

    fireEvent.click(screen.getByRole("button", { name: "Details Second Corvo Blog PR item" }));
    await waitFor(() => {
      const secondButton = within(screen.getByLabelText("Publishing item detail")).getByRole(
        "button",
        { name: "Open PR" }
      );
      expect(secondButton).not.toBeDisabled();
      expect(secondButton).not.toHaveAttribute("aria-busy");
    });
  }, 15000);

  it("checks server-owned article publication evidence without trusting a client merge receipt", async () => {
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

    await waitFor(()=>expect(checkArticlePublicationMock).toHaveBeenCalledWith({postId:"post_5"}));
    expect(recordBlogPrStatusMock).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
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

  it("saves a LinkedIn first comment as content requiring approval", async () => {
    render(<PersistedPublishingPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Inspect Scheduled LinkedIn validation item" }));
    const detail = screen.getByLabelText("Publishing item detail");
    fireEvent.change(within(detail).getByLabelText("First comment"), { target: { value: "https://corvolabs.com/blog/approved-article" } });
    expect(within(detail).getByText("Content or metadata changed: saving will clear approval.")).toBeInTheDocument();
    fireEvent.click(within(detail).getByRole("button", { name: "Save Composer Changes" }));
    await waitFor(() => expect(updateContentMock).toHaveBeenCalledWith({
      postId: "post_1", title: unapprovedItem.post.title, content: unapprovedItem.post.content,
      linkedinFirstComment: "https://corvolabs.com/blog/approved-article",
    }));
    expect(submitBufferLiveMock).not.toHaveBeenCalled();
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

  it("opens an undated draft from the unscheduled section", () => {
    const item = {
      ...unapprovedItem,
      post: { ...unapprovedItem.post, scheduledDate: undefined, scheduledTime: undefined },
      intent: { ...unapprovedItem.intent, scheduledDate: undefined, scheduledTime: undefined },
    };
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") return [{ brandId: "corvo", name: "Corvo Labs" }];
      if (reference === "publishing:listCalendarItems") return [item];
      return undefined;
    });
    render(<PersistedPublishingPanel />);
    fireEvent.click(screen.getByRole("button", { name: `Open composer for ${item.post.title}` }));
    expect(screen.getByLabelText("Publishing item detail")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("");
  });

  it("opens a composer link whose brand and status were excluded by default", async () => {
    const item = {
      ...approvedItem,
      post: { ...approvedItem.post, status: "unavailable", channelId: "youtube", platformId: "youtube" },
    };
    vi.mocked(useQuery).mockImplementation((reference, args) => {
      if (reference === "publishing:listBrands") return [{ brandId: "corvo", name: "Corvo Labs" }];
      if (reference === "publishing:getPostById") return item.post;
      if (reference === "publishing:listCalendarItems") {
        const filters = args as { brandIds: string[]; statuses: string[]; platformIds: string[] };
        return filters.brandIds.includes("freshproof") && filters.statuses.includes("unavailable") && filters.platformIds.includes("youtube") ? [item] : [];
      }
      return undefined;
    });
    render(<PersistedPublishingPanel initialPostId="post_2" />);
    await waitFor(() => expect(screen.getByLabelText("Publishing item detail")).toBeInTheDocument());
    expect(screen.getByLabelText("Title")).toHaveValue(item.post.title);
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
      if (query === "publishing:bufferLiveSubmissionEnabled") {
        return { enabled: bufferLiveEnabledMock };
      }
      return undefined;
    });

    render(<PersistedPublishingPanel />);
    expect(await screen.findByRole("button", { name: "Inspect Scheduled LinkedIn validation item" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect Scheduled LinkedIn validation item" }));
    expect(screen.getByLabelText("Date")).toHaveValue("2026-06-12");
  });

  it("uses labeled simulate path when Buffer live gate is off", async () => {
    render(<PersistedPublishingPanel devMode />);
    expect(screen.queryByRole("button", { name: /submit to buffer/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /simulate submission/i }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: /simulate submission/i })[1]);
    await waitFor(() =>
      expect(submitMockProviderMock).toHaveBeenCalledWith({
        postId: "post_2",
        mode: "success",
      })
    );
    expect(submitBufferLiveMock).not.toHaveBeenCalled();
  });

  it("submits approved LinkedIn posts through Buffer when live gate is on", async () => {
    bufferLiveEnabledMock = true;
    const approvedLinkedIn = {
      ...unapprovedItem,
      post: {
        ...unapprovedItem.post,
        _id: "post_li_live",
        title: "Approved LinkedIn live item",
        approvalState: "approved",
        status: "scheduled",
      },
      intent: {
        ...unapprovedItem.intent,
        _id: "intent_li_live",
      },
    };
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") {
        return [{ brandId: "corvo", name: "Corvo Labs" }];
      }
      if (reference === "publishing:listCalendarItems") {
        return [approvedLinkedIn];
      }
      if (reference === "publishing:bufferLiveSubmissionEnabled") {
        return { enabled: true };
      }
      return undefined;
    });

    render(<PersistedPublishingPanel />);
    expect(screen.queryByRole("button", { name: /simulate submission/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /submit to buffer/i }));
    await waitFor(() =>
      expect(submitBufferLiveMock).toHaveBeenCalledWith({ postId: "post_li_live" })
    );
    expect(submitMockProviderMock).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Queued in Buffer for LinkedIn; publication is still pending.")
    ).toBeInTheDocument();
  });

  it("cancels LinkedIn posts through Buffer when live gate is on", async () => {
    bufferLiveEnabledMock = true;
    const submittedLinkedIn = {
      ...unapprovedItem,
      post: {
        ...unapprovedItem.post,
        _id: "post_li_cancel",
        title: "Submitted LinkedIn live item",
        approvalState: "approved",
        status: "submitted",
      },
      providerState: {
        providerId: "buffer",
        status: "submitted",
        providerPostId: "buffer-xyz",
        simulated: false,
      },
    };
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") {
        return [{ brandId: "corvo", name: "Corvo Labs" }];
      }
      if (reference === "publishing:listCalendarItems") {
        return [submittedLinkedIn];
      }
      if (reference === "publishing:bufferLiveSubmissionEnabled") {
        return { enabled: true };
      }
      return undefined;
    });

    render(<PersistedPublishingPanel />);
    fireEvent.click(screen.getByRole("button", { name: /cancel in buffer/i }));
    await waitFor(() =>
      expect(cancelBufferLiveMock).toHaveBeenCalledWith({
        postId: "post_li_cancel",
        intentType: "cancel",
      })
    );
    expect(recordProviderIntentMock).not.toHaveBeenCalled();
  });

  it("disables Submit to Buffer for unapproved LinkedIn when live gate is on", async () => {
    bufferLiveEnabledMock = true;
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") {
        return [{ brandId: "corvo", name: "Corvo Labs" }];
      }
      if (reference === "publishing:listCalendarItems") {
        return [unapprovedItem];
      }
      if (reference === "publishing:bufferLiveSubmissionEnabled") {
        return { enabled: true };
      }
      return undefined;
    });

    render(<PersistedPublishingPanel />);
    const submit = screen.getByRole("button", { name: /submit to buffer/i });
    expect(submit).toBeDisabled();
    expect(submitBufferLiveMock).not.toHaveBeenCalled();
  });

  it("hides LinkedIn simulate controls while Buffer gate query is loading", async () => {
    bufferLiveEnabledMock = false;
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "publishing:listBrands") {
        return [{ brandId: "corvo", name: "Corvo Labs" }];
      }
      if (reference === "publishing:listCalendarItems") {
        return [unapprovedItem];
      }
      if (reference === "publishing:bufferLiveSubmissionEnabled") {
        return undefined;
      }
      return undefined;
    });

    render(<PersistedPublishingPanel devMode />);
    expect(screen.queryByRole("button", { name: /submit to buffer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /simulate submission/i })).not.toBeInTheDocument();
  });

});

it('derives calendar brand filters from the selected owned non-Corvo series',()=>{
 const original=vi.mocked(useQuery).getMockImplementation()!;
 vi.mocked(useQuery).mockImplementation((reference,args)=>reference==='series:list'?[{_id:'series-lower-db',brandId:'lower-db',title:'Lower DB series'}]:original(reference,args));
 render(<PersistedPublishingPanel initialSeriesId='series-lower-db'/>);
 expect(vi.mocked(useQuery).mock.calls.some(([reference,args])=>reference==='publishing:listCalendarItems'&&JSON.stringify(args).includes('"brandIds":["lower-db"]')&&JSON.stringify(args).includes('series-lower-db'))).toBe(true);
});

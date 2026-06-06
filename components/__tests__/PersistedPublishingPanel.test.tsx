import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { PersistedPublishingPanel } from "@/components/PersistedPublishingPanel";

vi.mock("convex/react", () => ({
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@/convex/_generated/api", () => ({
  api: {
    v2Publishing: {
      listBrands: "v2Publishing:listBrands",
      listCalendarItems: "v2Publishing:listCalendarItems",
      seedMvpWorkspace: "v2Publishing:seedMvpWorkspace",
      createPostWithIntent: "v2Publishing:createPostWithIntent",
      setApproval: "v2Publishing:setApproval",
      reschedule: "v2Publishing:reschedule",
      updateContent: "v2Publishing:updateContent",
      updatePlatformSettings: "v2Publishing:updatePlatformSettings",
      submitMockProvider: "v2Publishing:submitMockProvider",
      recordProviderIntent: "v2Publishing:recordProviderIntent",
      recordGithubPr: "v2Publishing:recordGithubPr",
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
const updatePlatformSettingsMock = vi.fn().mockResolvedValue(undefined);
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

describe("PersistedPublishingPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "v2Publishing:listBrands") {
        return [
          { brandId: "personal", name: "Personal" },
          { brandId: "corvo", name: "Corvo Labs" },
          { brandId: "lower-db", name: "the lower dB" },
          { brandId: "freshproof", name: "FreshProof" },
        ];
      }
      if (reference === "v2Publishing:listCalendarItems") {
        return [unapprovedItem, approvedItem, retryableItem, blogItem];
      }
      return undefined;
    });
    vi.mocked(useMutation).mockImplementation((reference) => {
      switch (reference) {
        case "v2Publishing:seedMvpWorkspace":
          return seedWorkspaceMock;
        case "v2Publishing:createPostWithIntent":
          return createPostWithIntentMock;
        case "v2Publishing:setApproval":
          return setApprovalMock;
        case "v2Publishing:reschedule":
          return rescheduleMock;
        case "v2Publishing:updateContent":
          return updateContentMock;
        case "v2Publishing:updatePlatformSettings":
          return updatePlatformSettingsMock;
        case "v2Publishing:submitMockProvider":
          return submitMockProviderMock;
        case "v2Publishing:recordProviderIntent":
          return recordProviderIntentMock;
        case "v2Publishing:recordGithubPr":
          return recordGithubPrMock;
        default:
          throw new Error(`Unexpected mutation reference: ${String(reference)}`);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders persisted publishing items with approval and provider state", () => {
    render(<PersistedPublishingPanel />);

    expect(screen.getByText("Persisted MVP spine")).toBeInTheDocument();
    expect(screen.getByText("June 2026")).toBeInTheDocument();
    expect(screen.getByText(/display timezone:/i)).toBeInTheDocument();
    expect(screen.getAllByText("Scheduled LinkedIn validation item")).toHaveLength(2);
    expect(screen.getAllByText("Approved Reddit validation item")).toHaveLength(2);
    expect(screen.getAllByText("mock / not-submitted")).toHaveLength(2);
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

    expect(useQuery).toHaveBeenLastCalledWith("v2Publishing:listCalendarItems", {
      brandIds: ["corvo"],
      platformIds: ["linkedin", "reddit", "corvo-blog"],
      statuses: ["draft", "scheduled", "submitted", "needs-review"],
    });

    fireEvent.click(screen.getByText("FreshProof"));
    fireEvent.click(screen.getByText("YouTube"));
    fireEvent.click(screen.getByText("Published"));

    expect(useQuery).toHaveBeenLastCalledWith("v2Publishing:listCalendarItems", {
      brandIds: ["corvo", "freshproof"],
      platformIds: ["linkedin", "reddit", "corvo-blog", "youtube"],
      statuses: ["draft", "scheduled", "submitted", "needs-review", "published"],
    });
  });

  it("seeds the MVP workspace and creates scheduled unapproved validation items", async () => {
    render(<PersistedPublishingPanel />);

    fireEvent.click(screen.getByRole("button", { name: /reseed workspace/i }));
    await waitFor(() => expect(seedWorkspaceMock).toHaveBeenCalledWith({}));

    fireEvent.click(screen.getByRole("button", { name: "+ LinkedIn" }));
    await waitFor(() =>
      expect(createPostWithIntentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          brandId: "corvo",
          channelId: "linkedin",
        })
      )
    );
  });

  it("blocks mock submission until approval, then submits approved items", async () => {
    render(<PersistedPublishingPanel />);

    const submitButtons = screen.getAllByRole("button", { name: /mock submit/i });
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

  it("reschedules items without changing approval", async () => {
    render(<PersistedPublishingPanel />);

    fireEvent.click(screen.getAllByRole("button", { name: /reschedule/i })[0]);
    await waitFor(() =>
      expect(rescheduleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          postId: "post_1",
          scheduledTime: "10:30",
          timezone: "America/Los_Angeles",
        })
      )
    );
  });

  it("records cancel intents from the visible range agenda", async () => {
    render(<PersistedPublishingPanel />);

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

  it("retries retryable mock provider attempts explicitly", async () => {
    render(<PersistedPublishingPanel />);

    fireEvent.click(screen.getByRole("button", { name: /retry mock/i }));
    await waitFor(() =>
      expect(submitMockProviderMock).toHaveBeenCalledWith({
        postId: "post_3",
        mode: "success",
        retry: true,
      })
    );
  });

  it("opens item detail with provider attempts, audit events, and approval gates", async () => {
    render(<PersistedPublishingPanel />);

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
    expect(within(detail).getByRole("button", { name: "Retry Mock" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close publishing detail" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect Scheduled LinkedIn validation item" })
    );

    const unapprovedDetail = screen.getByLabelText("Publishing item detail");
    expect(within(unapprovedDetail).getByRole("button", { name: "Submit Now" })).toBeDisabled();
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

    render(<PersistedPublishingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Details Approved Corvo Blog PR item" }));
    const detail = screen.getByLabelText("Publishing item detail");
    expect(within(detail).getByText("Source Idea")).toBeInTheDocument();
    expect(within(detail).getByText("idea-blog-1")).toBeInTheDocument();
    expect(within(detail).getByText("brief-1")).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Create PR" }));
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
      tags: ["Corvo Labs", "Resonate", "Publishing Workflow"],
    });
    expect(publishPayload.images[0]).toMatchObject({
      sourceUrl: "/images/corvo-labs-stacked.svg",
      isCover: true,
    });

    await waitFor(() =>
      expect(recordGithubPrMock).toHaveBeenCalledWith({
        postId: "post_4",
        result: {
          prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/42",
          branchName: "resonate/blog-post-2026-06-12-approved-corvo-blog-pr-item",
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
        "Created Corvo Blog PR: https://github.com/jakebutler/corvo-labs-dot-com/pull/42"
      )
    ).toBeInTheDocument();
  });

  it("saves content edits through the single composer and clears approval", async () => {
    render(<PersistedPublishingPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Inspect Approved Reddit validation item" }));
    const detail = screen.getByLabelText("Publishing item detail");
    expect(within(detail).getByText("Single Composer")).toBeInTheDocument();

    fireEvent.change(within(detail).getByLabelText("Content"), {
      target: { value: "Updated Reddit post body that needs review again." },
    });
    expect(within(detail).getByText("Content or platform settings changed: saving will clear approval.")).toBeInTheDocument();

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
  });

  it("saves LinkedIn platform settings and clears approval through Convex", async () => {
    const linkedInWithSettings = {
      ...unapprovedItem,
      post: {
        ...unapprovedItem.post,
        platformSettings: { cta: "Learn more", hashtags: ["corvo"], linkPreview: true },
      },
    };
    vi.mocked(useQuery).mockImplementation((reference) => {
      if (reference === "v2Publishing:listBrands") return [{ brandId: "corvo", name: "Corvo Labs" }];
      if (reference === "v2Publishing:listCalendarItems") return [linkedInWithSettings];
      return undefined;
    });
    render(<PersistedPublishingPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Details Scheduled LinkedIn validation item" })
    );
    const detail = screen.getByLabelText("Publishing item detail");
    fireEvent.change(within(detail).getByLabelText("Call to action"), {
      target: { value: "Book a demo" },
    });
    fireEvent.click(within(detail).getByRole("button", { name: "Save Composer Changes" }));
    await waitFor(() =>
      expect(updatePlatformSettingsMock).toHaveBeenCalledWith({
        postId: "post_1",
        platformSettings: {
          cta: "Book a demo",
          hashtags: ["corvo"],
          linkPreview: true,
        },
      })
    );
    expect(
      await screen.findByText("Saved platform settings and cleared approval for re-review.")
    ).toBeInTheDocument();
  });

  it("selects a post when initialPostId matches a visible calendar item", () => {
    render(<PersistedPublishingPanel initialPostId="post_2" />);
    const detail = screen.getByLabelText("Publishing item detail");
    expect(within(detail).getByRole("heading", { level: 3, name: "Approved Reddit validation item" })).toBeInTheDocument();
  });

});

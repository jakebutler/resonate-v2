import { describe, expect, it } from "vitest";
import {
  buildClarifyingContext,
  buildClarifyingQuestions,
  buildCorvoBlogDraft,
  buildFallbackDraft,
  buildIdeaSeedText,
  applyContentChange,
  createPublishingIntent,
  buildLinkedInDraft,
  DEFAULT_V2_STATE,
  filterPostsForView,
  findV2Channel,
  isEligibleForProviderSubmission,
  normalizeIdeaSourceUrl,
  reschedulePost,
  submitWithMockProvider,
  V2_BRANDS,
  V2_CHANNELS,
  type V2GapSeverity,
  type V2Post,
} from "@/lib/v2";

describe("v2 domain helpers", () => {
  it("normalizes source URLs for duplicate detection", () => {
    expect(
      normalizeIdeaSourceUrl(
        "https://Example.com/path/?utm_source=newsletter&keep=1#section"
      )
    ).toBe("https://example.com/path/?keep=1");
  });

  it("keeps malformed source text rather than throwing", () => {
    expect(normalizeIdeaSourceUrl("not a url")).toBe("not a url");
  });

  it("builds readable Idea seed text", () => {
    const idea = DEFAULT_V2_STATE.ideas[0];
    expect(buildIdeaSeedText(idea)).toContain("Idea:");
    expect(buildIdeaSeedText(idea)).toContain("Source:");
    expect(buildIdeaSeedText(idea)).toContain("Note 1:");
  });

  it("asks clarifying questions for thin multi-channel Ideas", () => {
    const idea = {
      ...DEFAULT_V2_STATE.ideas[0],
      sourceUrl: undefined,
      tags: [],
      entries: [
        {
          id: "entry-thin",
          content: "Turn this into something useful.",
          createdAt: "2026-06-06T00:00:00.000Z",
        },
      ],
    };

    expect(
      buildClarifyingQuestions({
        idea,
        brand: V2_BRANDS.find((brand) => brand.id === "corvo")!,
        channels: ["reddit", "corvo-blog"],
      })
    ).toEqual([
      "What is the central point this draft must make?",
      "Is there a source, example, or prior post this draft should reference?",
      "Which subreddit or reader context should shape the Reddit version?",
    ]);
  });

  it("formats clarifying answers for draft prompts", () => {
    expect(
      buildClarifyingContext([
        {
          question: "What is the takeaway?",
          answer: "Make the handoff reviewable.",
        },
      ])
    ).toContain("Q1: What is the takeaway?");
  });

  it("creates a Corvo blog draft with source material and voice-pack context", () => {
    const idea = DEFAULT_V2_STATE.ideas[0];
    const draft = buildCorvoBlogDraft({
      idea,
      voicePackMarkdown: DEFAULT_V2_STATE.voicePacks[0].markdown,
    });

    expect(draft).toContain("Golden sets");
    expect(draft).toContain("Source Material");
    expect(draft).toContain("Voice Pack Used");
  });

  it("creates a LinkedIn placeholder draft with idea title", () => {
    const idea = DEFAULT_V2_STATE.ideas[0];
    const draft = buildLinkedInDraft({
      idea,
      voicePackMarkdown: DEFAULT_V2_STATE.voicePacks[0].markdown,
    });

    expect(draft).toContain(idea.title);
  });

  it("returns a generated draft as-is when provided", () => {
    const idea = DEFAULT_V2_STATE.ideas[0];
    const generated = "This is the real AI draft.";
    const draft = buildLinkedInDraft({
      idea,
      voicePackMarkdown: "",
      generatedDraft: generated,
    });

    expect(draft).toBe(generated);
  });

  describe("buildFallbackDraft", () => {
    const idea = DEFAULT_V2_STATE.ideas[0];
    const voicePackMarkdown = DEFAULT_V2_STATE.voicePacks[0].markdown;

    it("routes corvo-blog to the blog draft builder", () => {
      const draft = buildFallbackDraft({ idea, channelId: "corvo-blog", voicePackMarkdown });
      expect(draft).toContain("Source Material");
    });

    it("routes linkedin to the LinkedIn draft builder", () => {
      const draft = buildFallbackDraft({ idea, channelId: "linkedin", voicePackMarkdown });
      expect(draft).toContain(idea.title);
      expect(draft).not.toContain("Source Material");
    });

    it("routes other channels to a generic draft with channel label", () => {
      const draft = buildFallbackDraft({ idea, channelId: "youtube", voicePackMarkdown });
      expect(draft).toContain("[YouTube draft]");
    });

    it("passes a generated draft through without modification", () => {
      const generated = "AI-produced copy.";
      const draft = buildFallbackDraft({
        idea,
        channelId: "reddit",
        voicePackMarkdown,
        generatedDraft: generated,
      });
      expect(draft).toBe(generated);
    });
  });

  describe("filterPostsForView", () => {
    const makePost = (id: string, brandId: V2Post["brandId"], status: V2Post["status"]): V2Post => ({
      id,
      brandId,
      channelId: "linkedin",
      title: `Post ${id}`,
      content: "content",
      status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const posts: V2Post[] = [
      makePost("a", "corvo", "draft"),
      makePost("b", "corvo", "scheduled"),
      makePost("c", "freshproof", "draft"),
      makePost("d", "lower-db", "pr-created"),
    ];

    it("returns only the active brand posts when allBrands is false", () => {
      const result = filterPostsForView(posts, "corvo", false);
      expect(result.map((p) => p.id)).toEqual(["a", "b"]);
    });

    it("returns all posts across brands when allBrands is true", () => {
      const result = filterPostsForView(posts, "corvo", true);
      expect(result).toHaveLength(4);
    });

    it("filters by status when statusFilter is provided", () => {
      const result = filterPostsForView(posts, "corvo", true, "draft");
      expect(result.map((p) => p.id)).toEqual(["a", "c"]);
    });

    it("returns all statuses when statusFilter is undefined", () => {
      const result = filterPostsForView(posts, "corvo", false);
      expect(result.every((p) => ["draft", "scheduled", "pr-created"].includes(p.status))).toBe(true);
    });
  });

  it("V2GapSeverity type covers expected severity levels", () => {
    // Type-level smoke test — ensures the union is exportable and assignable
    const severities: V2GapSeverity[] = ["blocker", "v1.1", "later", "acceptable"];
    expect(severities).toHaveLength(4);
  });

  describe("brand/channel/provider routing", () => {
    it("creates all MVP brand workspaces and routable validation channels", () => {
      expect(V2_CHANNELS.some((c) => c.brandId === "personal")).toBe(true);
      expect(V2_CHANNELS.some((c) => c.brandId === "corvo")).toBe(true);
      expect(V2_CHANNELS.some((c) => c.brandId === "lower-db")).toBe(true);
      expect(V2_CHANNELS.some((c) => c.brandId === "freshproof")).toBe(true);
      expect(findV2Channel("corvo", "linkedin")?.providerId).toBe("buffer");
      expect(findV2Channel("freshproof", "reddit")?.providerId).toBe("zernio");
      expect(findV2Channel("corvo", "corvo-blog")?.providerId).toBe("github-pr");
      expect(findV2Channel("corvo", "x")?.routable).toBe(false);
    });
  });

  describe("publishing intent and provider safety", () => {
    const basePost: V2Post = {
      id: "post-1",
      brandId: "corvo",
      channelId: "linkedin",
      ideaId: "idea-1",
      title: "A test post",
      content: "This is test content.",
      status: "scheduled",
      scheduledDate: "2026-06-12",
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
      approvalState: "unapproved",
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z",
    };

    it("keeps scheduled but unapproved posts visible but ineligible for submission", () => {
      const intent = createPublishingIntent(basePost);
      expect(intent.scheduledDate).toBe("2026-06-12");
      expect(intent.approvalState).toBe("unapproved");
      expect(isEligibleForProviderSubmission({ post: basePost, intent })).toEqual({
        eligible: false,
        reason: "Post is not approved.",
      });

      const result = submitWithMockProvider({ post: basePost, intent });
      expect(result.attempt).toBeUndefined();
      expect(result.providerState.status).toBe("not-submitted");
      expect(result.skippedReason).toBe("Post is not approved.");
    });

    it("allows date-only rescheduling without clearing approval", () => {
      const approved = { ...basePost, approvalState: "approved" as const };
      const rescheduled = reschedulePost(approved, {
        scheduledDate: "2026-06-13",
        scheduledTime: "10:30",
      });
      expect(rescheduled.approvalState).toBe("approved");
      expect(rescheduled.status).toBe("scheduled");
      expect(rescheduled.scheduledDate).toBe("2026-06-13");
    });

    it("requires reapproval after content changes", () => {
      const approved = { ...basePost, approvalState: "approved" as const };
      const changed = applyContentChange(approved, { content: "Changed copy." });
      expect(changed.approvalState).toBe("unapproved");
      expect(changed.status).toBe("draft");
    });

    it("submits approved scheduled posts through the mock provider once", () => {
      const approved = { ...basePost, approvalState: "approved" as const };
      const intent = createPublishingIntent(approved);
      const first = submitWithMockProvider({ post: approved, intent });
      expect(first.attempt?.status).toBe("success");
      expect(first.providerState.status).toBe("submitted");
      expect(first.attempt?.sanitizedResponse.accessToken).toBe("[redacted]");

      const second = submitWithMockProvider({
        post: approved,
        intent,
        previousAttempts: first.attempt ? [first.attempt] : [],
      });
      expect(second.attempt).toBeUndefined();
      expect(second.skippedReason).toBe("Duplicate submission prevented.");
    });

    it("moves ambiguous mock provider outcomes to needs review", () => {
      const approved = { ...basePost, approvalState: "approved" as const };
      const intent = createPublishingIntent(approved);
      const result = submitWithMockProvider({ post: approved, intent, mode: "ambiguous" });
      expect(result.attempt?.status).toBe("ambiguous");
      expect(result.post.status).toBe("needs-review");
      expect(result.providerState.status).toBe("needs-review");
    });

    it("allows explicit retries only after retryable or ambiguous mock attempts", () => {
      const approved = { ...basePost, approvalState: "approved" as const };
      const intent = createPublishingIntent(approved);
      const first = submitWithMockProvider({
        post: approved,
        intent,
        mode: "retryable-failure",
      });
      expect(first.attempt?.status).toBe("retryable-failure");

      const retry = submitWithMockProvider({
        post: approved,
        intent,
        mode: "success",
        previousAttempts: first.attempt ? [first.attempt] : [],
        retry: true,
      });
      expect(retry.attempt?.status).toBe("success");
      expect(retry.attempt?.retryCount).toBe(1);
      expect(retry.attempt?.idempotencyKey).toContain(":retry:1");

      const permanent = submitWithMockProvider({
        post: approved,
        intent,
        mode: "permanent-failure",
      });
      const blocked = submitWithMockProvider({
        post: approved,
        intent,
        mode: "success",
        previousAttempts: permanent.attempt ? [permanent.attempt] : [],
        retry: true,
      });
      expect(blocked.attempt).toBeUndefined();
      expect(blocked.skippedReason).toBe("Previous attempt is not retryable.");
    });
  });
});

import type { NextRequest } from "next/server"
import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockConvexQuery } = vi.hoisted(() => ({
  mockConvexQuery: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({
    userId: "user_123",
    getToken: vi.fn().mockResolvedValue("convex-token"),
  }),
}))

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn(function ConvexHttpClientMock() {
    return {
      setAuth: vi.fn(),
      query: mockConvexQuery,
      action: vi.fn().mockResolvedValue({base64: "aGVybw==", sha256: "fixture-hash"}),
      mutation: vi.fn().mockResolvedValue(null),
    }
  }),
}))

vi.mock("@/lib/github", () => {
  class BlogPostContractError extends Error {
    readonly issues: string[];

    constructor(issues: string[]) {
      super(`Blog post fails the corvo-labs-dot-com MDX contract:\n- ${issues.join("\n- ")}`);
      this.name = "BlogPostContractError";
      this.issues = issues;
    }
  }

  return {
    BlogPostContractError,
    createBlogPostPR: vi.fn().mockResolvedValue({
      prUrl: "https://github.com/org/repo/pull/1",
      branchName: "resonate/blog-post-2026-03-04-test",
      sanitizedResponse: {
        repo: "jakebutler/corvo-labs-dot-com",
        prUrl: "https://github.com/org/repo/pull/1",
        branchName: "resonate/blog-post-2026-03-04-test",
        number: 1,
        state: "open",
        scheduleTrigger: "pr-body",
        scheduledDate: "2026-03-04",
      },
    }),
  };
});

vi.mock("@/lib/imageAlt", () => ({
  enrichPublishImageAlts: vi.fn(async ({ coverImageAlt, images }) => ({
    coverImageAlt,
    images,
  })),
}))

import { POST } from "@/app/api/publish/route"
import { auth } from "@clerk/nextjs/server"
import { BlogPostContractError, createBlogPostPR } from "@/lib/github"
import { enrichPublishImageAlts } from "@/lib/imageAlt"

function makeRequest(body: object): NextRequest {
  return new Request("http://localhost/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

import { blogEditorialFingerprint } from "@/lib/blogContract";
const saved = {
  _id: "post_approved", channelId: "corvo-blog", title: "Server Title", content: "Server Content",
  approvalState: "approved", scheduledDate: "2026-06-01", scheduledTime: "10:00", timezone: "America/New_York",
  blogExcerpt: "Server excerpt", blogAuthor: "Server Author", blogTags: ["server-tag"],
  blogCategory: "strategy", blogSlug: "my-cool-post", blogPublicationIntent: "published" as const,
  heroImageStorageId: "source-storage", preparedHero: {sourceStorageId:"source-storage", storageId:"derivative", width:1600, height:900, mimeType:"image/webp", byteLength:1000, sha256:"fixture-hash", crop:"centre"},
  coverImageAlt: "  Exact approved alt.  ", heroImageUrl: "https://cdn.example.com/server-hero.jpg",
};
const approvedPost = { ...saved, contentFingerprint: blogEditorialFingerprint(saved) };

describe("POST /api/publish saved export contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    mockConvexQuery.mockResolvedValue(approvedPost);
    vi.mocked(auth).mockResolvedValue({ userId: "user_123", getToken: vi.fn().mockResolvedValue("convex-token") } as unknown as Awaited<ReturnType<typeof auth>>);
  });
  it("requires authentication", async () => {
    vi.mocked(auth).mockResolvedValueOnce({userId: null} as unknown as Awaited<ReturnType<typeof auth>>);
    expect((await POST(makeRequest({postId: "post_approved"}))).status).toBe(401);
    expect(createBlogPostPR).not.toHaveBeenCalled();
  });
  it.each(["status", "content", "coverImageAlt", "scheduledDate", "featured"])("rejects a client %s override before provider writes", async key => {
    expect((await POST(makeRequest({postId: "post_approved", [key]: "tampered"}))).status).toBe(400);
    expect(createBlogPostPR).not.toHaveBeenCalled();
  });
  it("exports exact saved approved metadata with no paid alt enrichment", async () => {
    expect((await POST(makeRequest({postId: "post_approved"}))).status).toBe(200);
    expect(createBlogPostPR).toHaveBeenCalledWith(expect.objectContaining({status: "published", content: saved.content, coverImageAlt: saved.coverImageAlt, slug: saved.blogSlug}));
    expect(enrichPublishImageAlts).not.toHaveBeenCalled();
  });
  it.each([{approvalState: "unapproved"}, {content: "Changed"}, {coverImageAlt: "Changed"}, {blogPublicationIntent: undefined}])("rejects legacy or stale approved snapshots %j", async change => {
    mockConvexQuery.mockResolvedValueOnce({...approvedPost, ...change});
    expect((await POST(makeRequest({postId: "post_approved"}))).status).toBe(403);
    expect(createBlogPostPR).not.toHaveBeenCalled();
  });
  it("returns contract errors without raw provider data", async () => {
    vi.mocked(createBlogPostPR).mockRejectedValueOnce(new BlogPostContractError(["Invalid MDX"]));
    const res = await POST(makeRequest({postId: "post_approved"}));
    expect(res.status).toBe(400); expect((await res.json()).issues).toEqual(["Invalid MDX"]);
  });
});

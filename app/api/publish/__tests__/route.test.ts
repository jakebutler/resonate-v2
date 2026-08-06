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

const approvedPost = {
  _id: "post_approved",
  title: "Server Title",
  content: "Server Content",
  approvalState: "approved" as const,
  scheduledDate: "2026-06-01",
  scheduledTime: "10:00",
  timezone: "America/New_York",
  blogExcerpt: "Server excerpt",
  blogAuthor: "Server Author",
  blogTags: ["server-tag"],
  blogCategory: "server-category",
  blogSlug: "My Cool Post!!",
  heroImageUrl: "https://cdn.example.com/server-hero.jpg",
}

describe("POST /api/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud"
    mockConvexQuery.mockResolvedValue(approvedPost)
    vi.mocked(auth).mockResolvedValue({
      userId: "user_123",
      getToken: vi.fn().mockResolvedValue("convex-token"),
    } as Awaited<ReturnType<typeof auth>>)
  })

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as Awaited<ReturnType<typeof auth>>)
    const res = await POST(makeRequest({ postId: "post_approved" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when postId is missing", async () => {
    const res = await POST(makeRequest({ title: "T", content: "C" }))
    expect(res.status).toBe(400)
    expect(createBlogPostPR).not.toHaveBeenCalled()
  })

  it("returns 200 with prUrl and branchName on success", async () => {
    const res = await POST(
      makeRequest({
        postId: "post_approved",
        scheduleTrigger: "pr-body",
        status: "scheduled",
      })
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.prUrl).toBe("https://github.com/org/repo/pull/1")
    expect(data.branchName).toBeDefined()
    expect(data.sanitizedResponse).toMatchObject({
      repo: "jakebutler/corvo-labs-dot-com",
      number: 1,
      state: "open",
    })
  })

  it("calls createBlogPostPR with server fields and normalized slug", async () => {
    await POST(
      makeRequest({
        postId: "post_approved",
        scheduleTrigger: "pr-body",
        status: "scheduled",
      })
    )
    expect(createBlogPostPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Server Title",
        content: "Server Content",
        scheduledDate: "2026-06-01",
        scheduledTime: "10:00",
        timezone: "America/New_York",
        scheduleTrigger: "pr-body",
        status: "scheduled",
        excerpt: "Server excerpt",
        author: "Server Author",
        tags: ["server-tag"],
        category: "server-category",
        slug: "my-cool-post",
      })
    )
  })

  it("forwards optional schedule/feature metadata without accepting client blog fields", async () => {
    await POST(
      makeRequest({
        postId: "post_approved",
        scheduleTrigger: "frontmatter",
        status: "scheduled",
        subtitle: "A subtitle",
        excerpt: "Client SEO",
        author: "Client Author",
        tags: ["client-tag"],
        category: "client-category",
        featured: true,
        coverImageAlt: "A descriptive cover image caption.",
      })
    )

    expect(createBlogPostPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Server Title",
        content: "Server Content",
        scheduleTrigger: "frontmatter",
        status: "scheduled",
        subtitle: "A subtitle",
        excerpt: "Server excerpt",
        author: "Server Author",
        tags: ["server-tag"],
        category: "server-category",
        featured: true,
        coverImageAlt: "A descriptive cover image caption.",
        images: [
          expect.objectContaining({
            sourceUrl: "https://cdn.example.com/server-hero.jpg",
            isCover: true,
          }),
        ],
      })
    )
    expect(enrichPublishImageAlts).toHaveBeenCalledWith({
      title: "Server Title",
      excerpt: "Server excerpt",
      coverImageAlt: "A descriptive cover image caption.",
      images: [
        expect.objectContaining({
          sourceUrl: "https://cdn.example.com/server-hero.jpg",
          isCover: true,
        }),
      ],
    })
  })

  it("returns 400 when optional metadata has the wrong shape", async () => {
    const res = await POST(
      makeRequest({
        postId: "post_approved",
        featured: "true",
        scheduleTrigger: "auto-merge",
      })
    )

    expect(res.status).toBe(400)
    expect(createBlogPostPR).not.toHaveBeenCalled()
  })

  it("rejects incomplete server metadata instead of filling from the client", async () => {
    mockConvexQuery.mockResolvedValueOnce({ ...approvedPost, blogTags: [] })

    const res = await POST(
      makeRequest({
        postId: "post_approved",
        tags: ["corvo-labs", "strategy"],
      })
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toMatch(/tags/)
    expect(createBlogPostPR).not.toHaveBeenCalled()
  })

  it("returns 400 with contract issues for BlogPostContractError", async () => {
    vi.mocked(createBlogPostPR).mockRejectedValueOnce(
      new BlogPostContractError(["Frontmatter `tags` must contain at least one tag."])
    )

    const res = await POST(makeRequest({ postId: "post_approved" }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.issues).toEqual(["Frontmatter `tags` must contain at least one tag."])
  })

  it("returns 500 when createBlogPostPR throws", async () => {
    vi.mocked(createBlogPostPR).mockRejectedValueOnce(new Error("GitHub API down"))
    const res = await POST(makeRequest({ postId: "post_approved" }))
    expect(res.status).toBe(500)
  })

  it("returns 403 when postId is provided but post is not approved", async () => {
    mockConvexQuery.mockResolvedValueOnce({ ...approvedPost, approvalState: "unapproved" })

    const res = await POST(
      makeRequest({
        postId: "post_approved",
        title: "Client Title",
        content: "Client Content",
      })
    )

    expect(res.status).toBe(403)
    expect(createBlogPostPR).not.toHaveBeenCalled()
  })

  it("ignores client title/content overrides for approved posts", async () => {
    const res = await POST(
      makeRequest({
        postId: "post_approved",
        title: "Client Title",
        content: "Client Content",
        excerpt: "Client excerpt",
      })
    )

    expect(res.status).toBe(200)
    expect(createBlogPostPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Server Title",
        content: "Server Content",
        excerpt: "Server excerpt",
        author: "Server Author",
        tags: ["server-tag"],
        category: "server-category",
        images: [
          expect.objectContaining({
            sourceUrl: "https://cdn.example.com/server-hero.jpg",
            isCover: true,
          }),
        ],
      })
    )
  })
})

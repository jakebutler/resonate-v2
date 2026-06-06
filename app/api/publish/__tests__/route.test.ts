import type { NextRequest } from "next/server"
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_123" }),
}))

vi.mock("@/lib/github", () => ({
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
}))

vi.mock("@/lib/imageAlt", () => ({
  enrichPublishImageAlts: vi.fn(async ({ coverImageAlt, images }) => ({
    coverImageAlt,
    images,
  })),
}))

import { POST } from "@/app/api/publish/route"
import { auth } from "@clerk/nextjs/server"
import { createBlogPostPR } from "@/lib/github"
import { enrichPublishImageAlts } from "@/lib/imageAlt"

function makeRequest(body: object): NextRequest {
  return new Request("http://localhost/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

describe("POST /api/publish", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as Awaited<ReturnType<typeof auth>>)
    const res = await POST(makeRequest({ title: "T", content: "C" }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when title is missing", async () => {
    const res = await POST(makeRequest({ content: "Body" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when content is missing", async () => {
    const res = await POST(makeRequest({ title: "Title" }))
    expect(res.status).toBe(400)
  })

  it("returns 200 with prUrl and branchName on success", async () => {
    const res = await POST(makeRequest({ title: "Hello", content: "World", scheduledDate: "2026-03-04", status: "scheduled" }))
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

  it("calls createBlogPostPR with correct params", async () => {
    await POST(makeRequest({ title: "My Post", content: "Content here", scheduledDate: "2026-05-01", scheduledTime: "09:00", timezone: "America/Los_Angeles", scheduleTrigger: "pr-body", status: "scheduled" }))
    expect(createBlogPostPR).toHaveBeenCalledWith({
      title: "My Post",
      content: "Content here",
      scheduledDate: "2026-05-01",
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
      scheduleTrigger: "pr-body",
      status: "scheduled",
    })
  })

  it("forwards repo-specific publish metadata", async () => {
    await POST(makeRequest({
      title: "My Post",
      content: "Content here",
      scheduledDate: "2026-05-01",
      scheduledTime: "13:45",
      timezone: "America/New_York",
      scheduleTrigger: "frontmatter",
      status: "scheduled",
      subtitle: "A subtitle",
      excerpt: "SEO",
      author: "Jake Butler",
      tags: ["ai"],
      category: "strategy",
      featured: true,
      coverImageAlt: "A descriptive cover image caption.",
      images: [
        {
          sourceUrl: "https://cdn.example.com/hero.webp",
          alt: "A descriptive cover image caption.",
          isCover: true,
        },
      ],
    }))

    expect(createBlogPostPR).toHaveBeenCalledWith({
      title: "My Post",
      content: "Content here",
      scheduledDate: "2026-05-01",
      scheduledTime: "13:45",
      timezone: "America/New_York",
      scheduleTrigger: "frontmatter",
      status: "scheduled",
      subtitle: "A subtitle",
      excerpt: "SEO",
      author: "Jake Butler",
      tags: ["ai"],
      category: "strategy",
      featured: true,
      coverImageAlt: "A descriptive cover image caption.",
      images: [
        {
          sourceUrl: "https://cdn.example.com/hero.webp",
          alt: "A descriptive cover image caption.",
          isCover: true,
        },
      ],
    })
    expect(enrichPublishImageAlts).toHaveBeenCalledWith({
      title: "My Post",
      excerpt: "SEO",
      coverImageAlt: "A descriptive cover image caption.",
      images: [
        {
          sourceUrl: "https://cdn.example.com/hero.webp",
          alt: "A descriptive cover image caption.",
          isCover: true,
        },
      ],
    })
  })

  it("returns 400 when optional metadata has the wrong shape", async () => {
    const res = await POST(
      makeRequest({
        title: "My Post",
        content: "Content here",
        images: [{ sourceUrl: 123 }],
        tags: "ai",
        featured: "true",
        scheduleTrigger: "auto-merge",
      })
    )

    expect(res.status).toBe(400)
    expect(createBlogPostPR).not.toHaveBeenCalled()
  })

  it("returns 500 when createBlogPostPR throws", async () => {
    vi.mocked(createBlogPostPR).mockRejectedValueOnce(new Error("GitHub API down"))
    const res = await POST(makeRequest({ title: "T", content: "C" }))
    expect(res.status).toBe(500)
  })
})

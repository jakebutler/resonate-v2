import type { Id } from "@/convex/_generated/dataModel"
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ContentLibrary } from "@/components/ContentLibrary/ContentLibrary"

beforeAll(() => vi.setSystemTime(new Date('2026-03-04T12:00:00Z')))
afterAll(() => vi.useRealTimers())

const basePosts = [
  { _id: "p1" as Id<"posts">, type: "blog" as const, title: "Alpha Post", content: "", status: "draft" as const, scheduledDate: "2026-03-04", createdAt: Date.now() - 2000, updatedAt: Date.now() - 2000 },
  { _id: "p2" as Id<"posts">, type: "linkedin" as const, title: undefined, content: "LinkedIn content", status: "scheduled" as const, scheduledDate: "2026-03-04", createdAt: Date.now() - 1000, updatedAt: Date.now() - 1000 },
  { _id: "p3" as Id<"posts">, type: "blog" as const, title: "Old Post", content: "", status: "published" as const, scheduledDate: "2025-06-01", createdAt: Date.now(), updatedAt: Date.now() },
]

describe('ContentLibrary', () => {
  it('shows empty state when no posts match filter', () => {
    render(<ContentLibrary posts={[]} filter="all" timePeriod="all" onEditPost={vi.fn()} />)
    expect(screen.getByText('No content matches these filters')).toBeInTheDocument()
  })

  it('filters to blog posts only', () => {
    render(<ContentLibrary posts={basePosts} filter="blog" timePeriod="all" onEditPost={vi.fn()} />)
    expect(screen.getByText('Alpha Post')).toBeInTheDocument()
    expect(screen.queryByText('LinkedIn content')).not.toBeInTheDocument()
  })

  it('filters to linkedin posts only', () => {
    render(<ContentLibrary posts={basePosts} filter="linkedin" timePeriod="all" onEditPost={vi.fn()} />)
    expect(screen.queryByText('Alpha Post')).not.toBeInTheDocument()
    expect(screen.getByText('LinkedIn content')).toBeInTheDocument()
  })

  it('shows all posts with filter=all', () => {
    render(<ContentLibrary posts={basePosts} filter="all" timePeriod="all" onEditPost={vi.fn()} />)
    expect(screen.getByText('Alpha Post')).toBeInTheDocument()
    expect(screen.getByText('LinkedIn content')).toBeInTheDocument()
  })

  it('filters to this-month only', () => {
    render(<ContentLibrary posts={basePosts} filter="all" timePeriod="this-month" onEditPost={vi.fn()} />)
    expect(screen.getByText('Alpha Post')).toBeInTheDocument()
    expect(screen.queryByText('Old Post')).not.toBeInTheDocument()
  })

  it('filters to this-year only', () => {
    render(<ContentLibrary posts={basePosts} filter="all" timePeriod="this-year" onEditPost={vi.fn()} />)
    expect(screen.getByText('Alpha Post')).toBeInTheDocument()
    expect(screen.queryByText('Old Post')).not.toBeInTheDocument()
  })

  it('shows scheduled date formatted correctly', () => {
    render(<ContentLibrary posts={basePosts} filter="blog" timePeriod="all" onEditPost={vi.fn()} />)
    expect(screen.getByText('Mar 4, 2026')).toBeInTheDocument()
  })

  it('shows — for posts without a scheduled date', () => {
    const posts = [{ _id: "p1" as Id<"posts">, type: "blog" as const, title: "No Date", content: "", status: "draft" as const, scheduledDate: undefined, createdAt: Date.now(), updatedAt: Date.now() }]
    render(<ContentLibrary posts={posts} filter="all" timePeriod="all" onEditPost={vi.fn()} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('truncates long linkedin content to 72 chars', () => {
    const longContent = 'A'.repeat(100)
    const posts = [{ _id: "p1" as Id<"posts">, type: "linkedin" as const, title: undefined, content: longContent, status: "draft" as const, scheduledDate: "2026-03-04", createdAt: Date.now(), updatedAt: Date.now() }]
    render(<ContentLibrary posts={posts} filter="all" timePeriod="all" onEditPost={vi.fn()} />)
    const title = screen.getByText(/A{72}…/)
    expect(title).toBeInTheDocument()
  })

  it('calls onEditPost when a post row is clicked', () => {
    const onEditPost = vi.fn()
    render(<ContentLibrary posts={basePosts} filter="blog" timePeriod="all" onEditPost={onEditPost} />)
    fireEvent.click(screen.getByText('Alpha Post'))
    expect(onEditPost).toHaveBeenCalledWith(basePosts[0])
  })
})

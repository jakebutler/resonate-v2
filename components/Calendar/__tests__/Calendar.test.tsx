import type { Id } from "@/convex/_generated/dataModel"
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Calendar } from "@/components/Calendar/Calendar"

// Pin date to March 4 2026 (Wednesday)
beforeAll(() => vi.setSystemTime(new Date('2026-03-04T12:00:00Z')))
afterAll(() => vi.useRealTimers())

const mockPosts = [
  { _id: "p1" as Id<"posts">, type: "blog" as const, title: "My Blog Post", content: "", status: "scheduled" as const, scheduledDate: "2026-03-04", createdAt: 0, updatedAt: 0 },
  { _id: "p2" as Id<"posts">, type: "linkedin" as const, title: undefined, content: "LinkedIn text", status: "draft" as const, scheduledDate: "2026-03-04", createdAt: 0, updatedAt: 0 },
]

describe('Calendar', () => {
  it('renders the current month label', () => {
    render(<Calendar posts={[]} filter="all" onCreatePost={vi.fn()} onEditPost={vi.fn()} />)
    expect(screen.getByText('March 2026')).toBeInTheDocument()
  })

  it('navigates to previous month on left chevron click', () => {
    render(<Calendar posts={[]} filter="all" onCreatePost={vi.fn()} onEditPost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByText('February 2026')).toBeInTheDocument()
  })

  it('navigates to next month on right chevron click', () => {
    render(<Calendar posts={[]} filter="all" onCreatePost={vi.fn()} onEditPost={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('April 2026')).toBeInTheDocument()
  })

  it('displays a blog post on its scheduled date', () => {
    render(<Calendar posts={mockPosts} filter="all" onCreatePost={vi.fn()} onEditPost={vi.fn()} />)
    expect(screen.getByText('My Blog Post')).toBeInTheDocument()
  })

  it('displays a linkedin post on its scheduled date', () => {
    render(<Calendar posts={mockPosts} filter="all" onCreatePost={vi.fn()} onEditPost={vi.fn()} />)
    expect(screen.getByText('LinkedIn text')).toBeInTheDocument()
  })

  it('hides linkedin posts when filter is blog', () => {
    render(<Calendar posts={mockPosts} filter="blog" onCreatePost={vi.fn()} onEditPost={vi.fn()} />)
    expect(screen.queryByText('LinkedIn text')).not.toBeInTheDocument()
    expect(screen.getByText('My Blog Post')).toBeInTheDocument()
  })

  it('hides blog posts when filter is linkedin', () => {
    render(<Calendar posts={mockPosts} filter="linkedin" onCreatePost={vi.fn()} onEditPost={vi.fn()} />)
    expect(screen.queryByText('My Blog Post')).not.toBeInTheDocument()
    expect(screen.getByText('LinkedIn text')).toBeInTheDocument()
  })

  it('calls onEditPost when a post pill is clicked', () => {
    const onEditPost = vi.fn()
    render(<Calendar posts={mockPosts} filter="all" onCreatePost={vi.fn()} onEditPost={onEditPost} />)
    fireEvent.click(screen.getByText('My Blog Post'))
    expect(onEditPost).toHaveBeenCalledWith(mockPosts[0])
  })
})

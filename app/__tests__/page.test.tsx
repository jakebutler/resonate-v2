import type { ReactNode } from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { useQuery } from "convex/react"
import Dashboard from "@/app/page"

const mockPush = vi.fn()

vi.mock("convex/react", () => ({ useQuery: vi.fn(), useMutation: vi.fn() }))
vi.mock("@/convex/_generated/api", () => ({
  api: { posts: { list: "posts:list" } }
}))
vi.mock("@clerk/nextjs", () => ({
  UserButton: () => <div data-testid="user-button" />,
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))
vi.mock("@/components/Calendar/Calendar", () => ({
  Calendar: ({
    onCreatePost,
    onEditPost,
  }: {
    onCreatePost: (date: string) => void
    onEditPost: (post: { _id: string; type: "blog" | "linkedin" }) => void
  }) => (
    <div data-testid="calendar">
      <button onClick={() => onCreatePost("2026-03-04")}>add-post</button>
      <button onClick={() => onEditPost({ _id: "blog-1", type: "blog" })}>edit-blog</button>
      <button onClick={() => onEditPost({ _id: "linkedin-1", type: "linkedin" })}>edit-linkedin</button>
    </div>
  ),
}))
vi.mock("@/components/ContentLibrary/ContentLibrary", () => ({
  ContentLibrary: ({
    onEditPost,
  }: {
    onEditPost: (post: { _id: string; type: "blog" | "linkedin" }) => void
  }) => (
    <div data-testid="content-library">
      <button onClick={() => onEditPost({ _id: "blog-2", type: "blog" })}>library-edit-blog</button>
    </div>
  ),
}))
vi.mock("@/components/CreatePostModal/CreatePostModal", () => ({
  CreatePostModal: ({
    open,
    onSelect,
  }: {
    open: boolean
    onSelect: (type: "blog" | "linkedin") => void
  }) =>
    open ? (
      <div data-testid="create-post-modal">
        <button onClick={() => onSelect("blog")}>blog</button>
        <button onClick={() => onSelect("linkedin")}>linkedin</button>
      </div>
    ) : null,
}))
vi.mock("@/components/WorkflowBoard/WorkflowBoard", () => ({
  WorkflowBoard: () => <div data-testid="workflow-board" />,
}))
vi.mock("@/components/LinkedInPostEditor/LinkedInPostEditor", () => ({
  LinkedInPostEditor: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div data-testid="linkedin-editor"><button onClick={onClose}>close-linkedin</button></div> : null,
}))
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useQuery).mockReturnValue([] as never)
  })

  it("does not render the summary stats strip", () => {
    render(<Dashboard />)
    expect(screen.queryByText("Blog Posts")).not.toBeInTheDocument()
    expect(screen.queryByText("LinkedIn Posts")).not.toBeInTheDocument()
    expect(screen.getByText("Publishing Calendar")).toBeInTheDocument()
    expect(screen.queryByText("Publishing view")).not.toBeInTheDocument()
    expect(
      screen.queryByText("Place content on the schedule, then jump into drafting when a date needs a post.")
    ).not.toBeInTheDocument()
  })

  it("shows Calendar by default", () => {
    render(<Dashboard />)
    expect(screen.getByTestId("calendar")).toBeInTheDocument()
    expect(screen.queryByTestId("content-library")).not.toBeInTheDocument()
  })

  it("switches to Library view when Library tab clicked", () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByText("Library"))
    expect(screen.getByTestId("content-library")).toBeInTheDocument()
    expect(screen.queryByTestId("calendar")).not.toBeInTheDocument()
  })

  it("switches to Workflow view when Kanban tab clicked", () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByText("Kanban"))
    expect(screen.getByTestId("workflow-board")).toBeInTheDocument()
    expect(screen.queryByText("Active board")).not.toBeInTheDocument()
    expect(
      screen.queryByText("Capture ideas, pull inspiration forward, and move each post through one clear stage at a time.")
    ).not.toBeInTheDocument()
  })

  it("opens CreatePostModal when calendar add-post is clicked", () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByText("add-post"))
    expect(screen.getByTestId("create-post-modal")).toBeInTheDocument()
  })

  it("routes new blog creation to the fullscreen editor", () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByText("add-post"))
    fireEvent.click(screen.getByText("blog"))
    expect(mockPush).toHaveBeenCalledWith("/editor/new?date=2026-03-04")
  })

  it("opens LinkedInPostEditor when linkedin is selected in modal", () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByText("add-post"))
    fireEvent.click(screen.getByText("linkedin"))
    expect(screen.getByTestId("linkedin-editor")).toBeInTheDocument()
  })

  it("routes blog edits from the calendar to the fullscreen editor", () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByText("edit-blog"))
    expect(mockPush).toHaveBeenCalledWith("/editor/blog-1")
  })

  it("keeps LinkedIn edits on the existing modal flow", () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByText("edit-linkedin"))
    expect(screen.getByTestId("linkedin-editor")).toBeInTheDocument()
  })

  it("routes blog edits from the library to the fullscreen editor", () => {
    render(<Dashboard />)
    fireEvent.click(screen.getByText("Library"))
    fireEvent.click(screen.getByText("library-edit-blog"))
    expect(mockPush).toHaveBeenCalledWith("/editor/blog-2")
  })

  it("renders UserButton in header", () => {
    render(<Dashboard />)
    expect(screen.getByTestId("user-button")).toBeInTheDocument()
  })

  it('renders an Ideas navigation link', () => {
    render(<Dashboard />)
    expect(screen.getByRole('link', { name: 'Ideas' })).toBeInTheDocument()
  })
})

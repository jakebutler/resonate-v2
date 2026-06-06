import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useQuery, useMutation } from 'convex/react'
import { Id } from '@/convex/_generated/dataModel'
import { LinkedInPostEditor } from '@/components/LinkedInPostEditor/LinkedInPostEditor'

vi.mock('convex/react', () => ({ useQuery: vi.fn(), useMutation: vi.fn() }))
vi.mock('@/convex/_generated/api', () => ({
  api: {
    posts: {
      getById: 'posts:getById',
      list: 'posts:list',
      create: 'posts:create',
      update: 'posts:update',
      remove: 'posts:remove',
    }
  }
}))
vi.mock('@/components/AIAssistant/AIAssistant', () => ({
  AIAssistant: ({ onUsePost }: { onUsePost: (text: string) => void }) => (
    <button onClick={() => onUsePost('Generated text')}>use-post-btn</button>
  ),
}))

function futureDateYMD() {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date.toISOString().slice(0, 10)
}

describe('LinkedInPostEditor', () => {
  const mockCreate = vi.fn().mockResolvedValue('new_id')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useQuery).mockReturnValue(undefined)
    vi.mocked(useMutation).mockReturnValue(mockCreate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not render when open is false', () => {
    render(<LinkedInPostEditor open={false} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    expect(screen.queryByText(/linkedin/i)).not.toBeInTheDocument()
  })

  it('shows character counter at 0 / 3,000 initially', () => {
    render(<LinkedInPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    expect(screen.getByText('0 / 3,000')).toBeInTheDocument()
  })

  it('updates character counter as user types', async () => {
    render(<LinkedInPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    const textarea = screen.getByRole('textbox', { name: '' })
    await userEvent.type(textarea, 'Hello')
    expect(screen.getByText('5 / 3,000')).toBeInTheDocument()
  })

  it('URL field hidden initially; appears when repost checkbox checked', async () => {
    render(<LinkedInPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    expect(screen.queryByPlaceholderText(/linkedin\.com\/posts/i)).not.toBeInTheDocument()
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(screen.getByPlaceholderText(/linkedin\.com\/posts/i)).toBeInTheDocument()
  })

  it('fills content from AIAssistant onUsePost and switches to write tab', async () => {
    render(<LinkedInPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    // Switch to AI tab
    fireEvent.click(screen.getByText(/ai assistant/i))
    // Trigger onUsePost
    fireEvent.click(screen.getByText('use-post-btn'))
    // Should switch back to write tab with content populated
    await waitFor(() => {
      const textarea = screen.getByRole('textbox', { name: '' }) as HTMLTextAreaElement
      expect(textarea.value).toBe('Generated text')
    })
  })

  it('calls onClose when Cancel clicked', () => {
    const onClose = vi.fn()
    render(<LinkedInPostEditor open={true} onClose={onClose} onSaved={vi.fn()} postId={null} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('hydrates existing post data into the editor', async () => {
    const scheduledDate = futureDateYMD()
    vi.mocked(useQuery).mockImplementation((fn) => {
      if (String(fn).includes('getById')) {
        return {
          _id: 'post-1',
          type: 'linkedin',
          content: 'Existing LinkedIn content',
          status: 'scheduled',
          scheduledDate,
          scheduledTime: '14:00',
          isRepost: true,
          externalUrl: 'https://www.linkedin.com/posts/example',
          linkedBlogPostId: 'blog-1',
        } as never
      }
      return [{ _id: 'blog-1', title: 'Linked blog' }] as never
    })

    render(<LinkedInPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={'post-1' as Id<'posts'>} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Existing LinkedIn content')).toBeInTheDocument()
      expect(screen.getByDisplayValue(scheduledDate)).toBeInTheDocument()
      expect(screen.getByDisplayValue('https://www.linkedin.com/posts/example')).toBeInTheDocument()
    })
  })

  it('shows preview mode for posts scheduled in the past', async () => {
    vi.mocked(useQuery).mockImplementation((fn) => {
      if (String(fn).includes('getById')) {
        return {
          _id: 'post-1',
          type: 'linkedin',
          content: 'Past LinkedIn content',
          status: 'published',
          scheduledDate: '2000-01-01',
          scheduledTime: '09:00',
          isRepost: false,
          linkedBlogPostId: 'blog-1',
        } as never
      }
      return [{ _id: 'blog-1', title: 'Linked blog' }] as never
    })

    render(<LinkedInPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={'post-1' as Id<'posts'>} />)

    await waitFor(() => {
      expect(screen.getByText('View LinkedIn Post')).toBeInTheDocument()
      expect(screen.getByText('Post Preview')).toBeInTheDocument()
      expect(screen.getByText('Past LinkedIn content')).toBeInTheDocument()
    })

    expect(screen.queryByPlaceholderText(/share with your network/i)).not.toBeInTheDocument()
    expect(screen.queryByText('AI Assistant')).not.toBeInTheDocument()
  })
})

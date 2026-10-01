import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAction, useQuery, useMutation } from 'convex/react'
import { Id } from '@/convex/_generated/dataModel'
import { BlogPostEditor } from '@/components/BlogPostEditor/BlogPostEditor'

vi.mock('convex/react', () => ({ useAction: vi.fn(), useQuery: vi.fn(), useMutation: vi.fn() }))
vi.mock('@/components/AIAssistant/AIAssistant', () => ({
  AIAssistant: ({ onUsePost }: { onUsePost: (text: string) => void }) => (
    <button onClick={() => onUsePost('# Draft from AI')}>use-blog-ai</button>
  ),
}))
vi.mock('@/convex/_generated/api', () => ({
  api: {
    v2Storage: { uploadImage: "v2Storage:uploadImage" },
    posts: {
      getById: 'posts:getById',
      create: 'posts:create',
      update: 'posts:update',
      remove: 'posts:remove',
      generateUploadUrl: 'posts:generateUploadUrl',
    }
  }
}))

function futureDateYMD() {
  const date = new Date()
  date.setDate(date.getDate() + 7)
  return date.toISOString().slice(0, 10)
}

describe('BlogPostEditor', () => {
  it.each(['reopen', 'change post'])('clears an attachment error on editor session %s', async (transition) => {
    vi.mocked(useAction).mockReturnValue(vi.fn().mockRejectedValue(new Error('Previous attachment rejected')))
    const props = { open: true, onClose: vi.fn(), onSaved: vi.fn(), postId: null }
    const view = render(<BlogPostEditor {...props} />)
    const file = new File(['image'], 'old.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1]).buffer })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Previous attachment rejected')
    if (transition === 'reopen') {
      view.rerender(<BlogPostEditor {...props} open={false} />)
      view.rerender(<BlogPostEditor {...props} />)
    } else {
      vi.mocked(useQuery).mockReturnValue({ _id: 'other', title: 'Other post', content: '', status: 'draft', fileIds: [] } as never)
      view.rerender(<BlogPostEditor {...props} postId={'other' as Id<'posts'>} />)
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not start an old session upload after its file read finishes in another post', async () => {
    let finishRead: (bytes: ArrayBuffer) => void = () => {}
    const pendingRead = new Promise<ArrayBuffer>(resolve => { finishRead = resolve })
    const upload = vi.fn().mockResolvedValue({ storageId: 'old-session-storage' })
    vi.mocked(useAction).mockReturnValue(upload)
    const props = { open: true, onClose: vi.fn(), onSaved: vi.fn(), postId: null }
    const view = render(<BlogPostEditor {...props} />)
    const file = new File(['png'], 'old.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', { value: () => pendingRead })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    vi.mocked(useQuery).mockReturnValue({ _id: 'other', title: 'Other post', content: '', status: 'draft', fileIds: [] } as never)
    view.rerender(<BlogPostEditor {...props} postId={'other' as Id<'posts'>} />)
    await act(async () => { finishRead(new Uint8Array([1]).buffer); await pendingRead })
    expect(upload).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Save Draft'))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'other', fileIds: [] })))
  })

  it.each(['success', 'failure'])('ignores an old session upload %s after changing post', async (outcome) => {
    let settle: () => void = () => {}
    const pendingUpload = new Promise<{ storageId: string }>((resolve, reject) => {
      settle = () => outcome === 'success' ? resolve({ storageId: 'old-session-storage' }) : reject(new Error('Old session rejection'))
    })
    const upload = vi.fn().mockReturnValue(pendingUpload)
    vi.mocked(useAction).mockReturnValue(upload)
    const props = { open: true, onClose: vi.fn(), onSaved: vi.fn(), postId: null }
    const view = render(<BlogPostEditor {...props} />)
    const file = new File(['png'], 'old.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1]).buffer })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } })
    await waitFor(() => expect(upload).toHaveBeenCalledOnce())
    vi.mocked(useQuery).mockReturnValue({ _id: 'other', title: 'Other post', content: '', status: 'draft', fileIds: [] } as never)
    view.rerender(<BlogPostEditor {...props} postId={'other' as Id<'posts'>} />)
    await act(async () => { settle(); await pendingUpload.catch(() => {}) })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Save Draft'))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'other', fileIds: [] })))
  })

  it('does not append a returned attachment storage ID again on an explicit retry', async () => {
    const upload = vi.fn().mockResolvedValue({ storageId: 'same-storage' })
    vi.mocked(useAction).mockReturnValue(upload)
    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    const file = new File(['png'], 'hero.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1]).buffer })
    const picker = document.querySelector('input[type="file"]')!
    fireEvent.change(picker, { target: { files: [file] } })
    await screen.findByText('1 file(s) attached')
    fireEvent.change(picker, { target: { files: [file] } })
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2))
    fireEvent.click(screen.getByText('Save Draft'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ fileIds: ['same-storage'] })))
  })

  it('continues a mixed attachment selection and names the rejected file without discarding successes', async () => {
    const upload = vi.fn().mockImplementation(async ({ fileName }: { fileName: string }) => ({ storageId: fileName }))
    vi.mocked(useAction).mockReturnValue(upload)
    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    const files = [
      new File(['png'], 'first.png', { type: 'image/png' }),
      new File(['svg'], 'unsupported.svg', { type: 'image/svg+xml' }),
      new File(['webp'], 'last.webp', { type: 'image/webp' }),
    ]
    for (const file of files) Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1]).buffer })
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files } })
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('unsupported.svg')
    expect(alert).toHaveTextContent('2 images attached')
    expect(alert).not.toHaveTextContent('Image upload failed:')
    expect(upload.mock.calls.map(([args]) => args.fileName)).toEqual(['first.png', 'last.webp'])
    fireEvent.click(screen.getByText('Save Draft'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ fileIds: ['first.png', 'last.webp'] })))
  })

  it('advertises only supported raster images and shows a rejected attachment without saving it', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('Image exceeds 5 MiB'))
    vi.mocked(useAction).mockReturnValue(upload)
    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    const picker = document.querySelector('input[type="file"]')!
    expect(picker).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp')
    const file = new File(['image'], 'hero.png', { type: 'image/png' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1]).buffer })
    fireEvent.change(picker, { target: { files: [file] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('Image exceeds 5 MiB')
    expect(upload).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/file\(s\) attached/)).not.toBeInTheDocument()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  const mockCreate = vi.fn().mockResolvedValue('new_id')
  const mockUpdate = vi.fn().mockResolvedValue(undefined)
  const mockRemove = vi.fn().mockResolvedValue(undefined)
  const mockGenerateUploadUrl = vi.fn().mockResolvedValue('https://upload.url')

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAction).mockReturnValue(vi.fn().mockResolvedValue({ storageId: "fixture-storage" }))
    vi.stubGlobal('fetch', vi.fn())
    vi.mocked(useQuery).mockReturnValue(undefined)
    vi.mocked(useMutation).mockImplementation((fn) => {
      const key = String(fn)
      if (key.includes('create')) return mockCreate
      if (key.includes('update')) return mockUpdate
      if (key.includes('remove')) return mockRemove
      if (key.includes('generateUploadUrl')) return mockGenerateUploadUrl
      return vi.fn()
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('does not render when open is false', () => {
    render(<BlogPostEditor open={false} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    expect(screen.queryByText(/blog post/i)).not.toBeInTheDocument()
  })

  it('shows New Blog Post title for new post', () => {
    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    expect(screen.getByText(/new blog post/i)).toBeInTheDocument()
  })

  it('switches between Write and Preview tabs', async () => {
    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    const previewTab = screen.getByText('Preview')
    fireEvent.click(previewTab)
    // Textarea should be gone after switching to preview
    expect(screen.queryByPlaceholderText(/write your blog post/i)).not.toBeInTheDocument()
  })

  it('fills content from AI Assistant and switches back to write mode', async () => {
    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    fireEvent.click(screen.getByText('AI Assistant'))
    fireEvent.click(screen.getByText('use-blog-ai'))

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText(/write your blog post/i) as HTMLTextAreaElement
      expect(textarea.value).toBe('# Draft from AI')
    })
  })

  it('calls createPost with draft status when Save Draft clicked', async () => {
    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={null} />)
    await userEvent.type(screen.getByPlaceholderText(/compelling title/i), 'My Post')
    await userEvent.type(screen.getByPlaceholderText(/write your blog post/i), 'Some content')
    fireEvent.click(screen.getByText('Save Draft'))
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', type: 'blog' })
    ))
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<BlogPostEditor open={true} onClose={onClose} onSaved={vi.fn()} postId={null} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('hydrates existing post data into the editor', async () => {
    const scheduledDate = futureDateYMD()
    const existingPost = {
      _id: 'post-1',
      type: 'blog',
      title: 'Existing title',
      content: 'Existing content',
      status: 'scheduled',
      scheduledDate,
      scheduledTime: '14:00',
      fileIds: [],
      githubPrUrl: '',
    }
    vi.mocked(useQuery).mockReturnValue(existingPost as never)

    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={'post-1' as Id<'posts'>} />)

    await waitFor(() => {
      expect(screen.getByDisplayValue('Existing title')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Existing content')).toBeInTheDocument()
      expect(screen.getByDisplayValue(scheduledDate)).toBeInTheDocument()
    })
  })

  it('shows preview mode for posts scheduled in the past', async () => {
    const existingPost = {
      _id: 'post-1',
      type: 'blog',
      title: 'Past title',
      content: 'Past content',
      status: 'published',
      scheduledDate: '2000-01-01',
      scheduledTime: '09:00',
      fileIds: [],
      githubPrUrl: '',
    }
    vi.mocked(useQuery).mockReturnValue(existingPost as never)

    render(<BlogPostEditor open={true} onClose={vi.fn()} onSaved={vi.fn()} postId={'post-1' as Id<'posts'>} />)

    await waitFor(() => {
      expect(screen.getByText('View Blog Post')).toBeInTheDocument()
      expect(screen.getByText('Content Preview')).toBeInTheDocument()
      expect(screen.getByText('Past content')).toBeInTheDocument()
    })

    expect(screen.queryByPlaceholderText(/compelling title/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/write your blog post/i)).not.toBeInTheDocument()
  })
})

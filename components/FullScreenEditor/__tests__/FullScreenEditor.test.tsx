import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useQuery, useMutation, useQueries } from 'convex/react'
import { FullScreenEditor } from '@/components/FullScreenEditor/FullScreenEditor'

// ── Convex ──────────────────────────────────────────────────────────────────
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueries: vi.fn(),
}))

vi.mock('@/convex/_generated/api', () => ({
  api: {
    posts: {
      getById: 'posts:getById',
      create: 'posts:create',
      update: 'posts:update',
      generateUploadUrl: 'posts:generateUploadUrl',
      getFileUrl: 'posts:getFileUrl',
    },
  },
}))

// ── Next.js navigation ───────────────────────────────────────────────────────
const mockPush = vi.fn()
const mockReplace = vi.fn()
const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: mockBack }),
  useSearchParams: () => ({ get: () => null }),
}))

// ── TiptapEditor — mock the whole component so ProseMirror doesn't run in jsdom ──
const mockInsertImage = vi.fn()
const mockGetHTML = vi.fn(() => '<p>Editor content area</p>')
const mockGetMarkdown = vi.fn(() => 'Editor content area')
const mockReplaceRange = vi.fn()
const mockGetTextBetween = vi.fn(() => 'Selected text')
const mockFocusEditor = vi.fn()

vi.mock('@/components/TiptapEditor/TiptapEditor', async () => {
  const React = await import('react')
  const MockTiptapEditor = React.forwardRef(
    (
        {
          onChange,
          placeholder,
          onImageInsert,
          onSelectionChange,
          onAskAI,
        }: {
          onChange?: (html: string) => void
          placeholder?: string
          onImageInsert?: () => void
          onSelectionChange?: (selection: {
            text: string
            from: number
            to: number
            top: number
            left: number
          } | null) => void
          onAskAI?: (selection: {
            text: string
            from: number
            to: number
            top: number
            left: number
          }) => void
        },
        ref: React.ForwardedRef<{
          getHTML: () => string
          getMarkdown: () => string
          setContent: (content: string) => void
          insertImage: (attrs: { src: string; alt?: string; fileId?: string }) => void
          replaceRange: (range: { from: number; to: number }, content: string) => void
          getTextBetween: (range: { from: number; to: number }) => string
          focus: () => void
          getEditor: () => null
        }>
      ) => {
        React.useImperativeHandle(ref, () => ({
          getHTML: mockGetHTML,
          getMarkdown: mockGetMarkdown,
          setContent: vi.fn(),
          insertImage: mockInsertImage,
          replaceRange: mockReplaceRange,
          getTextBetween: mockGetTextBetween,
          focus: mockFocusEditor,
          getEditor: () => null,
        }))

      return (
        <div>
          <div
            data-testid="tiptap-editor"
            contentEditable
            suppressContentEditableWarning
            data-placeholder={placeholder}
            onInput={(e) => {
              const html = (e.target as HTMLElement).innerHTML
              mockGetHTML.mockReturnValue(html)
              mockGetMarkdown.mockReturnValue(html)
              onChange?.(html)
            }}
          >
            <p>Editor content area</p>
          </div>
          {onImageInsert ? (
            <button type="button" onClick={onImageInsert}>
              Insert image
            </button>
          ) : null}
          {onSelectionChange ? (
            <button
              type="button"
              onClick={() =>
                onSelectionChange({
                  text: 'Selected text',
                  from: 2,
                  to: 9,
                  top: 100,
                  left: 120,
                })
              }
            >
              Emit selection
            </button>
          ) : null}
          {onAskAI ? (
            <button
              type="button"
              onClick={() =>
                onAskAI({
                  text: 'Selected text',
                  from: 2,
                  to: 9,
                  top: 100,
                  left: 120,
                })
              }
            >
              Ask AI
            </button>
          ) : null}
        </div>
      )
    }
  )

  MockTiptapEditor.displayName = 'MockTiptapEditor'

  return {
    TiptapEditor: MockTiptapEditor,
  }
})

vi.mock('@/lib/imageOptimize', () => ({
  optimizeImage: vi.fn(async (file: File) => file),
}))

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('FullScreenEditor', () => {
  const mockCreate = vi.fn().mockResolvedValue('new-post-id')
  const mockUpdate = vi.fn().mockResolvedValue(undefined)
  const mockGenerateUploadUrl = vi.fn().mockResolvedValue('https://upload.example.com')

  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView | undefined
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    mockCreate.mockResolvedValue('new-post-id')
    mockUpdate.mockResolvedValue(undefined)
    mockGenerateUploadUrl.mockResolvedValue('https://upload.example.com')
    mockGetHTML.mockReturnValue('<p>Editor content area</p>')
    mockGetMarkdown.mockReturnValue('Editor content area')
    mockInsertImage.mockImplementation(({ src, alt, fileId }) => {
      const html = `<p>Editor content area</p><img src="${src}" alt="${alt ?? ''}"${fileId ? ` data-file-id="${fileId}"` : ''} />`
      mockGetHTML.mockReturnValue(html)
      mockGetMarkdown.mockReturnValue(html)
    })
    // jsdom doesn't implement scrollIntoView — define it and restore in afterEach
    originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = vi.fn()

    vi.mocked(useMutation).mockImplementation(((fn: unknown) => {
      const key = fn as string
      if (key === 'posts:create') return mockCreate
      if (key === 'posts:update') return mockUpdate
      if (key === 'posts:generateUploadUrl') return mockGenerateUploadUrl
      return vi.fn()
    }) as never)
    vi.mocked(useQueries).mockReturnValue({})
    vi.stubGlobal('fetch', vi.fn())
    vi.stubGlobal('confirm', vi.fn(() => true))
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-image')
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    // Default: no existing post (new post mode)
    vi.mocked(useQuery).mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
    // Restore scrollIntoView to its original value (undefined in jsdom)
    if (originalScrollIntoView === undefined) {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    } else {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  // ── BEHAVIOR 1: renders the core UI ──────────────────────────────────────
  it('renders a large title field with placeholder "Untitled post"', () => {
    render(<FullScreenEditor postId="new" />)
    const titleInput = screen.getByPlaceholderText(/untitled post/i)
    expect(titleInput).toBeInTheDocument()
  })

  it('renders a back navigation button', () => {
    render(<FullScreenEditor postId="new" />)
    const backBtn = screen.getByRole('button', { name: /back/i })
    expect(backBtn).toBeInTheDocument()
  })

  it('renders the Tiptap editor area', () => {
    render(<FullScreenEditor postId="new" />)
    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument()
  })

  it('keeps the image tray outside the main pane scroll region', () => {
    render(<FullScreenEditor postId="new" />)

    expect(screen.getByTestId('editor-main-pane')).toHaveClass('overflow-hidden')
    expect(screen.getByRole('button', { name: /images \(0\)/i })).toBeInTheDocument()
  })

  it('renders a save status indicator', () => {
    render(<FullScreenEditor postId="new" />)
    // Initially shows "Saved" or similar status
    expect(screen.getByTestId('save-status')).toBeInTheDocument()
  })

  // ── BEHAVIOR 2: back navigation ──────────────────────────────────────────
  it('calls router.back() when back button is clicked', () => {
    render(<FullScreenEditor postId="new" />)
    const backBtn = screen.getByRole('button', { name: /back/i })
    fireEvent.click(backBtn)
    expect(mockBack).toHaveBeenCalled()
  })

  // ── BEHAVIOR 3: auto-save creates a new post on first change ────────────
  it('creates a new post after debounce when title changes', async () => {
    render(<FullScreenEditor postId="new" />)

    const titleInput = screen.getByPlaceholderText(/untitled post/i)
    fireEvent.change(titleInput, { target: { value: 'My New Post' } })

    // Before debounce fires, create should not be called
    expect(mockCreate).not.toHaveBeenCalled()

    // Advance past the 3s debounce
    await act(async () => {
      vi.advanceTimersByTime(3100)
      await Promise.resolve()
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'blog',
        title: 'My New Post',
      })
    )
    expect(mockReplace).toHaveBeenCalledWith('/editor/new-post-id')
  })

  it('shows "Saving..." while auto-save is in flight', async () => {
    // Make create hang so we can observe the "Saving..." state
    let resolveSave!: () => void
    mockCreate.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveSave = () => resolve('new-post-id')
      })
    )

    render(<FullScreenEditor postId="new" />)
    fireEvent.change(screen.getByPlaceholderText(/untitled post/i), {
      target: { value: 'Draft title' },
    })

    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(screen.getByTestId('save-status')).toHaveTextContent(/saving/i)

    // Resolve and confirm it goes back to "Saved"
    await act(async () => {
      resolveSave()
    })

    expect(screen.getByTestId('save-status')).toHaveTextContent(/saved/i)
  })

  // ── BEHAVIOR 4: loads existing post ─────────────────────────────────────
  it('pre-fills title when an existing post is loaded', () => {
    vi.mocked(useQuery).mockReturnValue({
      _id: 'post-123',
      type: 'blog',
      title: 'Existing Post Title',
      content: '<p>Existing content</p>',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    render(<FullScreenEditor postId="post-123" />)

    expect(screen.getByDisplayValue('Existing Post Title')).toBeInTheDocument()
  })

  it('updates an existing post (not creates) when editing', async () => {
    vi.mocked(useQuery).mockReturnValue({
      _id: 'post-123',
      type: 'blog',
      title: 'Existing Post Title',
      content: '<p>Existing content</p>',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    render(<FullScreenEditor postId="post-123" />)

    fireEvent.change(screen.getByDisplayValue('Existing Post Title'), {
      target: { value: 'Updated Title' },
    })

    await act(async () => {
      vi.advanceTimersByTime(3100)
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'post-123',
        title: 'Updated Title',
      })
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('autosaves the latest metadata state after status changes', async () => {
    vi.mocked(useQuery).mockReturnValue({
      _id: 'post-123',
      type: 'blog',
      title: 'Existing Post Title',
      content: '<p>Existing content</p>',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    render(<FullScreenEditor postId="post-123" />)

    fireEvent.click(screen.getByRole('button', { name: /change status/i }))

    await act(async () => {
      vi.advanceTimersByTime(3100)
      await Promise.resolve()
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'post-123',
        status: 'scheduled',
      })
    )
  })

  it('publishes a new editor by persisting the post before saving PR metadata', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          prUrl: 'https://github.com/jakebutler/resonate-blog/pull/42',
        }),
        { status: 200 }
      )
    )

    render(<FullScreenEditor postId="new" />)

    fireEvent.change(screen.getByPlaceholderText(/untitled post/i), {
      target: { value: 'Launch Post' },
    })
    fireEvent.input(screen.getByTestId('tiptap-editor'), {
      target: { innerHTML: '<p>Publish me</p>' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }))

    await flushPromises()
    await flushPromises()

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'blog',
        title: 'Launch Post',
        content: '<p>Publish me</p>',
      })
    )

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-post-id',
        githubPrUrl: 'https://github.com/jakebutler/resonate-blog/pull/42',
        status: 'draft',
      })
    )
  })

  it('publishes using the selected post status', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          prUrl: 'https://github.com/jakebutler/resonate-blog/pull/42',
        }),
        { status: 200 }
      )
    )

    render(<FullScreenEditor postId="new" />)

    fireEvent.change(screen.getByPlaceholderText(/untitled post/i), {
      target: { value: 'Launch Post' },
    })
    fireEvent.input(screen.getByTestId('tiptap-editor'), {
      target: { innerHTML: '<p>Publish me</p>' },
    })
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    fireEvent.click(screen.getByRole('button', { name: /change status/i }))
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }))

    await flushPromises()
    await flushPromises()

    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse((options as RequestInit).body as string)
    expect(body.status).toBe('published')

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-post-id',
        status: 'published',
      })
    )
  })

  it('flushes pending autosave changes before publishing an existing post', async () => {
    vi.mocked(useQuery).mockReturnValue({
      _id: 'post-123',
      type: 'blog',
      title: 'Existing Post Title',
      content: '<p>Existing content</p>',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          prUrl: 'https://github.com/jakebutler/resonate-blog/pull/42',
        }),
        { status: 200 }
      )
    )

    render(<FullScreenEditor postId="post-123" />)

    fireEvent.change(screen.getByDisplayValue('Existing Post Title'), {
      target: { value: 'Updated Before Publish' },
    })
    fireEvent.input(screen.getByTestId('tiptap-editor'), {
      target: { innerHTML: '<p>Fresh content</p>' },
    })

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }))

    await flushPromises()
    await flushPromises()

    expect(mockUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'post-123',
        title: 'Updated Before Publish',
        content: '<p>Fresh content</p>',
      })
    )

    expect(mockUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'post-123',
        githubPrUrl: 'https://github.com/jakebutler/resonate-blog/pull/42',
        status: 'draft',
      })
    )
  })

  it('does not create a duplicate draft when publish starts during an in-flight first save', async () => {
    let resolveCreate!: (id: string) => void
    mockCreate.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveCreate = resolve
      })
    )
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          prUrl: 'https://github.com/jakebutler/resonate-blog/pull/42',
        }),
        { status: 200 }
      )
    )

    render(<FullScreenEditor postId="new" />)

    fireEvent.change(screen.getByPlaceholderText(/untitled post/i), {
      target: { value: 'Launch Post' },
    })
    fireEvent.input(screen.getByTestId('tiptap-editor'), {
      target: { innerHTML: '<p>Publish me</p>' },
    })

    await act(async () => {
      vi.advanceTimersByTime(3100)
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }))
    expect(mockCreate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCreate('new-post-id')
      await Promise.resolve()
    })

    await flushPromises()
    await flushPromises()

    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it('uploads an image and inserts it into the editor', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ storageId: 'storage-1' }), { status: 200 })
    )

    render(<FullScreenEditor postId="new" />)

    const file = new File(['image'], 'hero.png', { type: 'image/png' })
    fireEvent.click(screen.getByRole('button', { name: /insert image/i }))
    fireEvent.change(screen.getByLabelText(/upload image/i), {
      target: { files: [file] },
    })

    await flushPromises()
    await flushPromises()

    expect(mockGenerateUploadUrl).toHaveBeenCalled()
    expect(mockInsertImage).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'storage-1',
        alt: 'hero',
      })
    )
  })

  it('revokes blob preview URLs when an uploaded image is removed', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ storageId: 'storage-1' }), { status: 200 })
    )

    render(<FullScreenEditor postId="new" />)

    const file = new File(['image'], 'hero.png', { type: 'image/png' })
    fireEvent.click(screen.getByRole('button', { name: /insert image/i }))
    fireEvent.change(screen.getByLabelText(/upload image/i), {
      target: { files: [file] },
    })

    await flushPromises()
    await flushPromises()

    fireEvent.click(screen.getByRole('button', { name: /images \(1\)/i }))
    fireEvent.click(screen.getByTestId('remove-btn-storage-1'))

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-image')
  })

  it('shows the selection chip when the editor emits a selection', () => {
    render(<FullScreenEditor postId="new" />)

    fireEvent.click(screen.getByRole('button', { name: 'Emit selection' }))

    expect(screen.getByTestId('selection-chip')).toHaveTextContent('Selected text')
  })

  it('keeps file URL queries stable across rerenders when the image list is unchanged', () => {
    let previousQueries: Record<string, unknown> | null = null

    vi.mocked(useQueries).mockImplementation(((queries: Record<string, unknown>) => {
      if (previousQueries && previousQueries !== queries) {
        throw new Error('file URL queries changed without any image updates')
      }

      previousQueries = queries
      return {}
    }) as never)

    render(<FullScreenEditor postId="new" />)

    expect(() => {
      fireEvent.change(screen.getByPlaceholderText(/untitled post/i), {
        target: { value: 'Draft title' },
      })
    }).not.toThrow()
  })

  it('queues a second autosave while the first save is in flight', async () => {
    let resolveFirstSave!: () => void
    mockUpdate
      .mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveFirstSave = resolve
        })
      )
      .mockResolvedValueOnce(undefined)

    vi.mocked(useQuery).mockReturnValue({
      _id: 'post-123',
      type: 'blog',
      title: 'Existing Post Title',
      content: '<p>Existing content</p>',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    render(<FullScreenEditor postId="post-123" />)

    fireEvent.change(screen.getByDisplayValue('Existing Post Title'), {
      target: { value: 'First title' },
    })

    await act(async () => {
      vi.advanceTimersByTime(3100)
      await Promise.resolve()
    })

    fireEvent.change(screen.getByDisplayValue('First title'), {
      target: { value: 'Second title' },
    })

    await act(async () => {
      vi.advanceTimersByTime(3100)
      await Promise.resolve()
    })

    expect(mockUpdate).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFirstSave()
      await Promise.resolve()
    })

    await flushPromises()

    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'post-123',
        title: 'Second title',
      })
    )
  })

  it('server-renders safely when document is unavailable', () => {
    const originalDocument = globalThis.document

    // Simulate the server render path where browser globals are unavailable.
    Reflect.deleteProperty(globalThis, 'document')

    try {
      expect(() => renderToString(<FullScreenEditor postId="new" />)).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: originalDocument,
      })
    }
  })
})

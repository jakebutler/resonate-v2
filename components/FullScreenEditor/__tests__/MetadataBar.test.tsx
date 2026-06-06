import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MetadataBar } from '@/components/FullScreenEditor/MetadataBar'

describe('MetadataBar', () => {
  const defaultProps = {
    status: 'draft' as const,
    scheduledDate: '',
    scheduledTime: '10:00',
    tags: [] as string[],
    subtitle: '',
    excerpt: '',
    author: 'Jake Butler',
    category: 'strategy',
    featured: false,
    coverImageAlt: '',
    onStatusChange: vi.fn(),
    onDateChange: vi.fn(),
    onTimeChange: vi.fn(),
    onTagsChange: vi.fn(),
    onSubtitleChange: vi.fn(),
    onExcerptChange: vi.fn(),
    onAuthorChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onFeaturedChange: vi.fn(),
    onCoverImageAltChange: vi.fn(),
    onPublish: vi.fn(),
    publishing: false,
    githubPrUrl: '',
    title: 'Test Post',
    hasContent: true,
  }

  // ── BEHAVIOR 1: renders status ───────────────────────────────────────────
  it('renders the current status badge', () => {
    render(<MetadataBar {...defaultProps} />)
    expect(screen.getByText(/draft/i)).toBeInTheDocument()
  })

  it('renders a publish button', () => {
    render(<MetadataBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /publish/i })).toBeInTheDocument()
  })

  // ── BEHAVIOR 2: status change ───────────────────────────────────────────
  it('cycles status when status badge is clicked', () => {
    render(<MetadataBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /status/i }))
    expect(defaultProps.onStatusChange).toHaveBeenCalledWith('scheduled')
  })

  // ── BEHAVIOR 3: publish disabled without title+content ──────────────────
  it('disables publish button when title is missing', () => {
    render(<MetadataBar {...defaultProps} title="" />)
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled()
  })

  it('disables publish button when content is missing', () => {
    render(<MetadataBar {...defaultProps} hasContent={false} />)
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled()
  })

  it('disables publish button while publishing is in flight', () => {
    render(<MetadataBar {...defaultProps} publishing={true} />)
    expect(screen.getByRole('button', { name: /publish/i })).toBeDisabled()
  })

  it('calls onPublish when publish button is clicked', () => {
    render(<MetadataBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /publish/i }))
    expect(defaultProps.onPublish).toHaveBeenCalled()
  })

  // ── BEHAVIOR 4: date + time ─────────────────────────────────────────────
  it('renders date input', () => {
    render(<MetadataBar {...defaultProps} scheduledDate="2026-05-01" />)
    expect(screen.getByDisplayValue('2026-05-01')).toBeInTheDocument()
  })

  it('calls onDateChange when date changes', () => {
    render(<MetadataBar {...defaultProps} />)
    fireEvent.change(screen.getByLabelText(/publish date/i), {
      target: { value: '2026-06-01' },
    })
    expect(defaultProps.onDateChange).toHaveBeenCalledWith('2026-06-01')
  })

  // ── BEHAVIOR 5: gear icon expands tags + SEO ────────────────────────────
  it('does not show tags input by default', () => {
    render(<MetadataBar {...defaultProps} />)
    expect(screen.queryByLabelText(/tags/i)).not.toBeInTheDocument()
  })

  it('shows blog metadata fields when gear icon is clicked', () => {
    render(<MetadataBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(screen.getByLabelText(/tags/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/subtitle/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/excerpt/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/author/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cover image alt/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/featured/i)).toBeInTheDocument()
  })

  it('preserves tag separators while typing and commits parsed tags on blur', () => {
    render(<MetadataBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const tagsInput = screen.getByLabelText(/tags/i)
    fireEvent.focus(tagsInput)
    fireEvent.change(tagsInput, { target: { value: 'ai, ' } })

    expect(tagsInput).toHaveValue('ai, ')
    expect(defaultProps.onTagsChange).toHaveBeenCalledWith(['ai'])

    fireEvent.blur(tagsInput)

    expect(defaultProps.onTagsChange).toHaveBeenCalledWith(['ai'])
  })

  it('commits tags only once when Enter is pressed', () => {
    render(<MetadataBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))

    const tagsInput = screen.getByLabelText(/tags/i)
    fireEvent.focus(tagsInput)
    fireEvent.change(tagsInput, { target: { value: 'ai, strategy' } })
    vi.mocked(defaultProps.onTagsChange).mockClear()

    fireEvent.keyDown(tagsInput, { key: 'Enter' })

    expect(defaultProps.onTagsChange).toHaveBeenCalledTimes(1)
    expect(defaultProps.onTagsChange).toHaveBeenCalledWith(['ai', 'strategy'])
  })

  // ── BEHAVIOR 6: GitHub PR link ──────────────────────────────────────────
  it('shows a PR link when githubPrUrl is set', () => {
    render(<MetadataBar {...defaultProps} githubPrUrl="https://github.com/pr/1" />)
    expect(screen.getByRole('link', { name: /PR open/i })).toBeInTheDocument()
  })

  it('does not show PR link when githubPrUrl is empty', () => {
    render(<MetadataBar {...defaultProps} githubPrUrl="" />)
    expect(screen.queryByRole('link', { name: /PR open/i })).not.toBeInTheDocument()
  })
})

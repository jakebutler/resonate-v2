import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageTray } from '@/components/ImageTray/ImageTray'

const mockImages = [
  { fileId: 'file-1', url: 'https://example.com/img1.jpg', altText: '' },
  { fileId: 'file-2', url: 'https://example.com/img2.jpg', altText: 'Alt text' },
]

function mockMatchMedia(matches: boolean) {
  const addEventListener = vi.fn()
  const removeEventListener = vi.fn()

  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches,
    media: '(hover: none), (pointer: coarse)',
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: addEventListener,
    removeListener: removeEventListener,
    dispatchEvent: vi.fn(),
  })))
}

describe('ImageTray', () => {
  beforeEach(() => {
    mockMatchMedia(false)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── BEHAVIOR 1: collapsed by default ────────────────────────────────────
  it('shows a toggle button with image count', () => {
    render(
      <ImageTray
        images={mockImages}
        heroFileId={null}
        onHeroChange={vi.fn()}
        onRemove={vi.fn()}
        onScrollToImage={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /images \(2\)/i })).toBeInTheDocument()
  })

  it('does not show thumbnails when collapsed', () => {
    render(
      <ImageTray
        images={mockImages}
        heroFileId={null}
        onHeroChange={vi.fn()}
        onRemove={vi.fn()}
        onScrollToImage={vi.fn()}
      />
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  // ── BEHAVIOR 2: expand / collapse ────────────────────────────────────────
  it('shows thumbnails after clicking the toggle', () => {
    render(
      <ImageTray
        images={mockImages}
        heroFileId={null}
        onHeroChange={vi.fn()}
        onRemove={vi.fn()}
        onScrollToImage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /images \(2\)/i }))
    const imgs = screen.getAllByRole('img')
    expect(imgs.length).toBe(2)
  })

  // ── BEHAVIOR 3: hero designation ─────────────────────────────────────────
  it('marks the hero image with an active star', () => {
    render(
      <ImageTray
        images={mockImages}
        heroFileId="file-1"
        onHeroChange={vi.fn()}
        onRemove={vi.fn()}
        onScrollToImage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /images \(2\)/i }))
    // The hero thumbnail should have the tangerine border class
    const heroItem = screen.getByTestId('image-thumb-file-1')
    expect(heroItem).toHaveClass('border-[#ff7d00]')
  })

  it('calls onHeroChange when star button is clicked', () => {
    const onHeroChange = vi.fn()
    render(
      <ImageTray
        images={mockImages}
        heroFileId={null}
        onHeroChange={onHeroChange}
        onRemove={vi.fn()}
        onScrollToImage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /images \(2\)/i }))
    expect(screen.getByTestId('image-controls-file-1')).toHaveClass('group-focus-within:opacity-100')
    fireEvent.click(screen.getByTestId('hero-btn-file-1'))
    expect(onHeroChange).toHaveBeenCalledWith('file-1')
  })

  it('calls onHeroChange(null) when star is clicked on already-hero image', () => {
    const onHeroChange = vi.fn()
    render(
      <ImageTray
        images={mockImages}
        heroFileId="file-1"
        onHeroChange={onHeroChange}
        onRemove={vi.fn()}
        onScrollToImage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /images \(2\)/i }))
    fireEvent.click(screen.getByTestId('hero-btn-file-1'))
    expect(onHeroChange).toHaveBeenCalledWith(null)
  })

  // ── BEHAVIOR 4: remove ────────────────────────────────────────────────────
  it('calls onRemove when trash button is clicked', () => {
    const onRemove = vi.fn()
    render(
      <ImageTray
        images={mockImages}
        heroFileId={null}
        onHeroChange={vi.fn()}
        onRemove={onRemove}
        onScrollToImage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /images \(2\)/i }))
    fireEvent.click(screen.getByTestId('remove-btn-file-1'))
    expect(onRemove).toHaveBeenCalledWith('file-1')
  })

  // ── BEHAVIOR 5: scroll to image ───────────────────────────────────────────
  it('calls onScrollToImage when thumbnail is clicked', () => {
    const onScrollToImage = vi.fn()
    render(
      <ImageTray
        images={mockImages}
        heroFileId={null}
        onHeroChange={vi.fn()}
        onRemove={vi.fn()}
        onScrollToImage={onScrollToImage}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /images \(2\)/i }))
    fireEvent.click(screen.getByTestId('image-thumb-file-1'))
    expect(onScrollToImage).toHaveBeenCalledWith('file-1')
  })

  // ── BEHAVIOR 6: empty state ───────────────────────────────────────────────
  it('shows empty state text when no images', () => {
    render(
      <ImageTray
        images={[]}
        heroFileId={null}
        onHeroChange={vi.fn()}
        onRemove={vi.fn()}
        onScrollToImage={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /images \(0\)/i }))
    expect(screen.getByText(/no images/i)).toBeInTheDocument()
  })

  it('keeps hero controls visible on touch devices', () => {
    mockMatchMedia(true)

    render(
      <ImageTray
        images={mockImages}
        heroFileId={null}
        onHeroChange={vi.fn()}
        onRemove={vi.fn()}
        onScrollToImage={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /images \(2\)/i }))

    expect(screen.getByTestId('image-controls-file-1')).toHaveClass('opacity-100')
    expect(screen.getByTestId('hero-btn-file-1')).toBeVisible()
  })
})

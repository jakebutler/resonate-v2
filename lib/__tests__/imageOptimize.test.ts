import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock canvas API (jsdom doesn't implement canvas) ──────────────────────
const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => ({
    drawImage: vi.fn(),
  })),
  toBlob: vi.fn((callback: (blob: Blob | null) => void, type: string, quality: number) => {
    void type; void quality
    callback(new Blob(['compressed'], { type: 'image/webp' }))
  }),
}
vi.stubGlobal('document', {
  createElement: (tag: string) => {
    if (tag === 'canvas') return mockCanvas
    return {}
  },
})

// Mock createImageBitmap
vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({
  width: 4000,
  height: 3000,
  close: vi.fn(),
}))

import { optimizeImage } from '@/lib/imageOptimize'

describe('optimizeImage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mock to return large dimensions by default
    vi.mocked(createImageBitmap).mockResolvedValue({
      width: 4000,
      height: 3000,
      close: vi.fn(),
    })
    mockCanvas.toBlob.mockImplementation((callback: (blob: Blob | null) => void) => {
      callback(new Blob(['compressed'], { type: 'image/webp' }))
    })
  })

  // ── BEHAVIOR 1: rejects files over size limit ────────────────────────────
  it('throws an error for files over 10MB', async () => {
    const largeFile = new File(['x'.repeat(11 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    await expect(optimizeImage(largeFile)).rejects.toThrow(/10MB/i)
  })

  // ── BEHAVIOR 2: rejects non-image files ──────────────────────────────────
  it('throws for non-image file types', async () => {
    const textFile = new File(['hello'], 'doc.txt', { type: 'text/plain' })
    await expect(optimizeImage(textFile)).rejects.toThrow(/image/i)
  })

  // ── BEHAVIOR 3: caps width at 2000px ────────────────────────────────────
  it('caps large images at 2000px wide', async () => {
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await optimizeImage(file)
    // Canvas width should be set to 2000 (max), height scaled proportionally
    expect(mockCanvas.width).toBe(2000)
    expect(mockCanvas.height).toBe(1500) // 4000x3000 scaled to 2000x1500
  })

  // ── BEHAVIOR 4: does not upscale small images ────────────────────────────
  it('does not upscale images smaller than 2000px', async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({
      width: 800,
      height: 600,
      close: vi.fn(),
    })
    const file = new File(['img'], 'small.jpg', { type: 'image/jpeg' })
    await optimizeImage(file)
    expect(mockCanvas.width).toBe(800)
    expect(mockCanvas.height).toBe(600)
  })

  // ── BEHAVIOR 5: returns a Blob ───────────────────────────────────────────
  it('returns a compressed Blob', async () => {
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const result = await optimizeImage(file)
    expect(result).toBeInstanceOf(Blob)
  })

  // ── BEHAVIOR 6: throws if canvas toBlob fails ────────────────────────────
  it('throws if canvas toBlob returns null', async () => {
    mockCanvas.toBlob.mockImplementation((callback: (blob: Blob | null) => void) => {
      callback(null)
    })
    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    await expect(optimizeImage(file)).rejects.toThrow(/compress/i)
  })

  it('re-encodes raster uploads as webp', async () => {
    mockCanvas.toBlob.mockImplementation(
      (callback: (blob: Blob | null) => void, type?: string) => {
        callback(new Blob(['compressed'], { type }))
      }
    )

    const file = new File(['img'], 'photo.jpg', { type: 'image/jpeg' })
    const result = await optimizeImage(file)

    expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.82)
    expect(result.type).toBe('image/webp')
  })

  it('passes svg uploads through unchanged', async () => {
    const file = new File(['<svg />'], 'diagram.svg', { type: 'image/svg+xml' })
    const result = await optimizeImage(file)

    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(result).toBe(file)
  })
})

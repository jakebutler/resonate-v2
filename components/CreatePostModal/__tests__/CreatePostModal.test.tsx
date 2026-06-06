import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreatePostModal } from '@/components/CreatePostModal/CreatePostModal'

describe('CreatePostModal', () => {
  it('does not render when open is false', () => {
    render(<CreatePostModal open={false} date={null} onClose={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.queryByText('Create Post')).not.toBeInTheDocument()
  })

  it('renders when open with no date', () => {
    render(<CreatePostModal open={true} date={null} onClose={vi.fn()} onSelect={vi.fn()} />)
    expect(screen.getByText('Create Post')).toBeInTheDocument()
  })

  it('calls onSelect("blog") when Blog Post is clicked', () => {
    const onSelect = vi.fn()
    render(<CreatePostModal open={true} date={null} onClose={vi.fn()} onSelect={onSelect} />)
    fireEvent.click(screen.getByText(/blog post/i))
    expect(onSelect).toHaveBeenCalledWith('blog')
  })

  it('calls onSelect("linkedin") when LinkedIn Post is clicked', () => {
    const onSelect = vi.fn()
    render(<CreatePostModal open={true} date={null} onClose={vi.fn()} onSelect={onSelect} />)
    fireEvent.click(screen.getByText(/linkedin post/i))
    expect(onSelect).toHaveBeenCalledWith('linkedin')
  })
})

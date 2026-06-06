import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlideOver } from '@/components/ui/SlideOver'

describe('SlideOver', () => {
  it('does not render when open is false', () => {
    render(<SlideOver open={false} onClose={vi.fn()} title="T"><p>x</p></SlideOver>)
    expect(screen.queryByText('T')).not.toBeInTheDocument()
  })

  it('renders title and children when open', () => {
    render(<SlideOver open={true} onClose={vi.fn()} title="Editor"><p>Content here</p></SlideOver>)
    expect(screen.getByText('Editor')).toBeInTheDocument()
    expect(screen.getByText('Content here')).toBeInTheDocument()
  })

  it('calls onClose when X button clicked', () => {
    const onClose = vi.fn()
    render(<SlideOver open={true} onClose={onClose} title="T"><p>x</p></SlideOver>)
    const closeBtn = screen.getByRole('button')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn()
    render(<SlideOver open={true} onClose={onClose} title="T"><p>x</p></SlideOver>)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('renders footer content when footer prop provided', () => {
    render(
      <SlideOver open={true} onClose={vi.fn()} title="T" footer={<button>Save</button>}>
        <p>x</p>
      </SlideOver>
    )
    expect(screen.getByText('Save')).toBeInTheDocument()
  })
})

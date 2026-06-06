import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Toggle } from '@/components/ui/Toggle'

describe('Toggle', () => {
  it('renders with role switch', () => {
    render(<Toggle checked={false} onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('sets aria-checked false when unchecked', () => {
    render(<Toggle checked={false} onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
  })

  it('sets aria-checked true when checked', () => {
    render(<Toggle checked={true} onChange={vi.fn()} />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('calls onChange with true when clicking unchecked toggle', () => {
    const handler = vi.fn()
    render(<Toggle checked={false} onChange={handler} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(handler).toHaveBeenCalledWith(true)
  })

  it('calls onChange with false when clicking checked toggle', () => {
    const handler = vi.fn()
    render(<Toggle checked={true} onChange={handler} />)
    fireEvent.click(screen.getByRole('switch'))
    expect(handler).toHaveBeenCalledWith(false)
  })
})

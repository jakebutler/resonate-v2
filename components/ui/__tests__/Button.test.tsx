import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const handler = vi.fn()
    render(<Button onClick={handler}>Go</Button>)
    fireEvent.click(screen.getByText('Go'))
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', () => {
    const handler = vi.fn()
    render(<Button disabled onClick={handler}>Go</Button>)
    fireEvent.click(screen.getByText('Go'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('has disabled attribute when disabled prop set', () => {
    render(<Button disabled>Go</Button>)
    expect(screen.getByText('Go').closest('button')).toBeDisabled()
  })

  it('sets data-variant="primary" on primary variant', () => {
    render(<Button variant="primary">Go</Button>)
    expect(screen.getByText('Go').closest('button')).toHaveAttribute('data-variant', 'primary')
  })

  it('sets data-variant="danger" on danger variant', () => {
    render(<Button variant="danger">Del</Button>)
    expect(screen.getByText('Del').closest('button')).toHaveAttribute('data-variant', 'danger')
  })

  it('forwards type attribute', () => {
    render(<Button type="submit">Submit</Button>)
    expect(screen.getByText('Submit').closest('button')).toHaveAttribute('type', 'submit')
  })
})

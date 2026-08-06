import { describe, it, expect, vi } from 'vitest'
import { createElement, Fragment } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { Button, resolveAsChildElement } from '@/components/ui/button'

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

  it('disables and marks busy when loading', () => {
    render(<Button loading>Open PR</Button>)
    const button = screen.getByRole('button', { name: /Open PR/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('does not call onClick when loading', () => {
    const handler = vi.fn()
    render(
      <Button loading onClick={handler}>
        Open PR
      </Button>
    )
    fireEvent.click(screen.getByRole('button', { name: /Open PR/i }))
    expect(handler).not.toHaveBeenCalled()
  })

  it('shows a loading spinner when loading', () => {
    render(<Button loading>Open PR</Button>)
    expect(screen.getByRole('button', { name: /Open PR/i })).toContainElement(
      screen.getByTestId('button-loading-spinner')
    )
  })

  it('does not show a loading spinner when not loading', () => {
    render(<Button>Open PR</Button>)
    expect(screen.queryByTestId('button-loading-spinner')).not.toBeInTheDocument()
  })

  it('preserves caller aria-busy when not loading', () => {
    render(
      <Button aria-busy={true}>Save</Button>
    )
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'aria-busy',
      'true'
    )
  })

  it('forces aria-busy when loading even if caller passes false', () => {
    render(
      <Button aria-busy={false} loading>
        Save
      </Button>
    )
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute(
      'aria-busy',
      'true'
    )
  })

  it('blocks slotted child clicks and shows spinner when loading with asChild', () => {
    const handler = vi.fn()
    render(
      <Button asChild loading>
        <a href="https://example.com" onClick={handler}>
          Continue
        </a>
      </Button>
    )
    const link = screen.getByRole('link', { name: /Continue/i })
    expect(link).toHaveAttribute('aria-busy', 'true')
    expect(link).toHaveAttribute('aria-disabled', 'true')
    expect(link).toHaveAttribute('tabindex', '-1')
    expect(link).toContainElement(screen.getByTestId('button-loading-spinner'))
    fireEvent.click(link)
    expect(handler).not.toHaveBeenCalled()
  })

  it('rejects Fragment children when asChild is set', () => {
    expect(() =>
      resolveAsChildElement(
        createElement(Fragment, null, createElement('a', { href: '#' }, 'Continue'))
      )
    ).toThrow(/does not support React.Fragment/i)
  })

  it('preserves caller aria-disabled on slotted child when not disabled', () => {
    render(
      <Button asChild aria-disabled={true}>
        <a href="https://example.com">Continue</a>
      </Button>
    )
    expect(screen.getByRole('link', { name: /Continue/i })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('forces aria-busy on slotted child when loading even if child sets false', () => {
    render(
      <Button asChild loading>
        <a aria-busy={false} href="https://example.com">
          Continue
        </a>
      </Button>
    )
    expect(screen.getByRole('link', { name: /Continue/i })).toHaveAttribute(
      'aria-busy',
      'true'
    )
  })

  it('forwards disabled to a slotted native button and removes it from tab order', () => {
    render(
      <Button asChild disabled>
        <button type="button">Go</button>
      </Button>
    )
    const button = screen.getByRole('button', { name: 'Go' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('tabindex', '-1')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── Deps ───────────────────────────────────────────────────────────────────
vi.mock('@/lib/models', () => ({
  MODELS: [{ id: 'claude-opus-4-5', label: 'Claude Opus' }],
  CLAUDE_MODELS: [{ id: 'claude-opus-4-5', label: 'Claude Opus' }],
  DEFAULT_MODEL: { id: 'claude-opus-4-5', label: 'Claude Opus' },
}))

import { EditorChat } from '@/components/EditorChat/EditorChat'

function makeStream(chunks: string[]): ReadableStream {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk))
      }
      controller.close()
    },
  })
}

describe('EditorChat', () => {
  let originalScrollIntoView: typeof HTMLElement.prototype.scrollIntoView | undefined

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalScrollIntoView === undefined) {
      delete (window.HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    } else {
      window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })

  // ── BEHAVIOR 1: renders ─────────────────────────────────────────────────
  it('renders a greeting message on mount', () => {
    render(<EditorChat />)
    // The greeting mentions "Blog Copilot" in the assistant message body
    expect(screen.getByText(/highlight text in the editor/i)).toBeInTheDocument()
  })

  it('renders a text input for user messages', () => {
    render(<EditorChat />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders a Send button', () => {
    render(<EditorChat />)
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
  })

  // ── BEHAVIOR 2: collapse toggle ─────────────────────────────────────────
  it('renders a collapse toggle button', () => {
    render(<EditorChat />)
    expect(screen.getByRole('button', { name: /collapse/i })).toBeInTheDocument()
  })

  it('calls onCollapse when collapse button is clicked', () => {
    const onCollapse = vi.fn()
    render(<EditorChat onCollapse={onCollapse} />)
    fireEvent.click(screen.getByRole('button', { name: /collapse/i }))
    expect(onCollapse).toHaveBeenCalled()
  })

  // ── BEHAVIOR 3: message streaming ──────────────────────────────────────
  it('streams assistant response after sending a message', async () => {
    const stream = makeStream([
      'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
      'data: {"type":"response.output_text.delta","delta":" editor"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<EditorChat />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Help me write' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Hello editor')).toBeInTheDocument())
  })

  it('shows a generic error message when the backend returns an error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('provider exploded', { status: 500 }))

    render(<EditorChat />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Help me write' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() =>
      expect(
        screen.getByText('Something went wrong. Please try again.')
      ).toBeInTheDocument()
    )
    expect(screen.queryByText('provider exploded')).not.toBeInTheDocument()
  })

  it('does not submit while the user is composing text with an IME', () => {
    render(<EditorChat />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Help me write' } })
    fireEvent.keyDown(screen.getByRole('textbox'), {
      key: 'Enter',
      isComposing: true,
      nativeEvent: { isComposing: true },
    })

    expect(fetch).not.toHaveBeenCalled()
  })

  // ── BEHAVIOR 4: selection chip ──────────────────────────────────────────
  it('shows a selection chip when selectedText is provided', () => {
    render(<EditorChat selectedText="This is the selected text" />)
    expect(screen.getByTestId('selection-chip')).toBeInTheDocument()
    expect(screen.getByText(/this is the selected text/i)).toBeInTheDocument()
  })

  it('does not show a selection chip when selectedText is empty', () => {
    render(<EditorChat selectedText="" />)
    expect(screen.queryByTestId('selection-chip')).not.toBeInTheDocument()
  })

  it('calls onDismissSelection when the chip dismiss button is clicked', () => {
    const onDismiss = vi.fn()
    render(<EditorChat selectedText="Some selected text" onDismissSelection={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss selection/i }))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('truncates long selected text in the chip to ~80 chars', () => {
    const longText = 'A'.repeat(120)
    render(<EditorChat selectedText={longText} />)
    const chip = screen.getByTestId('selection-chip')
    // Should show truncated text with ellipsis
    expect(chip.textContent).toContain('...')
  })

  // ── BEHAVIOR 5: includes selected text in message payload ───────────────
  it('sends selected text as context with the user message', async () => {
    const stream = makeStream([
      'data: {"type":"response.completed","response":{}}\n\n',
    ])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<EditorChat selectedText="Key passage about AI" />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rewrite this' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() => {
      const [, options] = vi.mocked(fetch).mock.calls[0]
      const body = JSON.parse((options as RequestInit).body as string)
      const lastUserMessage = body.messages.find((m: { role: string }) => m.role === 'user')
      expect(lastUserMessage.content).toContain('Key passage about AI')
      expect(lastUserMessage.content).toContain('Rewrite this')
      expect(lastUserMessage.content).toContain('<rewrite>')
    })
  })

  it('focuses the input when focusRequestId changes', () => {
    const { rerender } = render(<EditorChat />)
    const textbox = screen.getByRole('textbox')

    rerender(<EditorChat focusRequestId={1} />)

    expect(textbox).toHaveFocus()
  })

  it('renders a safe empty state when no models are available', () => {
    render(<EditorChat models={[]} />)

    expect(screen.getByText('No models available')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeDisabled()
  })

  it('renders rewrite responses as suggestion cards and accepts them', async () => {
    const onAcceptSuggestion = vi.fn()
    const stream = makeStream([
      'data: {"type":"response.output_text.delta","delta":"<rewrite>Sharper line</rewrite>"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(
      <EditorChat
        selectedText="Original line"
        onAcceptSuggestion={onAcceptSuggestion}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rewrite it' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() => expect(screen.getByTestId('suggestion-card-2')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(onAcceptSuggestion).toHaveBeenCalledWith('Sharper line', 'Original line')
  })

  it('dismisses rendered suggestion cards', async () => {
    const stream = makeStream([
      'data: {"type":"response.output_text.delta","delta":"<rewrite>Sharper line</rewrite>"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<EditorChat selectedText="Original line" onAcceptSuggestion={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Rewrite it' } })
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' })

    await waitFor(() => expect(screen.getByTestId('suggestion-card-2')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.getByText(/suggestion dismissed/i)).toBeInTheDocument()
  })
})

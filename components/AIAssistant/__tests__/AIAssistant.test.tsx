import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AIAssistant } from '@/components/AIAssistant/AIAssistant'
import { CLAUDE_MODELS } from '@/lib/models'

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

describe('AIAssistant', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    // jsdom doesn't implement scrollIntoView
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('renders greeting message on mount', () => {
    render(<AIAssistant onUsePost={vi.fn()} />)
    expect(screen.getByText(/help you craft the perfect LinkedIn post/i)).toBeInTheDocument()
  })

  it('streams response.output_text.delta events into assistant message', async () => {
    const stream = makeStream([
      'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
      'data: {"type":"response.output_text.delta","delta":" world"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<AIAssistant onUsePost={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/describe what you want/i), { target: { value: 'test' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/describe what you want/i), { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument())
  })

  it('handles SSE events that are split across chunk boundaries', async () => {
    const stream = makeStream([
      'data: {"type":"response.output_text.delta","de',
      'lta":"Hello"}\n\n',
      'data: {"type":"response.output_text.delta","delta":" world"}\n\n',
      'data: {"type":"response.completed","response":{}}\n\n',
    ])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<AIAssistant onUsePost={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/describe what you want/i), { target: { value: 'test' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/describe what you want/i), { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Hello world')).toBeInTheDocument())
  })

  it('shows error message when response.failed event received', async () => {
    const stream = makeStream([
      'data: {"type":"response.failed","response":{"error":"rate_limit"}}\n\n',
    ])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<AIAssistant onUsePost={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/describe what you want/i), { target: { value: 'test' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/describe what you want/i), { key: 'Enter' })

    await waitFor(() =>
      expect(screen.getByText(/rate_limit|something went wrong/i)).toBeInTheDocument()
    )
  })

  it('still handles legacy [DONE] sentinel', async () => {
    const stream = makeStream([
      'data: {"choices":[{"delta":{"content":"Legacy"}}]}\n\n',
      'data: [DONE]\n\n',
    ])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<AIAssistant onUsePost={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/describe what you want/i), { target: { value: 'test' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/describe what you want/i), { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Legacy')).toBeInTheDocument())
  })

  it('model selector button has aria-haspopup and aria-expanded attributes', () => {
    render(<AIAssistant onUsePost={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /select ai model/i })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('aria-expanded becomes true when model menu is open', () => {
    render(<AIAssistant onUsePost={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /select ai model/i })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes model menu on Escape key', () => {
    render(<AIAssistant onUsePost={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: /select ai model/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('shows Sonnet 4.6 as the default model', () => {
    render(<AIAssistant onUsePost={vi.fn()} />)
    expect(screen.getByText('Sonnet 4.6')).toBeInTheDocument()
  })

  it('opens model menu and switches to a different model', async () => {
    render(<AIAssistant onUsePost={vi.fn()} />)
    fireEvent.click(screen.getByText('Sonnet 4.6'))
    expect(screen.getByText('Opus 4.6')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Opus 4.6'))
    expect(screen.queryByText('GPT-5.2')).not.toBeInTheDocument()
    expect(screen.getByText('Opus 4.6')).toBeInTheDocument()
  })

  it('sends the selected model in the request body', async () => {
    const stream = makeStream(['data: [DONE]\n\n'])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<AIAssistant onUsePost={vi.fn()} />)

    // Switch to GPT-5.2
    fireEvent.click(screen.getByText('Sonnet 4.6'))
    fireEvent.click(screen.getByText('GPT-5.2'))

    fireEvent.change(screen.getByPlaceholderText(/describe what you want/i), { target: { value: 'test' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/describe what you want/i), { key: 'Enter' })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body.model).toBe('gpt-5.2')
    expect(body.assistantType).toBe('linkedin')
  })

  it('renders blog variant copy and only Claude models when configured', () => {
    render(<AIAssistant onUsePost={vi.fn()} models={CLAUDE_MODELS} variant="blog" />)

    expect(screen.getByText(/ai blog copilot/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/describe the blog post you want to write/i)).toBeInTheDocument()

    fireEvent.click(screen.getByText('Sonnet 4.6'))
    expect(screen.getByText('Opus 4.6')).toBeInTheDocument()
    expect(screen.queryByText('GPT-5.2')).not.toBeInTheDocument()
  })

  it('sends blog assistantType when variant is blog', async () => {
    const stream = makeStream(['data: [DONE]\n\n'])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<AIAssistant onUsePost={vi.fn()} models={CLAUDE_MODELS} variant="blog" />)
    fireEvent.change(screen.getByPlaceholderText(/describe the blog post/i), { target: { value: 'kv cache' } })
    fireEvent.keyDown(screen.getByPlaceholderText(/describe the blog post/i), { key: 'Enter' })

    await waitFor(() => expect(fetch).toHaveBeenCalled())
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string)
    expect(body.assistantType).toBe('blog')
    expect(body.model).toBe('claude-sonnet-4.6')
  })

  it('sends message via Send button click', async () => {
    const stream = makeStream(['data: [DONE]\n\n'])
    vi.mocked(fetch).mockResolvedValueOnce(new Response(stream, { status: 200 }))

    render(<AIAssistant onUsePost={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText(/describe what you want/i), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalled())
  })

  it('allows Shift+Enter to insert a line break without sending', async () => {
    render(<AIAssistant onUsePost={vi.fn()} />)

    const composer = screen.getByPlaceholderText(/describe what you want/i) as HTMLTextAreaElement
    fireEvent.change(composer, { target: { value: 'First line' } })
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true })
    fireEvent.change(composer, { target: { value: 'First line\nSecond line' } })

    expect(fetch).not.toHaveBeenCalled()
    expect(composer.value).toBe('First line\nSecond line')
  })
})

// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'

let streamCortexChat: (typeof import('@/lib/cortex'))['streamCortexChat']
let LINKEDIN_SYSTEM_PROMPT: (typeof import('@/lib/cortex'))['LINKEDIN_SYSTEM_PROMPT']
let BLOG_SYSTEM_PROMPT: (typeof import('@/lib/cortex'))['BLOG_SYSTEM_PROMPT']

beforeAll(async () => {
  process.env.CORTEX_API_KEY = 'test_key'
  process.env.CORTEX_BASE_URL = 'https://cortex.test'
  vi.resetModules()
  const mod = await import('@/lib/cortex')
  streamCortexChat = mod.streamCortexChat
  LINKEDIN_SYSTEM_PROMPT = mod.LINKEDIN_SYSTEM_PROMPT
  BLOG_SYSTEM_PROMPT = mod.BLOG_SYSTEM_PROMPT
})

describe('streamCortexChat', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns the response body as a ReadableStream on success', async () => {
    const fakeStream = new ReadableStream()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(fakeStream, { status: 200 }))
    const result = await streamCortexChat([{ role: 'user', content: 'hello' }])
    expect(result).toBeInstanceOf(ReadableStream)
  })

  it('sends LINKEDIN_SYSTEM_PROMPT as the first system message', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
    await streamCortexChat([{ role: 'user', content: 'test' }])
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.messages[0]).toEqual({ role: 'system', content: LINKEDIN_SYSTEM_PROMPT })
  })

  it('sends messages in the messages field after the system prompt', async () => {
    const messages = [{ role: 'user' as const, content: 'test' }]
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
    await streamCortexChat(messages)
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.messages.slice(1)).toEqual(messages)
  })

  it('uses default model "claude-sonnet-4.6" when none provided', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
    await streamCortexChat([{ role: 'user', content: 'test' }])
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.model).toBe('claude-sonnet-4.6')
  })

  it('forwards custom model argument', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
    await streamCortexChat([{ role: 'user', content: 'test' }], { model: 'claude-opus-4.6' })
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.model).toBe('claude-opus-4.6')
  })

  it('switches system prompt when blog assistantType is requested', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
    await streamCortexChat([{ role: 'user', content: 'test' }], { assistantType: 'blog' })
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.messages[0]).toEqual({ role: 'system', content: BLOG_SYSTEM_PROMPT })
  })

  it('sets stream: true in request body', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
    await streamCortexChat([{ role: 'user', content: 'test' }])
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)
    expect(body.stream).toBe(true)
  })

  it('sends Authorization Bearer header', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(new ReadableStream(), { status: 200 }))
    await streamCortexChat([{ role: 'user', content: 'test' }])
    const headers = vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test_key')
  })

  it('throws when response body is null', async () => {
    const nullBodyResponse = new Response(null, { status: 200 })
    vi.mocked(fetch).mockResolvedValueOnce(nullBodyResponse)
    await expect(streamCortexChat([{ role: 'user', content: 'test' }]))
      .rejects.toThrow('No response body')
  })

  it('throws on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 503 }))
    await expect(streamCortexChat([{ role: 'user', content: 'test' }]))
      .rejects.toThrow('LLM API error: 503')
  })
})

describe('module initialization', () => {
  it('throws when neither CORTEX_API_KEY nor OPENAI_API_KEY is set at call time', async () => {
    const savedCortexKey = process.env.CORTEX_API_KEY
    const savedOpenAiKey = process.env.OPENAI_API_KEY
    delete process.env.CORTEX_API_KEY
    delete process.env.OPENAI_API_KEY
    vi.resetModules()
    const mod = await import('@/lib/cortex')
    await expect(mod.streamCortexChat([{ role: 'user', content: 'test' }]))
      .rejects.toThrow('Missing required environment variable: CORTEX_API_KEY or OPENAI_API_KEY')
    process.env.CORTEX_API_KEY = savedCortexKey
    process.env.OPENAI_API_KEY = savedOpenAiKey
    vi.resetModules()
  })
})

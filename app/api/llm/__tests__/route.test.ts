import type { NextRequest } from "next/server"
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "user_123" }),
}))

vi.mock("@/lib/cortex", () => ({
  streamCortexChat: vi.fn().mockResolvedValue(new ReadableStream()),
}))

import { POST } from "@/app/api/llm/route"
import { auth } from "@clerk/nextjs/server"
import { streamCortexChat } from "@/lib/cortex"

function makeRequest(body: object): NextRequest {
  return new Request("http://localhost/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

describe("POST /api/llm", () => {
  beforeEach(() => vi.clearAllMocks())

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as Awaited<ReturnType<typeof auth>>)
    const res = await POST(makeRequest({ messages: [] }))
    expect(res.status).toBe(401)
  })

  it("returns 200 with text/event-stream on success", async () => {
    const res = await POST(makeRequest({ messages: [{ role: "user", content: "hi" }] }))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
  })

  it("forwards messages and model to streamCortexChat", async () => {
    const messages = [{ role: "user", content: "hello" }]
    await POST(makeRequest({ messages, model: "claude-opus-4.6", assistantType: "blog" }))
    expect(streamCortexChat).toHaveBeenCalledWith(messages, {
      model: "claude-opus-4.6",
      assistantType: "blog",
    })
  })

  it("returns 400 when model is not in the allowlist", async () => {
    const res = await POST(makeRequest({ messages: [{ role: "user", content: "hi" }], model: "some-rogue-model" }))
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("not a supported model")
  })

  it("returns 500 with generic message when streamCortexChat throws", async () => {
    vi.mocked(streamCortexChat).mockRejectedValueOnce(
      new Error('LLM API error: 500 {"provider":"secret","key":"sk-abc"}')
    )
    const res = await POST(makeRequest({ messages: [] }))
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toBe("The AI service encountered an error. Please try again.")
    expect(body).not.toContain("secret")
    expect(body).not.toContain("sk-abc")
  })

  it("returns 400 when messages is missing", async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it("returns 400 when messages is not an array", async () => {
    const res = await POST(makeRequest({ messages: "not-an-array" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when model is provided but not a string", async () => {
    const res = await POST(makeRequest({ messages: [], model: 42 }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when assistantType is provided but not a string", async () => {
    const res = await POST(makeRequest({ messages: [], assistantType: 42 }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when assistantType is not supported", async () => {
    const res = await POST(makeRequest({ messages: [], assistantType: "essay" }))
    expect(res.status).toBe(400)
    expect(await res.text()).toContain("not a supported assistantType")
  })
})

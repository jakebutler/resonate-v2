// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAssistantResponse } from "@/lib/llmClient";

function createStream(chunks: string[]) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
}

describe("getAssistantResponse", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("collects assistant deltas until a completion event", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        createStream([
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n',
          'data: {"type":"response.output_text.delta","delta":"world"}\n\n',
          'data: {"type":"response.completed"}\n\n',
        ]),
        { status: 200 }
      )
    );

    await expect(
      getAssistantResponse({
        assistantType: "blog",
        messages: [{ role: "user", content: "Write a draft" }],
      })
    ).resolves.toBe("Hello world");
  });

  it("supports OpenAI-style delta payloads and done markers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        createStream([
          'data: {"choices":[{"delta":{"content":"Alpha"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" beta"}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
        { status: 200 }
      )
    );

    await expect(
      getAssistantResponse({
        assistantType: "linkedin",
        messages: [{ role: "user", content: "Draft a post" }],
      })
    ).resolves.toBe("Alpha beta");
  });

  it("throws the response body text when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    await expect(
      getAssistantResponse({
        assistantType: "blog",
        messages: [],
      })
    ).rejects.toThrow("rate limited");
  });

  it("throws when the stream body is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(
      getAssistantResponse({
        assistantType: "blog",
        messages: [],
      })
    ).rejects.toThrow("No response body");
  });

  it("throws response.failed errors from the event stream", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        createStream([
          'data: {"type":"response.failed","response":{"error":"rate_limit"}}\n\n',
        ]),
        { status: 200 }
      )
    );

    await expect(
      getAssistantResponse({
        assistantType: "blog",
        messages: [],
      })
    ).rejects.toThrow("rate_limit");
  });
});

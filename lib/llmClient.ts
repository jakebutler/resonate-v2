import type { AssistantType, ChatMessage } from "@/lib/cortex";

export async function getAssistantResponse(input: {
  assistantType: AssistantType;
  messages: ChatMessage[];
  model?: string;
}): Promise<string> {
  const response = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error((await response.text()) || `Request failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error("No response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  const appendDelta = (delta: string) => {
    output += delta;
  };

  const processEventBlock = (eventBlock: string): { done: boolean; error: Error | null } => {
    const lines = eventBlock.split("\n").filter((line) => line.startsWith("data: "));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === "[DONE]") return { done: true, error: null };

      try {
        const json = JSON.parse(data);
        if (json.type === "response.completed") {
          return { done: true, error: null };
        }
        if (json.type === "response.failed") {
          return {
            done: true,
            error: new Error(json.response?.error ?? "response.failed"),
          };
        }

        const delta =
          json.type === "content_block_delta" && json.delta?.type === "text_delta"
            ? json.delta.text
            : json.type === "response.output_text.delta"
            ? json.delta
            : json.choices?.[0]?.delta?.content;

        if (delta) {
          appendDelta(delta);
        }
      } catch {
        // Ignore incomplete or non-JSON event data.
      }
    }

    return { done: false, error: null };
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    while (true) {
      const boundary = buffer.indexOf("\n\n");
      if (boundary === -1) break;

      const eventBlock = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const result = processEventBlock(eventBlock);
      if (result.error) throw result.error;
      if (result.done) return output.trim();
    }

    if (done) {
      const remainder = buffer.trim();
      if (remainder) {
        const result = processEventBlock(remainder);
        if (result.error) throw result.error;
      }
      break;
    }
  }

  return output.trim();
}

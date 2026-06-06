import { NextRequest } from "next/server";
import {
  streamCortexChat,
  type AssistantType,
  type ChatMessage,
} from "@/lib/cortex";
import { MODEL_IDS } from "@/lib/models";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const ASSISTANT_TYPES = new Set<AssistantType>(["blog", "linkedin"]);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, model, assistantType } = await req.json();

  if (!Array.isArray(messages)) {
    return new Response("messages must be an array", { status: 400 });
  }
  if (model !== undefined && typeof model !== "string") {
    return new Response("model must be a string", { status: 400 });
  }
  if (assistantType !== undefined && typeof assistantType !== "string") {
    return new Response("assistantType must be a string", { status: 400 });
  }
  if (model !== undefined && !MODEL_IDS.has(model)) {
    return new Response(`"${model}" is not a supported model`, { status: 400 });
  }
  if (assistantType !== undefined && !ASSISTANT_TYPES.has(assistantType as AssistantType)) {
    return new Response(`"${assistantType}" is not a supported assistantType`, { status: 400 });
  }

  try {
    const stream = await streamCortexChat(messages as ChatMessage[], {
      model,
      assistantType: (assistantType as AssistantType | undefined) ?? "linkedin",
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("Cortex error [model=%s]:", model ?? "default", detail);
    return new Response("The AI service encountered an error. Please try again.", { status: 500 });
  }
}

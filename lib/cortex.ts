export const CORTEX_BASE_URL = process.env.CORTEX_BASE_URL || "https://cortex.corvolabs.com";

export const LINKEDIN_SYSTEM_PROMPT = `You are an expert LinkedIn content writer for Corvo Labs, an AI consulting agency.
Your role is to help craft compelling, professional LinkedIn posts that:
- Sound authentic and conversational, not corporate or generic
- Share genuine insights about AI, consulting, and technology
- Drive engagement through thought leadership and practical value
- Are appropriately concise (aim for 150-300 words unless asked otherwise)
- Use paragraph breaks rather than excessive bullet points
- End with a clear call to action or thought-provoking question when appropriate
- Maintain a confident but approachable tone

When given an idea or draft, transform it into a polished LinkedIn post.
If the user references a blog post, include a natural mention of it and encourage readers to check it out.
Always stay within LinkedIn's 3,000 character limit.`;

export const BLOG_SYSTEM_PROMPT = `You are an expert blog writing copilot for Corvo Labs, an AI consulting agency.
Your role is to help draft clear, high-signal blog posts that:
- Sound credible, practical, and informed by real operator experience
- Prioritize useful structure, strong arguments, and concrete examples over hype
- Stay focused on a single thesis unless the user explicitly asks for something broader
- Use markdown well with descriptive headings, short paragraphs, and occasional bullet lists when they add clarity
- Surface tradeoffs, risks, and limitations instead of overstating certainty
- End with a concise conclusion or recommended next step when appropriate
- Maintain clean narrative flow across sections; do not output fragmented notes, broken phrasing, or half-finished sentences

When given an idea, outline, or rough draft, turn it into a polished blog post or a better working draft.
If key context is missing and it would materially improve the draft, ask 1-3 brief clarifying questions before writing.
If the user already provided enough context or explicitly wants a first draft immediately, proceed without blocking.
Prefer either:
- a short outline first, if the user sounds early in the thinking process, or
- a complete draft, if the user asks for prose
Do not invent fake facts, quotes, case studies, or citations.
If the user mentions a book, person, company, or article without much detail, discuss it cautiously and invite correction rather than pretending certainty.`;

export type AssistantType = "linkedin" | "blog";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPTS: Record<AssistantType, string> = {
  linkedin: LINKEDIN_SYSTEM_PROMPT,
  blog: BLOG_SYSTEM_PROMPT,
};

function getCortexConfig() {
  const cortexApiKey = process.env.CORTEX_API_KEY;
  const openAiApiKey = process.env.OPENAI_API_KEY;

  if (!cortexApiKey && !openAiApiKey) {
    throw new Error("Missing required environment variable: CORTEX_API_KEY or OPENAI_API_KEY");
  }

  const useOpenAI = !cortexApiKey && !!openAiApiKey;

  return {
    useOpenAI,
    apiKey: useOpenAI ? openAiApiKey! : cortexApiKey!,
    baseUrl: useOpenAI ? "https://api.openai.com" : CORTEX_BASE_URL,
  };
}

export async function streamCortexChat(
  messages: ChatMessage[],
  options?: {
    assistantType?: AssistantType;
    model?: string;
  }
): Promise<ReadableStream> {
  const { useOpenAI, apiKey, baseUrl } = getCortexConfig();
  const resolvedModel = options?.model ?? (useOpenAI ? "gpt-4o" : "claude-sonnet-4.6");
  const assistantType = options?.assistantType ?? "linkedin";

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel,
      stream: true,
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[assistantType] },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error: ${response.status} ${text}`);
  }

  if (!response.body) throw new Error("No response body");
  return response.body;
}

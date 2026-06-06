import { NextRequest, NextResponse } from "next/server";
import {
  buildClarifyingContext,
  buildFallbackDraft,
  type V2ChannelId,
  type V2ClarifyingAnswer,
} from "@/lib/v2";

export const runtime = "nodejs";

type RequestBody = {
  idea: Parameters<typeof buildFallbackDraft>[0]["idea"];
  voicePackMarkdown: string;
  channel: V2ChannelId;
  clarifyingAnswers?: V2ClarifyingAnswer[];
};

function fallbackDraft(body: RequestBody) {
  return buildFallbackDraft({
    idea: body.idea,
    channelId: body.channel,
    voicePackMarkdown: body.voicePackMarkdown,
    clarifyingContext: buildClarifyingContext(body.clarifyingAnswers ?? []),
  });
}

const CHANNEL_INSTRUCTIONS: Record<V2ChannelId, string> = {
  "corvo-blog": [
    "Write a high-signal Corvo Labs blog post in markdown body only (no frontmatter).",
    "Structure: practical problem → architecture/workflow split → why the naive approach breaks → review or measurement loop → reader takeaway.",
    "Avoid hype. Be precise and candid about constraints.",
  ].join(" "),
  linkedin: [
    "Write a short LinkedIn post (200–300 words).",
    "Open with one concrete hook or observation, not a question or a list header.",
    "One central lesson per post. Conversational but substantive.",
    "No hashtags unless they directly add context. No line breaks every sentence.",
  ].join(" "),
  youtube: [
    "Write a YouTube video script outline and description draft.",
    "Include: title, 3–5 sentence description for the video listing, and a brief script outline with timestamps.",
    "Make the setup explicit, include visual beat cues, and end with one concrete takeaway.",
  ].join(" "),
  x: [
    "Write a thread or single post for X (formerly Twitter).",
    "If a thread, use numbered tweets (1/, 2/, etc.). If single, keep under 280 characters.",
    "Lead with the sharpest claim. Cut everything soft.",
  ].join(" "),
  instagram: [
    "Write an Instagram caption (150–300 words).",
    "Open with a strong first line (visible before 'more'). Conversational and visual.",
    "End with a question or prompt that invites comments.",
  ].join(" "),
  tiktok: [
    "Write a TikTok video script (30–90 seconds).",
    "Hook in the first 3 seconds. Pacing is fast. End with a clear takeaway or CTA.",
    "Write it as spoken words, not prose.",
  ].join(" "),
  reddit: [
    "Write a Reddit post: title and body text.",
    "Body should be substantive and direct. No marketing language.",
    "Identify the subreddit context if relevant to tone.",
  ].join(" "),
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<RequestBody>;
  if (!body.idea || !body.voicePackMarkdown || !body.channel) {
    return NextResponse.json(
      { error: "idea, voicePackMarkdown, and channel are required" },
      { status: 400 }
    );
  }

  const apiKey = process.env.PIONEER_API_KEY?.trim();
  const model = process.env.PIONEER_DRAFT_MODEL?.trim() || "claude-opus-4-7";

  if (!apiKey) {
    return NextResponse.json({
      draft: fallbackDraft(body as RequestBody),
      provider: "local-placeholder",
      warning:
        "PIONEER_API_KEY is not configured. This deterministic draft is for local validation only.",
    });
  }

  const channelInstruction =
    CHANNEL_INSTRUCTIONS[body.channel] ??
    `Write a draft for the ${body.channel} channel. Follow the voice pack.`;
  const clarifyingContext = buildClarifyingContext(body.clarifyingAnswers ?? []);

  const prompt = [
    `Draft a high-signal post from this Idea for the target channel below.`,
    "Follow the voice pack exactly. Do not invent facts, citations, metrics, or case studies.",
    "",
    `Channel instructions: ${channelInstruction}`,
    "",
    "Voice pack:",
    body.voicePackMarkdown,
    "",
    "Idea:",
    JSON.stringify(body.idea, null, 2),
    clarifyingContext ? "\nClarifying answers collected from the user:" : "",
    clarifyingContext,
  ].join("\n");

  try {
    const response = await fetch("https://api.pioneer.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        messages: [
          {
            role: "system",
            content:
              "You are a careful editorial drafting assistant for Corvo Labs. Produce useful drafts, preserve caveats, and never claim publication or scheduling has happened.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Pioneer draft error [model=%s]: %s", model, detail);
      return NextResponse.json(
        {
          draft: fallbackDraft(body as RequestBody),
          provider: "local-placeholder",
          warning:
            "PioneerAI returned an error. A deterministic fallback draft was generated for continuity.",
        },
        { status: 502 }
      );
    }

    const data = await response.json();
    const draft =
      data?.choices?.[0]?.message?.content ||
      data?.output_text ||
      fallbackDraft(body as RequestBody);

    return NextResponse.json({ draft, provider: "pioneer", model, channel: body.channel });
  } catch (error) {
    console.error(
      "Pioneer draft request failed:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      {
        draft: fallbackDraft(body as RequestBody),
        provider: "local-placeholder",
        warning:
          "PioneerAI request failed. A deterministic fallback draft was generated for continuity.",
      },
      { status: 502 }
    );
  }
}

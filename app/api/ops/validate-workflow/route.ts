import { NextRequest, NextResponse } from "next/server";
import { createBlogPostPR } from "@/lib/github";
import {
  CORVO_PLACEHOLDER_VOICE_PACK,
  DEFAULT_WORKSPACE_STATE,
  CHANNEL_LABELS,
} from "@/lib/domain";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getSecret(req: NextRequest): string {
  const headerSecret =
    req.headers.get("x-resonate-v2-ops-secret") ||
    req.headers.get("x-v2-ops-secret") ||
    "";
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return headerSecret || bearer || "";
}

function validateSecret(req: NextRequest): boolean {
  const expected = process.env.V2_OPS_SECRET?.trim();
  const provided = getSecret(req).trim();
  return Boolean(expected && provided && expected === provided);
}

async function generatePioneerDraft(params: {
  channel: "corvo-blog" | "youtube";
  idea: (typeof DEFAULT_WORKSPACE_STATE)["ideas"][number];
  voicePackMarkdown: string;
}) {
  const apiKey = process.env.PIONEER_API_KEY?.trim();
  const model = process.env.PIONEER_DRAFT_MODEL?.trim() || "claude-opus-4-7";

  if (!apiKey) {
    throw new Error("PIONEER_API_KEY is not configured.");
  }

  const prompt = [
    "Draft a high-signal Corvo Labs post from this Idea.",
    "Follow the voice pack. Do not invent facts, citations, metrics, or case studies.",
    "If the target channel is Corvo Labs Blog, write markdown body only, without frontmatter.",
    "If the target channel is YouTube, write a concise script/description draft.",
    "",
    `Target channel: ${params.channel}`,
    `Target channel label: ${CHANNEL_LABELS[params.channel]}`,
    "",
    "Voice pack:",
    params.voicePackMarkdown,
    "",
    "Idea:",
    JSON.stringify(params.idea, null, 2),
  ].join("\n");

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
    throw new Error(`PioneerAI returned ${response.status}: ${detail.slice(0, 500)}`);
  }

  const data = await response.json();
  const draft = data?.choices?.[0]?.message?.content || data?.output_text;
  if (typeof draft !== "string" || draft.trim().length < 200) {
    throw new Error("PioneerAI returned an empty or unexpectedly short draft.");
  }

  return { draft: draft.trim(), model };
}

function validateYouTubePlaceholder(params: {
  title: string;
  description: string;
  scheduledDate: string;
}) {
  const issues: string[] = [];
  if (!params.title.trim()) issues.push("YouTube placeholder validation requires a title.");
  if (params.title.length > 100) issues.push("YouTube title should stay under 100 characters.");
  if (!params.description.trim()) {
    issues.push("YouTube placeholder validation requires a description/script.");
  }
  if (params.description.length > 5000) {
    issues.push("YouTube description should stay under 5,000 characters.");
  }
  if (!params.scheduledDate.trim()) {
    issues.push("A scheduled date is required to validate the scheduling handoff.");
  }

  return {
    ok: issues.length === 0,
    mode: "placeholder",
    provider: "youtube",
    credentialStatus: "placeholder-only",
    issues,
  };
}

export async function POST(req: NextRequest) {
  if (!validateSecret(req)) return unauthorized();

  const idea = DEFAULT_WORKSPACE_STATE.ideas[0];
  const scheduledDate = "2026-06-05";

  try {
    const blogDraft = await generatePioneerDraft({
      channel: "corvo-blog",
      idea,
      voicePackMarkdown: CORVO_PLACEHOLDER_VOICE_PACK,
    });

    const youtubeValidation = validateYouTubePlaceholder({
      title: idea.title,
      description:
        "Placeholder YouTube validation for the Corvo Labs claim validation workflow.",
      scheduledDate,
    });

    if (!youtubeValidation.ok) {
      return NextResponse.json(
        {
          ok: false,
          step: "youtube-placeholder",
          youtube: youtubeValidation,
        },
        { status: 422 }
      );
    }

    const blogPr = await createBlogPostPR({
      title: idea.title,
      content: blogDraft.draft,
      scheduledDate,
      status: "scheduled",
      subtitle:
        "Why claim validation needs curated examples, calibrated evals, and human review.",
      excerpt:
        "A practical Corvo Labs draft on golden sets, evaluator calibration, and review artifacts for trustworthy claim validation.",
      author: "Jake Butler",
      tags: ["AI evaluation", "claim validation", "FreshProof"],
      category: "strategy",
      featured: false,
      coverImageAlt: "Corvo Labs stacked logo mark.",
      images: [
        {
          sourceUrl: "/images/corvo-labs-stacked.svg",
          alt: "Corvo Labs stacked logo mark.",
          isCover: true,
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
      route: "/api/ops/validate-workflow",
      idea: {
        id: idea.id,
        brandId: idea.brandId,
        title: idea.title,
      },
      draft: {
        provider: "pioneer",
        model: blogDraft.model,
        length: blogDraft.draft.length,
      },
      youtube: youtubeValidation,
      blog: blogPr,
    });
  } catch (error) {
    console.error(
      "V2 workflow validation failed:",
      error instanceof Error ? error.message : String(error)
    );
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Workflow validation failed",
      },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import type { V2Claim, V2EditorialOutline } from "@/lib/v2";

export const runtime = "nodejs";

type RequestBody = {
  outline: V2EditorialOutline;
  acceptedClaims: V2Claim[];
  brandId?: string;
  voicePackMarkdown?: string;
};

function buildMockDraft(body: RequestBody): string {
  const { outline, acceptedClaims } = body;
  const claimLines = acceptedClaims
    .map((c, i) => `[^${i + 1}]: ${c.text}${c.caveats ? ` (${c.caveats})` : ""}`)
    .join("\n");

  const sectionBodies = outline.sections
    .map((s) => `## ${s.heading}\n\n${s.notes}\n\n`)
    .join("\n");

  const takeawayRows = outline.takeawayTable
    .map((r) => `| ${r.finding} | ${r.evidenceLabel} | ${r.source} |`)
    .join("\n");

  return [
    `# Weight Regain After GLP-1 Discontinuation: What the Evidence Actually Shows`,
    "",
    `> ${outline.thesis}`,
    "",
    `Most patients who stop semaglutide regain a significant portion of the weight they lost — often within a year. This is not a willpower failure. It is pharmacology. Understanding what the evidence actually says helps patients and providers plan more honestly. [^1]`,
    "",
    sectionBodies,
    "## Key Takeaways",
    "",
    "| Finding | Evidence Level | Source |",
    "| ------- | -------------- | ------ |",
    takeawayRows,
    "",
    "---",
    "",
    "### References",
    "",
    claimLines,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

function buildDraftPrompt(body: RequestBody): string {
  const claimsText = body.acceptedClaims
    .map(
      (c, i) =>
        `[^${i + 1}] "${c.text}" (${c.evidenceLabel}, confidence: ${c.confidence})${c.caveats ? ` — Caveat: ${c.caveats}` : ""}`
    )
    .join("\n");

  const sectionsText = body.outline.sections
    .map((s) => `## ${s.heading}\nNotes: ${s.notes}`)
    .join("\n\n");

  const voicePack = body.voicePackMarkdown
    ? `\n\nVoice guide:\n${body.voicePackMarkdown}`
    : "";

  return [
    "You are a senior health-content writer producing an evidence-based long-form article in markdown.",
    "Write ONLY the article body — no preamble, no explanation.",
    "Use [^N] footnotes to cite claims. Include a References section at the end.",
    `Thesis: ${body.outline.thesis}`,
    voicePack,
    "",
    "Outline sections:",
    sectionsText,
    "",
    "Accepted claims (use as footnotes):",
    claimsText,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<RequestBody>;

  if (!body.outline || typeof body.outline !== "object" || !body.outline.thesis) {
    return NextResponse.json({ error: "outline is required" }, { status: 400 });
  }
  if (!Array.isArray(body.acceptedClaims) || body.acceptedClaims.length === 0) {
    return NextResponse.json({ error: "acceptedClaims must be a non-empty array" }, { status: 400 });
  }

  const apiKey = process.env.PIONEER_API_KEY?.trim();
  const model = process.env.PIONEER_DRAFT_MODEL?.trim() || "claude-opus-4-7";

  if (!apiKey) {
    const draft = buildMockDraft(body as RequestBody);
    return NextResponse.json({
      draft,
      provider: "mock",
      warning:
        "PIONEER_API_KEY is not configured. This is a pre-structured mock draft. Configure PIONEER_API_KEY to generate from your actual outline and accepted claims.",
    });
  }

  try {
    const response = await fetch("https://api.pioneer.ai/v1/chat/completions", {
      method: "POST",
      headers: { "X-API-Key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        messages: [
          {
            role: "system",
            content:
              "You are a senior health-content writer. Return only the article in markdown, no preamble.",
          },
          { role: "user", content: buildDraftPrompt(body as RequestBody) },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Pioneer long-form-draft error:", await response.text());
      const draft = buildMockDraft(body as RequestBody);
      return NextResponse.json({ draft, provider: "mock", warning: "PioneerAI error. Returning mock draft." });
    }

    const data = await response.json();
    const draft: string = data?.choices?.[0]?.message?.content ?? "";

    if (!draft.trim()) {
      const mockDraft = buildMockDraft(body as RequestBody);
      return NextResponse.json({ draft: mockDraft, provider: "mock", warning: "PioneerAI returned empty response. Returning mock draft." });
    }

    return NextResponse.json({ draft, provider: "pioneer", model });
  } catch (error) {
    console.error("Pioneer long-form-draft request failed:", error instanceof Error ? error.message : String(error));
    const draft = buildMockDraft(body as RequestBody);
    return NextResponse.json({ draft, provider: "mock", warning: "PioneerAI request failed. Returning mock draft." });
  }
}

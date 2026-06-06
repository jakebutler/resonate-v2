import { NextRequest, NextResponse } from "next/server";
import { makeClaim, type V2ClaimConfidence, type V2EvidenceLabel, type V2SourceRecord } from "@/lib/v2";

export const runtime = "nodejs";

type RequestBody = {
  topic: string;
  thesis?: string;
  brandId?: string;
  acceptedSources: V2SourceRecord[];
};

/** Pre-seeded mock claims for the FreshProof GLP-1 discontinuation topic. */
function buildMockClaims(sources: V2SourceRecord[]) {
  const sourceId = (idx: number) => sources[idx]?.id ?? "";
  return [
    makeClaim({
      text: "The majority of patients regain most of their lost weight within one year of stopping semaglutide.",
      sourceIds: [sourceId(0), sourceId(1)].filter(Boolean),
      evidenceLabel: "rct-meta-analysis",
      confidence: "high",
      caveats: "Based on STEP 4 extension data; may vary by patient adherence to lifestyle changes after discontinuation.",
    }),
    makeClaim({
      text: "Weight regain after GLP-1 discontinuation is accompanied by reversal of cardiometabolic improvements, including blood pressure, lipid levels, and glycemic control.",
      sourceIds: [sourceId(0)].filter(Boolean),
      evidenceLabel: "rct-meta-analysis",
      confidence: "high",
      caveats: "SELECT trial follow-up; long-term outcomes beyond two years are less well-characterized.",
    }),
    makeClaim({
      text: "GLP-1 receptor agonists suppress appetite primarily through central nervous system mechanisms, which reverse upon discontinuation.",
      sourceIds: [sourceId(2)].filter(Boolean),
      evidenceLabel: "mechanism",
      confidence: "high",
      caveats: "Most mechanistic data from animal models; direct human CNS imaging data is limited.",
    }),
    makeClaim({
      text: "Structured tapering and lifestyle continuity can reduce — but not eliminate — weight regain after GLP-1 discontinuation.",
      sourceIds: [sourceId(3)].filter(Boolean),
      evidenceLabel: "practice-principle",
      confidence: "medium",
      caveats: "Limited RCT data on tapering protocols specifically; recommendation largely based on expert opinion.",
    }),
    makeClaim({
      text: "Proactive patient counseling about expected weight regain improves informed consent and treatment adherence decisions.",
      sourceIds: [sourceId(4)].filter(Boolean),
      evidenceLabel: "expert-practice",
      confidence: "medium",
      caveats: "Based on Endocrine Society expert consensus; limited patient-reported outcome data.",
    }),
  ];
}

function buildClaimPrompt(body: RequestBody): string {
  const sourceContext = body.acceptedSources
    .map((s, i) => `Source ${i + 1} [id: ${s.id}]: "${s.title}" (${s.evidenceLabel}, relevance ${s.relevanceScore ?? "?"}) — ${s.useCase}`)
    .join("\n");

  return [
    "You are a rigorous editorial researcher. Generate a JSON array of candidate claims derived strictly from the provided sources.",
    "Each claim must be directly supported by at least one of the provided sources.",
    "Do not invent claims unsupported by the sources. Return only the JSON array — no prose.",
    "",
    `Topic: ${body.topic}`,
    body.thesis ? `Thesis: ${body.thesis}` : "",
    "",
    "Sources:",
    sourceContext,
    "",
    'Each claim: { text, evidenceLabel (from the supporting source), confidence ("high"|"medium"|"low"), caveats?, sourceIds (array of source id strings from above) }',
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<RequestBody>;

  if (!body.topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }
  if (!Array.isArray(body.acceptedSources) || body.acceptedSources.length === 0) {
    return NextResponse.json(
      { error: "acceptedSources must be a non-empty array of accepted source records" },
      { status: 400 }
    );
  }

  const apiKey = process.env.PIONEER_API_KEY?.trim();
  const model = process.env.PIONEER_DRAFT_MODEL?.trim() || "claude-opus-4-7";

  if (!apiKey) {
    const claims = buildMockClaims(body.acceptedSources);
    return NextResponse.json({
      claims,
      provider: "mock",
      warning:
        "PIONEER_API_KEY is not configured. These are pre-seeded mock claims for the FreshProof GLP-1 topic. Configure PIONEER_API_KEY to generate claims from your actual accepted sources.",
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
              "You are a rigorous editorial researcher. Return only valid JSON. Never invent claims or sources. Only derive claims from the provided source list.",
          },
          { role: "user", content: buildClaimPrompt(body as RequestBody) },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Pioneer claim-map error [model=%s]: %s", model, detail);
      const claims = buildMockClaims(body.acceptedSources);
      return NextResponse.json({
        claims,
        provider: "mock",
        warning: "PioneerAI returned an error. Returning mock claims for continuity.",
      });
    }

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";

    let rawClaims: { text?: string; evidenceLabel?: string; confidence?: string; caveats?: string; sourceIds?: string[] }[] | null = null;
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) rawClaims = parsed;
    } catch {
      rawClaims = null;
    }

    if (!rawClaims) {
      const claims = buildMockClaims(body.acceptedSources);
      return NextResponse.json({
        claims,
        provider: "mock",
        warning: "PioneerAI response could not be parsed as a claim list. Returning mock claims.",
      });
    }

    const claims = rawClaims
      .filter((c) => typeof c.text === "string" && c.text.trim())
      .map((c) =>
        makeClaim({
          text: c.text!,
          sourceIds: Array.isArray(c.sourceIds) ? c.sourceIds : [],
          evidenceLabel: (c.evidenceLabel as V2EvidenceLabel) ?? "weaker-support",
          confidence: (c.confidence as V2ClaimConfidence) ?? "medium",
          caveats: c.caveats,
        })
      );

    return NextResponse.json({ claims, provider: "pioneer", model });
  } catch (error) {
    console.error("Pioneer claim-map request failed:", error instanceof Error ? error.message : String(error));
    const claims = buildMockClaims(body.acceptedSources);
    return NextResponse.json({
      claims,
      provider: "mock",
      warning: "PioneerAI request failed. Returning mock claims for continuity.",
    });
  }
}

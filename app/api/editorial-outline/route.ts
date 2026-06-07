import { NextRequest, NextResponse } from "next/server";
import {
  EVIDENCE_LABELS,
  makeEditorialOutline,
  makeOutlineSection,
  makeTakeawayRow,
  type EvidenceLabel,
  type Claim,
  type OutlineSection,
  type TakeawayRow,
} from "@/lib/domain";

export const runtime = "nodejs";

type RequestBody = {
  thesis: string;
  claimMapId: string;
  brandId: string;
  topic?: string;
  acceptedClaims: Claim[];
};

function displayText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(displayText).filter(Boolean).join("; ");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const likelyCitationFields = [
      record.primarySources,
      record.secondarySources,
      record.citationStrategy,
      record.citationStyle,
      record.evidenceHierarchy,
      record.caveatsHandling,
      record.title,
      record.name,
      record.url,
    ];
    const fromFields = likelyCitationFields.map(displayText).filter(Boolean).join("; ");
    if (fromFields) return fromFields;
    return JSON.stringify(value);
  }
  return "";
}

function normalizeEvidenceLabels(value: unknown): EvidenceLabel[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(displayText)
    .filter((label): label is EvidenceLabel =>
      EVIDENCE_LABELS.includes(label as EvidenceLabel)
    );
}

function normalizeOutlineSection(input: OutlineSection): OutlineSection {
  return makeOutlineSection({
    heading: displayText(input.heading),
    notes: displayText(input.notes),
    claimIds: Array.isArray(input.claimIds) ? input.claimIds.map(displayText).filter(Boolean) : [],
    evidenceLabels: normalizeEvidenceLabels(input.evidenceLabels),
  });
}

function normalizeTakeawayRow(input: TakeawayRow): TakeawayRow {
  const evidenceLabels = normalizeEvidenceLabels([input.evidenceLabel]);
  return makeTakeawayRow({
    finding: displayText(input.finding),
    evidenceLabel: evidenceLabels[0] ?? "weaker-support",
    source: displayText(input.source),
  });
}

function buildMockOutline(body: RequestBody) {
  const claims = body.acceptedClaims;
  return makeEditorialOutline({
    claimMapId: body.claimMapId ?? "cmap-mock",
    brandId: (body.brandId ?? "freshproof") as Parameters<typeof makeEditorialOutline>[0]["brandId"],
    thesis: body.thesis,
    sections: [
      makeOutlineSection({
        heading: "The Clinical Reality of GLP-1 Discontinuation",
        notes:
          "Open with the key statistic: most patients regain significant weight within one year. Cite trial data. No minimizing.",
        claimIds: claims.filter((c) => c.evidenceLabel === "rct-meta-analysis").map((c) => c.id),
        evidenceLabels: ["rct-meta-analysis"],
      }),
      makeOutlineSection({
        heading: "Why the Weight Comes Back: The Mechanism",
        notes:
          "Explain appetite suppression via CNS. Clarify this is not a willpower failure — it is pharmacology reversing.",
        claimIds: claims.filter((c) => c.evidenceLabel === "mechanism").map((c) => c.id),
        evidenceLabels: ["mechanism"],
      }),
      makeOutlineSection({
        heading: "What Patients and Providers Can Do",
        notes:
          "Structured tapering, lifestyle continuity, realistic counseling. Cite OMA guidelines and Endocrine Society.",
        claimIds: claims
          .filter((c) => ["practice-principle", "expert-practice"].includes(c.evidenceLabel))
          .map((c) => c.id),
        evidenceLabels: ["practice-principle", "expert-practice"],
      }),
      makeOutlineSection({
        heading: "The Honest Conversation: Setting Expectations",
        notes:
          "Patient counseling reduces harm. Discontinuation without a plan leads to worse outcomes. Cite expert consensus.",
        claimIds: claims.filter((c) => c.evidenceLabel === "expert-practice").map((c) => c.id),
        evidenceLabels: ["expert-practice"],
      }),
    ],
    takeawayTable: [
      makeTakeawayRow({
        finding: "Two-thirds of lost weight is regained within one year of stopping semaglutide",
        evidenceLabel: "rct-meta-analysis",
        source: "STEP 4 extension — PubMed 2022",
      }),
      makeTakeawayRow({
        finding: "Cardiometabolic improvements (BP, lipids, glycemic control) also reverse after discontinuation",
        evidenceLabel: "rct-meta-analysis",
        source: "SELECT trial — NEJM 2023",
      }),
      makeTakeawayRow({
        finding: "GLP-1 appetite suppression is pharmacological — it reverts when the drug clears",
        evidenceLabel: "mechanism",
        source: "GLP-1 mechanism review — NIH PMC 2023",
      }),
      makeTakeawayRow({
        finding: "Structured tapering and lifestyle continuity reduce (but do not eliminate) regain",
        evidenceLabel: "practice-principle",
        source: "OMA Obesity Algorithm 2024",
      }),
    ],
    citationPlan:
      "Footnotes in markdown format [^N]. STEP 4 = [^1], SELECT = [^2], NIH mechanism review = [^3], OMA guideline = [^4], Endocrine Society = [^5].",
  });
}

function buildOutlinePrompt(body: RequestBody): string {
  const claimsText = body.acceptedClaims
    .map((c, i) => `Claim ${i + 1}: "${c.text}" (${c.evidenceLabel}, confidence: ${c.confidence})${c.caveats ? ` — Caveat: ${c.caveats}` : ""}`)
    .join("\n");

  return [
    "You are a rigorous editorial planner. Generate a JSON editorial outline for a long-form evidence-based article.",
    "Use only the accepted claims below. Return only valid JSON — no prose.",
    "",
    `Thesis: ${body.thesis}`,
    body.topic ? `Topic: ${body.topic}` : "",
    "",
    "Accepted claims:",
    claimsText,
    "",
    "Return: { thesis, sections: [{ heading, notes, claimIds: [], evidenceLabels: [] }], takeawayTable: [{ finding, evidenceLabel, source }], citationPlan }",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<RequestBody>;

  if (!body.thesis?.trim()) {
    return NextResponse.json({ error: "thesis is required" }, { status: 400 });
  }
  if (!Array.isArray(body.acceptedClaims) || body.acceptedClaims.length === 0) {
    return NextResponse.json({ error: "acceptedClaims must be a non-empty array" }, { status: 400 });
  }

  const apiKey = process.env.PIONEER_API_KEY?.trim();
  const model = process.env.PIONEER_DRAFT_MODEL?.trim() || "claude-opus-4-7";

  if (!apiKey) {
    const outline = buildMockOutline(body as RequestBody);
    return NextResponse.json({
      outline,
      provider: "mock",
      warning:
        "PIONEER_API_KEY is not configured. This is a pre-structured mock outline for the GLP-1 topic. Configure PIONEER_API_KEY to generate from your actual accepted claims.",
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
          { role: "system", content: "You are a rigorous editorial planner. Return only valid JSON." },
          { role: "user", content: buildOutlinePrompt(body as RequestBody) },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Pioneer editorial-outline error:", await response.text());
      const outline = buildMockOutline(body as RequestBody);
      return NextResponse.json({ outline, provider: "mock", warning: "PioneerAI error. Returning mock outline." });
    }

    const data = await response.json();
    const content: string = data?.choices?.[0]?.message?.content ?? "";

    let raw: { thesis?: unknown; sections?: OutlineSection[]; takeawayTable?: TakeawayRow[]; citationPlan?: unknown } | null = null;
    try {
      raw = JSON.parse(content);
    } catch {
      raw = null;
    }

    if (!raw || !raw.thesis) {
      const outline = buildMockOutline(body as RequestBody);
      return NextResponse.json({ outline, provider: "mock", warning: "PioneerAI response could not be parsed. Returning mock outline." });
    }

    const outline = makeEditorialOutline({
      claimMapId: body.claimMapId ?? "cmap-unknown",
      brandId: (body.brandId ?? "freshproof") as Parameters<typeof makeEditorialOutline>[0]["brandId"],
      thesis: displayText(raw.thesis),
      sections: (raw.sections ?? []).map(normalizeOutlineSection),
      takeawayTable: (raw.takeawayTable ?? []).map(normalizeTakeawayRow),
      citationPlan: displayText(raw.citationPlan),
    });

    return NextResponse.json({ outline, provider: "pioneer", model });
  } catch (error) {
    console.error("Pioneer editorial-outline request failed:", error instanceof Error ? error.message : String(error));
    const outline = buildMockOutline(body as RequestBody);
    return NextResponse.json({ outline, provider: "mock", warning: "PioneerAI request failed. Returning mock outline." });
  }
}

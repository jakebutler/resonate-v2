// Real campaign draft generation over the citation plumbing.
//
// Follows the answer-engine precedent (lib/answerEngine.ts): the Cortex
// gateway with an OpenAI-compatible fallback, injected fetch, per-run budget
// admission that fails closed, and strictly bounded grounding — a draft may
// only draw on the excerpts its slot's idea already cites (D-6). Nothing here
// dispatches at import time; every network call happens inside a function
// invoked with a CampaignDraftingContext.
//
// L8: generation only. These functions produce draft text; approval and
// publishing stay in their own human-gated mutations.

import { containsPlaceholderTokens } from "./campaignDrafts";

const DEFAULT_CORTEX_BASE_URL = "https://cortex.corvolabs.com";

const DEFAULT_RUN_CEILING_CENTS = 100;
const DEFAULT_COST_PER_DRAFT_CENTS = 4;

export type CampaignDraftingContext = {
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

export type CampaignDraftingLimits = {
  runCeilingCents: number;
  costPerDraftCents: number;
};

function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function campaignDraftingRunLimits(
  env: Record<string, string | undefined>
): CampaignDraftingLimits {
  return {
    runCeilingCents: positiveIntFromEnv(
      env.CAMPAIGN_DRAFT_RUN_CEILING_CENTS,
      DEFAULT_RUN_CEILING_CENTS
    ),
    costPerDraftCents: positiveIntFromEnv(
      env.CAMPAIGN_DRAFT_COST_PER_DRAFT_CENTS,
      DEFAULT_COST_PER_DRAFT_CENTS
    ),
  };
}

/**
 * The gateway credential, resolved exactly like the answer engine: the Cortex
 * gateway when CORTEX_API_KEY is set, otherwise the OpenAI-compatible
 * fallback. Null means live drafting is not configured and fails closed.
 */
export function campaignDraftingCredential(env: Record<string, string | undefined>): {
  apiKey: string;
  baseUrl: string;
  model: string;
} | null {
  const cortexKey = env.CORTEX_API_KEY?.trim();
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const modelOverride = env.CAMPAIGN_DRAFT_MODEL?.trim();
  if (cortexKey) {
    return {
      apiKey: cortexKey,
      baseUrl: env.CORTEX_BASE_URL?.trim() || DEFAULT_CORTEX_BASE_URL,
      model: modelOverride || "claude-sonnet-4.6",
    };
  }
  if (openAiKey) {
    return {
      apiKey: openAiKey,
      baseUrl: "https://api.openai.com",
      model: modelOverride || "gpt-4o",
    };
  }
  return null;
}

export type DraftGenerationRunPlan =
  | { ok: true; draftCount: number; estimatedCostCents: number; ceilingCents: number }
  | {
      ok: false;
      reason: "no-slots" | "budget-exceeded";
      draftCount: number;
      estimatedCostCents: number;
      ceilingCents: number;
    };

/**
 * Per-run budget admission, mirroring the answer engine: refuse before any
 * dispatch when the estimated cost (drafts x per-draft estimate) exceeds the
 * run ceiling. Nothing writes until every draft is composed, so a refusal
 * leaves the campaign untouched.
 */
export function planDraftGenerationRun(input: {
  draftCount: number;
  limits: CampaignDraftingLimits;
}): DraftGenerationRunPlan {
  const estimatedCostCents = input.draftCount * input.limits.costPerDraftCents;
  if (input.draftCount <= 0) {
    return {
      ok: false,
      reason: "no-slots",
      draftCount: input.draftCount,
      estimatedCostCents,
      ceilingCents: input.limits.runCeilingCents,
    };
  }
  if (estimatedCostCents > input.limits.runCeilingCents) {
    return {
      ok: false,
      reason: "budget-exceeded",
      draftCount: input.draftCount,
      estimatedCostCents,
      ceilingCents: input.limits.runCeilingCents,
    };
  }
  return {
    ok: true,
    draftCount: input.draftCount,
    estimatedCostCents,
    ceilingCents: input.limits.runCeilingCents,
  };
}

export function budgetRefusalMessage(plan: {
  ok: false;
  reason: "no-slots" | "budget-exceeded";
  draftCount: number;
  estimatedCostCents: number;
  ceilingCents: number;
}): string {
  if (plan.reason === "no-slots") {
    return "Live draft generation refused: the accepted shape has no slots to draft.";
  }
  return (
    `Live draft generation refused: generating ${plan.draftCount} draft(s) is estimated at ` +
    `${plan.estimatedCostCents} cents, above the ${plan.ceilingCents}-cent run ceiling ` +
    `(CAMPAIGN_DRAFT_RUN_CEILING_CENTS). Raise the ceiling and retry, or generate in mock mode.`
  );
}

/** One grounding excerpt: corpus text plus the citation that licenses it. */
export type DraftingExcerpt = {
  citation: string;
  text: string;
  provenance: string;
};

export type DraftingSlotInput = {
  seq: number;
  slotId: string;
  role: string;
  channel: string;
  mediaType: string;
  title?: string;
  angle?: string;
  ideaText?: string;
  /** The slot's grounding set — citations outside it are refused (D-6). */
  excerptCitations?: string[];
  /** Resolved excerpt text for the slot's citations. */
  excerpts: DraftingExcerpt[];
};

export type CampaignDraftResult =
  | { ok: true; title: string; content: string }
  | { ok: false; reason: string };

const SYSTEM_PROMPT = `You are a campaign content drafter. You compose one post for a slot in an accepted campaign shape.

You will receive the slot's role, channel, and media type, its title and angle if any, the linked working-set idea, and the ONLY source excerpts you may draw on — each labeled with a corpus citation of the form corpus://<brand>/<corpus>#excerpt-<n>.

Rules:
- Ground every factual claim in the labeled excerpts. Cite as you draft: include the exact corpus:// citation string inline (in square brackets) wherever a claim draws on an excerpt.
- Never invent facts, quotes, numbers, names, or citations. Citations not given to you are forbidden.
- Never emit bracketed placeholder tokens such as [ANGLE: ...], [THESIS: ...], [EVIDENCE: ...], or [CTA: ...] — write the real copy they would stand in for.
- Match the slot: a pillar is a structured markdown piece; a hook is a short punchy post; a satellite develops one facet of the pillar's claim; a recap summarizes the set; a CTA makes exactly one ask.
- Return strictly valid JSON: {"title": "...", "content": "..."} with no markdown fencing and no text outside the JSON.`;

function formatSlotBrief(slot: DraftingSlotInput): string {
  const lines = [
    `Slot: seq=${slot.seq} role=${slot.role} channel=${slot.channel} mediaType=${slot.mediaType}`,
    slot.title ? `Title: ${slot.title}` : null,
    slot.angle ? `Angle: ${slot.angle}` : null,
    slot.ideaText ? `Linked idea: ${slot.ideaText}` : null,
  ].filter((line): line is string => line !== null);
  return lines.join("\n");
}

function formatExcerpts(slot: DraftingSlotInput): string {
  if (slot.excerpts.length === 0) {
    return "Grounding excerpts: none. Write only framing and the idea's own claim — do not state any external fact.";
  }
  return [
    "Grounding excerpts (the only sources you may draw on):",
    ...slot.excerpts.map(
      (excerpt) => `- [${excerpt.citation}] (from ${excerpt.provenance}): ${excerpt.text}`
    ),
  ].join("\n");
}

/** Pure prompt composition, testable without any network or gateway. */
export function buildDraftingMessages(slot: DraftingSlotInput): {
  system: string;
  user: string;
} {
  return {
    system: SYSTEM_PROMPT,
    user: `${formatSlotBrief(slot)}\n\n${formatExcerpts(slot)}\n\nCompose this slot's draft now. Return the JSON object.`,
  };
}

const CITATION_PATTERN = /corpus:\/\/[^\s\])]+/g;

/**
 * Composition validation: real copy, no placeholder tokens, and citations
 * confined to the slot's grounding set (and present when grounding exists).
 */
export function validateComposedDraft(
  draft: { title: string; content: string },
  slot: DraftingSlotInput
): { ok: true } | { ok: false; reason: string } {
  if (!draft.content.trim()) {
    return { ok: false, reason: "the model returned no draft content" };
  }
  if (containsPlaceholderTokens(draft.content)) {
    return {
      ok: false,
      reason: "the model returned placeholder tokens instead of real copy",
    };
  }
  const allowed = new Set(slot.excerptCitations ?? []);
  const cited = [...new Set(draft.content.match(CITATION_PATTERN) ?? [])];
  const foreign = cited.filter((citation) => !allowed.has(citation));
  if (foreign.length > 0) {
    return {
      ok: false,
      reason: `the draft cites excerpts outside its grounding set (${foreign[0]}${foreign.length > 1 ? ` and ${foreign.length - 1} more` : ""})`,
    };
  }
  if (allowed.size > 0 && cited.length === 0) {
    return {
      ok: false,
      reason: "the draft cites none of its grounding excerpts — cite as you draft",
    };
  }
  return { ok: true };
}

function parseDraftJson(raw: string): { title: string; content: string } | null {
  // Tolerate markdown fencing around the JSON object; everything else is refused.
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  try {
    const parsed: unknown = JSON.parse(stripped);
    if (typeof parsed !== "object" || parsed === null) return null;
    const title = (parsed as { title?: unknown }).title;
    const content = (parsed as { content?: unknown }).content;
    if (typeof title !== "string" || typeof content !== "string") return null;
    return { title: title.trim(), content };
  } catch {
    return null;
  }
}

/**
 * Compose one slot's draft through the Cortex/Pioneer gateway. The credential
 * gate is fail-closed: without a key the call refuses with an explicit reason
 * and fetch is never invoked.
 */
export async function composeSlotDraft(
  context: CampaignDraftingContext,
  slot: DraftingSlotInput
): Promise<CampaignDraftResult> {
  const config = campaignDraftingCredential(context.env);
  if (!config) {
    return {
      ok: false,
      reason:
        "Live draft generation requires CORTEX_API_KEY or OPENAI_API_KEY; credentials are not configured.",
    };
  }
  const messages = buildDraftingMessages(slot);
  const fetchImpl = context.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
      }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    return {
      ok: false,
      reason: `Gateway request failed: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }
  if (!response.ok) {
    return { ok: false, reason: `Gateway returned HTTP ${response.status}.` };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "Gateway returned a non-JSON response." };
  }
  const answer = (body as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    return { ok: false, reason: "Gateway response contained no draft text." };
  }
  const draft = parseDraftJson(answer);
  if (!draft) {
    return {
      ok: false,
      reason: "the model did not return the expected {title, content} JSON",
    };
  }
  const validation = validateComposedDraft(draft, slot);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }
  return {
    ok: true,
    title: draft.title || slot.title || `Slot ${slot.seq} — ${slot.mediaType}`,
    content: draft.content,
  };
}

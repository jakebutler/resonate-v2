import { describe, expect, it, vi } from "vitest";
import {
  budgetRefusalMessage,
  buildDraftingMessages,
  campaignDraftingCredential,
  composeSlotDraft,
  planDraftGenerationRun,
  validateComposedDraft,
  type DraftingSlotInput,
} from "../campaignDrafting";

const CITATION = "corpus://corvo/corpus_1#excerpt-1";
const OTHER_CORPUS_CITATION = "corpus://corvo/corpus_9#excerpt-2";

function slot(overrides: Partial<DraftingSlotInput> = {}): DraftingSlotInput {
  return {
    seq: 2,
    slotId: "00000000000000000010002campaignSlots",
    role: "satellite",
    channel: "linkedin",
    mediaType: "post",
    title: "Slot 2 title",
    ideaText: "Working-set idea with a complete claim.",
    excerptCitations: [CITATION],
    excerpts: [
      {
        citation: CITATION,
        text: "Grounding beats vibes: every claim ships with a corpus pointer.",
        provenance: "2026 field notes",
      },
    ],
    ...overrides,
  };
}

function gatewayResponse(content: unknown, status = 200) {
  return new Response(typeof content === "string" ? content : JSON.stringify(content), {
    status,
  });
}

function draftPayload(content: string, title = "A composed draft") {
  return { choices: [{ message: { content: JSON.stringify({ title, content }) } }] };
}

describe("campaignDraftingCredential", () => {
  it("prefers the Cortex gateway and honors the model override", () => {
    const config = campaignDraftingCredential({
      CORTEX_API_KEY: "cortex-key",
      CORTEX_BASE_URL: "https://cortex.example.com",
      CAMPAIGN_DRAFT_MODEL: "custom-model",
    });
    expect(config).toEqual({
      apiKey: "cortex-key",
      baseUrl: "https://cortex.example.com",
      model: "custom-model",
    });
  });

  it("falls back to the OpenAI-compatible endpoint", () => {
    const config = campaignDraftingCredential({ OPENAI_API_KEY: "sk-test" });
    expect(config).toEqual({
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com",
      model: "gpt-4o",
    });
  });

  it("is null without any credential — live drafting fails closed", () => {
    expect(campaignDraftingCredential({})).toBeNull();
  });
});

describe("planDraftGenerationRun", () => {
  const limits = { runCeilingCents: 100, costPerDraftCents: 4 };

  it("admits a run inside the ceiling", () => {
    const plan = planDraftGenerationRun({ draftCount: 5, limits });
    expect(plan).toMatchObject({ ok: true, estimatedCostCents: 20 });
  });

  it("refuses before any dispatch when the estimate exceeds the ceiling", () => {
    const plan = planDraftGenerationRun({
      draftCount: 30,
      limits: { ...limits, runCeilingCents: 100 },
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok && plan.reason === "budget-exceeded") {
      expect(budgetRefusalMessage(plan)).toMatch(/CAMPAIGN_DRAFT_RUN_CEILING_CENTS/);
    } else {
      throw new Error("expected a budget-exceeded refusal");
    }
  });

  it("refuses a run with no slots", () => {
    expect(planDraftGenerationRun({ draftCount: 0, limits }).ok).toBe(false);
  });
});

describe("buildDraftingMessages", () => {
  it("labels each grounding excerpt with its citation", () => {
    const messages = buildDraftingMessages(slot());
    expect(messages.user).toContain(`[${CITATION}]`);
    expect(messages.user).toContain("2026 field notes");
    expect(messages.system).toMatch(/cite as you draft/i);
    expect(messages.system).toMatch(/Never emit bracketed placeholder tokens/i);
  });

  it("states the no-grounding rule explicitly when a slot cites nothing", () => {
    const messages = buildDraftingMessages(slot({ excerptCitations: [], excerpts: [] }));
    expect(messages.user).toMatch(/Grounding excerpts: none/i);
  });
});

describe("validateComposedDraft", () => {
  it("accepts real copy that cites its grounding set", () => {
    expect(
      validateComposedDraft(
        { title: "t", content: `A claim worth making. [${CITATION}]` },
        slot()
      )
    ).toEqual({ ok: true });
  });

  it("refuses placeholder tokens instead of copy", () => {
    const result = validateComposedDraft(
      { title: "t", content: `[ANGLE: sharpen the angle] [${CITATION}]` },
      slot()
    );
    expect(result.ok).toBe(false);
  });

  it("refuses citations outside the slot's grounding set", () => {
    const result = validateComposedDraft(
      { title: "t", content: `A claim. [${OTHER_CORPUS_CITATION}]` },
      slot()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/outside its grounding set/);
  });

  it("refuses copy that cites none of its grounding excerpts", () => {
    const result = validateComposedDraft(
      { title: "t", content: "A claim with no citation at all." },
      slot()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cite as you draft/);
  });
});

describe("composeSlotDraft", () => {
  it("refuses without credentials and never invokes fetch", async () => {
    const fetchMock = vi.fn();
    const result = await composeSlotDraft({ env: {}, fetchImpl: fetchMock }, slot());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/credentials are not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("composes a grounded draft through the gateway", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(gatewayResponse(draftPayload(`A grounded claim. [${CITATION}]`)));
    const result = await composeSlotDraft(
      { env: { CORTEX_API_KEY: "cortex-key" }, fetchImpl: fetchMock },
      slot()
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content).toContain(CITATION);
      expect(result.title).toBe("A composed draft");
    }
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cortex.corvolabs.com/v1/chat/completions");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("claude-sonnet-4.6");
    expect(body.messages[0].role).toBe("system");
  });

  it("tolerates fenced JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      gatewayResponse({
        choices: [
          {
            message: {
              content: `\`\`\`json\n${JSON.stringify({
                title: "T",
                content: `Claim. [${CITATION}]`,
              })}\n\`\`\``,
            },
          },
        ],
      })
    );
    const result = await composeSlotDraft(
      { env: { OPENAI_API_KEY: "sk" }, fetchImpl: fetchMock },
      slot()
    );
    expect(result.ok).toBe(true);
  });

  it("refuses gateway errors, non-JSON, empty answers, and malformed draft payloads", async () => {
    const ok = (content: unknown) => composeSlotDraft(
      { env: { CORTEX_API_KEY: "k" }, fetchImpl: vi.fn().mockResolvedValue(content) },
      slot()
    );
    expect((await ok(gatewayResponse("nope", 503))).ok).toBe(false);
    expect((await ok(gatewayResponse("not json"))).ok).toBe(false);
    expect(
      (await ok(gatewayResponse({ choices: [{ message: { content: "" } }] }))).ok
    ).toBe(false);
    expect(
      (await ok(gatewayResponse({ choices: [{ message: { content: "prose only" } }] })))
        .ok
    ).toBe(false);
  });

  it("refuses a draft that cites outside its grounding set, before anything is written", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(gatewayResponse(draftPayload(`Invented. [${OTHER_CORPUS_CITATION}]`)));
    const result = await composeSlotDraft(
      { env: { CORTEX_API_KEY: "k" }, fetchImpl: fetchMock },
      slot()
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/outside its grounding set/);
  });
});

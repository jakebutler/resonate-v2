import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  IMAGE_PACKET_REFERENCES,
  LIVE_ABSENT_PREREQUISITE,
  QUALIFICATION_MAX_PROMPT_BYTES,
  QUALIFICATION_PER_ATTEMPT_CAP_MICROS,
  QUALIFICATION_SEQUENCE_CAP_MICROS,
  assertQualificationPacketCaps,
  assertQualificationPromptBytes,
  prepareImageQualificationRoute,
  prepareTextQualificationRoute,
  qualificationGate,
} from "../visualQualification";
import { VISUAL_PROVIDER_CAPABILITIES } from "../visualProviders";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const functionalPacket = JSON.parse(readFileSync(resolve(repoRoot, "docs/editorial-visuals/providers/functional-first-packet.json"), "utf8")) as {
  base_packet_sha256: string;
  maximum_charge_usd: number;
  sequence_planned_maximum_usd: number;
  reference_inputs: { order: number; role: string; sha256: string; bytes: number; width: number; height: number; approval_provenance: string }[];
  quote_guards: { prompt_utf8_bytes_max: number };
};

const identity = {
  capabilityReceiptIds: ["gpt-image-1-functional-generation-receipt", "gpt-image-1-functional-edit-receipt"],
  boundReceiptId: "gpt-image-1-functional-bound-receipt",
  reviewedBy: "offline-test-review",
  provenance: "Recorded functional packet receipts from docs/editorial-visuals/providers/tdd-receipts.md; not a live qualification",
  expiresAt: 4_000_000_000_000,
};

describe("image qualification packet", () => {
  it("prepares the exact reviewed gpt-image-1 low/low functional route", () => {
    expect(prepareImageQualificationRoute(identity, 1_000)).toEqual({
      provider: "openai",
      model: "gpt-image-1",
      apiModelId: "gpt-image-1",
      operations: ["generate", "edit"],
      referenceInputs: true,
      maxInputImages: 3,
      size: "1536x1024",
      outputFormat: "png",
      quality: "low",
      inputFidelity: "low",
      maximumMicros: 250_000,
      maxPromptBytes: 9_045,
      maxInputBytes: 4 * 1024 * 1024,
      capabilityReceiptIds: identity.capabilityReceiptIds,
      boundReceiptId: identity.boundReceiptId,
      reviewedBy: identity.reviewedBy,
      provenance: identity.provenance,
      expiresAt: 4_000_000_000_000,
    });
  });

  it("matches a documented entry in the provider capability matrix, so registerReviewedImageRoute admits it", () => {
    const prepared = prepareImageQualificationRoute(identity, 1_000);
    const documented = VISUAL_PROVIDER_CAPABILITIES.find(route => route.provider === prepared.provider && route.model === prepared.model && route.apiModelId === prepared.apiModelId);
    expect(documented).toBeDefined();
    expect(prepared.operations.every(operation => documented!.operations.includes(operation))).toBe(true);
    expect(prepared.referenceInputs).toBe(documented!.referenceInputs);
    expect(prepared.maxInputImages).toBeLessThanOrEqual(documented!.maxInputImages);
    expect(documented!.sizes).toContain(prepared.size);
    expect(documented!.outputFormats).toContain(prepared.outputFormat);
  });

  it("rejects missing or malformed receipt evidence with named errors", () => {
    expect(() => prepareImageQualificationRoute({ ...identity, capabilityReceiptIds: [] }, 1_000)).toThrow("recorded capability receipt ids");
    expect(() => prepareImageQualificationRoute({ ...identity, capabilityReceiptIds: ["bad receipt!"] }, 1_000)).toThrow("receipt ids must match");
    expect(() => prepareImageQualificationRoute({ ...identity, reviewedBy: "  " }, 1_000)).toThrow("Reviewed-by identity");
    expect(() => prepareImageQualificationRoute({ ...identity, provenance: "x".repeat(1_001) }, 1_000)).toThrow("provenance");
    expect(() => prepareImageQualificationRoute({ ...identity, expiresAt: 1_000 }, 1_000)).toThrow("expiry must be in the future");
  });
});

describe("text qualification packet", () => {
  const textBounds = {
    model: "gpt-5.1-mini",
    maxInputBytes: 20_000,
    maxInputTokens: 21_000,
    maxMessageOverheadTokens: 1_000,
    contextWindowTokens: 30_000,
    maxOutputTokens: 4_000,
    inputPriceMicrosPerMillion: 1_250_000,
    outputPriceMicrosPerMillion: 10_000_000,
  };

  it("prepares a planning-stage route with the operator-measured bounds", () => {
    expect(prepareTextQualificationRoute({ ...textBounds, ...identity }, 1_000)).toEqual({
      provider: "openai",
      model: textBounds.model,
      stages: ["planning"],
      maxInputBytes: 20_000,
      maxInputTokens: 21_000,
      maxMessageOverheadTokens: 1_000,
      contextWindowTokens: 30_000,
      maxOutputTokens: 4_000,
      inputPriceMicrosPerMillion: 1_250_000,
      outputPriceMicrosPerMillion: 10_000_000,
      capabilityReceiptIds: identity.capabilityReceiptIds,
      tokenBoundReceiptId: identity.boundReceiptId,
      priceReceiptId: identity.boundReceiptId,
      reviewedBy: identity.reviewedBy,
      provenance: identity.provenance,
      expiresAt: 4_000_000_000_000,
    });
  });

  it("rejects inconsistent measured bounds with named errors", () => {
    expect(() => prepareTextQualificationRoute({ ...textBounds, ...identity, maxInputTokens: 15_000 }, 1_000)).toThrow("cover the UTF-8 byte bound");
    expect(() => prepareTextQualificationRoute({ ...textBounds, ...identity, contextWindowTokens: 24_000 }, 1_000)).toThrow("context window");
    expect(() => prepareTextQualificationRoute({ ...textBounds, ...identity, maxInputBytes: 0 }, 1_000)).toThrow("positive integer");
    expect(() => prepareTextQualificationRoute({ ...textBounds, ...identity, model: "bad model id" }, 1_000)).toThrow("model id must match");
  });
});

describe("packet caps and prompt quote guard", () => {
  it("admits the reviewed two-call reservation ladder and refuses anything larger", () => {
    expect(() => assertQualificationPacketCaps([QUALIFICATION_PER_ATTEMPT_CAP_MICROS, QUALIFICATION_PER_ATTEMPT_CAP_MICROS])).not.toThrow();
    expect(() => assertQualificationPacketCaps([300_000, 250_000])).toThrow("exactly the reviewed $0.25 maximum");
    expect(() => assertQualificationPacketCaps([QUALIFICATION_PER_ATTEMPT_CAP_MICROS, QUALIFICATION_PER_ATTEMPT_CAP_MICROS, QUALIFICATION_PER_ATTEMPT_CAP_MICROS])).toThrow("exactly two calls");
  });

  it("enforces the 9,045-byte prompt quote guard", () => {
    const atLimit = "a".repeat(QUALIFICATION_MAX_PROMPT_BYTES);
    expect(() => assertQualificationPromptBytes(atLimit)).not.toThrow();
    // é is two UTF-8 bytes: 9,044 characters can exceed the byte guard.
    const overBytes = "é".repeat(QUALIFICATION_MAX_PROMPT_BYTES / 2 + 1);
    expect(() => assertQualificationPromptBytes(overBytes)).toThrow("UTF-8 bytes");
  });
});

describe("live qualification gate", () => {
  it("defaults to the zero-cost fixture tier without written approval", () => {
    expect(qualificationGate({ approved: undefined, credentials: { image: false, text: false } })).toEqual({ mode: "offline-fixture" });
    expect(qualificationGate({ approved: "yes", credentials: { image: true, text: true } })).toEqual({ mode: "offline-fixture" });
  });

  it("reports ABSENT with the named missing credentials and prerequisite when approval lacks keys", () => {
    const gate = qualificationGate({ approved: "approved", credentials: { image: false, text: false } });
    expect(gate).toEqual({ mode: "absent", missing: ["OPENAI_API_KEY", "OPENAI_TEXT_API_KEY or CORTEX_API_KEY"], prerequisite: LIVE_ABSENT_PREREQUISITE });
    const imageOnly = qualificationGate({ approved: "approved", credentials: { image: true, text: false } });
    expect(imageOnly.mode === "absent" && imageOnly.missing).toEqual(["OPENAI_TEXT_API_KEY or CORTEX_API_KEY"]);
  });

  it("admits the live mode only with approval plus present credentials, carrying the model-availability notice", () => {
    const gate = qualificationGate({ approved: "approved", credentials: { image: true, text: true } });
    expect(gate.mode).toBe("live");
    if (gate.mode === "live") expect(gate.notice).toMatch(/gpt-image-1 shutdown was scheduled/);
  });
});

describe("the prepared packet mirrors the reviewed docs packets", () => {
  it("keeps the functional-first packet anchored to the committed base packet", () => {
    const basePacketBytes = readFileSync(resolve(repoRoot, "docs/editorial-visuals/providers/qualification-packet.json"));
    expect(createHash("sha256").update(basePacketBytes).digest("hex")).toBe(functionalPacket.base_packet_sha256);
  });

  it("mirrors the frozen reference inputs, caps and quote guard from the functional-first packet", () => {
    expect(QUALIFICATION_PER_ATTEMPT_CAP_MICROS).toBe(functionalPacket.maximum_charge_usd * 1_000_000);
    expect(QUALIFICATION_SEQUENCE_CAP_MICROS).toBe(functionalPacket.sequence_planned_maximum_usd * 1_000_000);
    expect(QUALIFICATION_MAX_PROMPT_BYTES).toBe(functionalPacket.quote_guards.prompt_utf8_bytes_max);
    expect(IMAGE_PACKET_REFERENCES.map(reference => ({ order: reference.order, role: reference.role, sha256: reference.sha256, bytes: reference.bytes, width: reference.width, height: reference.height })))
      .toEqual(functionalPacket.reference_inputs.map(reference => ({ order: reference.order, role: reference.role, sha256: reference.sha256, bytes: reference.bytes, width: reference.width, height: reference.height })));
  });
});

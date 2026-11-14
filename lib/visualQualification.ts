import { VISUAL_PROVIDER_CAPABILITIES } from "./visualProviders";

/**
 * Pure preparation for the route-qualification operator tooling (C3).
 *
 * Every bound below is grounded in the reviewed packets under
 * docs/editorial-visuals/providers/: the functional-first packet
 * (functional-first-packet.json) and its independent cost bound
 * (gpt-image-1-functional-bound.md). No network, no keys, no ledger writes.
 */

/** $0.25 per call, $0.50 for the two-call generation+edit sequence (functional bound doc, reviewed 2026-09-30). */
export const QUALIFICATION_PER_ATTEMPT_CAP_MICROS = 250_000;
export const QUALIFICATION_SEQUENCE_CAP_MICROS = 500_000;
/** The packet's exact prompt budget: total prompt bytes ≤ 9,045 per call (functional-first quote_guards). */
export const QUALIFICATION_MAX_PROMPT_BYTES = 9_045;
/**
 * Input byte bound for a registered route: covers the documented seed references
 * (largest 2,178,138 bytes) with headroom for the verified 1536x1024 parent, well
 * inside MAX_VISUAL_IMAGE_BYTES. Dispatch still verifies exact hashes and dimensions.
 */
export const QUALIFICATION_MAX_INPUT_BYTES = 4 * 1024 * 1024;

/**
 * gpt-image-1 shutdown was scheduled for 2026-10-23 and the model is no longer
 * served (confirmed via /v1/models on 2026-11-13). Jake approved re-pinning to
 * gpt-image-1.5 on 2026-11-13, then upgraded the pin to gpt-image-2 the same
 * day after the model comparison (PR #163); the pin is never silently changed
 * without that approval trail.
 * enforced: operators must verify model availability before a live dispatch and must
 * not fall back to another model under this quote.
 */
export const IMAGE_ROUTE_MODEL_AVAILABILITY_NOTICE =
  "Original pin gpt-image-1 is no longer served (shutdown was scheduled 2026-10-23); Jake approved gpt-image-1.5 on 2026-11-13, then upgraded the pin to gpt-image-2 the same day after the model comparison (PR #163): image-2 best matches the cut-paper style references and preserves edits best at comparable cost ($0.150 vs $0.153 per sequence) with roughly double latency (~60s vs ~36s), a tradeoff Jake accepted — model pins require explicit review.";

/** Frozen approved reference inputs, mirrored from functional-first-packet.json (lib test enforces the mirror stays in sync). */
export const IMAGE_PACKET_REFERENCES = [
  {
    order: 1,
    role: "identity",
    sourceFileName: "raven-character-sheet.png",
    sha256: "0900adbe822813085b585b6415dd958e994046ec47122ca248e6ee525b4db316",
    bytes: 2_178_138,
    width: 1_448,
    height: 1_086,
  },
  {
    order: 2,
    role: "style",
    sourceFileName: "article-04.png",
    sha256: "fca4cce79b178b5b586d5e39d48653ea1c0c267575887e855730df0dd13525eb",
    bytes: 1_866_944,
    width: 1_600,
    height: 900,
  },
] as const;

export const LIVE_SUBMISSION_APPROVED_VALUE = "approved";
export const QUALIFICATION_OPERATOR_TOKEN_ENV =
  "VISUAL_QUALIFICATION_OPERATOR_TOKEN";
export const LIVE_SUBMISSION_APPROVAL_ENV = "VISUAL_QUALIFICATION_APPROVED";

export const IMAGE_CREDENTIAL_ENV = "OPENAI_API_KEY";
/** The text credential is satisfied by either reviewed text runtime key. */
export const TEXT_CREDENTIAL_ENVS = [
  "OPENAI_TEXT_API_KEY",
  "CORTEX_API_KEY",
] as const;

export const LIVE_ABSENT_PREREQUISITE =
  "Jake mints the scoped provider keys and provisions them as Convex environment variables via Obvious secrets; the deployment also needs VISUAL_QUALIFICATION_OPERATOR_TOKEN and VISUAL_QUALIFICATION_APPROVED=approved before a live packet can be admitted.";

const receiptIdPattern = /^[a-zA-Z0-9._:-]{1,160}$/;

export type QualificationRouteIdentity = {
  capabilityReceiptIds: readonly string[];
  boundReceiptId: string;
  reviewedBy: string;
  provenance: string;
  expiresAt: number;
};

export type PreparedImageQualificationRoute = {
  provider: "openai";
  model: "gpt-image-2";
  apiModelId: "gpt-image-2-2026-04-21";
  operations: ["generate", "edit"];
  referenceInputs: true;
  maxInputImages: 3;
  size: "1536x1024";
  outputFormat: "png";
  quality: "low";
  inputFidelity?: "low";
  maximumMicros: typeof QUALIFICATION_PER_ATTEMPT_CAP_MICROS;
  maxPromptBytes: typeof QUALIFICATION_MAX_PROMPT_BYTES;
  maxInputBytes: typeof QUALIFICATION_MAX_INPUT_BYTES;
  capabilityReceiptIds: string[];
  boundReceiptId: string;
  reviewedBy: string;
  provenance: string;
  expiresAt: number;
};

export type TextQualificationBounds = {
  model: string;
  maxInputBytes: number;
  maxInputTokens: number;
  maxMessageOverheadTokens: number;
  contextWindowTokens: number;
  maxOutputTokens: number;
  inputPriceMicrosPerMillion: number;
  outputPriceMicrosPerMillion: number;
};

export type PreparedTextQualificationRoute = TextQualificationBounds & {
  provider: "openai";
  stages: ["planning"];
  capabilityReceiptIds: string[];
  tokenBoundReceiptId: string;
  priceReceiptId: string;
  reviewedBy: string;
  provenance: string;
  expiresAt: number;
};

function assertReceiptEvidence(
  identity: QualificationRouteIdentity,
  now: number,
): void {
  if (
    !identity.capabilityReceiptIds.length ||
    identity.capabilityReceiptIds.length > 16
  )
    throw new Error(
      "Qualification route requires the recorded capability receipt ids (1-16)",
    );
  if (
    [...identity.capabilityReceiptIds, identity.boundReceiptId].some(
      (id) => !receiptIdPattern.test(id),
    )
  )
    throw new Error(
      "Capability/bound receipt ids must match [a-zA-Z0-9._:-]{1,160}",
    );
  if (!identity.reviewedBy.trim() || identity.reviewedBy.length > 200)
    throw new Error("Reviewed-by identity is required (1-200 chars)");
  if (!identity.provenance.trim() || identity.provenance.length > 1000)
    throw new Error(
      "Qualification provenance is required (1-1000 chars) and must cite the recorded receipts",
    );
  if (!Number.isSafeInteger(identity.expiresAt) || identity.expiresAt <= now)
    throw new Error("Qualification route expiry must be in the future");
}

/** Builds the exact registerReviewedImageRoute args for the reviewed functional packet. Throws with a named error on missing evidence. */
export function prepareImageQualificationRoute(
  identity: QualificationRouteIdentity,
  now = Date.now(),
): PreparedImageQualificationRoute {
  assertReceiptEvidence(identity, now);
  const capability = VISUAL_PROVIDER_CAPABILITIES.find(
    (route) =>
      route.provider === "openai" &&
      route.model === "gpt-image-2" &&
      route.apiModelId === "gpt-image-2-2026-04-21",
  );
  if (!capability)
    throw new Error(
      "The functional packet model is missing from the documented provider capability matrix",
    );
  return {
    provider: "openai",
    model: "gpt-image-2",
    apiModelId: "gpt-image-2-2026-04-21",
    operations: ["generate", "edit"],
    referenceInputs: true,
    // Generation binds 2 references; the edit binds the generated parent plus both references.
    maxInputImages: 3,
    size: "1536x1024",
    outputFormat: "png",
    quality: "low",
    maximumMicros: QUALIFICATION_PER_ATTEMPT_CAP_MICROS,
    maxPromptBytes: QUALIFICATION_MAX_PROMPT_BYTES,
    maxInputBytes: QUALIFICATION_MAX_INPUT_BYTES,
    capabilityReceiptIds: [...identity.capabilityReceiptIds],
    boundReceiptId: identity.boundReceiptId,
    reviewedBy: identity.reviewedBy,
    provenance: identity.provenance,
    expiresAt: identity.expiresAt,
  };
}

/** Validates the operator-measured text bounds and builds the exact registerReviewedTextRoute args for a planning route. */
export function prepareTextQualificationRoute(
  request: TextQualificationBounds & QualificationRouteIdentity,
  now = Date.now(),
): PreparedTextQualificationRoute {
  assertReceiptEvidence(request, now);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(request.model))
    throw new Error(
      "Text model id must match [a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}",
    );
  const bounds = [
    request.maxInputBytes,
    request.maxInputTokens,
    request.maxMessageOverheadTokens,
    request.contextWindowTokens,
    request.maxOutputTokens,
    request.inputPriceMicrosPerMillion,
    request.outputPriceMicrosPerMillion,
  ];
  if (bounds.some((amount) => !Number.isSafeInteger(amount) || amount <= 0))
    throw new Error(
      "Text qualification requires positive integer measured bounds/prices",
    );
  if (
    request.maxInputBytes > 220_000 ||
    request.maxInputTokens > 1_000_000 ||
    request.maxOutputTokens > 20_000
  )
    throw new Error(
      "Measured text bounds exceed the reviewed tokenizer envelope",
    );
  if (
    request.maxInputTokens <
    request.maxInputBytes + request.maxMessageOverheadTokens
  )
    throw new Error(
      "Measured token bound must cover the UTF-8 byte bound plus message overhead",
    );
  if (
    request.contextWindowTokens <
    request.maxInputTokens + request.maxOutputTokens
  )
    throw new Error(
      "Measured context window must cover input plus output token bounds",
    );
  return {
    provider: "openai",
    model: request.model,
    stages: ["planning"],
    maxInputBytes: request.maxInputBytes,
    maxInputTokens: request.maxInputTokens,
    maxMessageOverheadTokens: request.maxMessageOverheadTokens,
    contextWindowTokens: request.contextWindowTokens,
    maxOutputTokens: request.maxOutputTokens,
    inputPriceMicrosPerMillion: request.inputPriceMicrosPerMillion,
    outputPriceMicrosPerMillion: request.outputPriceMicrosPerMillion,
    capabilityReceiptIds: [...request.capabilityReceiptIds],
    tokenBoundReceiptId: request.boundReceiptId,
    priceReceiptId: request.boundReceiptId,
    reviewedBy: request.reviewedBy,
    provenance: request.provenance,
    expiresAt: request.expiresAt,
  };
}

/** The exact two-call reservation ladder for the functional packet: $0.25 per call, $0.50 for the sequence. */
export function assertQualificationPacketCaps(
  perAttemptMicros: readonly number[],
): void {
  if (perAttemptMicros.length !== 2)
    throw new Error(
      "The functional qualification packet is exactly two calls (generation then edit)",
    );
  if (
    perAttemptMicros.some(
      (micros) => micros !== QUALIFICATION_PER_ATTEMPT_CAP_MICROS,
    )
  )
    throw new Error(
      "Each qualification call reserves exactly the reviewed $0.25 maximum",
    );
  if (
    perAttemptMicros.reduce((sum, micros) => sum + micros, 0) >
    QUALIFICATION_SEQUENCE_CAP_MICROS
  )
    throw new Error(
      "The qualification sequence reserves at most the reviewed $0.50 maximum",
    );
}

/** Total prompt bytes per call must stay inside the packet's reviewed 9,045-byte quote guard. */
export function assertQualificationPromptBytes(prompt: string): void {
  const bytes = new TextEncoder().encode(prompt).length;
  if (bytes > QUALIFICATION_MAX_PROMPT_BYTES)
    throw new Error(
      `Qualification prompt is ${bytes} UTF-8 bytes; the reviewed quote guard allows at most ${QUALIFICATION_MAX_PROMPT_BYTES}`,
    );
}

export type QualificationGateInput = {
  approved: string | null | undefined;
  credentials: { image: boolean; text: boolean };
};

export type QualificationGate =
  | { mode: "offline-fixture" }
  | { mode: "absent"; missing: string[]; prerequisite: string }
  | { mode: "live"; credentials: string[]; notice: string };

/**
 * Explicit gate logic (spec V7 pattern): fixture mode is the zero-cost default,
 * a blocked live attempt reports ABSENT with the prerequisite named, and only
 * written approval plus present credentials admit the live packet.
 */
export function qualificationGate(
  input: QualificationGateInput,
): QualificationGate {
  if (input.approved !== LIVE_SUBMISSION_APPROVED_VALUE)
    return { mode: "offline-fixture" };
  const missing: string[] = [];
  if (!input.credentials.image) missing.push(IMAGE_CREDENTIAL_ENV);
  if (!input.credentials.text) missing.push(TEXT_CREDENTIAL_ENVS.join(" or "));
  if (missing.length)
    return { mode: "absent", missing, prerequisite: LIVE_ABSENT_PREREQUISITE };
  return {
    mode: "live",
    credentials: [IMAGE_CREDENTIAL_ENV, ...TEXT_CREDENTIAL_ENVS],
    notice: IMAGE_ROUTE_MODEL_AVAILABILITY_NOTICE,
  };
}

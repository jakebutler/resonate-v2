export type VisualProviderId = "digitalocean" | "openai";
export type VisualOperation = "generate" | "edit";
export type VisualOutputFormat = "png" | "jpeg" | "webp";
export type VisualProviderMode = "live" | "offline-contract" | "qualification-probe";
export const MAX_VISUAL_IMAGE_BYTES = 20 * 1024 * 1024;

function hasImageSignature(bytes: Uint8Array, mimeType: string): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_VISUAL_IMAGE_BYTES) return false;
  if (mimeType === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte);
  if (mimeType === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mimeType === "image/webp") return [82, 73, 70, 70].every((byte, i) => bytes[i] === byte) &&
    [87, 69, 66, 80].every((byte, i) => bytes[i + 8] === byte);
  return false;
}
async function hashBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export type VisualRouteCapability = {
  provider: VisualProviderId;
  /** Canonical model identity; separate from the provider's API name. */
  model: string;
  apiModelId: string;
  qualification: "unverified" | "live-receipt" | "speculative-fixture" | "authorized-probe";
  receiptIds: readonly string[];
  operations: readonly VisualOperation[];
  referenceInputs: boolean;
  maxInputImages: number;
  sizes: readonly string[];
  outputFormats: readonly VisualOutputFormat[];
};
export const VISUAL_PROVIDER_CAPABILITIES: readonly VisualRouteCapability[] = [
  { provider: "openai", model: "gpt-image-1", apiModelId: "gpt-image-1", qualification: "unverified", receiptIds: [], operations: ["generate", "edit"], referenceInputs: true, maxInputImages: 16, sizes: ["1024x1024", "1536x1024", "1024x1536"], outputFormats: ["png", "jpeg", "webp"] },
  { provider: "openai", model: "gpt-image-1-mini", apiModelId: "gpt-image-1-mini", qualification: "unverified", receiptIds: [], operations: ["generate", "edit"], referenceInputs: true, maxInputImages: 16, sizes: ["1024x1024", "1536x1024", "1024x1536"], outputFormats: ["png", "jpeg", "webp"] },
  { provider: "digitalocean", model: "gpt-image-2", apiModelId: "openai-gpt-image-2",
    qualification: "unverified", receiptIds: [], operations: ["generate"],
    referenceInputs: false, maxInputImages: 0, sizes: ["1536x1024", "1024x1536"],
    outputFormats: ["png", "jpeg", "webp"] },
  { provider: "openai", model: "gpt-image-2", apiModelId: "gpt-image-2-2026-04-21",
    qualification: "unverified", receiptIds: [], operations: ["generate", "edit"],
    referenceInputs: true, maxInputImages: 16, sizes: ["1024x1024", "1536x1024", "1024x1536"],
    outputFormats: ["png", "jpeg", "webp"] },
];
export type VisualRouteRequest = {
  operation: VisualOperation;
  model: string;
  referenceCount: number;
  size: string;
  outputFormat: VisualOutputFormat;
  mode?: VisualProviderMode;
  preferredProvider?: VisualProviderId;
  previousOutcome?: "uncertain";
};

export function selectVisualProviderRoute(
  request: VisualRouteRequest,
  routes: readonly VisualRouteCapability[] = VISUAL_PROVIDER_CAPABILITIES,
) {
  if (request.previousOutcome === "uncertain") {
    return { ok: false as const, reason: "reconciliation-required" as const, blockedRoutes: [] as string[] };
  }
  const preferred = request.preferredProvider ?? "digitalocean";
  const candidates = [...routes].sort((a, b) => Number(b.provider === preferred) - Number(a.provider === preferred));
  const route = candidates.find((candidate) =>
    candidate.model === request.model &&
    (request.mode === "offline-contract"
      ? candidate.qualification === "speculative-fixture" && candidate.receiptIds.length === 0
      : request.mode === "qualification-probe" ? candidate.qualification === "authorized-probe" && candidate.receiptIds.length === 0
      : candidate.qualification === "live-receipt" && candidate.receiptIds.length > 0) &&
    candidate.operations.includes(request.operation) &&
    (request.referenceCount === 0 || candidate.referenceInputs) &&
    request.referenceCount <= candidate.maxInputImages &&
    candidate.sizes.includes(request.size) && candidate.outputFormats.includes(request.outputFormat),
  );
  return route ? { ok: true as const, route } : {
    ok: false as const, reason: "no-qualified-route" as const,
    blockedRoutes: candidates.map((candidate) => `${candidate.provider}:${candidate.apiModelId}`),
  };
}

export type VisualImageInput = {
  id: string;
  role: "identity" | "style" | "composition" | "edit-parent";
  storageId: string;
  sha256: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  bytes: Uint8Array;
};
export type VisualPinnedRevisions = {
  articleRevision: string;
  profileRevision: string;
  lessonRevisions: readonly string[];
};
function validRevisionPins(pins: VisualPinnedRevisions): boolean {
  const valid = (value: unknown) => typeof value === "string" && value.trim().length > 0 && value === value.trim();
  return valid(pins.articleRevision) && valid(pins.profileRevision) && Array.isArray(pins.lessonRevisions) && pins.lessonRevisions.every(valid);
}
export type VisualProviderInput = {
  attemptId: string;
  /** Trusted coordinator's stable post/scene/operation key, unchanged by retries or provider switches. */
  lineageKey: string;
  operation: VisualOperation;
  mode?: VisualProviderMode;
  model?: string;
  /** Deliberate user selection, including changing the selected edit parent's model. */
  modelOverride?: string;
  preferredProvider?: VisualProviderId;
  prompt: string;
  feedback?: string;
  revisions: VisualPinnedRevisions;
  references: readonly VisualImageInput[];
  parentImage?: VisualImageInput & { versionId: string; model: string; provider: VisualProviderId };
  size: string;
  quality: "low" | "medium" | "high";
  inputFidelity?: "low" | "high";
  outputFormat: VisualOutputFormat;
  previousOutcome?: "uncertain";
};
export type PreparedVisualProviderRequest = {
  attemptId: string;
  lineageKey: string;
  operation: VisualOperation;
  mode: VisualProviderMode;
  route: VisualRouteCapability;
  prompt: string;
  feedback?: string;
  parentVersionId?: string;
  parentModel?: string;
  modelOverride: string | null;
  revisions: VisualPinnedRevisions;
  images: readonly VisualImageInput[];
  requestSha256: string;
  request: {
    path: "/v1/images/edits" | "/v1/images/generations";
    encoding: "multipart" | "json";
    /** Transport appends images as ordered image[] parts for multipart. */
    fields: { model: string; prompt: string; n: 1; size: string; quality: string; input_fidelity?: "low" | "high";
      output_format: VisualOutputFormat; background: "opaque"; stream: false };
  };
};
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
/** Content checksum only. Authorization requires a separately resolved durable server claim. */
export async function hashVisualProviderRequest(request: Omit<PreparedVisualProviderRequest, "requestSha256">): Promise<string> {
  const preimage = {
    transport: request.request,
    images: request.images.map(({ id, storageId, role, sha256, mimeType }) => ({ id, storageId, role, sha256, mimeType })),
    attemptId: request.attemptId, lineageKey: request.lineageKey, operation: request.operation, mode: request.mode,
    provider: request.route.provider, apiModelId: request.route.apiModelId, canonicalModel: request.route.model,
    parentVersionId: request.parentVersionId ?? null, parentModel: request.parentModel ?? null,
    modelOverride: request.modelOverride, revisions: request.revisions,
    feedbackSha256: request.feedback ? await hashBytes(new TextEncoder().encode(request.feedback)) : null,
  };
  return hashBytes(new TextEncoder().encode(canonicalJson(preimage)));
}

/** Pure preparation. The caller must resolve owned storage bytes before this boundary. */
export async function prepareVisualProviderRequest(
  input: VisualProviderInput,
  routes: readonly VisualRouteCapability[] = VISUAL_PROVIDER_CAPABILITIES,
): Promise<PreparedVisualProviderRequest> {
  if (!validRevisionPins(input.revisions)) throw new Error("Valid nonempty revision pins are required");
  input = { ...input, revisions: { ...input.revisions, lessonRevisions: [...input.revisions.lessonRevisions] },
    references: input.references.map(image => ({ ...image })),
    ...(input.parentImage ? { parentImage: { ...input.parentImage } } : {}) };
  if (input.prompt.length > 32_000) throw new Error("Image prompt exceeds documented character limit");
  if (input.operation !== "generate" && input.operation !== "edit") throw new Error("Invalid visual operation");
  if (!input.attemptId?.trim() || !input.lineageKey?.trim() || !input.prompt?.trim()) throw new Error("Attempt, lineage and prompt are required");
  if (input.model && input.modelOverride && input.model !== input.modelOverride) throw new Error("Conflicting model and modelOverride");
  if (input.operation !== "edit" && input.parentImage) throw new Error("A parent image is only permitted for edits");
  if (input.operation === "edit" && (!input.parentImage || !input.feedback?.trim())) {
    throw new Error("An edit requires the selected parent image and feedback");
  }
  if (input.parentImage && (input.parentImage.role !== "edit-parent" || !input.parentImage.versionId?.trim())) {
    throw new Error("Selected parent role and version are required");
  }
  if (input.references.some(image => !["identity", "style", "composition"].includes(image.role))) {
    throw new Error("Invalid reference role");
  }
  if (input.operation === "edit" && input.model && input.model !== input.parentImage?.model && !input.modelOverride) {
    throw new Error("Use modelOverride for an intentional edit model change");
  }
  const images = input.parentImage ? [input.parentImage, ...input.references] : [...input.references];
  for (const key of ["id", "storageId", "sha256"] as const) {
    if (new Set(images.map(image => image[key])).size !== images.length) throw new Error("Duplicate image provenance");
  }
  if (images.some((image) => !image.id || !image.storageId || !/^[a-f0-9]{64}$/.test(image.sha256) || !image.bytes.length)) {
    throw new Error("Every image input requires retained bytes and provenance");
  }
  if (images.some(image => !hasImageSignature(image.bytes, image.mimeType))) throw new Error("Invalid or oversized image signature");
  // Snapshot before awaiting so a caller cannot mutate the verified bytes during digest resolution.
  const retainedImages = images.map(image => ({ ...image, bytes: new Uint8Array(image.bytes) }));
  for (const image of retainedImages) {
    if (await hashBytes(image.bytes) !== image.sha256) throw new Error("Image digest does not match retained bytes");
  }
  const selection = selectVisualProviderRoute({
    operation: input.operation, model: input.modelOverride ?? input.parentImage?.model ?? input.model ?? "gpt-image-2",
    referenceCount: images.length, size: input.size, outputFormat: input.outputFormat,
    mode: input.mode, preferredProvider: input.preferredProvider, previousOutcome: input.previousOutcome,
  }, routes);
  if (!selection.ok) throw new Error(selection.reason);
  if (selection.route.provider === "digitalocean" && (images.length > 0 || input.operation === "edit")) {
    throw new Error("DigitalOcean reference/edit request contract is not established");
  }
  if (input.inputFidelity && !["gpt-image-1-mini", "gpt-image-1"].includes(selection.route.model)) throw new Error("Input fidelity is only configured for explicit GPT Image1 routes");
  const request: PreparedVisualProviderRequest["request"] = {
    path: images.length ? "/v1/images/edits" : "/v1/images/generations",
    encoding: images.length ? "multipart" : "json", fields: {
      ...(input.inputFidelity ? { input_fidelity: input.inputFidelity } : {}), model: selection.route.apiModelId, prompt: input.prompt, n: 1, size: input.size,
      quality: input.quality, output_format: input.outputFormat, background: "opaque", stream: false,
    },
  };
  const prepared: Omit<PreparedVisualProviderRequest, "requestSha256"> = {
    attemptId: input.attemptId, lineageKey: input.lineageKey, operation: input.operation, mode: input.mode ?? "live",
    route: selection.route, prompt: input.prompt, feedback: input.feedback,
    parentVersionId: input.parentImage?.versionId, revisions: { ...input.revisions, lessonRevisions: [...input.revisions.lessonRevisions] },
    parentModel: input.parentImage?.model, modelOverride: input.modelOverride ?? null,
    images: retainedImages,
    request,
  };
  return { ...prepared, requestSha256: await hashVisualProviderRequest(prepared) };
}

export type VisualDispatchClaim = {
  claimId: string;
  attemptId: string;
  lineageKey: string;
  provider: VisualProviderId;
  apiModelId: string;
  /** Read from the separately persisted trusted claim, never copied from an untrusted request at interpretation. */
  requestSha256: string;
  maximumUsd: number;
  /** Trusted durable quote/claim bridge verified this bound before dispatch. */
  boundVerified?: boolean;
  mode: VisualProviderMode;
};
export type VisualProviderTransportResponse = { status: number; requestId?: string; body: unknown };
export type VisualTokenUsage = { textInputTokens: number; imageInputTokens: number; imageOutputTokens: number };
/** Verified 2026-09-30 from each provider's pricing page; no cached discount assumed. */
export const VISUAL_TOKEN_RATES_USD_PER_MILLION = {
  digitalocean: { textInputTokens: 5, imageInputTokens: 8, imageOutputTokens: 30 },
  openai: { textInputTokens: 5, imageInputTokens: 8, imageOutputTokens: 30 },
} as const;
/** Usage-derived estimate, not an invoice receipt or a pre-dispatch maximum. */
export function calculateVisualUsageCost(provider: VisualProviderId, usage: VisualTokenUsage, model = "gpt-image-2"): number | null {
  if (!Object.values(usage).every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  if (!["gpt-image-2", "gpt-image-1-mini", "gpt-image-1"].includes(model) || model !== "gpt-image-2" && provider !== "openai") return null;
  const rates = model === "gpt-image-1-mini" ? { textInputTokens: 2, imageInputTokens: 2.5, imageOutputTokens: 8 } : model === "gpt-image-1" ? { textInputTokens: 5, imageInputTokens: 10, imageOutputTokens: 40 } : VISUAL_TOKEN_RATES_USD_PER_MILLION[provider];
  return (usage.textInputTokens * rates.textInputTokens + usage.imageInputTokens * rates.imageInputTokens +
    usage.imageOutputTokens * rates.imageOutputTokens) / 1_000_000;
}
export function quoteVisualProviderCost(route: VisualRouteCapability) {
  return { provider: route.provider, model: route.model, maximumUsd: null,
    estimatedOnly: true as const, reason: "Reliable input/output upper bounds have not been established" };
}
export type VisualProviderReceipt = {
  provider: VisualProviderId; apiModelId: string; httpStatus: number | null; imageCount: number;
  attemptId: string; claimId: string; maximumUsd: number; lineageKey: string;
  promptSha256: string; inputImages: { id: string; storageId: string; role: VisualImageInput["role"]; sha256: string }[];
  parentVersionId?: string; outputSha256: string[]; reportedModel?: string;
  qualifiesRoute: false; evidence: "speculative-fixture" | "unqualified-response" | "authorized-probe";
  operation: VisualOperation; mode: VisualProviderMode; canonicalModel: string; revisions: VisualPinnedRevisions;
  feedbackSha256?: string; requestSha256: string; parentModel?: string;
  modelOverride: string | null; modelOverrideChangedParent: boolean;
  settings: { n: 1; size: string; quality: string; inputFidelity?: "low" | "high"; outputFormat: VisualOutputFormat; background: "opaque"; stream: false };
  requestId?: string; usage: VisualTokenUsage | null;
};
export type VisualProviderResult =
  | { status: "blocked"; reason: string }
  | { status: "uncertain"; reason: string; claimId: string; receipt?: VisualProviderReceipt }
  | { status: "completed"; claimId: string; images: { bytes: Uint8Array; mimeType: string }[];
      revisedPrompt?: string; usage: VisualTokenUsage | null; receipt: VisualProviderReceipt };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function containsOpaqueMaterial(value: string): boolean {
  return /Bearer\s|\bsk[-_]|\bdo[por]_v1_|\beyJ[A-Za-z0-9_-]+\.|\bAKIA[A-Z0-9]{16}|authorization|api[_-]?key\s*[=:]|https?:\/\/|[?&](?:token|key|secret)=|[A-Za-z0-9+/=_-]{32,}/i.test(value);
}
function observedUsage(body: Record<string, unknown>): VisualTokenUsage | null {
  const usage = record(body.usage), input = record(usage.input_tokens_details);
  const values = [input.text_tokens, input.image_tokens, usage.output_tokens];
  if (!values.every((value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0)) return null;
  return { textInputTokens: input.text_tokens as number, imageInputTokens: input.image_tokens as number,
    imageOutputTokens: usage.output_tokens as number };
}
function decodeImage(value: unknown): Uint8Array {
  if (typeof value !== "string" || !value.length || value.length > Math.ceil(MAX_VISUAL_IMAGE_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid image bytes");
  }
  const binary = atob(value);
  if (binary.length > MAX_VISUAL_IMAGE_BYTES) throw new Error("Oversized image");
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** No executable transport injection while every reliable quote is unknown. */
export async function executeVisualProviderRequest(
  _request: PreparedVisualProviderRequest,
  _context?: unknown,
): Promise<VisualProviderResult> {
  void _request;
  void _context;
  return { status: "blocked", reason: "reliable-cost-bound-required" };
}

/** Pure interpretation only: this function cannot claim, dispatch or qualify a route. */
export async function interpretVisualProviderResponse(
  request: PreparedVisualProviderRequest,
  claim: VisualDispatchClaim,
  response: VisualProviderTransportResponse,
): Promise<VisualProviderResult> {
  try {
    request = { ...request,
      route: { ...request.route, receiptIds: [...request.route.receiptIds], operations: [...request.route.operations], sizes: [...request.route.sizes], outputFormats: [...request.route.outputFormats] },
      revisions: { ...request.revisions, lessonRevisions: [...request.revisions.lessonRevisions] },
      request: { ...request.request, fields: { ...request.request.fields } },
      images: request.images.map(image => {
        if (!(image.bytes instanceof Uint8Array) || image.bytes.length > MAX_VISUAL_IMAGE_BYTES) throw new Error("Invalid image snapshot");
        return { ...image, bytes: new Uint8Array(image.bytes) };
      }),
    };
    claim = { ...claim };
  } catch {
    return { status: "uncertain", reason: "request-provenance-invalid", claimId: claim.claimId };
  }
  if (request.mode !== "offline-contract" && (!claim.boundVerified || claim.maximumUsd <= 0 || (request.mode === "qualification-probe" ? request.route.qualification !== "authorized-probe" || request.route.receiptIds.length !== 0 : request.route.qualification !== "live-receipt" || !request.route.receiptIds.length))) {
    return { status: "uncertain", reason: "reliable-cost-bound-required", claimId: claim.claimId };
  }
  try {
    const fields = request.request.fields;
    if (!validRevisionPins(request.revisions) || request.prompt !== request.request.fields.prompt || !request.attemptId?.trim() || !request.lineageKey?.trim() ||
      fields.model !== request.route.apiModelId || fields.n !== 1 || !request.route.sizes.includes(fields.size) ||
      !request.route.outputFormats.includes(fields.output_format) || !["low", "medium", "high"].includes(fields.quality) ||
      fields.background !== "opaque" || fields.stream !== false || (fields.input_fidelity !== undefined && (!["gpt-image-1-mini", "gpt-image-1"].includes(request.route.model) || !["low", "high"].includes(fields.input_fidelity))) ||
      request.request.path !== (request.images.length ? "/v1/images/edits" : "/v1/images/generations") ||
      request.request.encoding !== (request.images.length ? "multipart" : "json") ||
      !request.route.operations.includes(request.operation) || request.images.length > request.route.maxInputImages ||
      (request.images.length > 0 && (!request.route.referenceInputs || request.route.provider === "digitalocean")) ||
      Boolean(request.parentVersionId) !== (request.operation === "edit") ||
      Boolean(request.parentVersionId) !== (request.images[0]?.role === "edit-parent") ||
      Boolean(request.parentModel?.trim()) !== Boolean(request.parentVersionId) ||
      (request.operation === "edit" && (!request.feedback?.trim() || !request.parentVersionId?.trim() || request.route.model !== (request.modelOverride ?? request.parentModel))) ||
      (request.modelOverride !== null && (!request.modelOverride?.trim() || request.modelOverride !== request.route.model)) ||
      request.images.slice(request.operation === "edit" ? 1 : 0).some(image => !["identity", "style", "composition"].includes(image.role)) ||
      (request.mode === "offline-contract" && (request.route.qualification !== "speculative-fixture" || request.route.receiptIds.length))) {
      throw new Error("Invalid prepared request");
    }
    if (await hashVisualProviderRequest(request) !== request.requestSha256) throw new Error("Substituted canonical request");
    for (const key of ["id", "storageId", "sha256"] as const) {
      if (new Set(request.images.map(image => image[key])).size !== request.images.length) throw new Error("Duplicate provenance");
    }
    for (const image of request.images) {
      if (!hasImageSignature(image.bytes, image.mimeType) || await hashBytes(image.bytes) !== image.sha256) throw new Error("Substituted input");
    }
  } catch {
    return { status: "uncertain", reason: "request-provenance-invalid", claimId: claim.claimId };
  }
  if (!claim.claimId || claim.attemptId !== request.attemptId || claim.lineageKey !== request.lineageKey || claim.provider !== request.route.provider ||
    claim.apiModelId !== request.route.apiModelId || claim.mode !== request.mode || claim.requestSha256 !== request.requestSha256 ||
    !Number.isFinite(claim.maximumUsd) || claim.maximumUsd < 0 ||
    (request.mode === "offline-contract" && claim.maximumUsd !== 0)) {
    return { status: "uncertain", reason: "claim-does-not-match-request", claimId: claim.claimId };
  }
  const body = record(response.body), data = Array.isArray(body.data) ? body.data.map(record) : [];
  const usage = observedUsage(body);
  const validStatus = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599;
  // Whitelist only typed metadata. Never retain headers, raw errors, URLs, or response trees.
  const receipt: VisualProviderReceipt = {
    provider: request.route.provider, apiModelId: request.route.apiModelId, httpStatus: validStatus ? response.status : null,
    attemptId: request.attemptId, claimId: claim.claimId, maximumUsd: claim.maximumUsd, lineageKey: request.lineageKey,
    operation: request.operation, mode: request.mode, canonicalModel: request.route.model,
    revisions: { ...request.revisions, lessonRevisions: [...request.revisions.lessonRevisions] },
    ...(request.feedback ? { feedbackSha256: await hashBytes(new TextEncoder().encode(request.feedback)) } : {}),
    requestSha256: request.requestSha256, ...(request.parentModel ? { parentModel: request.parentModel } : {}),
    modelOverride: request.modelOverride, modelOverrideChangedParent: Boolean(request.parentModel && request.modelOverride && request.parentModel !== request.modelOverride),
    settings: { ...(request.request.fields.input_fidelity ? { inputFidelity: request.request.fields.input_fidelity } : {}), n: request.request.fields.n, size: request.request.fields.size, quality: request.request.fields.quality,
      outputFormat: request.request.fields.output_format, background: request.request.fields.background, stream: request.request.fields.stream },
    promptSha256: await hashBytes(new TextEncoder().encode(request.prompt)),
    inputImages: request.images.map(({ id, storageId, role, sha256 }) => ({ id, storageId, role, sha256 })),
    ...(request.parentVersionId ? { parentVersionId: request.parentVersionId } : {}), outputSha256: [], qualifiesRoute: false,
    evidence: request.mode === "offline-contract" ? "speculative-fixture" : request.mode === "qualification-probe" ? "authorized-probe" : "unqualified-response",
    ...(typeof body.model === "string" && /^[a-z0-9][a-z0-9._:-]{0,119}$/.test(body.model) && !containsOpaqueMaterial(body.model) ? { reportedModel: body.model } : {}),
    imageCount: data.length, usage,
    ...(typeof response.requestId === "string" && /^req_[A-Za-z0-9_-]{1,100}$/.test(response.requestId) ? { requestId: response.requestId } : {}),
  };
  if (!validStatus) return { status: "uncertain", reason: "provider-result-invalid", claimId: claim.claimId, receipt };
  if (body.model !== undefined && body.model !== request.route.apiModelId) {
    return { status: "uncertain", reason: "provider-model-mismatch", claimId: claim.claimId, receipt };
  }
  if (response.status < 200 || response.status >= 300) {
    return { status: "uncertain", reason: "provider-http-uncertain", claimId: claim.claimId, receipt };
  }
  if (data.length !== request.request.fields.n) {
    return { status: "uncertain", reason: "provider-result-incomplete", claimId: claim.claimId, receipt };
  }
  const mimeType = `image/${request.request.fields.output_format}`;
  const rewrite = data[0]?.revised_prompt;
  const safeRewrite = typeof rewrite === "string" && rewrite.length <= 32000 &&
    !containsOpaqueMaterial(rewrite);
  try {
    const images = data.map(item => ({ bytes: decodeImage(item.b64_json), mimeType }));
    if (images.some(image => !hasImageSignature(image.bytes, image.mimeType))) throw new Error("Invalid output image signature");
    receipt.outputSha256 = await Promise.all(images.map(image => hashBytes(image.bytes)));
    return { status: "completed", claimId: claim.claimId, usage, receipt,
      images,
      ...(safeRewrite ? { revisedPrompt: rewrite as string } : {}),
    };
  } catch {
    return { status: "uncertain", reason: "provider-result-invalid", claimId: claim.claimId, receipt };
  }
}

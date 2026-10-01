import sharp from "sharp";
import { createHash } from "node:crypto";
import { verifyVisualOutput } from "../visualProviderRuntime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchTextRequest, parseReflectionOutput, prepareTextRequest, textMaximumMicros, visualTextCredential } from "../visualTextRuntime";

const route = { provider: "openai" as const, model: "fictional-text-model", maxInputBytes: 20_000, maxInputTokens: 21_000, maxMessageOverheadTokens: 1000, maxOutputTokens: 4000, inputPriceMicrosPerMillion: 1_000_000, outputPriceMicrosPerMillion: 2_000_000, maximumMicros: 29_000 };
const attempt = { _id: "fictional-attempt", stage: "planning" as const, input: { article: { title: "Inspection", content: "A raven inspects a machine and repairs the broken gear.", signature: "saved-article" }, pins: { profileRevisionId: "original-profile" }, references: [{ referenceId: "original-reference", role: "identity", sha256: "original-reference-hash" }], prompt: "Preserve the visible repair action." } };

describe("bounded text runtime", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("specifies the complete planning JSON shape in messages when response_format is ignored", async () => {
    const prepared = await prepareTextRequest(attempt, { ...route, provider: "cortex" });
    const wireBody = JSON.parse(JSON.stringify(prepared.body));
    delete wireBody.response_format; // Legacy provider adapters may omit this field.
    const instruction = wireBody.messages.find((message: { role: string }) => message.role === "system").content;
    expect(instruction).toMatch(/return only a JSON object/i);
    expect(instruction).toMatch(/"scenes"\s*:\s*\[/);
    expect(instruction).toMatch(/exactly three/i);
    for (const field of ["title", "subject", "metaphor", "action", "reveal", "articleConnection", "articleAnchor"]) {
      expect(instruction).toContain(`"${field}"`);
    }
    expect(instruction).toMatch(/no additional (?:keys|fields)/i);
    expect(instruction).toMatch(/no Markdown/i);
    expect(instruction).toMatch(/no (?:surrounding )?prose/i);
  });

  it("asks reflection to revise the original image prompt from the accepted edit and final pixels", async () => {
    const pixels = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#f08030" } }).webp().toBuffer();
    const identity = { storageId: "fictional-owned-export", sha256: createHash("sha256").update(pixels).digest("hex"), bytes: pixels.length, width: 1600 as const, height: 900 as const, contentType: "image/webp" as const };
    const visionRoute = { ...route, maxInputTokens: 22_000, maximumMicros: 30_000, vision: { protocol: "chat-completions-image-url" as const, detail: "low" as const, maxImageBytes: 149_999, maxImageInputTokens: 1000, maxRequestBytes: 225_000, capabilityReceiptIds: ["SPECULATIVE-vision"], tokenBoundReceiptId: "SPECULATIVE-tokens", priceReceiptId: "SPECULATIVE-price" } };
    const controller = "Reflect on the immutable original input; candidate prompts remain untested.";
    const originalPrompt = "Create a matte paper raven repairing a gear at a workbench. Keep the screwdriver handle dark teal.";
    const feedback = "Change only the screwdriver handle from dark teal to warm orange; preserve the raven and gear.";
    const context = JSON.stringify({ originalInput: { ...attempt.input, prompt: originalPrompt }, lineage: [{ feedback: null }, { feedback }], finalPresentation: { exportHash: identity.sha256 } });
    const prepared = await prepareTextRequest({ ...attempt, stage: "reflection", input: { ...attempt.input, prompt: controller } }, visionRoute, context, { identity, bytes: pixels });
    const messages = prepared.body.messages as { role: string; content: string | { type: string; text?: string; image_url?: { url: string } }[] }[];
    const system = messages[0].content as string;
    expect(system).toMatch(/candidatePrompt.*complete revised image.generation prompt/i);
    expect(system).toContain("reflectionContext.originalInput.prompt");
    expect(system).toMatch(/ordered.*feedback/i);
    expect(system).toMatch(/do not (?:copy|echo).*reflection.*(?:controller|control)/i);
    expect(system).toMatch(/do not duplicate.*(?:seed|existing).*lessons/i);
    expect(system).toMatch(/no.*(?:new|supported).*lesson.*lessons.*\[\]/i);
    const user = messages[1].content as { type: string; text?: string; image_url?: { url: string } }[];
    const supplied = JSON.parse(user[0].text!);
    expect(supplied.reflectionControlInstructions).toBe(controller);
    expect(supplied.instructions).toBeUndefined();
    expect(supplied.reflectionContext.originalInput.prompt).toBe(originalPrompt);
    expect(supplied.reflectionContext.lineage[1].feedback).toBe(feedback);
    expect(user[1].image_url!.url).toBe(`data:image/webp;base64,${pixels.toString("base64")}`);
  });

  it("omits an echoed supplied credential from a Cortex HTTP failure receipt", async () => {
    const cortex = { ...route, provider: "cortex" as const };
    const prepared = await prepareTextRequest(attempt, cortex);
    const key = "opaqueFakeCredential";
    vi.stubEnv("CORTEX_BASE_URL", "https://cortex.corvolabs.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "SPECULATIVE private provider body" }), {
      status: 502,
      headers: { "x-request-id": `req_echo${key}`, "x-private-header": "SPECULATIVE private header" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchTextRequest(prepared, { claimKey: "claim", requestSha256: prepared.requestSha256, maximumMicros: cortex.maximumMicros, provider: cortex.provider, model: cortex.model }, key);
    expect(result).toMatchObject({ status: "uncertain", receipt: expect.any(String) });
    const receipt = JSON.parse(result.receipt!);
    expect(receipt).toMatchObject({ provider: "cortex", httpStatus: 502, usage: null });
    expect(receipt.requestId).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain("private provider body");
    expect(JSON.stringify(result)).not.toContain("private header");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["req_echosk-fictional-secret", "req_echosk_fictional", "req_echodop_v1_fictional", "req_echodor_v1_fictional", "req_echoghp_fictional", "req_echoGITHUB_PAT_fictional"])("omits embedded credential-shaped request ID %s without dropping HTTP status", async requestId => {
    const cortex = { ...route, provider: "cortex" as const };
    const prepared = await prepareTextRequest(attempt, cortex);
    vi.stubEnv("CORTEX_BASE_URL", "https://cortex.corvolabs.com");
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 502, headers: { "x-request-id": requestId } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchTextRequest(prepared, { claimKey: "claim", requestSha256: prepared.requestSha256, maximumMicros: cortex.maximumMicros, provider: cortex.provider, model: cortex.model }, "opaqueFakeCredential");
    expect(result).toMatchObject({ status: "uncertain", receipt: expect.any(String) });
    const receipt = JSON.parse(result.receipt!);
    expect(receipt.httpStatus).toBe(502);
    expect(receipt.requestId).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(requestId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([{ status: 200, requestId: "req_fictional_gateway" }, { status: 502, requestId: `req_${"a".repeat(100)}` }])("retains ordinary bounded request IDs and HTTP status $status", async ({ status, requestId }) => {
    const cortex = { ...route, provider: "cortex" as const };
    const prepared = await prepareTextRequest(attempt, cortex);
    vi.stubEnv("CORTEX_BASE_URL", "https://cortex.corvolabs.com");
    const body = { model: cortex.model, choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "x-request-id": requestId } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchTextRequest(prepared, { claimKey: "claim", requestSha256: prepared.requestSha256, maximumMicros: cortex.maximumMicros, provider: cortex.provider, model: cortex.model }, "opaqueFakeCredential");
    expect(result.status).toBe(status === 200 ? "received" : "uncertain");
    expect(JSON.parse(result.receipt!)).toMatchObject({ httpStatus: status, requestId, usage: { inputTokens: 10, outputTokens: 5 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps an interrupted response uncertain without retaining echoed credentials or raw stream errors", async () => {
    const cortex = { ...route, provider: "cortex" as const };
    const prepared = await prepareTextRequest(attempt, cortex);
    const key = "opaqueFakeCredential";
    vi.stubEnv("CORTEX_BASE_URL", "https://cortex.corvolabs.com");
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error(`SPECULATIVE private stream failure ${key}`)); } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 502, headers: { "x-request-id": `req_echo${key}` } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchTextRequest(prepared, { claimKey: "claim", requestSha256: prepared.requestSha256, maximumMicros: cortex.maximumMicros, provider: cortex.provider, model: cortex.model }, key);
    expect(result).toEqual({ status: "uncertain", reason: "text-transport-uncertain" });
    expect(JSON.stringify(result)).not.toContain(key);
    expect(JSON.stringify(result)).not.toContain("private stream failure");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("binds exact pinned context and output limit to the quote hash and refuses tampered dispatch", async () => {
    const prepared = await prepareTextRequest(attempt, route);
    expect(textMaximumMicros(route)).toBe(29_000);
    expect(JSON.stringify(prepared.body)).toContain("original-reference-hash");
    expect(prepared.body.max_completion_tokens).toBe(4000);
    vi.stubGlobal("fetch", vi.fn());
    prepared.body.model = "different-model";
    expect(await dispatchTextRequest(prepared, { claimKey: "claim", requestSha256: prepared.requestSha256, maximumMicros: 29_000, provider: route.provider, model: route.model }, "fictional-key")).toMatchObject({ status: "uncertain", reason: "trusted-text-claim-required" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses oversized input and reflection without verified lineage", async () => {
    await expect(prepareTextRequest(attempt, { ...route, maxInputBytes: 100 })).rejects.toThrow("bound exceeded");
    await expect(prepareTextRequest({ ...attempt, stage: "reflection" }, route)).rejects.toThrow("Verified reflection context required");
  });

  it("binds server metadata and exact pixel body to the same quote and independently verifies dispatch bytes", async () => {
    const pixels = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#15616d" } }).webp().toBuffer();
    const identity = { storageId: "fictional-owned-export", sha256: createHash("sha256").update(pixels).digest("hex"), bytes: pixels.length, width: 1600 as const, height: 900 as const, contentType: "image/webp" as const };
    const visionRoute = { ...route, maxInputTokens: 22_000, maximumMicros: 30_000, vision: { protocol: "chat-completions-image-url" as const, detail: "low" as const, maxImageBytes: 149_999, maxImageInputTokens: 1000, maxRequestBytes: 225_000, capabilityReceiptIds: ["SPECULATIVE-vision"], tokenBoundReceiptId: "SPECULATIVE-tokens", priceReceiptId: "SPECULATIVE-vision-price" } };
    const reflection = { ...attempt, stage: "reflection" as const };
    const context = JSON.stringify({ originalInput: attempt.input, lineage: [{ feedback: "Keep contact" }], finalPresentation: { exportHash: identity.sha256 } });
    const quoted = await prepareTextRequest(reflection, visionRoute, context, { identity });
    const actual = await prepareTextRequest(reflection, visionRoute, context, { identity, bytes: pixels });
    expect(actual.requestSha256).toBe(quoted.requestSha256);
    expect(JSON.stringify(quoted.body)).not.toContain(pixels.toString("base64"));
    const claim = { claimKey: "claim", requestSha256: actual.requestSha256, maximumMicros: 30_000, provider: visionRoute.provider, model: visionRoute.model };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ model: route.model, choices: [{ finish_reason: "stop", message: { content: "{}" } }], usage: { prompt_tokens: 1500, completion_tokens: 100 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const verifier = vi.fn(bytes => verifyVisualOutput(bytes, "image/webp"));
    expect(await dispatchTextRequest(actual, claim, "fictional-key", verifier)).toMatchObject({ status: "received", actualMicros: 1700 });
    expect(verifier).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    const tampered = structuredClone(actual);
    const messages = tampered.body.messages as { content: { image_url: { url: string } }[] }[];
    messages[1].content[1].image_url.url = `data:image/webp;base64,${Buffer.alloc(pixels.length).toString("base64")}`;
    expect(await dispatchTextRequest(tampered, claim, "fictional-key", verifier)).toMatchObject({ status: "uncertain", reason: "approved-reflection-image-unverified" });
    expect(fetchMock).not.toHaveBeenCalled();
    (actual.body.messages as unknown[]).push({ role: "user", content: "Unquoted extra billable input" });
    expect(await dispatchTextRequest(actual, claim, "fictional-key", verifier)).toMatchObject({ status: "uncertain", reason: "trusted-text-claim-required" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never uses the image-only OpenAI credential for a text request", () => {
    vi.stubEnv("OPENAI_API_KEY", "SPECULATIVE-images-only");
    vi.stubEnv("OPENAI_TEXT_API_KEY", "");
    expect(visualTextCredential("openai")).toBeNull();
    vi.stubEnv("OPENAI_TEXT_API_KEY", "SPECULATIVE-text-only");
    expect(visualTextCredential("openai")).toBe("SPECULATIVE-text-only");
  });

  it("rechecks the fixed Cortex origin immediately before HTTP and never expands its credential destination", async () => {
    const cortex = { ...route, provider: "cortex" as const };
    const prepared = await prepareTextRequest(attempt, cortex);
    vi.stubEnv("CORTEX_API_KEY", "SPECULATIVE-cortex-key");
    vi.stubEnv("CORTEX_BASE_URL", "https://unreviewed.invalid");
    vi.stubGlobal("fetch", vi.fn());
    expect(visualTextCredential("cortex")).toBeNull();
    expect(await dispatchTextRequest(prepared, { claimKey: "claim", requestSha256: prepared.requestSha256, maximumMicros: cortex.maximumMicros, provider: cortex.provider, model: cortex.model }, "fictional-key")).toEqual({ status: "uncertain", reason: "text-origin-unqualified" });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("CORTEX_BASE_URL", "https://cortex.corvolabs.com/");
    expect(visualTextCredential("cortex")).toBe("SPECULATIVE-cortex-key");
  });

  it("requires explicit reflection scope and refuses extra fields", () => {
    const output = { candidatePrompt: "Preserve the original action.", lessons: [{ title: "Action", instruction: "Maintain the claw touching the gear.", role: "image_generator", sceneTags: [], modelSpecific: false, postSpecific: true }], profileChangeProposals: [] };
    expect(parseReflectionOutput(output)).toEqual(output);
    expect(() => parseReflectionOutput({ ...output, lessons: [{ ...output.lessons[0], postSpecific: undefined }] })).toThrow();
    expect(() => parseReflectionOutput({ ...output, approved: true })).toThrow();
  });
});

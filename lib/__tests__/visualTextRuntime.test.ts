import sharp from "sharp";
import { createHash } from "node:crypto";
import { verifyVisualOutput } from "../visualProviderRuntime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchTextRequest, parseReflectionOutput, prepareTextRequest, textMaximumMicros, visualTextCredential } from "../visualTextRuntime";

const route = { provider: "openai" as const, model: "fictional-text-model", maxInputBytes: 20_000, maxInputTokens: 21_000, maxMessageOverheadTokens: 1000, maxOutputTokens: 4000, inputPriceMicrosPerMillion: 1_000_000, outputPriceMicrosPerMillion: 2_000_000, maximumMicros: 29_000 };
const attempt = { _id: "fictional-attempt", stage: "planning" as const, input: { article: { title: "Inspection", content: "A raven inspects a machine and repairs the broken gear.", signature: "saved-article" }, pins: { profileRevisionId: "original-profile" }, references: [{ referenceId: "original-reference", role: "identity", sha256: "original-reference-hash" }], prompt: "Preserve the visible repair action." } };

describe("bounded text runtime", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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

  it("requires explicit reflection scope and refuses extra fields", () => {
    const output = { candidatePrompt: "Preserve the original action.", lessons: [{ title: "Action", instruction: "Maintain the claw touching the gear.", role: "image_generator", sceneTags: [], modelSpecific: false, postSpecific: true }], profileChangeProposals: [] };
    expect(parseReflectionOutput(output)).toEqual(output);
    expect(() => parseReflectionOutput({ ...output, lessons: [{ ...output.lessons[0], postSpecific: undefined }] })).toThrow();
    expect(() => parseReflectionOutput({ ...output, approved: true })).toThrow();
  });
});

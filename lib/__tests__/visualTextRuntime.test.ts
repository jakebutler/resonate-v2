import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchTextRequest, parseReflectionOutput, prepareTextRequest, textMaximumMicros } from "../visualTextRuntime";

const route = { provider: "openai" as const, model: "fictional-text-model", maxInputBytes: 20_000, maxInputTokens: 21_000, maxMessageOverheadTokens: 1000, maxOutputTokens: 4000, inputPriceMicrosPerMillion: 1_000_000, outputPriceMicrosPerMillion: 2_000_000, maximumMicros: 29_000 };
const attempt = { _id: "fictional-attempt", stage: "planning" as const, input: { article: { title: "Inspection", content: "A raven inspects a machine and repairs the broken gear.", signature: "saved-article" }, pins: { profileRevisionId: "original-profile" }, references: [{ referenceId: "original-reference", role: "identity", sha256: "original-reference-hash" }], prompt: "Preserve the visible repair action." } };

describe("bounded text runtime", () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it("requires explicit reflection scope and refuses extra fields", () => {
    const output = { candidatePrompt: "Preserve the original action.", lessons: [{ title: "Action", instruction: "Maintain the claw touching the gear.", role: "image_generator", sceneTags: [], modelSpecific: false, postSpecific: true }], profileChangeProposals: [] };
    expect(parseReflectionOutput(output)).toEqual(output);
    expect(() => parseReflectionOutput({ ...output, lessons: [{ ...output.lessons[0], postSpecific: undefined }] })).toThrow();
    expect(() => parseReflectionOutput({ ...output, approved: true })).toThrow();
  });
});

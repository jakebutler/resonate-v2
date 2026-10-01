// SPECULATIVE offline contract doubles. Never capability or paid billing evidence.
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareVisualProviderRequest, VISUAL_PROVIDER_CAPABILITIES, type VisualDispatchClaim } from "../visualProviders";
import sharp from "sharp";
import { dispatchVisualImageRequest, verifyVisualOutput } from "../visualProviderRuntime";

afterEach(() => vi.unstubAllGlobals());
async function envelope() {
  const documented = VISUAL_PROVIDER_CAPABILITIES.find(route => route.provider === "openai" && route.model === "gpt-image-2")!;
  const route = { ...documented, qualification: "live-receipt" as const, receiptIds: ["SPECULATIVE-runtime-double"] };
  const request = await prepareVisualProviderRequest({ attemptId: "fictional-attempt", lineageKey: "fictional-lineage", operation: "generate", model: "gpt-image-2", preferredProvider: "openai", prompt: "Fictional raven moves a gear", revisions: { articleRevision: "fictional-article", profileRevision: "fictional-profile", lessonRevisions: [] }, references: [], size: "1536x1024", quality: "medium", outputFormat: "webp" }, [route]);
  const claim: VisualDispatchClaim = { claimId: "fictional-claim", attemptId: request.attemptId, lineageKey: request.lineageKey, provider: "openai", apiModelId: route.apiModelId, requestSha256: request.requestSha256, maximumUsd: 0.1, boundVerified: true, mode: "live" };
  return { request, claim };
}
describe("server image transport", () => {
  it("retains safe HTTP metadata from a non-JSON gateway failure without retaining its body or other headers", async () => {
    const { request, claim } = await envelope();
    const fetchMock = vi.fn().mockResolvedValue(new Response("<html>SPECULATIVE private provider body sk-fictional-secret</html>", {
      status: 504,
      headers: { "x-request-id": "req_fictional_gateway", "x-private-provider-header": "SPECULATIVE private header" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchVisualImageRequest(request, claim, "fictional-key");
    expect(result).toMatchObject({ status: "uncertain", reason: "provider-http-uncertain", receipt: { httpStatus: 504, requestId: "req_fictional_gateway" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const retained = JSON.stringify(result);
    expect(retained).not.toContain("private provider body");
    expect(retained).not.toContain("sk-fictional-secret");
    expect(retained).not.toContain("private header");
    expect(retained).not.toContain("fictional-key");
  });

  it("retains received HTTP metadata when reading the response body fails without retrying", async () => {
    const { request, claim } = await envelope();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("SPECULATIVE private stream failure sk-fictional-secret")); } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 502, headers: { "x-request-id": "req_fictional_interrupted" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchVisualImageRequest(request, claim, "fictional-key");
    expect(result).toMatchObject({ status: "uncertain", reason: "provider-transport-uncertain", receipt: { httpStatus: 502, requestId: "req_fictional_interrupted" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("private stream failure");
    expect(JSON.stringify(result)).not.toContain("sk-fictional-secret");
  });

  it.each(["Bearer sk-fictional-secret", "req_sk-fictional-secret", "req_dop_v1_fictional", `req_${"a".repeat(101)}`])("omits an unsafe server request ID %s from the retained HTTP failure", async (requestId) => {
    const { request, claim } = await envelope();
    const fetchMock = vi.fn().mockResolvedValue(new Response("SPECULATIVE invalid JSON", { status: 504, headers: { "x-request-id": requestId } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await dispatchVisualImageRequest(request, claim, "fictional-key");
    expect(result).toMatchObject({ status: "uncertain", receipt: { httpStatus: 504 } });
    expect(result.status === "uncertain" && result.receipt?.requestId).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(requestId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps a malformed success response uncertain with its received status and request ID", async () => {
    const { request, claim } = await envelope();
    const fetchMock = vi.fn().mockResolvedValue(new Response("{SPECULATIVE invalid JSON", { status: 200, headers: { "x-request-id": "req_fictional_malformed" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await dispatchVisualImageRequest(request, claim, "fictional-key")).toMatchObject({ status: "uncertain", reason: "provider-result-incomplete", receipt: { httpStatus: 200, requestId: "req_fictional_malformed", imageCount: 0, usage: null } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves transport uncertainty without HTTP metadata when fetching fails before headers", async () => {
    const { request, claim } = await envelope();
    const fetchMock = vi.fn().mockRejectedValue(new Error("SPECULATIVE private network failure sk-fictional-secret"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await dispatchVisualImageRequest(request, claim, "fictional-key")).toEqual({ status: "uncertain", reason: "provider-transport-uncertain", claimId: claim.claimId });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a compressed image header above the explicit40M decoded pixel bound", async () => {
    const bytes = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#123456" } }).png().toBuffer();
    bytes.writeUInt32BE(10000, 16); bytes.writeUInt32BE(5000, 20);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(12, 29)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    bytes.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
    await expect(verifyVisualOutput(bytes, "image/png")).rejects.toThrow(/pixel limit|dimensions/);
  });

  it("rejects changed prepared fields before the HTTP dispatch", async () => {
    const { request, claim } = await envelope();
    request.request.fields.prompt = "A changed unreviewed prompt";
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    expect(await dispatchVisualImageRequest(request, claim, "fictional-key")).toMatchObject({ status: "blocked" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

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

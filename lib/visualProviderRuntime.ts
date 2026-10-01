import sharp from "sharp";
import { createHash } from "node:crypto";
import { hashVisualProviderRequest, interpretVisualProviderResponse, MAX_VISUAL_IMAGE_BYTES, type PreparedVisualProviderRequest, type VisualDispatchClaim, type VisualProviderId, type VisualProviderResult } from "./visualProviders";

/** Server/Node-only secret boundary. Never return credential material to Convex clients or receipts. */
export function visualProviderCredential(provider: VisualProviderId): string | null {
  const key = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.DIGITALOCEAN_INFERENCE_API_KEY;
  return key?.trim() || null;
}

const MAX_RESPONSE_BYTES = Math.ceil(MAX_VISUAL_IMAGE_BYTES / 3) * 4 + 128_000;
/** Exactly one HTTP dispatch. All transport exceptions are ambiguous, never retried or switched. */
export async function dispatchVisualImageRequest(request: PreparedVisualProviderRequest, claim: VisualDispatchClaim, key: string): Promise<VisualProviderResult> {
  if (!key || !["live", "qualification-probe"].includes(request.mode) || !claim.boundVerified || claim.maximumUsd <= 0 || claim.requestSha256 !== request.requestSha256) return { status: "blocked", reason: "trusted-dispatch-claim-required" };
  // Recheck the exact snapshot before the paid boundary, even though the trusted action prepared it.
  if (claim.attemptId !== request.attemptId || claim.lineageKey !== request.lineageKey || claim.provider !== request.route.provider || claim.apiModelId !== request.route.apiModelId || claim.mode !== request.mode ||
    await hashVisualProviderRequest(request) !== claim.requestSha256 || request.images.some(image => createHash("sha256").update(image.bytes).digest("hex") !== image.sha256)) return { status: "blocked", reason: "prepared-request-provenance-changed" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
    let body: string | FormData;
    if (request.request.encoding === "multipart") {
      const form = new FormData();
      for (const [name, value] of Object.entries(request.request.fields)) form.append(name, String(value));
      request.images.forEach((image, index) => form.append("image[]", new Blob([new Uint8Array(image.bytes).buffer], { type: image.mimeType }), `input-${index}.${image.mimeType.split("/")[1]}`));
      body = form;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(request.request.fields);
    }
    const origin = request.route.provider === "openai" ? "https://api.openai.com" : "https://inference.do-ai.run";
    const response = await fetch(`${origin}${request.request.path}`, { method: "POST", headers, body, signal: controller.signal, redirect: "error" });
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) { controller.abort(); await response.body?.cancel(); throw new Error("Oversized response"); }
    if (!response.body) throw new Error("Missing response body");
    const reader = response.body.getReader(), chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("Oversized response"); }
      chunks.push(next.value);
    }
    const retained = Buffer.concat(chunks);
    return await interpretVisualProviderResponse(request, claim, { status: response.status, requestId: response.headers.get("x-request-id") ?? undefined, body: JSON.parse(retained.toString("utf8")) });
  } catch {
    return { status: "uncertain", reason: "provider-transport-uncertain", claimId: claim.claimId };
  } finally { clearTimeout(timer); }
}

/** Decode the entire image, not only its header, before durable selectable completion. */
export async function verifyVisualOutput(bytes: Uint8Array, mimeType: string) {
  if (!bytes.length || bytes.length > MAX_VISUAL_IMAGE_BYTES) throw new Error("Invalid output byte bound");
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  const format = mimeType.split("/")[1];
  if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width > 16_384 || metadata.height > 16_384 || metadata.width * metadata.height > 40_000_000 || (metadata.pages ?? 1) > 1) throw new Error("Output image does not match requested format/dimensions");
  await image.stats();
  return { sha256: createHash("sha256").update(bytes).digest("hex"), contentType: mimeType, width: metadata.width, height: metadata.height, bytes: bytes.length };
}

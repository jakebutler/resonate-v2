import sharp from "sharp";
import { createHash } from "node:crypto";
export const HERO_BYTE_CAP = 150_000;
export type HeroCrop = "centre" | "north" | "south";
export async function prepareBlogHero(bytes: Uint8Array, crop: HeroCrop = "centre") {
  if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw new Error("Hero input must be under 10 MB.");
  if (!["centre", "north", "south"].includes(crop)) throw new Error("Choose a supported crop.");
  const source = Buffer.from(bytes);
  const metadata = await sharp(source, { limitInputPixels: 40_000_000, failOn: "error" }).metadata();
  if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Upload a still PNG, JPEG, or WebP hero.");
  for (const quality of [85, 75, 65, 55, 45]) {
    const output = await sharp(source, {limitInputPixels: 40_000_000, failOn: "error"})
      .rotate().resize(1600, 900, {fit: "cover", position: crop})
      .webp({quality, effort: 6}).toBuffer();
    if (output.byteLength < HERO_BYTE_CAP) return {
      bytes: output, width: 1600 as const, height: 900 as const,
      mimeType: "image/webp" as const, byteLength: output.byteLength,
      sha256: createHash("sha256").update(output).digest("hex"), crop,
    };
  }
  throw new Error("This crop cannot meet the 150,000 byte cap at 1600×900. Choose a simpler source or crop; dimensions were preserved.");
}

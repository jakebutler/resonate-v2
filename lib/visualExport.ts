import { createHash } from "node:crypto";
import sharp from "sharp";

export type HeroCrop = { left: number; top: number; width: number; height: number };
export async function prepareHeroExport(source: Uint8Array, crop?: HeroCrop) {
  if (!source.byteLength || source.byteLength > 20 * 1024 * 1024) {
    throw new Error("Hero input must contain at most 20 MB of image bytes.");
  }
  const image = sharp(source, { limitInputPixels: 40_000_000 }).rotate();
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) !== 1) {
    throw new Error("Hero input must be a single PNG, JPEG, or WebP image.");
  }
  if (crop) {
    const oriented = metadata.autoOrient ?? metadata;
    if (Object.values(crop).some((value) => !Number.isSafeInteger(value)) ||
        crop.left < 0 || crop.top < 0 || crop.width < 1 || crop.height < 1 ||
        crop.left + crop.width > (oriented.width ?? 0) || crop.top + crop.height > (oriented.height ?? 0)) {
      throw new Error("Hero crop must be an in-bounds pixel rectangle.");
    }
    image.extract(crop);
  }
  const resized = image.resize(1600, 900, { fit: "cover", position: "centre" });
  for (const quality of [90, 82, 74, 66, 58, 50, 42, 34]) {
    const bytes = await resized.clone().webp({ quality, effort: 6 }).toBuffer();
    if (bytes.byteLength < 150_000) {
      return {
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        sourceSha256: createHash("sha256").update(source).digest("hex"),
        presentation: { width: 1600 as const, height: 900 as const, format: "webp" as const,
          bytes: bytes.byteLength, fit: "cover" as const, position: "centre" as const,
          crop: crop ?? null, quality },
      };
    }
  }
  throw new Error("Hero cannot meet the 150 KB export limit; choose a simpler crop.");
}

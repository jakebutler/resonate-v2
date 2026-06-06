/**
 * Client-side image optimization.
 *
 * Resizes images to max 2000px wide and re-encodes raster images as WebP
 * before upload.
 * This keeps Convex storage costs low and editor preview performance fast.
 *
 * Uses createImageBitmap for off-main-thread decoding where available,
 * with a Canvas API fallback for compression.
 */

const MAX_WIDTH = 2000;
const WEBP_QUALITY = 0.82;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export async function optimizeImage(file: File): Promise<Blob> {
  // Guard: file type
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}. Please upload an image file.`);
  }

  // Guard: file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Image is too large. Maximum file size is 10MB.");
  }

  if (file.type === "image/svg+xml") {
    return file;
  }

  // Decode the image using createImageBitmap (off main-thread capable)
  const bitmap = await createImageBitmap(file);

  let { width, height } = bitmap;

  // Scale down if wider than MAX_WIDTH; never upscale
  if (width > MAX_WIDTH) {
    const ratio = MAX_WIDTH / width;
    width = MAX_WIDTH;
    height = Math.round(height * ratio);
  }

  // Draw onto a canvas at the target dimensions
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Canvas 2D context unavailable.");
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to compress image. Please try again."));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      WEBP_QUALITY
    );
  });
}

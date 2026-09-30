/** Bound action arguments including Convex's base64 transport overhead. */
export const MAX_VISUAL_REFERENCE_BYTES = 5 * 1024 * 1024;

export async function hashVisualBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function assertVisualImage(bytes: ArrayBuffer, contentType: string): void {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_VISUAL_REFERENCE_BYTES) {
    throw new Error("Visual reference must contain at most 5 MiB of image bytes");
  }
  const data = new Uint8Array(bytes);
  const matches = (offset: number, signature: number[]) => signature.every((byte, i) => data[offset + i] === byte);
  const valid = contentType === "image/png"
    ? matches(0, [137, 80, 78, 71, 13, 10, 26, 10])
    : contentType === "image/jpeg"
      ? matches(0, [255, 216, 255])
      : contentType === "image/webp" && matches(0, [82, 73, 70, 70]) && matches(8, [87, 69, 66, 80]);
  if (!valid) throw new Error("Visual reference must be PNG, JPEG, or WebP with matching bytes");
}

export type VisualGuidance = {
  artDirection: string; palette: { name: string; color: string }[];
  mascotGuidance: string; compositionGuidance: string; textPolicy: string; heroChartPolicy: string;
};

export function validateVisualProfileContent(content: {
  guidance: VisualGuidance;
  referenceBindings: { referenceId: string; role: string }[];
  defaultRoute: { provider: string; model: string; qualification: "unqualified" } | null;
}): void {
  const { guidance, referenceBindings, defaultRoute } = content;
  if (!guidance.artDirection.trim()) throw new Error("Visual art direction is required");
  for (const [key, value] of Object.entries(guidance)) {
    if (typeof value === "string" && value.length > (key === "artDirection" ? 12000 : 4000)) {
      throw new Error(`Visual ${key} exceeds its character limit`);
    }
  }
  if (guidance.palette.length < 1 || guidance.palette.length > 12) throw new Error("Visual palette needs 1 to 12 colors");
  for (const color of guidance.palette) {
    if (!color.name.trim() || color.name.length > 80 || !/^#[0-9a-f]{6}$/iu.test(color.color)) {
      throw new Error("Palette colors need a name and six-digit hex value");
    }
  }
  if (referenceBindings.length > 8) throw new Error("Visual profile supports at most 8 ordered references");
  if (new Set(referenceBindings.map(binding => binding.referenceId)).size !== referenceBindings.length) {
    throw new Error("Visual profile cannot repeat a reference");
  }
  if (defaultRoute && [defaultRoute.provider, defaultRoute.model].some(value => !value.trim() || value.length > 120 || value.trim() !== value)) {
    throw new Error("Default provider and model need distinct nonblank identifiers");
  }
}

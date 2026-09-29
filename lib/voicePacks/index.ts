import { DEFAULT_WORKSPACE_STATE, type BrandId } from "../domain";

/** Default voice pack markdown for a brand, resolved server-side (never client-supplied). */
export function getDefaultVoiceMarkdown(brandId: BrandId): string | undefined {
  const packs = DEFAULT_WORKSPACE_STATE.voicePacks.filter((pack) => pack.brandId === brandId);
  return (packs.find((pack) => pack.isDefault) ?? packs[0])?.markdown;
}

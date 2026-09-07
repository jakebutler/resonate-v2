export type SlotRole = "pillar" | "hook" | "satellite" | "cta" | "recap";
export type SlotMediaType = "post" | "article" | "essay" | "script";
export type SlotChannel =
  | "linkedin"
  | "x"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "reddit"
  | "corvo-blog";
export type CampaignPresetKey = "seed" | "standard" | "deep";

export type PresetSlotTemplate = {
  role: SlotRole;
  channel: SlotChannel;
  mediaType: SlotMediaType;
};

export type CampaignPreset = {
  key: CampaignPresetKey;
  name: string;
  description: string;
  slots: PresetSlotTemplate[];
};

export const ROLE_LEGEND: Record<SlotRole, string> = {
  pillar: "Anchors the thesis — the long-form anchor piece",
  hook: "Grabs attention — the short attention-grabber",
  satellite: "Carries a supporting angle alongside the pillar",
  cta: "Makes the ask — drives the campaign's conversion action",
  recap: "Closes the loop — wraps the set's argument",
};

export const ROLE_TINTS: Record<SlotRole, string> = {
  pillar: "bg-[#ffefdd] text-[#b25400]",
  hook: "bg-[#fde5ee] text-[#a11441]",
  satellite: "bg-[#e2eff1] text-[#0e4a54]",
  cta: "bg-[#e2f2e6] text-[#1d5c31]",
  recap: "bg-[#efeafb] text-[#4a3591]",
};

/** Corvo default compositions (#63). */
export const CAMPAIGN_PRESETS: Record<CampaignPresetKey, CampaignPreset> = {
  seed: {
    key: "seed",
    name: "Seed",
    description:
      "Minimal proof: one pillar to anchor the thesis, one satellite to carry it socially, one CTA. The CTA slot starts unlinked — incomplete slots block acceptance.",
    slots: [
      { role: "pillar", channel: "corvo-blog", mediaType: "article" },
      { role: "satellite", channel: "linkedin", mediaType: "post" },
      { role: "cta", channel: "linkedin", mediaType: "post" },
    ],
  },
  standard: {
    key: "standard",
    name: "Standard",
    description:
      "The Corvo workhorse: pillar + hook + two satellites + recap. Every slot links a working-set idea by default.",
    slots: [
      { role: "pillar", channel: "corvo-blog", mediaType: "article" },
      { role: "hook", channel: "x", mediaType: "post" },
      { role: "satellite", channel: "linkedin", mediaType: "post" },
      { role: "satellite", channel: "linkedin", mediaType: "post" },
      { role: "recap", channel: "linkedin", mediaType: "post" },
    ],
  },
  deep: {
    key: "deep",
    name: "Deep",
    description:
      "Full arc: adds an essay satellite and a YouTube script for the long argument. Heaviest lift; strongest narrative.",
    slots: [
      { role: "pillar", channel: "corvo-blog", mediaType: "article" },
      { role: "hook", channel: "x", mediaType: "post" },
      { role: "satellite", channel: "linkedin", mediaType: "essay" },
      { role: "satellite", channel: "linkedin", mediaType: "post" },
      { role: "satellite", channel: "youtube", mediaType: "script" },
      { role: "satellite", channel: "linkedin", mediaType: "post" },
      { role: "cta", channel: "linkedin", mediaType: "post" },
    ],
  },
};

export type EditableSlot = {
  role: SlotRole;
  channel: SlotChannel;
  mediaType: SlotMediaType;
  title?: string;
  angle?: string;
  ideaId?: string;
};

/**
 * D-10: switching presets preserves operator edits — slots are matched by
 * role + channel; matched slots keep title, angle, and linked idea; unmatched
 * slots fill from the preset. The working set is untouched by this function.
 */
export function applyPreset(
  currentSlots: EditableSlot[],
  presetKey: CampaignPresetKey
): EditableSlot[] {
  const preset = CAMPAIGN_PRESETS[presetKey];
  const remaining = [...currentSlots];
  return preset.slots.map((template) => {
    const matchedIndex = remaining.findIndex(
      (slot) => slot.role === template.role && slot.channel === template.channel
    );
    if (matchedIndex >= 0) {
      const [matched] = remaining.splice(matchedIndex, 1);
      return { ...template, title: matched.title, angle: matched.angle, ideaId: matched.ideaId };
    }
    return { ...template };
  });
}

/** D-11: an empty slot (no linked idea) is incomplete. */
export function isShapeComplete(
  slots: { ideaId?: string | null }[]
): boolean {
  return slots.every((slot) => Boolean(slot.ideaId));
}

export function countIncompleteSlots(
  slots: { ideaId?: string | null }[]
): number {
  return slots.filter((slot) => !slot.ideaId).length;
}

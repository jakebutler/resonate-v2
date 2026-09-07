import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_PRESETS,
  applyPreset,
  countIncompleteSlots,
  isShapeComplete,
} from "@/lib/campaignShapes";

describe("CAMPAIGN_PRESETS", () => {
  it("matches the locked Seed/Standard/Deep compositions", () => {
    expect(CAMPAIGN_PRESETS.seed.slots.map((slot) => slot.role)).toEqual([
      "pillar",
      "satellite",
      "cta",
    ]);
    expect(CAMPAIGN_PRESETS.standard.slots.map((slot) => slot.role)).toEqual([
      "pillar",
      "hook",
      "satellite",
      "satellite",
      "recap",
    ]);
    expect(CAMPAIGN_PRESETS.deep.slots).toHaveLength(7);
    expect(
      CAMPAIGN_PRESETS.deep.slots.some((slot) => slot.mediaType === "essay")
    ).toBe(true);
    expect(
      CAMPAIGN_PRESETS.deep.slots.some((slot) => slot.mediaType === "script")
    ).toBe(true);
  });

  it("uses channel identity with media type per D-9", () => {
    const pillar = CAMPAIGN_PRESETS.standard.slots[0];
    expect(pillar.channel).toBe("corvo-blog");
    expect(pillar.mediaType).toBe("article");
  });
});

describe("applyPreset (D-10 edit preservation)", () => {
  const standardShape = CAMPAIGN_PRESETS.standard.slots.map((slot) => ({
    ...slot,
    title: `${slot.role} title`,
    angle: `${slot.role} angle`,
    ideaId: `idea-${slot.role}-${slot.channel}`,
  }));

  it("keeps edits on slots matched by role + channel", () => {
    const next = applyPreset(standardShape, "deep");
    const pillar = next.find((slot) => slot.role === "pillar")!;
    expect(pillar.title).toBe("pillar title");
    expect(pillar.angle).toBe("pillar angle");
    expect(pillar.ideaId).toBe("idea-pillar-corvo-blog");

    const hook = next.find((slot) => slot.role === "hook")!;
    expect(hook.title).toBe("hook title");
  });

  it("fills unmatched slots fresh from the preset", () => {
    const next = applyPreset(standardShape, "deep");
    // Matching is role + channel (not media type), so the standard
    // satellite(linkedin) slots inherit into deep's linkedin satellites;
    // youtube/script and cta(linkedin) have no match and start fresh.
    const script = next.find((slot) => slot.channel === "youtube")!;
    expect(script.mediaType).toBe("script");
    expect(script.title).toBeUndefined();
    expect(script.angle).toBeUndefined();
    expect(script.ideaId).toBeUndefined();

    const cta = next.find((slot) => slot.role === "cta")!;
    expect(cta.title).toBeUndefined();
    expect(cta.ideaId).toBeUndefined();
  });

  it("produces the full preset composition and never mutates the working set", () => {
    const next = applyPreset(standardShape, "seed");
    expect(next).toHaveLength(3);
    expect(standardShape).toHaveLength(5);
  });
});

describe("completeness (D-11)", () => {
  it("treats an unlinked slot as incomplete", () => {
    expect(
      isShapeComplete([{ ideaId: "a" }, { ideaId: undefined }])
    ).toBe(false);
    expect(isShapeComplete([{ ideaId: "a" }, { ideaId: "b" }])).toBe(true);
    expect(isShapeComplete([])).toBe(true);
    expect(countIncompleteSlots([{ ideaId: "a" }, {}])).toBe(1);
  });
});

// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateVisualProfileContent } from "../visualProfile";
import { corvoCurrentGuidance, corvoSeed, corvoSeedIntegrity, verifyCorvoSeedIntegrity } from "../visualSeed";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const guidance = {
  artDirection: "Matte paper", palette: [{ name: "Paper", color: "#ECE9E2" }],
  mascotGuidance: "", compositionGuidance: "Wide", textPolicy: "Short labels", heroChartPolicy: "Illustrative",
};

describe("visual profile input limits", () => {
  it("verifies exact source UTF-8 and frozen lesson/final-direction JSON without external masters", async () => {
    await expect(verifyCorvoSeedIntegrity()).resolves.toBeUndefined();
    const hash = (content: string) => createHash("sha256").update(content, "utf8").digest("hex");
    expect(hash(corvoSeed.sourceDocument)).toBe(corvoSeed.manifest.source_sha256);
    for (const [name, expected] of Object.entries(corvoSeedIntegrity.files)) {
      expect(hash(readFileSync(new URL(`../visualSeed/${name}`, import.meta.url), "utf8"))).toBe(expected);
    }
    expect(hash(JSON.stringify(corvoSeed.lessons))).toBe(corvoSeedIntegrity.archive.lessons);
    expect(hash(JSON.stringify(corvoSeed.finalDirections))).toBe(corvoSeedIntegrity.archive.finalDirections);
  });
  it("attributes seeded chart guidance only to exact approved source wording", () => {
    expect(corvoSeed.sourceDocument).toContain(corvoCurrentGuidance.heroChartPolicy.split("\n\n")[0]);
    expect(corvoCurrentGuidance.heroChartPolicy).not.toContain("does not apply");
    expect(corvoCurrentGuidance.compositionGuidance).toMatch(/^Stage a recognizable physical scene/);
  });
  it("accepts bounded guidance and rejects invalid colors or oversized ordered reference sets", () => {
    expect(() => validateVisualProfileContent({ guidance, referenceBindings: [], defaultRoute: null })).not.toThrow();
    expect(() => validateVisualProfileContent({
      guidance: { ...guidance, palette: [{ name: "Bad", color: "javascript:alert(1)" }] }, referenceBindings: [], defaultRoute: null,
    })).toThrow(/six-digit hex/);
    expect(() => validateVisualProfileContent({
      guidance, referenceBindings: Array.from({ length: 9 }, (_, i) => ({ referenceId: `reference-${i}`, role: "style" })), defaultRoute: null,
    })).toThrow(/at most 8/);
  });
});

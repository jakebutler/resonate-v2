import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareHeroExport } from "../visualExport";

describe("reviewed Corvo hero export", () => {
  it("exports a proportional 1600 by 900 WebP below 150 KB with a content identity", async () => {
    const source = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#2E5B60" } }).png().toBuffer();
    const result = await prepareHeroExport(source);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata).toMatchObject({ width: 1600, height: 900, format: "webp" });
    expect(result.bytes.byteLength).toBeLessThan(150_000);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.presentation).toMatchObject({ fit: "cover", position: "centre", width: 1600, height: 900 });
  });
  it("rejects a crop outside the actual source before preparing approval bytes", async () => {
    const source = await sharp({ create: { width: 32, height: 24, channels: 3, background: "white" } }).png().toBuffer();
    await expect(prepareHeroExport(source, { left: 20, top: 0, width: 32, height: 24 })).rejects.toThrow("Hero crop must be an in-bounds pixel rectangle.");
  });
});

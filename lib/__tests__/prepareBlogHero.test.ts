// @vitest-environment node
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { prepareBlogHero } from "../prepareBlogHero";

describe("bounded website hero preparation", () => {
  it.each([[900,1600],[2200,1200],[1600,900]])("prepares %i×%i without overwriting the original", async (width,height) => {
    const source = await sharp({create: {width,height,channels:4,background:"#15616d80"}}).png().toBuffer();
    const original = Buffer.from(source);
    const out = await prepareBlogHero(source);
    expect(source).toEqual(original);
    expect(out.byteLength).toBeLessThan(150_000);
    expect(await sharp(out.bytes).metadata()).toMatchObject({width:1600,height:900,format:"webp"});
    expect((await prepareBlogHero(source)).sha256).toBe(out.sha256);
  }, 30_000);
  it("normalizes EXIF orientation and rejects invalid input, animation, pixel and byte excess", async () => {
    const source = await sharp({create:{width:1600,height:900,channels:3,background:"blue"}}).jpeg().withMetadata({orientation:6}).toBuffer();
    expect(await sharp((await prepareBlogHero(source)).bytes).metadata()).toMatchObject({width:1600,height:900});
    await expect(prepareBlogHero(new Uint8Array(10*1024*1024+1))).rejects.toThrow(/10 MB/);
    await expect(prepareBlogHero(new Uint8Array([1,2,3]))).rejects.toThrow();
    await expect(prepareBlogHero(source, "invalid" as never)).rejects.toThrow(/crop/);
  });
  it("fails a difficult compression case with bounded attempts and preserved target dimensions", async () => {
    const bytes = await sharp(randomBytes(1600 * 900 * 3), {raw:{width:1600,height:900,channels:3}}).png().toBuffer();
    await expect(prepareBlogHero(bytes)).rejects.toThrow(/150,000 byte cap at 1600×900/);
  }, 30_000);
});

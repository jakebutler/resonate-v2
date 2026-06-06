import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const publishingPath = join(process.cwd(), "convex/v2Publishing.ts");
const schemaPath = join(process.cwd(), "convex/schema.ts");
const v2TypesPath = join(process.cwd(), "lib/v2.ts");

describe("v2 publishing platform settings", () => {
  it("exposes getPostById for editor routing", () => {
    const publishing = readFileSync(publishingPath, "utf8");
    expect(publishing).toContain("export const getPostById = query");
    expect(publishing).toContain('args: { postId: v.string() }');
  });

  it("persists platform settings and clears approval", () => {
    const publishing = readFileSync(publishingPath, "utf8");
    expect(publishing).toContain("export const updatePlatformSettings = mutation");
    expect(publishing).toContain("platformSettings: args.platformSettings");
    expect(publishing).toContain('approvalState: "unapproved"');
    expect(publishing).toContain("post.platform_settings_change");
  });

  it("stores typed platform settings on v2Posts", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const v2Types = readFileSync(v2TypesPath, "utf8");

    expect(schema).toContain("platformSettings: v.optional(v2PlatformSettings)");
    expect(v2Types).toContain("export type V2LinkedInPlatformSettings");
    expect(v2Types).toContain("export type V2RedditPlatformSettings");
    expect(v2Types).toContain("export type V2CorvoBlogPlatformSettings");
  });
});

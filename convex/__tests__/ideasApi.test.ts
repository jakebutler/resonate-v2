import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("generated ideas API", () => {
  it("includes ideas in the generated data model", () => {
    const generated = readFileSync(
      join(process.cwd(), "convex/_generated/api.d.ts"),
      "utf8"
    );

    expect(generated).toContain('import type * as ideas from "../ideas.js";');
  });

  it("includes v2 publishing functions in the generated API surface", () => {
    const generated = readFileSync(
      join(process.cwd(), "convex/_generated/api.d.ts"),
      "utf8"
    );

    expect(generated).toContain('import type * as v2Publishing from "../v2Publishing.js";');
  });

  it("includes v2 research functions in the generated API surface", () => {
    const generated = readFileSync(
      join(process.cwd(), "convex/_generated/api.d.ts"),
      "utf8"
    );

    expect(generated).toContain('import type * as v2Research from "../v2Research.js";');
  });

  it("includes v2 idea spawning and link persistence in the generated surface", () => {
    const ideas = readFileSync(join(process.cwd(), "convex/ideas.ts"), "utf8");
    const schema = readFileSync(join(process.cwd(), "convex/schema.ts"), "utf8");

    expect(ideas).toContain("spawnV2Posts");
    expect(schema).toContain("capturedIdeaV2PostLinks");
  });

  it("keeps v2 post and calendar list queries scoped to current brand membership", () => {
    const publishing = readFileSync(
      join(process.cwd(), "convex/v2Publishing.ts"),
      "utf8"
    );

    expect(publishing).toContain("async function accessibleBrandIds");
    expect(publishing.match(/accessibleBrandIds\(ctx, userId\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(publishing.match(/accessibleBrands\.has\(post\.brandId\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

import { describe, expect, it } from "vitest";
import { localFixtureTokenUrl } from "../localFixtureAuth";

describe("isolated local visual rehearsal authentication", () => {
  it("permits a fixture issuer only for the explicit local development backend", () => {
    const input = { runtime: "development", bypass: true, convexUrl: "http://127.0.0.1:3210", tokenUrl: "http://127.0.0.1:3969/token", vercel: false };
    expect(localFixtureTokenUrl(input)).toBe(input.tokenUrl);
    for (const override of [{ runtime: "production" }, { bypass: false }, { vercel: true }, { convexUrl: "https://example.convex.cloud" }, { tokenUrl: "https://attacker.test/token" }]) {
      expect(localFixtureTokenUrl({ ...input, ...override })).toBeUndefined();
    }
  });
});

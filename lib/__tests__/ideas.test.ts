import { describe, expect, it } from "vitest";
import {
  buildIdeaPreview,
  normalizeIdeaSourceUrl,
  sanitizeIdeaTags,
} from "@/lib/ideas";

describe("normalizeIdeaSourceUrl", () => {
  it("removes tracking params and normalizes host casing", () => {
    expect(
      normalizeIdeaSourceUrl(
        "https://YouTube.com/watch?v=abc&utm_source=rss&utm_medium=email"
      )
    ).toBe("https://youtube.com/watch?v=abc");
  });

  it("returns null for empty input", () => {
    expect(normalizeIdeaSourceUrl("")).toBeNull();
  });
});

describe("sanitizeIdeaTags", () => {
  it("trims, deduplicates, and lowercases tags", () => {
    expect(sanitizeIdeaTags([" AI ", "voice", "ai", ""])).toEqual([
      "ai",
      "voice",
    ]);
  });
});

describe("buildIdeaPreview", () => {
  it("prefers the latest entry text and truncates long previews", () => {
    expect(buildIdeaPreview("A".repeat(160))).toBe(`${"A".repeat(140)}…`);
  });
});

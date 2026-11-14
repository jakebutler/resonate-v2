import { describe, expect, it } from "vitest";
import { typedId, typedIds } from "@/lib/typedIds";
import type { Id } from "@/convex/_generated/dataModel";

describe("typedId", () => {
  it("returns the same string so Convex sees the original ID", () => {
    const id = typedId<"campaigns">("campaign_abc123");
    expect(id).toBe("campaign_abc123");
  });

  it("rejects an empty route param before it reaches a Convex call", () => {
    expect(() => typedId<"campaigns">("")).toThrow(
      "Expected a non-empty Convex document ID."
    );
  });

  it("brands the result so cross-table misuse fails at compile time", () => {
    // The runtime value is just the string; the compile-time assertion is the
    // test. If the branding is lost, these assignments widen to string and
    // tsc stops flagging the swap.
    const campaign = typedId<"campaigns">("campaign_1");
    const corpora = typedId<"corpora">("corpus_1");
    expect(campaign).not.toBe(corpora);
    const same: Id<"campaigns"> = campaign;
    expect(same).toBe("campaign_1");
  });
});

describe("typedIds", () => {
  it("maps every element through typedId", () => {
    const ids = typedIds<"v2Posts">(["post_1", "post_2"]);
    expect(ids).toEqual(["post_1", "post_2"]);
  });

  it("propagates the empty-ID rejection", () => {
    expect(() => typedIds<"v2Posts">(["post_1", ""])).toThrow(
      "Expected a non-empty Convex document ID."
    );
  });

  it("returns an empty array for no ids", () => {
    expect(typedIds<"v2Posts">([])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { publicationTransitionRequired } from "../publicationReview";

describe("publication authoring boundary", () => {
  it("requires reconciliation for an admitted export even before a PR URL is recorded", () => {
    expect(publicationTransitionRequired({ status: "draft", blogExportClaimKey: "saved-export-claim" })).toBe(true);
    expect(publicationTransitionRequired({ status: "draft" })).toBe(false);
  });
});

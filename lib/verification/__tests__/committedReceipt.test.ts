import { describe, expect, it } from "vitest";
import { decideCommittedReceipt } from "../committedReceipt";

const datedReceipt = [
  "# Live run receipt — openai (image-generation)",
  "",
  "- **Qualification:** live-receipt",
  "- **Executed at:** 2026-11-14T00:05:17Z",
  "",
  "## Checks",
  "",
  "- [PASS] Functional packet exit 0 in 37s",
].join("\n");

describe("decideCommittedReceipt", () => {
  it("accepts a committed dated receipt as criterion evidence", () => {
    const decision = decideCommittedReceipt(
      "docs/verification/receipts/2026-11-14-live-receipt.md",
      datedReceipt,
    );
    expect(decision.kind).toBe("accepted");
    if (decision.kind === "accepted") {
      expect(decision.evidence).toContain(
        "docs/verification/receipts/2026-11-14-live-receipt.md",
      );
      expect(decision.evidence).toContain("2026-11-14T00:05:17Z");
    }
  });

  it("reports no-receipt-declared when the criterion declares none", () => {
    expect(decideCommittedReceipt(undefined, datedReceipt)).toEqual({
      kind: "no-receipt-declared",
    });
    expect(decideCommittedReceipt(undefined, null)).toEqual({
      kind: "no-receipt-declared",
    });
  });

  it("reports a missing receipt file instead of silently passing", () => {
    expect(decideCommittedReceipt("docs/verification/receipts/gone.md", null)).toEqual({
      kind: "receipt-missing",
      receiptPath: "docs/verification/receipts/gone.md",
    });
  });

  it("rejects a receipt with no dated execution line", () => {
    const undated = datedReceipt.replace(
      "- **Executed at:** 2026-11-14T00:05:17Z",
      "- **Executed at:** (omitted)",
    );
    const decision = decideCommittedReceipt(
      "docs/verification/receipts/undated.md",
      undated,
    );
    expect(decision).toEqual({
      kind: "receipt-undated",
      receiptPath: "docs/verification/receipts/undated.md",
    });
  });
});

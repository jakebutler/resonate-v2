/**
 * Acceptance of a committed, dated live receipt as criterion evidence.
 *
 * A live-receipt criterion names its provider-key prerequisites and the runner
 * re-checks them at run time — but keys are rotated and reports are re-run
 * later, so a criterion with a committed receipt from an earlier approved live
 * run would report ABSENT ("prerequisite not set"), understating readiness in
 * the freshest report. When the criterion declares `receipt`, the runner
 * accepts that committed receipt as the criterion's evidence instead.
 *
 * The decision logic is pure; the caller (scripts/verify-feature.ts) does the
 * filesystem read and passes the content in (null when the file is missing or
 * unreadable).
 */

/** A receipt is dated: buildLiveReceipt always writes an `Executed at` line. */
const DATED_EXECUTION_LINE = /^- \*\*Executed at:\*\* \d{4}-\d{2}-\d{2}T/m;

export type CommittedReceiptDecision =
  | { kind: "no-receipt-declared" }
  | { kind: "receipt-missing"; receiptPath: string }
  | { kind: "receipt-undated"; receiptPath: string }
  | { kind: "accepted"; receiptPath: string; evidence: string };

export function decideCommittedReceipt(
  receiptPath: string | undefined,
  content: string | null,
): CommittedReceiptDecision {
  if (receiptPath === undefined) return { kind: "no-receipt-declared" };
  if (content === null) return { kind: "receipt-missing", receiptPath };
  if (!DATED_EXECUTION_LINE.test(content)) {
    return { kind: "receipt-undated", receiptPath };
  }
  return {
    kind: "accepted",
    receiptPath,
    evidence:
      `Accepted committed live receipt \`${receiptPath}\` as criterion evidence ` +
      `(prerequisites are not set in this run environment; the receipt records an ` +
      `earlier approved live run):\n\n${content.trimEnd()}`,
  };
}

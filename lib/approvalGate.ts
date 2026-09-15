/**
 * The ADR 0002 approval-gate ladder, as one pure function. This is the app's
 * central submission invariant: routable → approved → scheduled → fingerprint
 * unchanged. The Convex submit paths and the lib/domain domain-model check all
 * delegate here so the tested copy IS the copy that runs.
 *
 * Returns null when eligible, otherwise the human-readable reason.
 */
export function providerSubmissionIneligibilityReason(input: {
  routable: boolean;
  approvalState: string;
  scheduledDate?: string | null;
  contentFingerprint: string;
  currentFingerprint: string;
}): string | null {
  if (!input.routable) return "Channel is not routable.";
  if (input.approvalState !== "approved") return "Post is not approved.";
  if (!input.scheduledDate) return "Scheduled date is required.";
  if (input.contentFingerprint !== input.currentFingerprint) {
    return "Content changed after approval.";
  }
  return null;
}

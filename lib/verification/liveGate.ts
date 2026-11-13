/**
 * Generalized fail-closed gate for live-provider verification runs (V7).
 *
 * The repo's gated live-validation workflows (buffer/zernio) each hand-roll the
 * same check: the live stage runs only when the submission input is explicitly
 * "approved" AND the provider credentials are present. This module is that
 * check as one pure function, so the tested copy is the copy every live tier —
 * existing and future — delegates to.
 *
 * Fail-closed ordering: the approval gate is evaluated first. An unapproved
 * run reports `unapproved` even when keys exist, and an approved run without
 * keys reports `credentials-not-configured` naming the missing secrets —
 * never a silent skip.
 */

export type QualificationLevel =
  | "offline-fixture"
  | "offline-contract"
  | "live-receipt";

export type LiveGateInput = {
  /** The gate input, e.g. the workflow's `live_submission` value. */
  approval: string | undefined | null;
  /** The value the gate treats as explicit approval. Default "approved". */
  approvalApprovedValue?: string;
  /**
   * Credential name -> value as observed in the environment. A missing,
   * null, or whitespace-only value counts as not configured.
   */
  credentials: Record<string, string | undefined | null>;
  /** Optional per-run spend ceiling in USD, surfaced on approval. */
  budgetUsd?: number | null;
};

export type LiveGateDecision =
  | {
      outcome: "unapproved";
      qualification: "offline-contract";
      reason: string;
    }
  | {
      outcome: "credentials-not-configured";
      qualification: "offline-contract";
      missingCredentials: string[];
      reason: string;
    }
  | {
      outcome: "approved";
      qualification: "live-receipt";
      budgetUsd: number | null;
      reason: string;
    };

export function evaluateLiveGate(input: LiveGateInput): LiveGateDecision {
  const approvedValue = input.approvalApprovedValue ?? "approved";
  const approval = input.approval?.trim();

  if (approval !== approvedValue) {
    return {
      outcome: "unapproved",
      qualification: "offline-contract",
      reason: `Live stage requires the submission gate set to "${approvedValue}" (received ${describeValue(input.approval)}).`,
    };
  }

  const missingCredentials = Object.entries(input.credentials)
    .filter(([, value]) => !value || !value.trim())
    .map(([name]) => name);

  if (missingCredentials.length > 0) {
    return {
      outcome: "credentials-not-configured",
      qualification: "offline-contract",
      missingCredentials,
      reason: `Submission gate is approved but credentials not configured: ${missingCredentials.join(", ")}.`,
    };
  }

  return {
    outcome: "approved",
    qualification: "live-receipt",
    budgetUsd: input.budgetUsd ?? null,
    reason: `Submission gate approved and all credentials present${input.budgetUsd != null ? ` (budget cap $${input.budgetUsd})` : ""}.`,
  };
}

function describeValue(value: string | undefined | null): string {
  if (value == null || value.trim() === "") return "no value";
  return `"${value.trim()}"`;
}

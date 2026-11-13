/**
 * Gate for the editorial-visuals live-qualification harness (C6).
 *
 * The generic V7 gate (liveGate.ts) decides approval + credentials; the
 * visual harness adds two preconditions the generic gate cannot know about:
 * the dev deployment the packet runs against, and the operator token the
 * deployment's own gate requires. This module composes the generic gate with
 * those visual-specific guards so the tested copy is the copy the workflow
 * runner executes.
 *
 * Fail-closed ordering (matches liveGate.ts): approval is evaluated first —
 * an unapproved run reports `unapproved` even when every credential exists,
 * and an approved run without its credentials reports
 * `credentials-not-configured` naming each one — never a silent skip.
 *
 * Budget: the reviewed functional packet reserves $0.25 per call, $0.50 for
 * the two-call sequence (docs/editorial-visuals/providers/gpt-image-1-functional-bound.md),
 * inside the existing $5 per-provider ledger caps the workflow state machine
 * enforces. The gate carries the packet's $0.50 sequence reservation.
 */

import { evaluateLiveGate } from "./liveGate";

export const VISUAL_PACKET_SEQUENCE_BUDGET_USD = 0.5;
export const VISUAL_PROVIDER_LEDGER_CAP_USD = 5;

export type VisualLiveGateInput = {
  /** The workflow's `visual_live_submission` dispatch input. */
  approval: string | undefined | null;
  /** VISUAL_QUALIFICATION_OPERATOR_TOKEN — also required by the deployment gate. */
  operatorToken: string | undefined | null;
  /** The dev deployment URL the packet executes against. */
  deploymentUrl: string | undefined | null;
};

export type VisualLiveGateDecision =
  | {
      outcome: "unapproved";
      qualification: "offline-contract";
      reason: string;
    }
  | {
      outcome: "credentials-not-configured";
      missingCredentials: string[];
      reason: string;
    }
  | {
      outcome: "deployment-refused";
      reason: string;
    }
  | {
      outcome: "approved";
      qualification: "live-receipt";
      budgetUsd: number;
      deploymentUrl: string;
      reason: string;
    };

export function evaluateVisualLiveGate(input: VisualLiveGateInput): VisualLiveGateDecision {
  // Reuse the generic V7 gate for the approval and operator-token checks so
  // the fail-closed ordering has exactly one tested implementation.
  const generic = evaluateLiveGate({
    approval: input.approval,
    credentials: { VISUAL_QUALIFICATION_OPERATOR_TOKEN: input.operatorToken },
    budgetUsd: VISUAL_PACKET_SEQUENCE_BUDGET_USD,
  });

  if (generic.outcome === "unapproved") {
    return {
      outcome: "unapproved",
      qualification: "offline-contract",
      reason: `Visual live qualification requires the submission gate set to "approved" (received ${describeValue(input.approval)}).`,
    };
  }

  const deploymentUrl = input.deploymentUrl?.trim() ?? "";
  const missing = [
    ...(generic.outcome === "credentials-not-configured" ? generic.missingCredentials : []),
    ...(deploymentUrl ? [] : ["deployment URL (workflow input deployment-url)"]),
  ];
  if (missing.length > 0) {
    return {
      outcome: "credentials-not-configured",
      missingCredentials: missing,
      reason: `Submission gate is approved but prerequisites not configured: ${missing.join(", ")}. Provider keys themselves live on the deployment and are re-checked there.`,
    };
  }

  // Mirror the operator script's production refusal: the packet may only run
  // against a dev deployment.
  const refused = ["prod", "production"].some((marker) => deploymentUrl.toLowerCase().includes(marker));
  if (refused) {
    return {
      outcome: "deployment-refused",
      reason: `Refusing to run the live qualification packet against a production deployment.`,
    };
  }

  return {
    outcome: "approved",
    qualification: "live-receipt",
    budgetUsd: VISUAL_PACKET_SEQUENCE_BUDGET_USD,
    deploymentUrl,
    reason: `Submission gate approved, operator token present, dev deployment resolved (packet budget $${VISUAL_PACKET_SEQUENCE_BUDGET_USD}, under the $${VISUAL_PROVIDER_LEDGER_CAP_USD} provider caps).`,
  };
}

function describeValue(value: string | undefined | null): string {
  return value == null || value.trim() === "" ? "no value" : `"${value.trim()}"`;
}

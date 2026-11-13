import { describe, expect, it } from "vitest";
import { evaluateLiveGate } from "../liveGate";

describe("evaluateLiveGate", () => {
  it("approves with the gate set and credentials present", () => {
    const decision = evaluateLiveGate({
      approval: "approved",
      credentials: { BUFFER_API_KEY: "key-value" },
      budgetUsd: 5,
    });

    expect(decision.outcome).toBe("approved");
    expect(decision.qualification).toBe("live-receipt");
    expect(decision.budgetUsd).toBe(5);
  });

  it("approves on a trimmed match of the approved value", () => {
    for (const approval of ["approved", "approved ", " approved"]) {
      const decision = evaluateLiveGate({
        approval,
        credentials: { BUFFER_API_KEY: "key-value" },
      });

      expect(decision.outcome).toBe("approved");
    }
  });

  it("rejects every value that is not the approved value", () => {
    for (const approval of ["Approved", "approve", "approved123", "blocked", undefined, null, ""]) {
      const decision = evaluateLiveGate({
        approval,
        credentials: { BUFFER_API_KEY: "key-value" },
      });

      expect(decision.outcome).toBe("unapproved");
      expect(decision.qualification).toBe("offline-contract");
    }
  });

  it("never approves when the gate is off, even with keys present", () => {
    const decision = evaluateLiveGate({
      approval: "blocked",
      credentials: { BUFFER_API_KEY: "key-value" },
    });

    expect(decision.outcome).toBe("unapproved");
    if (decision.outcome !== "unapproved") return expect.unreachable();
    expect(decision.reason).toContain('"approved"');
    expect(decision.reason).toContain("blocked");
  });

  it("reports credentials-not-configured when approved but keys are missing", () => {
    const decision = evaluateLiveGate({
      approval: "approved",
      credentials: { BUFFER_API_KEY: undefined, ZERNIO_API_KEY: "" },
    });

    expect(decision.outcome).toBe("credentials-not-configured");
    expect(decision.qualification).toBe("offline-contract");
    if (decision.outcome !== "credentials-not-configured") return expect.unreachable();
    expect(decision.missingCredentials).toEqual(["BUFFER_API_KEY", "ZERNIO_API_KEY"]);
    expect(decision.reason).toContain("credentials not configured");
  });

  it("treats whitespace-only credentials as not configured", () => {
    const decision = evaluateLiveGate({
      approval: "approved",
      credentials: { BUFFER_API_KEY: "   " },
    });

    expect(decision.outcome).toBe("credentials-not-configured");
    if (decision.outcome !== "credentials-not-configured") return expect.unreachable();
    expect(decision.missingCredentials).toEqual(["BUFFER_API_KEY"]);
  });

  it("honors a custom approved value", () => {
    const approved = evaluateLiveGate({
      approval: "yes",
      approvalApprovedValue: "yes",
      credentials: { BUFFER_API_KEY: "key-value" },
    });
    expect(approved.outcome).toBe("approved");

    const blocked = evaluateLiveGate({
      approval: "approved",
      approvalApprovedValue: "yes",
      credentials: { BUFFER_API_KEY: "key-value" },
    });
    expect(blocked.outcome).toBe("unapproved");
  });

  it("supports multiple credentials and reports only the missing ones", () => {
    const decision = evaluateLiveGate({
      approval: "approved",
      credentials: {
        OPENAI_API_KEY: "key-value",
        DIGITALOCEAN_INFERENCE_API_KEY: undefined,
        OPENAI_TEXT_API_KEY: null,
      },
    });

    if (decision.outcome !== "credentials-not-configured") return expect.unreachable();
    expect(decision.missingCredentials).toEqual([
      "DIGITALOCEAN_INFERENCE_API_KEY",
      "OPENAI_TEXT_API_KEY",
    ]);
  });
});

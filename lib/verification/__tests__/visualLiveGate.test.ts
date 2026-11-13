import { describe, expect, it } from "vitest";
import {
  evaluateVisualLiveGate,
  VISUAL_PACKET_SEQUENCE_BUDGET_USD,
  VISUAL_PROVIDER_LEDGER_CAP_USD,
} from "../visualLiveGate";

const devUrl = "https://agreeable-marmot-123.convex.cloud";

describe("evaluateVisualLiveGate", () => {
  it("reports unapproved first, even with every credential present", () => {
    const decision = evaluateVisualLiveGate({
      approval: "blocked",
      operatorToken: "token",
      deploymentUrl: devUrl,
    });
    expect(decision).toMatchObject({ outcome: "unapproved", qualification: "offline-contract" });
    expect(decision.reason).toContain("approved");
  });

  it("treats a missing approval as unapproved", () => {
    expect(evaluateVisualLiveGate({ approval: null, operatorToken: "token", deploymentUrl: devUrl }))
      .toMatchObject({ outcome: "unapproved" });
  });

  it("reports credentials-not-configured naming the operator token when approval is granted but the token is absent", () => {
    for (const operatorToken of [undefined, null, "", "   "] as const) {
      const decision = evaluateVisualLiveGate({ approval: "approved", operatorToken, deploymentUrl: devUrl });
      expect(decision).toMatchObject({
        outcome: "credentials-not-configured",
        missingCredentials: ["VISUAL_QUALIFICATION_OPERATOR_TOKEN"],
      });
    }
  });

  it("reports credentials-not-configured naming the deployment URL when it is absent", () => {
    for (const deploymentUrl of [undefined, null, "", "  "] as const) {
      const decision = evaluateVisualLiveGate({ approval: "approved", operatorToken: "token", deploymentUrl });
      expect(decision.outcome).toBe("credentials-not-configured");
      if (decision.outcome !== "credentials-not-configured") throw new Error("Expected credentials-not-configured");
      expect(decision.missingCredentials).toEqual(["deployment URL (workflow input deployment-url)"]);
    }
  });

  it("names every missing prerequisite together instead of one per run", () => {
    const decision = evaluateVisualLiveGate({ approval: "approved", operatorToken: "", deploymentUrl: "" });
    expect(decision).toMatchObject({
      outcome: "credentials-not-configured",
      missingCredentials: ["VISUAL_QUALIFICATION_OPERATOR_TOKEN", "deployment URL (workflow input deployment-url)"],
    });
  });

  it("refuses a production deployment after the approval and credential gates pass", () => {
    for (const deploymentUrl of [
      "https://prod-deployment.convex.cloud",
      "https://my-production-convex.cloud",
      "https://GENUINELY-PROD.convex.cloud",
    ]) {
      expect(evaluateVisualLiveGate({ approval: "approved", operatorToken: "token", deploymentUrl }))
        .toMatchObject({ outcome: "deployment-refused" });
    }
  });

  it("approves a dev deployment with the operator token, carrying the packet budget under the provider caps", () => {
    const decision = evaluateVisualLiveGate({ approval: "approved", operatorToken: "token", deploymentUrl: `  ${devUrl}  ` });
    expect(decision).toMatchObject({
      outcome: "approved",
      qualification: "live-receipt",
      budgetUsd: VISUAL_PACKET_SEQUENCE_BUDGET_USD,
      deploymentUrl: devUrl,
    });
    expect(VISUAL_PACKET_SEQUENCE_BUDGET_USD).toBeLessThanOrEqual(VISUAL_PROVIDER_LEDGER_CAP_USD);
  });
});

import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  formatManifestIssues,
  parseVerificationManifest,
  verificationManifestSchema,
} from "../verificationManifest";

function validManifest() {
  return {
    featureId: "smoke",
    name: "Smoke feature",
    fixtures: [{ name: "campaign-batch", module: "test-support/campaignBatch.ts" }],
    criteria: [
      {
        id: "ladder-green",
        name: "Ladder is green",
        runner: "vitest",
        tier: "offline-fixture",
        target: "lib/__tests__/smoke.test.ts",
        fixtures: ["campaign-batch"],
        prerequisites: [],
        dependsOn: [],
      },
      {
        id: "provider-contract",
        name: "Provider contract holds",
        runner: "contract",
        tier: "offline-contract",
        target: "scripts/smoke-contract.mjs",
        command: "node scripts/smoke-contract.mjs",
        fixtures: [],
        prerequisites: [],
        dependsOn: ["ladder-green"],
      },
    ],
  };
}

/** Parses a manifest expected to be invalid; returns the named issues for asserting. */
function rejectedWithIssues(json: unknown): string[] {
  const result = verificationManifestSchema.safeParse(json);
  if (result.success) {
    throw new Error("expected manifest to be rejected, but it parsed");
  }
  return formatManifestIssues(result.error as z.ZodError);
}

describe("verificationManifestSchema", () => {
  it("accepts a valid manifest and applies field defaults", () => {
    const manifest = parseVerificationManifest(validManifest());
    expect(manifest.featureId).toBe("smoke");
    expect(manifest.criteria).toHaveLength(2);
    expect(manifest.criteria[0].fixtures).toEqual(["campaign-batch"]);
    expect(manifest.criteria[1].command).toBe("node scripts/smoke-contract.mjs");
  });

  it("rejects an unknown runner type with a named error", () => {
    const json = validManifest();
    json.criteria[0].runner = "jest" as never;
    const issues = rejectedWithIssues(json);
    expect(issues.some((issue) => issue.includes("criteria.0.runner"))).toBe(true);
  });

  it("rejects a bad qualification tier with a named error", () => {
    const json = validManifest();
    json.criteria[1].tier = "live" as never;
    const issues = rejectedWithIssues(json);
    expect(issues.some((issue) => issue.includes("criteria.1.tier"))).toBe(true);
  });

  it("rejects duplicate criterion ids", () => {
    const json = validManifest();
    json.criteria[1] = { ...json.criteria[0], name: "Duplicate" };
    const issues = rejectedWithIssues(json);
    expect(issues.some((issue) => issue.includes('duplicate criterion id "ladder-green"'))).toBe(
      true,
    );
  });

  it("rejects a criterion referencing an unknown fixture", () => {
    const json = validManifest();
    json.criteria[0].fixtures = ["no-such-fixture"];
    const issues = rejectedWithIssues(json);
    expect(issues.some((issue) => issue.includes('references unknown fixture "no-such-fixture"')))
      .toBe(true);
  });

  it("rejects a dependency on an unknown criterion id", () => {
    const json = validManifest();
    json.criteria[1].dependsOn = ["missing-criterion"];
    const issues = rejectedWithIssues(json);
    expect(
      issues.some((issue) => issue.includes('depends on unknown criterion "missing-criterion"')),
    ).toBe(true);
  });

  it("rejects a self-dependency", () => {
    const json = validManifest();
    json.criteria[0].dependsOn = ["ladder-green"];
    expect(rejectedWithIssues(json).length).toBeGreaterThan(0);
  });

  it("requires an explicit command for contract criteria", () => {
    const json = validManifest();
    delete json.criteria[1].command;
    const issues = rejectedWithIssues(json);
    expect(issues.some((issue) => issue.includes("requires an explicit command"))).toBe(true);
  });

  it("requires a live-receipt criterion to name its gating prerequisite", () => {
    const json = validManifest();
    json.criteria[1].tier = "live-receipt";
    const issues = rejectedWithIssues(json);
    expect(issues.some((issue) => issue.includes("must name the prerequisite"))).toBe(true);
  });

  it("accepts a live-receipt criterion that names a prerequisite", () => {
    const json = validManifest();
    json.criteria[1].tier = "live-receipt";
    json.criteria[1].prerequisites = ["OPENAI_API_KEY"];
    expect(() => parseVerificationManifest(json)).not.toThrow();
  });

  it("rejects a manifest with zero criteria", () => {
    const json = validManifest();
    json.criteria = [];
    expect(rejectedWithIssues(json).length).toBeGreaterThan(0);
  });
});

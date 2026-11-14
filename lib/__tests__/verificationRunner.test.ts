import { describe, expect, it } from "vitest";
import { parseVerificationManifest } from "../verificationManifest";
import type { ExecutorResult } from "../verificationRunner";
import {
  isRunSuccessful,
  renderVerificationReport,
  runVerification,
} from "../verificationRunner";

function manifestJson() {
  return {
    featureId: "smoke",
    name: "Smoke feature",
    criteria: [
      {
        id: "ladder-green",
        name: "Ladder is green",
        runner: "vitest",
        tier: "offline-fixture",
        target: "lib/__tests__/smoke.test.ts",
        fixtures: [],
        prerequisites: [],
        dependsOn: [],
      },
      {
        id: "downstream",
        name: "Depends on the ladder",
        runner: "contract",
        tier: "offline-contract",
        target: "scripts/smoke-contract.mjs",
        command: "node scripts/smoke-contract.mjs",
        fixtures: [],
        prerequisites: [],
        dependsOn: ["ladder-green"],
      },
      {
        id: "live-provider",
        name: "Live provider receipt",
        runner: "contract",
        tier: "live-receipt",
        target: "scripts/live-packet.mjs",
        command: "node scripts/live-packet.mjs",
        fixtures: [],
        prerequisites: ["OPENAI_API_KEY"],
        dependsOn: [],
      },
    ],
  };
}

const passingExecutor = async (): Promise<ExecutorResult> => ({
  outcome: "PASS",
  evidence: "$ npx vitest run …\nexit code: 0\nTests  3 passed (3)",
});

describe("runVerification", () => {
  it("records a PASS with its self-observed evidence and a successful summary", async () => {
    const manifest = parseVerificationManifest(manifestJson());
    const executed: string[] = [];
    const result = await runVerification(manifest, async (criterion) => {
      executed.push(criterion.id);
      return { outcome: "PASS", evidence: "exit code: 0" };
    });

    expect(executed).toEqual(["ladder-green", "downstream", "live-provider"]);
    expect(result.summary).toEqual({ pass: 3, fail: 0, absent: 0, unproven: 0 });
    expect(result.results.every((r) => r.evidence === "exit code: 0")).toBe(true);
    expect(isRunSuccessful(result)).toBe(true);
  });

  it("keeps FAIL distinct from ABSENT", async () => {
    const manifest = parseVerificationManifest(manifestJson());
    const result = await runVerification(manifest, async (criterion) => {
      if (criterion.id === "ladder-green") {
        return { outcome: "FAIL", details: "vitest exited 1: 2 tests failed" };
      }
      return { outcome: "ABSENT", missingComponent: "some tool", details: "not built yet" };
    });

    expect(result.summary).toEqual({ pass: 0, fail: 1, absent: 2, unproven: 0 });
    expect(isRunSuccessful(result)).toBe(false);
    // live-provider has no dependency: its ABSENT names the executor's missing component.
    const live = result.results.find((r) => r.criterionId === "live-provider");
    expect(live?.outcome).toBe("ABSENT");
    expect(live?.missingComponent).toBe("some tool");
    // downstream is gated: its ABSENT names the failed dependency instead.
    const downstream = result.results.find((r) => r.criterionId === "downstream");
    expect(downstream?.missingComponent).toContain('"ladder-green"');
  });

  it("rejects an evidence-less PASS as UNPROVEN", async () => {
    const manifest = parseVerificationManifest(manifestJson());
    const result = await runVerification(manifest, async () => ({
      outcome: "PASS",
      evidence: "   ",
    }));

    expect(result.summary).toEqual({ pass: 0, fail: 0, absent: 1, unproven: 2 });
    expect(result.results[0].details).toContain("self-observed evidence");
    expect(isRunSuccessful(result)).toBe(false);
  });

  it("skips a dependent criterion as ABSENT when its dependency does not pass", async () => {
    const manifest = parseVerificationManifest(manifestJson());
    const executed: string[] = [];
    const result = await runVerification(manifest, async (criterion) => {
      executed.push(criterion.id);
      return criterion.id === "ladder-green"
        ? { outcome: "FAIL", details: "vitest exited 1" }
        : passingExecutor();
    });

    expect(executed).toEqual(["ladder-green", "live-provider"]);
    const downstream = result.results.find((r) => r.criterionId === "downstream");
    expect(downstream?.outcome).toBe("ABSENT");
    expect(downstream?.missingComponent).toContain('"ladder-green"');
  });
});

describe("renderVerificationReport", () => {
  it("renders a durable per-criterion report with evidence and missing components", async () => {
    const manifest = parseVerificationManifest(manifestJson());
    const result = await runVerification(manifest, async (criterion) => {
      if (criterion.id === "live-provider") {
        return {
          outcome: "ABSENT",
          missingComponent: 'prerequisite "OPENAI_API_KEY" (env var not set)',
          details: "Criterion not run: prerequisite not configured.",
        };
      }
      if (criterion.id === "downstream") {
        return { outcome: "FAIL", details: "node exited 1: assertion failed" };
      }
      return { outcome: "PASS", evidence: "$ npx vitest run\nexit code: 0\n3 passed" };
    });

    const report = renderVerificationReport(result);
    expect(report).toContain("# Feature verification: smoke");
    expect(report).toContain("Verdict:** NOT READY");
    expect(report).toContain("| ladder-green");
    expect(report).toContain("| PASS |");
    expect(report).toContain("| FAIL |");
    expect(report).toContain("missing: prerequisite \"OPENAI_API_KEY\"");
    expect(report).toContain("```\n$ npx vitest run\nexit code: 0\n3 passed\n```");
  });

  it("renders READY for a run whose only non-pass is an explicit ABSENT", async () => {
    const manifest = parseVerificationManifest(manifestJson());
    const result = await runVerification(manifest, async (criterion) =>
      criterion.tier === "live-receipt"
        ? {
            outcome: "ABSENT",
            missingComponent: 'prerequisite "OPENAI_API_KEY" (env var not set)',
            details: "Criterion not run: prerequisite not configured.",
          }
        : passingExecutor(),
    );

    expect(isRunSuccessful(result)).toBe(true);
    expect(renderVerificationReport(result)).toContain("Verdict:** READY (offline tier)");
  });
});

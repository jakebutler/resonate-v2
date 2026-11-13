// @vitest-environment node

import { describe, expect, it } from "vitest";

import { buildProvisioningPlan, formatProvisioningFailure, parseProvisioningArgs, upsertEnvFileEntries } from "../provision-visual-environment.mjs";

const validArgs = ["--url", "https://some-deployment.convex.cloud", "--brand", "corvo", "--budget-limit-micros", "5000000"];
const applyArgs = [...validArgs, "--apply", "--source-directory", "/tmp/approved-images"];

describe("provision-visual-environment argument parsing", () => {
  it("parses a full apply invocation with brand, budget limit, destination and seed source", () => {
    expect(parseProvisioningArgs(applyArgs, "jwt-token")).toEqual({
      apply: true,
      url: "https://some-deployment.convex.cloud",
      brandId: "corvo",
      budgetLimitMicros: 5_000_000,
      skipSeedImport: false,
      sourceDirectory: "/tmp/approved-images",
    });
  });

  it("defaults to a dry run without --apply", () => {
    expect(parseProvisioningArgs(validArgs)).toMatchObject({ apply: false });
  });

  it("rejects a missing or unknown brand with the named brand error", () => {
    for (const argv of [[], ["--brand", "acme", ...validArgs.slice(2)]]) {
      expect(() => parseProvisioningArgs(argv)).toThrow("--brand");
    }
  });

  it.each([["-1"], ["0.5"], ["abc"], ["1e999"]])("rejects budget limit %s with the named budget error", raw => {
    expect(() => parseProvisioningArgs(["--budget-limit-micros", raw, ...validArgs.slice(2)])).toThrow("--budget-limit-micros");
  });

  it("rejects a missing or malformed destination with the named destination error", () => {
    for (const argv of [["--brand", "corvo", "--budget-limit-micros", "1"], [...validArgs.slice(2), "--url", "https://evil.test/path?x=1"]]) {
      expect(() => parseProvisioningArgs(argv)).toThrow("Import destination must be a canonical HTTPS Convex cloud/site origin");
    }
  });

  it("rejects --apply without an application JWT and without a seed source directory", () => {
    expect(() => parseProvisioningArgs(applyArgs, "")).toThrow("RESONATE_VISUAL_IMPORT_TOKEN");
    expect(() => parseProvisioningArgs([...validArgs, "--apply"], "jwt-token")).toThrow("--source-directory");
    expect(parseProvisioningArgs([...validArgs, "--apply", "--skip-seed-import"], "jwt-token")).toMatchObject({ skipSeedImport: true });
  });
});

describe("provision-visual-environment plan building", () => {
  it("plans budget seeding, both rollout flags and seed import in order", () => {
    const plan = buildProvisioningPlan(parseProvisioningArgs(applyArgs, "jwt-token"));
    expect(plan.map(step => step.id)).toEqual(["budget", "server-flag", "frontend-flag", "seed-import"]);
    expect(plan.find(step => step.id === "budget")?.description).toContain("visualWorkflow:setMonthlyBudget");
    expect(plan.find(step => step.id === "server-flag")?.command).toBe("npx convex env set EDITORIAL_VISUALS_ENABLED 1 --url=https://some-deployment.convex.cloud");
    expect(plan.find(step => step.id === "frontend-flag")?.description).toContain("NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED=1");
    expect(plan.find(step => step.id === "seed-import")?.command).toContain("--source-directory=/tmp/approved-images");
  });

  it("drops the seed-import step when --skip-seed-import is set", () => {
    const plan = buildProvisioningPlan(parseProvisioningArgs([...validArgs, "--apply", "--skip-seed-import"], "jwt-token"));
    expect(plan.map(step => step.id)).toEqual(["budget", "server-flag", "frontend-flag"]);
  });
});

describe("upsertEnvFileEntries", () => {
  it("appends a missing flag while preserving every other line", () => {
    const updated = upsertEnvFileEntries("CORTEX_API_KEY=\nPIONEER_API_KEY=\n", { NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED: "1" });
    expect(updated).toBe("CORTEX_API_KEY=\nPIONEER_API_KEY=\nNEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED=1\n");
  });

  it("replaces an existing disabled flag value in place", () => {
    const updated = upsertEnvFileEntries("NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED=0\nBUFFER_API_KEY=\n", { NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED: "1" });
    expect(updated).toBe("NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED=1\nBUFFER_API_KEY=\n");
  });

  it("collapses duplicated flag lines to a single assignment", () => {
    const updated = upsertEnvFileEntries("NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED=0\nCORTEX_API_KEY=\nNEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED=0\n", { NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED: "1" });
    expect(updated).toBe("NEXT_PUBLIC_EDITORIAL_VISUALS_ENABLED=1\nCORTEX_API_KEY=\n");
  });
});

describe("formatProvisioningFailure", () => {
  it("echoes a named message with its stage and falls back to the generic message for untrusted errors", () => {
    expect(formatProvisioningFailure(new Error("Budget limit must be a nonnegative integer number of USD micros (--budget-limit-micros)"), "argument preparation")).toContain("during argument preparation");
    expect(formatProvisioningFailure(new Error("getaddrinfo ENOTFOUND secret-host.internal"), "budget seeding")).toContain("The operation failed or did not return a confirmed result.");
    expect(formatProvisioningFailure(new Error("x"), "not-a-stage")).toContain("during argument preparation");
  });
});

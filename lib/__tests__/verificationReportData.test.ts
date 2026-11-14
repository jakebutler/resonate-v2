import { describe, it, expect } from "vitest";
import { parseVerificationManifest } from "../verificationManifest";
import { runVerification, type CriterionExecutor } from "../verificationRunner";
import {
  buildVerificationReportData,
  buyerSummaryForFeature,
  featureStatusFromSummary,
  formatVerificationDate,
  loadVerificationReportData,
  type VerificationFileSystem,
} from "../verificationReportData";
import { aeoSeoFeatureReport } from "../verificationAeoLiveProof";
import campaignsManifestJson from "../../verification/campaigns.manifest.json";
import smokeManifestJson from "../../verification/smoke.manifest.json";

/**
 * Fixtures are the repo's real manifests, and runs come from the real runner
 * core with a stub executor — so the tests exercise actual manifest/runner
 * output shapes, not hand-written lookalikes.
 */
const campaignsManifest = parseVerificationManifest(campaignsManifestJson);
const smokeManifest = parseVerificationManifest(smokeManifestJson);

const allPass: CriterionExecutor = async (criterion) =>
  criterion.runner === "contract"
    ? { outcome: "PASS", evidence: "$ node --version\nexit code: 0\nv22.x" }
    : { outcome: "PASS", evidence: "$ npx vitest run\nexit code: 0\nTests 3 passed (3)" };

function executorWithFailures(failingIds: Set<string>): CriterionExecutor {
  return async (criterion) => {
    if (failingIds.has(criterion.id)) return { outcome: "FAIL", details: "suite exited 1" };
    return allPass(criterion);
  };
}

/** Builds a real VerificationRunResult-shaped run file, as verify-feature.ts writes it. */
async function runFileFor(
  manifest: typeof campaignsManifest,
  execute: CriterionExecutor = allPass,
): Promise<string> {
  const run = await runVerification(manifest, execute);
  return JSON.stringify({ run, reportPath: `docs/verification/${manifest.featureId}/2026-11-13.md` });
}

function fileSystemWith(files: Record<string, string>): VerificationFileSystem {
  return {
    async listManifestFeatureIds() {
      return Object.keys(files)
        .filter((path) => path.startsWith("verification/") && path.endsWith(".manifest.json"))
        .map((path) => path.replace("verification/", "").replace(".manifest.json", ""));
    },
    async readTextFile(relativePath: string) {
      return files[relativePath] ?? null;
    },
  };
}

describe("loadVerificationReportData", () => {
  it("loads real manifests with their latest runs and builds the report", async () => {
    const data = await loadVerificationReportData(
      fileSystemWith({
        "verification/campaigns.manifest.json": JSON.stringify(campaignsManifestJson),
        "verification/smoke.manifest.json": JSON.stringify(smokeManifestJson),
        "docs/verification/campaigns/latest.json": await runFileFor(campaignsManifest),
        "docs/verification/smoke/latest.json": await runFileFor(smokeManifest),
      }),
    );

    expect(data.loadErrors).toEqual([]);
    const campaigns = data.features.find((feature) => feature.featureId === "campaigns");
    const smoke = data.features.find((feature) => feature.featureId === "smoke");

    expect(campaigns?.status).toBe("verified");
    expect(campaigns?.summary).toEqual({ pass: 6, fail: 0, absent: 0, unproven: 0 });
    expect(campaigns?.results).toHaveLength(6);
    expect(campaigns?.reportPath).toBe("docs/verification/campaigns/2026-11-13.md");
    expect(smoke?.results).toHaveLength(3);
  });

  it("includes the curated AEO/SEO live-proof entry with receipts", async () => {
    const data = await loadVerificationReportData(fileSystemWith({}));
    const aeo = data.features.find((feature) => feature.featureId === "aeo-seo");

    expect(aeo).toEqual(aeoSeoFeatureReport());
    expect(aeo?.receipts.some((receipt) => receipt.runId === "ms73vpw9sgj9w061qz8h2f04558j6rhd"))
      .toBe(true);
    expect(aeo?.receipts.some((receipt) => receipt.spendCents != null)).toBe(true);
  });

  it("reports a feature as unverified — without a load error — when no run is on file", async () => {
    const data = await loadVerificationReportData(
      fileSystemWith({
        "verification/campaigns.manifest.json": JSON.stringify(campaignsManifestJson),
      }),
    );

    const campaigns = data.features.find((feature) => feature.featureId === "campaigns");
    expect(campaigns?.status).toBe("unverified");
    expect(campaigns?.results).toEqual([]);
    expect(data.loadErrors).toEqual([]);
  });

  it("captures a corrupt latest.json as a load error instead of throwing", async () => {
    const data = await loadVerificationReportData(
      fileSystemWith({
        "verification/campaigns.manifest.json": JSON.stringify(campaignsManifestJson),
        "docs/verification/campaigns/latest.json": "{ not json",
      }),
    );

    expect(data.loadErrors).toHaveLength(1);
    expect(data.loadErrors[0].path).toBe("docs/verification/campaigns/latest.json");
    const campaigns = data.features.find((feature) => feature.featureId === "campaigns");
    expect(campaigns?.status).toBe("unverified");
  });

  it("rejects a run file whose outcome vocabulary is outside the runner's", async () => {
    const data = await loadVerificationReportData(
      fileSystemWith({
        "verification/smoke.manifest.json": JSON.stringify(smokeManifestJson),
        "docs/verification/smoke/latest.json": JSON.stringify({
          run: {
            featureId: "smoke",
            startedAt: "2026-11-13T20:50:46.348Z",
            finishedAt: "2026-11-13T20:51:02.319Z",
            results: [
              {
                criterionId: "x",
                name: "x",
                runner: "vitest",
                tier: "offline-fixture",
                outcome: "MAYBE",
                evidence: "",
                details: "",
              },
            ],
            summary: { pass: 0, fail: 0, absent: 0, unproven: 0 },
          },
          reportPath: "docs/verification/smoke/2026-11-13.md",
        }),
      }),
    );

    expect(data.loadErrors[0].path).toBe("docs/verification/smoke/latest.json");
  });

  it("captures an unreadable manifest directory as a load error and renders the empty report", async () => {
    const data = await loadVerificationReportData({
      listManifestFeatureIds: () => Promise.reject(new Error("ENOENT: verification")),
      readTextFile: () => Promise.resolve(null),
    });

    expect(data.features).toEqual([]);
    expect(data.loadErrors).toHaveLength(1);
    expect(data.loadErrors[0].path).toBe("verification/");
  });
});

describe("buildVerificationReportData", () => {
  it("sorts features so features with issues surface first", async () => {
    const data = buildVerificationReportData({
      manifests: [campaignsManifest, smokeManifest],
      runsByFeatureId: {
        campaigns: await runVerification(campaignsManifest, executorWithFailures(new Set(["campaign-data-layer"]))),
        smoke: null,
      },
      loadErrors: [],
      curatedFeatures: [aeoSeoFeatureReport()],
    });

    expect(data.features.map((feature) => feature.featureId)).toEqual([
      "campaigns",
      "smoke",
      "aeo-seo",
    ]);
    expect(data.features[0].status).toBe("issues");
    expect(data.features[1].status).toBe("unverified");
    expect(data.features[2].status).toBe("verified");
  });
});

describe("featureStatusFromSummary", () => {
  it("treats an explicit ABSENT as tolerated, FAIL and UNPROVEN as issues", () => {
    expect(featureStatusFromSummary({ pass: 5, fail: 0, absent: 1, unproven: 0 })).toBe("verified");
    expect(featureStatusFromSummary({ pass: 5, fail: 1, absent: 0, unproven: 0 })).toBe("issues");
    expect(featureStatusFromSummary({ pass: 5, fail: 0, absent: 0, unproven: 1 })).toBe("issues");
    expect(featureStatusFromSummary(undefined)).toBe("unverified");
  });
});

describe("buyerSummaryForFeature", () => {
  it("has buyer-facing copy for every committed manifest feature and a safe fallback", () => {
    const fallback = buyerSummaryForFeature("unknown-feature");
    for (const featureId of ["campaigns", "image-generation", "smoke"]) {
      expect(buyerSummaryForFeature(featureId)).not.toBe(fallback);
      expect(buyerSummaryForFeature(featureId)).toMatch(/\./);
    }
    // The curated AEO/SEO copy lives with its source data, not in this map.
    expect(aeoSeoFeatureReport().buyerSummary).not.toBe(fallback);
    expect(buyerSummaryForFeature("something-new")).toBe(
      "Automated checks ran against this feature and every result is shown below, including what could not be proven. Read the evidence for yourself before trusting the status.",
    );
  });
});

describe("formatVerificationDate", () => {
  it("formats UTC dates and tolerates missing or invalid input", () => {
    expect(formatVerificationDate("2026-11-13T20:51:02.319Z")).toBe("2026-11-13");
    expect(formatVerificationDate(undefined)).toBeNull();
    expect(formatVerificationDate("not a date")).toBeNull();
  });
});

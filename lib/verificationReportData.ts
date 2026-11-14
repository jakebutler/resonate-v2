import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  VERIFICATION_RUNNER_TYPES,
  VERIFICATION_TIERS,
  parseVerificationManifest,
  type VerificationManifest,
} from "./verificationManifest";
import type {
  CriterionOutcome,
  CriterionResult,
  VerificationRunResult,
} from "./verificationRunner";
import { aeoSeoFeatureReport } from "./verificationAeoLiveProof";

/**
 * Typed ingestion for the buyer-facing /verification report.
 *
 * The runner's structured output (`VerificationRunResult`) only reached the
 * repo as rendered markdown, so `scripts/verify-feature.ts` now also writes a
 * JSON sidecar per run (`docs/verification/<featureId>/latest.json`). This
 * module validates those files, merges them with the committed manifests, and
 * adds the curated, plain-language copy each feature needs to read as evidence
 * for a marketing buyer rather than an engineer.
 */

/** Mirrors the runner's on-disk JSON sidecar shape (run + report pointer). */
const CRITERION_OUTCOMES = ["PASS", "FAIL", "ABSENT", "UNPROVEN"] as const satisfies readonly CriterionOutcome[];

const criterionResultSchema = z.object({
  criterionId: z.string().min(1),
  name: z.string().min(1),
  runner: z.enum(VERIFICATION_RUNNER_TYPES),
  tier: z.enum(VERIFICATION_TIERS),
  outcome: z.enum(CRITERION_OUTCOMES),
  evidence: z.string(),
  missingComponent: z.string().optional(),
  details: z.string(),
});

const verificationRunFileSchema = z.object({
  run: z.object({
    featureId: z.string().min(1),
    startedAt: z.string().min(1),
    finishedAt: z.string().min(1),
    results: z.array(criterionResultSchema).min(1),
    summary: z.object({
      pass: z.number().int().nonnegative(),
      fail: z.number().int().nonnegative(),
      absent: z.number().int().nonnegative(),
      unproven: z.number().int().nonnegative(),
    }),
  }),
  reportPath: z.string().min(1),
});

export type VerificationRunFile = z.infer<typeof verificationRunFileSchema>;
// Compile-time guarantee that the on-disk schema keeps the runner's shape: the
// loader assigns each parsed file's `run` into a `VerificationRunResult` slot,
// so a schema drift fails `tsc` there.

export type VerificationLoadError = {
  path: string;
  error: string;
};

/** Outcome rollup a feature is judged by: a run is ready only with zero FAIL and zero UNPROVEN. */
export type VerificationFeatureStatus = "verified" | "issues" | "unverified";

export type VerificationReceipt = {
  label: string;
  /** Provider or engine run identifier, when the source recorded one. */
  runId?: string;
  /** Estimated spend in cents against the declared budget, when recorded. */
  spendCents?: number;
  /** Declared budget ceiling in cents, when recorded. */
  ceilingCents?: number;
  status: string;
};

export type VerificationFeatureReport = {
  kind: "manifest" | "curated";
  featureId: string;
  name: string;
  description?: string;
  /** Plain-language summary written for a marketing buyer, not an engineer. */
  buyerSummary: string;
  status: VerificationFeatureStatus;
  summary?: VerificationRunResult["summary"];
  startedAt?: string;
  finishedAt?: string;
  results: CriterionResult[];
  /** Repo-relative path of the dated markdown report, when one is on file. */
  reportPath?: string;
  receipts: VerificationReceipt[];
  /** Repo-relative doc this entry was transcribed from (curated features). */
  sourceDoc?: string;
};

export type VerificationReportData = {
  features: VerificationFeatureReport[];
  loadErrors: VerificationLoadError[];
};

/** Filesystem edge the loader reads through; tests inject an in-memory copy. */
export type VerificationFileSystem = {
  listManifestFeatureIds(): Promise<string[]>;
  readTextFile(relativePath: string): Promise<string | null>;
};

const nodeFileSystem: VerificationFileSystem = {
  async listManifestFeatureIds() {
    const entries = await readdir(path.join(process.cwd(), "verification"));
    return entries
      .filter((name) => name.endsWith(".manifest.json"))
      .map((name) => name.replace(/\.manifest\.json$/, ""));
  },
  readTextFile(relativePath: string) {
    return readFile(path.join(process.cwd(), relativePath), "utf8").catch(
      (error: unknown) => {
        if (isAbsentFile(error)) return null;
        throw error;
      },
    );
  },
};

function isAbsentFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

export const DEFAULT_BUYER_SUMMARY =
  "Automated checks ran against this feature and every result is shown below, " +
  "including what could not be proven. Read the evidence for yourself before trusting the status.";

/**
 * The "what this proves" line per feature, written for a marketing buyer.
 * Manifest descriptions speak engineer; buyers need outcomes.
 */
const BUYER_SUMMARIES: Record<string, string> = {
  campaigns:
    "You can brief a multi-post campaign once and watch every post move through " +
    "suggestions, review, scheduling and publishing. Automated suites prove the " +
    "campaign engine end to end, and a full browser walkthrough of the campaign " +
    "screens runs on every change. Anything not built yet is shown as an explicit " +
    "gap rather than hidden.",
  "image-generation":
    "You can generate and edit on-brand images inside the editor, place them in " +
    "posts, and export finished articles with figures intact. Automated checks " +
    "cover the workflow, providers, export pipeline and the composer screen " +
    "itself; the live-provider claim only counts when a paid API run with a " +
    "recorded receipt is on file.",
  smoke:
    "The verification system checks itself: the same runner that proves the " +
    "product also proves its own schema and core loop. Every PASS you see on " +
    "this page was produced by machinery that is itself under test.",
};

/** Curated plain-language summary for a manifest feature, with a safe fallback. */
export function buyerSummaryForFeature(featureId: string): string {
  return BUYER_SUMMARIES[featureId] ?? DEFAULT_BUYER_SUMMARY;
}

export function featureStatusFromSummary(
  summary: VerificationRunResult["summary"] | undefined,
): VerificationFeatureStatus {
  if (!summary) return "unverified";
  if (summary.fail > 0 || summary.unproven > 0) return "issues";
  return "verified";
}

export type BuildVerificationReportInput = {
  manifests: VerificationManifest[];
  /** Latest structured run per manifest featureId; null when none is on file. */
  runsByFeatureId: Record<string, VerificationRunResult | null>;
  /** Repo-relative report path per featureId, when a dated report is on file. */
  reportPathsByFeatureId?: Record<string, string | undefined>;
  loadErrors: VerificationLoadError[];
  curatedFeatures: VerificationFeatureReport[];
};

/** Pure core: manifests + runs + curated entries in, render-ready report out. */
export function buildVerificationReportData(
  input: BuildVerificationReportInput,
): VerificationReportData {
  const manifestFeatures: VerificationFeatureReport[] = input.manifests.map(
    (manifest) => {
      const run = input.runsByFeatureId[manifest.featureId] ?? null;
      return {
        kind: "manifest",
        featureId: manifest.featureId,
        name: manifest.name,
        description: manifest.description,
        buyerSummary: buyerSummaryForFeature(manifest.featureId),
        status: featureStatusFromSummary(run?.summary),
        summary: run?.summary,
        startedAt: run?.startedAt,
        finishedAt: run?.finishedAt,
        results: run?.results ?? [],
        reportPath: input.reportPathsByFeatureId?.[manifest.featureId],
        receipts: [],
      };
    },
  );

  const features = [...manifestFeatures, ...input.curatedFeatures].sort(
    (a, b) => statusRank(a.status) - statusRank(b.status),
  );

  return { features, loadErrors: input.loadErrors };
}

function statusRank(status: VerificationFeatureStatus): number {
  switch (status) {
    case "issues":
      return 0;
    case "unverified":
      return 1;
    case "verified":
      return 2;
  }
}

/**
 * Loads every committed manifest plus its latest structured run. Never
 * throws: a missing or malformed file becomes a load error the UI renders
 * honestly instead of a broken page or a silently dropped feature.
 */
export async function loadVerificationReportData(
  fileSystem: VerificationFileSystem = nodeFileSystem,
): Promise<VerificationReportData> {
  const loadErrors: VerificationLoadError[] = [];
  const manifests: VerificationManifest[] = [];
  const runsByFeatureId: Record<string, VerificationRunResult | null> = {};
  const reportPathsByFeatureId: Record<string, string | undefined> = {};

  let featureIds: string[];
  try {
    featureIds = await fileSystem.listManifestFeatureIds();
  } catch (error) {
    return {
      features: [],
      loadErrors: [
        { path: "verification/", error: `Could not list verification manifests: ${describe(error)}` },
      ],
    };
  }

  for (const featureId of featureIds) {
    const manifestPath = `verification/${featureId}.manifest.json`;
    try {
      const raw = await fileSystem.readTextFile(manifestPath);
      if (raw === null) {
        loadErrors.push({ path: manifestPath, error: "Manifest file went missing while reading." });
        continue;
      }
      manifests.push(parseVerificationManifest(JSON.parse(raw)));
      const latestRun = await loadLatestRun(featureId, fileSystem, loadErrors);
      runsByFeatureId[featureId] = latestRun?.run ?? null;
      reportPathsByFeatureId[featureId] = latestRun?.reportPath;
    } catch (error) {
      loadErrors.push({ path: manifestPath, error: describe(error) });
    }
  }

  return buildVerificationReportData({
    manifests,
    runsByFeatureId,
    reportPathsByFeatureId,
    loadErrors,
    curatedFeatures: [aeoSeoFeatureReport()],
  });
}

async function loadLatestRun(
  featureId: string,
  fileSystem: VerificationFileSystem,
  loadErrors: VerificationLoadError[],
): Promise<VerificationRunFile | null> {
  const runPath = `docs/verification/${featureId}/latest.json`;
  try {
    const raw = await fileSystem.readTextFile(runPath);
    if (raw === null) return null;
    return verificationRunFileSchema.parse(JSON.parse(raw));
  } catch (error) {
    loadErrors.push({ path: runPath, error: describe(error) });
    return null;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Formats a run timestamp as a stable UTC date for display and tests. */
export function formatVerificationDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Formats a run timestamp as a stable UTC clock time for display and tests. */
export function formatVerificationTime(iso: string | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(11, 16)} UTC`;
}

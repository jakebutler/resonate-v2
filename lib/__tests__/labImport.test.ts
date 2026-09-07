import { describe, expect, it } from "vitest";
import {
  SecretScanFailure,
  buildLabDocument,
  frontMatterProvenance,
  secretScan,
  summarizeLabBundle,
} from "@/lib/labImport";

describe("secretScan (D-18 hard fail)", () => {
  it("finds common secret patterns with line numbers and redacted previews", () => {
    const text = [
      "# clean line",
      'API_KEY = "sk-live-abcdef12345678"',
      "const token = \"abcdefghijklmnopqrst\"",
      "-----BEGIN RSA PRIVATE KEY-----",
    ].join("\n");
    const findings = secretScan(text);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    expect(findings.some((finding) => finding.kind === "api key assignment" && finding.line === 2)).toBe(true);
    expect(findings.some((finding) => finding.kind === "private key block")).toBe(true);
    for (const finding of findings) {
      expect(finding.preview).toContain("[redacted]");
    }
  });

  it("does not flag ordinary prose", () => {
    const prose =
      "# 2026-05-26 experiment\n\nThe cohesion gate catches repeated framing openers across the draft set. Approval telemetry shows fact-drift as the top review reason.";
    expect(secretScan(prose)).toHaveLength(0);
  });
});

describe("frontMatterProvenance (#64)", () => {
  it("combines the filename date with the type front-matter", () => {
    const text = "---\ntype: hypothesis\n---\n\nA batch of posts derived from one source reads as five strangers.";
    expect(frontMatterProvenance(text, "2026-05-26-cohesion-gate.md")).toBe(
      "2026-05-26 · hypothesis"
    );
  });

  it("falls back to the filename without front-matter", () => {
    expect(frontMatterProvenance("plain text", "notes.txt")).toBe("notes.txt");
  });
});

describe("buildLabDocument", () => {
  it("rejects unsupported formats", () => {
    expect(() => buildLabDocument("board-sync-scratch.ipynb", "{}")).toThrow(
      /Unsupported format/
    );
  });

  it("hard-fails on secret findings without returning content", () => {
    expect(() =>
      buildLabDocument(
        "2026-01-01-leak.md",
        'password = "super-secret-value"'
      )
    ).toThrow(SecretScanFailure);
  });

  it("segments accepted lab entries with front-matter provenance", () => {
    const document = buildLabDocument(
      "2026-05-26-cohesion-gate.md",
      "---\ntype: hypothesis\n---\n\nA batch of posts derived from one source reads as five strangers. A cohesion check that scores the set will catch what per-post review structurally cannot, because it sees the framing across every draft at once and flags the repetition."
    );
    expect(document.kind).toBe("md");
    expect(document.excerpts.length).toBeGreaterThan(0);
    expect(document.excerpts[0]!.provenance).toContain("2026-05-26 · hypothesis");
    expect(document.excerpts.every((excerpt) => !excerpt.unusable)).toBe(true);
  });
});

describe("summarizeLabBundle", () => {
  it("counts documents and usable excerpt candidates", () => {
    const a = buildLabDocument(
      "2026-04-14-eval-harness-v0.md",
      "---\ntype: experiment-result\n---\n\nBaseline prompt roulette regressed 4 of 10 outputs, while per-component gates regressed only 1 of 10 and named every failing case. The harness turns review feedback into documentation that feeds the eval suite over time."
    );
    const b = buildLabDocument("eval-runs.csv", "run,score\n1,0.61");
    const summary = summarizeLabBundle([a, b]);
    expect(summary.documentCount).toBe(2);
    expect(summary.excerptCount).toBeGreaterThanOrEqual(2);
    expect(summary.usableCount).toBeGreaterThan(0);
  });
});

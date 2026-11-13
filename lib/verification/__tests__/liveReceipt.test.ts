import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLiveReceipt,
  liveReceiptFileName,
  writeLiveReceipt,
} from "../liveReceipt";

describe("buildLiveReceipt", () => {
  it("records the qualification vocabulary, command, and budget", () => {
    const markdown = buildLiveReceipt({
      provider: "buffer",
      feature: "live-validation",
      qualification: "live-receipt",
      executedAt: "2026-11-13T20:00:00.000Z",
      command: "npx tsx scripts/buffer-live-validation.mjs",
      checks: [{ name: "Gate approved", passed: true }],
      costUsd: 0.42,
      budgetUsd: 5,
    });

    expect(markdown).toContain("live-receipt");
    expect(markdown).toContain("buffer");
    expect(markdown).toContain("2026-11-13T20:00:00.000Z");
    expect(markdown).toContain("npx tsx scripts/buffer-live-validation.mjs");
    expect(markdown).toContain("$0.42");
    expect(markdown).toContain("$5 budget cap");
    expect(markdown).toContain("[PASS] Gate approved");
  });

  it("reports failed checks and unreported cost explicitly", () => {
    const markdown = buildLiveReceipt({
      provider: "openai",
      feature: "editorial-visuals",
      qualification: "live-receipt",
      executedAt: "2026-11-13T20:00:00.000Z",
      command: "scripts/qualify-visual-routes.mjs",
      checks: [{ name: "Live command exit status", passed: false, details: "exit 1" }],
      costUsd: null,
      budgetUsd: 0.5,
    });

    expect(markdown).toContain("[FAIL] Live command exit status — exit 1");
    expect(markdown).toContain("not reported");
  });

  it("never embeds credential values in the receipt", () => {
    const markdown = buildLiveReceipt({
      provider: "buffer",
      feature: "live-validation",
      qualification: "live-receipt",
      executedAt: "2026-11-13T20:00:00.000Z",
      command: "npx tsx scripts/buffer-live-validation.mjs",
      checks: [{ name: "Gate approved", passed: true }],
    });

    expect(markdown).not.toContain("key-value");
  });
});

describe("liveReceiptFileName", () => {
  it("is dated, slugged, and names the qualification level", () => {
    expect(
      liveReceiptFileName({
        provider: "Buffer",
        feature: "live validation",
        executedAt: "2026-11-13T20:00:00.000Z",
      }),
    ).toBe("2026-11-13-buffer-live-validation-live-receipt.md");
  });
});

describe("writeLiveReceipt", () => {
  it("writes the receipt under the docs dir and returns its path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "live-receipt-"));
    try {
      const target = writeLiveReceipt(dir, {
        provider: "buffer",
        feature: "live-validation",
        qualification: "live-receipt",
        executedAt: "2026-11-13T20:00:00.000Z",
        command: "npx tsx scripts/buffer-live-validation.mjs",
        checks: [{ name: "Gate approved", passed: true }],
      });

      const written = readFileSync(target, "utf8");
      expect(written).toContain("live-receipt");
      expect(target.startsWith(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

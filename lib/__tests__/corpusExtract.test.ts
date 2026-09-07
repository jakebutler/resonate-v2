import { describe, expect, it } from "vitest";
import {
  isUnusableExtract,
  kindForFileName,
  segmentCsv,
  segmentJson,
  segmentMarkdown,
  segmentPdfPages,
  segmentPlainText,
} from "@/lib/corpusExtract";

describe("kindForFileName", () => {
  it("maps extensions to document kinds", () => {
    expect(kindForFileName("paper.PDF")).toBe("pdf");
    expect(kindForFileName("notes.md")).toBe("md");
    expect(kindForFileName("notes.markdown")).toBe("md");
    expect(kindForFileName("readme.txt")).toBe("txt");
    expect(kindForFileName("index.json")).toBe("json");
    expect(kindForFileName("runs.csv")).toBe("csv");
  });

  it("returns null for unsupported formats", () => {
    expect(kindForFileName("scratch.ipynb")).toBeNull();
    expect(kindForFileName("image.png")).toBeNull();
  });
});

describe("isUnusableExtract", () => {
  it("flags mangled numeric tables", () => {
    const table = [
      "34.2 | 35.1 || 61.0 | 12",
      "40.1 | 41.9 || 62.2 | 14",
      "[ARTIFACT] NaN — suc. rate %═",
      "33.0 | 34.8 || 60.1 | 11",
    ].join("\n");
    const verdict = isUnusableExtract(table);
    expect(verdict.unusable).toBe(true);
    expect(verdict.reason).toMatch(/table/i);
  });

  it("accepts normal prose", () => {
    const prose =
      "ReAct outperforms the strongest imitation-learning baseline on HotpotQA, and grounding in retrieved evidence reduces hallucination.";
    expect(isUnusableExtract(prose).unusable).toBe(false);
  });
});

describe("segmentPdfPages", () => {
  it("assigns page-number provenance to every candidate", () => {
    const pages = [
      "Abstract. We explore the use of large language models to generate both reasoning traces and task-specific actions in an interleaved manner, allowing the model to induce, track, and update high-level plans for handling exceptions across diverse tasks.",
      "On HotpotQA, ReAct outperforms the strongest imitation-learning baseline and error analysis shows that grounding in retrieved evidence reduces hallucination relative to reasoning-only chains of thought.",
    ];
    const candidates = segmentPdfPages(pages);
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0].provenance).toBe("p.1");
    expect(candidates[candidates.length - 1].provenance).toBe("p.2");
    expect(candidates.every((candidate) => candidate.text.length > 0)).toBe(
      true
    );
  });

  it("marks mangled table pages unusable while keeping prose usable", () => {
    const pages = [
      "We explore reasoning and acting with large language models in an interleaved manner so the model can update high-level plans.",
      "34.2 | 35.1 || 61.0\n40.1 | 41.9 || 62.2\n[ARTIFACT] NaN\n33.0 | 34.8 || 60.1",
    ];
    const candidates = segmentPdfPages(pages);
    expect(candidates[0].unusable).toBe(false);
    expect(candidates[candidates.length - 1].unusable).toBe(true);
  });
});

describe("segmentMarkdown", () => {
  it("uses headings as provenance", () => {
    const markdown = [
      "## Results",
      "",
      "ReAct improves HotpotQA accuracy over the strongest baseline while remaining fully inspectable at every intermediate step of the trace.",
      "",
      "## Limitations",
      "",
      "Performance depends heavily on the quality of in-context examples chosen for each task family.",
    ].join("\n");
    const candidates = segmentMarkdown(markdown);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].provenance).toBe("Results");
    expect(candidates[1].provenance).toBe("Limitations");
    expect(candidates[0].text).not.toContain("##");
  });
});

describe("segmentPlainText", () => {
  it("splits long text into bounded semantic units and merges short ones", () => {
    const short = ["One line.", "Another short line."].join("\n\n");
    const merged = segmentPlainText(short);
    expect(merged.length).toBeLessThanOrEqual(2);

    const longBody = Array.from(
      { length: 12 },
      (_, i) =>
        `Paragraph ${i} explains one complete thought about reasoning and acting with enough sentences to stand alone as a unit ${i}. It continues with a second sentence that adds context and keeps the paragraph long enough to survive on its own without merging.`
    ).join("\n\n");
    const split = segmentPlainText(longBody);
    expect(split.length).toBeGreaterThan(1);
    expect(
      split.every((candidate) => candidate.text.length <= 900)
    ).toBe(true);
  });
});

describe("segmentJson / segmentCsv", () => {
  it("summarizes structured JSON as a usable candidate", () => {
    const candidates = segmentJson(
      JSON.stringify([{ id: "EXP-014" }, { id: "EXP-015" }]),
      "experiments.json"
    );
    expect(candidates[0].unusable).toBe(false);
    expect(candidates[0].text).toContain("2 entries");
  });

  it("flags invalid JSON as unusable", () => {
    const candidates = segmentJson("{not json", "broken.json");
    expect(candidates[0].unusable).toBe(true);
    expect(candidates[0].unusableReason).toMatch(/invalid JSON/);
  });

  it("summarizes CSV rows against the header", () => {
    const csv = "run,task,score\n1,hotpot,0.61\n2,alfworld,0.71";
    const candidates = segmentCsv(csv, "eval-runs.csv");
    expect(candidates).toHaveLength(1);
    expect(candidates[0].unusable).toBe(false);
    expect(candidates[0].text).toContain("2 data rows");
    expect(candidates[0].text).toContain("run,task,score");
  });
});

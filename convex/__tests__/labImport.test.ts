import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

function createTestHarness() {
  return convexTest(schema, modules);
}

/**
 * importLabBundle is internal-only (C9): the ops route authenticates and
 * invokes it, so tests drive it through the server context directly.
 */
function importBundle(
  t: ReturnType<typeof convexTest>,
  args: { brandId: "corvo" | "lower-db"; files: { name: string; text: string }[] }
) {
  return t.run((ctx) =>
    ctx.runMutation(internal.corpora.importLabBundle, args)
  );
}

const labFiles = [
  {
    name: "2026-04-14-eval-harness-v0.md",
    text: "---\ntype: experiment-result\n---\n\nBaseline prompt roulette regressed 4 of 10 outputs, while per-component gates regressed only 1 of 10 and named every failing case in the harness output for later inspection by reviewers.",
  },
  {
    name: "2026-05-26-cohesion-gate.md",
    text: "---\ntype: hypothesis\n---\n\nA batch of posts derived from one source reads as five strangers, and a cohesion check that scores the set will catch what per-post review structurally cannot catch in isolated drafts.",
  },
  {
    name: "eval-runs.csv",
    text: "run,task,score\n1,hotpot,0.61\n2,alfworld,0.71",
  },
];

describe("lab import (C8)", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("v2Brands", {
        brandId: "lower-db",
        name: "the lower dB",
        description: "Test brand",
        createdAt: now,
        updatedAt: now,
      });
    });
  });

  it("imports a clean lab folder as an immutable corpus version", async () => {
    const result = await importBundle(t, { brandId: "lower-db", files: labFiles });

    expect(result.version).toBe(1);
    expect(result.excerptCount).toBeGreaterThanOrEqual(3);

    const corpora = await t.run(async (ctx) =>
      ctx.db.query("corpora").collect()
    );
    expect(corpora[0]).toMatchObject({
      brandId: "lower-db",
      origin: "cli",
      version: 1,
      status: "active",
    });

    const excerpts = await t.run(async (ctx) =>
      ctx.db.query("corpusExcerpts").collect()
    );
    expect(excerpts.length).toBe(result.excerptCount);
    expect(excerpts.every((excerpt) => excerpt.reviewState === "accepted")).toBe(true);
    expect(
      excerpts.some((excerpt) => excerpt.provenance.includes("hypothesis"))
    ).toBe(true);

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    expect(
      audits.find((event) => event.action === "corpus.lab_import")
    ).toBeDefined();
  });

  it("hard-fails the whole import on a secret finding server-side", async () => {
    await expect(
      importBundle(t, {
        brandId: "lower-db",
        files: [
          ...labFiles,
          {
            name: "2026-01-01-leak.md",
            text: 'API_KEY = "sk-live-abcdef123456"',
          },
        ],
      })
    ).rejects.toThrow(/Secret scan failed/);

    const corpora = await t.run(async (ctx) =>
      ctx.db.query("corpora").collect()
    );
    expect(corpora).toHaveLength(0);
  });

  it("refuses unsupported formats server-side", async () => {
    await expect(
      importBundle(t, {
        brandId: "lower-db",
        files: [{ name: "board-sync-scratch.ipynb", text: "{}" }],
      })
    ).rejects.toThrow(/Unsupported format/);
  });

  it("bumps versions monotonically across imports", async () => {
    const first = await importBundle(t, { brandId: "lower-db", files: labFiles });
    const second = await importBundle(t, { brandId: "lower-db", files: labFiles });
    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
  });
});

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

function createTestHarness() {
  return convexTest(schema, modules);
}

/**
 * seedVerificationWorkspace is internal-only (V5): CI invokes it through
 * `npx convex run` with the deployment's ops secret, so tests drive it through
 * the server context directly — with no identity, which is itself the point
 * under test: no human session is required.
 */
function seed(
  t: ReturnType<typeof convexTest>,
  args: {
    subject: string;
    brandId?: "personal" | "corvo" | "lower-db" | "freshproof";
    budgetLimitMicros?: number;
    dryRun?: boolean;
  }
) {
  return t.run((ctx) =>
    ctx.runMutation(internal.verificationSeed.seedVerificationWorkspace, args)
  );
}

async function countRows(t: ReturnType<typeof convexTest>, table: string): Promise<number> {
  return await t.run(
    async (ctx) => (await ctx.db.query(table as never).collect()).length
  );
}

describe("verification seed (V5)", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(() => {
    vi.stubEnv("ALLOW_VERIFICATION_SEED", "1");
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210");
    t = createTestHarness();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to run when ALLOW_VERIFICATION_SEED is not set", async () => {
    vi.stubEnv("ALLOW_VERIFICATION_SEED", undefined);
    await expect(seed(t, { subject: "user_ci_verification" })).rejects.toThrow(
      /disabled/i
    );
  });

  it("refuses to run when the flag is any value other than 1", async () => {
    vi.stubEnv("ALLOW_VERIFICATION_SEED", "true");
    await expect(seed(t, { subject: "user_ci_verification" })).rejects.toThrow(
      /disabled/i
    );
  });

  it("refuses the production deployment outright", async () => {
    vi.stubEnv(
      "CONVEX_CLOUD_URL",
      "https://healthy-platypus-553.convex.cloud"
    );
    await expect(seed(t, { subject: "user_ci_verification" })).rejects.toThrow(
      /production/i
    );
  });

  it("rejects an empty subject", async () => {
    await expect(seed(t, { subject: "   " })).rejects.toThrow(/subject/i);
  });

  it("runs with no authenticated identity and seeds brands, memberships, corpus, and budget", async () => {
    const summary = await seed(t, { subject: "user_ci_verification" });

    expect(summary.seeded).toBe(true);
    expect(summary.corpusCreated).toBe(true);
    expect(summary.budgetCreated).toBe(true);
    expect(summary.skipped).toBe(0);

    // Four hard-coded brands, channels, and an owner membership per brand.
    expect(await countRows(t, "v2Brands")).toBe(4);
    const memberships = await t.run(async (ctx) =>
      ctx.db
        .query("v2BrandMemberships")
        .withIndex("by_user", (q) => q.eq("userId", "user_ci_verification"))
        .collect()
    );
    expect(memberships).toHaveLength(4);
    expect(memberships.every((m) => m.role === "owner")).toBe(true);

    // Corpus version 1 with one accepted excerpt.
    const corpora = await t.run(async (ctx) =>
      ctx.db.query("corpora").withIndex("by_brand", (q) => q.eq("brandId", "freshproof")).collect()
    );
    expect(corpora).toHaveLength(1);
    expect(corpora[0].version).toBe(1);
    expect(corpora[0].status).toBe("active");
    const excerpts = await t.run(async (ctx) =>
      ctx.db
        .query("corpusExcerpts")
        .withIndex("by_corpus", (q) => q.eq("corpusId", corpora[0]._id))
        .collect()
    );
    expect(excerpts).toHaveLength(1);
    expect(excerpts[0].reviewState).toBe("accepted");

    // Budget row at the default $5 provider cap.
    const budgets = await t.run(async (ctx) =>
      ctx.db
        .query("v2VisualBudgets")
        .withIndex("by_brand", (q) => q.eq("brandId", "freshproof"))
        .collect()
    );
    expect(budgets).toHaveLength(1);
    expect(budgets[0].limitMicros).toBe(5_000_000);

    // Every mutation in the envelope leaves an audit trail.
    const auditEvents = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    expect(auditEvents.some((event) => event.action === "verification.seed")).toBe(true);
    expect(
      auditEvents.some((event) => event.action === "corpus.verification_seed")
    ).toBe(true);
  });

  it("is idempotent: a second run duplicates nothing and reports skips", async () => {
    await seed(t, { subject: "user_ci_verification" });
    const second = await seed(t, { subject: "user_ci_verification" });

    expect(second.corpusCreated).toBe(false);
    expect(second.budgetCreated).toBe(false);
    expect(second.skipped).toBe(2);

    expect(await countRows(t, "corpora")).toBe(1);
    expect(await countRows(t, "v2VisualBudgets")).toBe(1);
    expect(await countRows(t, "v2Brands")).toBe(4);
    expect(await countRows(t, "v2BrandMemberships")).toBe(4);
  });

  it("keys idempotency through v2MigrationRecords scoped to the subject", async () => {
    await seed(t, { subject: "user_ci_verification" });
    const records = await t.run(async (ctx) =>
      ctx.db
        .query("v2MigrationRecords")
        .withIndex("by_legacy", (q) =>
          q.eq("legacyTable", "verificationSeed").eq("legacyId", "verificationSeed:corpus:freshproof")
        )
        .collect()
    );
    expect(records).toHaveLength(1);
    expect(records[0].userId).toBe("user_ci_verification");

    // A different subject gets its own seed set — the key is per-user, like previewSeed.
    const other = await seed(t, { subject: "user_other_ci" });
    expect(other.corpusCreated).toBe(true);
    expect(other.budgetCreated).toBe(false); // budget exists per brand, not per subject
    expect(other.skipped).toBe(1);
  });

  it("never clobbers an operator-set budget row", async () => {
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("v2VisualBudgets", {
        brandId: "freshproof",
        limitMicros: 1_000_000,
        updatedBy: "user_operator",
        updatedAt: now,
      });
    });

    const summary = await seed(t, { subject: "user_ci_verification" });

    expect(summary.budgetCreated).toBe(false);
    const budgets = await t.run(async (ctx) =>
      ctx.db
        .query("v2VisualBudgets")
        .withIndex("by_brand", (q) => q.eq("brandId", "freshproof"))
        .collect()
    );
    expect(budgets).toHaveLength(1);
    expect(budgets[0].limitMicros).toBe(1_000_000);
    expect(budgets[0].updatedBy).toBe("user_operator");
  });

  it("dryRun writes nothing", async () => {
    const summary = await seed(t, { subject: "user_ci_verification", dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.corpusCreated).toBe(true);
    expect(summary.budgetCreated).toBe(true);
    expect(await countRows(t, "v2Brands")).toBe(0);
    expect(await countRows(t, "corpora")).toBe(0);
    expect(await countRows(t, "v2VisualBudgets")).toBe(0);
  });

  it("rejects a negative budget limit", async () => {
    await expect(
      seed(t, { subject: "user_ci_verification", budgetLimitMicros: -1 })
    ).rejects.toThrow(/budgetLimitMicros/i);
  });
});

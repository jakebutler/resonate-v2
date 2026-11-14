import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { audit, brandIdValidator, type BrandId } from "./campaignAccess";
import { seedBrandsAndChannels } from "./publishing";

/**
 * CI verification seed (V5). Bootstraps the rows a feature-verification run
 * needs on a *dev* deployment — brands, channels, memberships, one corpus
 * version, and the visual-provider budget row — with no human identity.
 *
 * It follows the repo's ops-secret pattern (see /api/ops/lab-import): the
 * mutation is internal-only, so it is unreachable from the internet except
 * through a caller holding the deployment's ops secret (CI holds
 * CONVEX_DEPLOY_KEY; `npx convex run` authenticates with it). Identity is a
 * synthetic subject string, mirroring importLabBundle's "cli:lab-import".
 *
 * Gates, fail-closed in order:
 *  1. ALLOW_VERIFICATION_SEED=1 must be set on the deployment (the sibling of
 *     ALLOW_PREVIEW_SEED — set on dev deployments only).
 *  2. The production deployment is refused outright, same as seedPreviewWorkspace.
 *
 * Idempotency: rows that would duplicate on a re-run (corpus versions, budget)
 * are keyed through v2MigrationRecords with legacyTable "verificationSeed".
 * Brand/channel/membership rows are existence-checked per call, exactly like
 * seedMvpWorkspace.
 */

const PROD_DEPLOYMENT_HOST = "healthy-platypus-553";
const DEFAULT_BUDGET_LIMIT_MICROS = 5_000_000; // $5 — matches the existing provider caps.
const DEFAULT_BRAND: BrandId = "freshproof"; // AEO/SEO pilot brand.

/**
 * Deterministic fixture plan for verification runs and demos: the /aeo/plan
 * screen renders the latest strategyPlans row for the seeded subject's brand,
 * so the seed produces a generated draft plan with no claim content. Fields
 * mirror aeoPlanValidator; sourceFindingIds stay empty because the seed
 * creates no intelFindings rows.
 */
function verificationStrategyPlan() {
  return {
    gaps: [
      {
        title: "No comparison content in answer engines",
        description:
          "Verification seed fixture: answer engines surface no comparison pages for the brand's category questions.",
        priority: 1,
        sourceFindingIds: [],
      },
    ],
    opportunities: [
      {
        title: "Third-party evidence question set",
        description:
          "Verification seed fixture: evidence-backed pages could answer the brand's target questions with citable sources.",
        priority: 1,
        sourceFindingIds: [],
      },
    ],
    targetKeywords: ["verification seed fixture"],
    targetQuestions: ["What does the verification seed fixture cover?"],
    brief: {
      goal: "Verification seed fixture: grow AEO citation share for the pilot brand.",
      audience: "Fixture audience for verification runs and demos",
      thesis: "Fixture thesis — deterministic seed data, no claim content",
      window: "verification",
      channels: ["blog"],
      cta: "Join the waitlist",
      metric: "Citation share in answer engines",
      constraints: ["Fixture data only — no unverifiable claims"],
    },
  };
}

async function verificationSeedRecordExists(
  ctx: MutationCtx,
  subject: string,
  legacyId: string
) {
  const records = await ctx.db
    .query("v2MigrationRecords")
    .withIndex("by_legacy", (q) =>
      q.eq("legacyTable", "verificationSeed").eq("legacyId", legacyId)
    )
    .collect();
  return records.some((record) => record.userId === subject);
}

async function recordVerificationSeed(
  ctx: MutationCtx,
  subject: string,
  legacyId: string,
  targetTable: string,
  targetId: string,
  now: number
) {
  await ctx.db.insert("v2MigrationRecords", {
    userId: subject,
    legacyTable: "verificationSeed",
    legacyId,
    targetTable,
    targetId,
    createdAt: now,
  });
}

export const seedVerificationWorkspace = internalMutation({
  args: {
    /** Synthetic owner for every seeded row; no Clerk identity is required. */
    subject: v.string(),
    brandId: v.optional(brandIdValidator),
    budgetLimitMicros: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (process.env.ALLOW_VERIFICATION_SEED !== "1") {
      throw new Error(
        "seedVerificationWorkspace is disabled. Set ALLOW_VERIFICATION_SEED=1 on the Convex *dev* deployment only."
      );
    }
    const cloudUrl = process.env.CONVEX_CLOUD_URL ?? "";
    if (cloudUrl.includes(PROD_DEPLOYMENT_HOST)) {
      throw new Error(
        "seedVerificationWorkspace cannot run against the production Convex deployment."
      );
    }
    const subject = args.subject.trim();
    if (!subject || subject.length > 120) {
      throw new Error("subject must be a nonempty identifier (max 120 chars).");
    }
    const brandId = args.brandId ?? DEFAULT_BRAND;
    const budgetLimitMicros = args.budgetLimitMicros ?? DEFAULT_BUDGET_LIMIT_MICROS;
    if (!Number.isSafeInteger(budgetLimitMicros) || budgetLimitMicros < 0) {
      throw new Error("budgetLimitMicros must be a nonnegative integer (USD micros).");
    }
    const now = Date.now();
    const dryRun = args.dryRun ?? false;

    const summary = {
      seeded: true,
      dryRun,
      subject,
      brandId,
      corpusCreated: false,
      budgetCreated: false,
      strategyPlanCreated: false,
      skipped: 0,
    };

    // Brands, channels, and an owner membership for the subject. Existence-
    // checked per row, so a re-run is a no-op here.
    if (!dryRun) {
      await seedBrandsAndChannels(ctx, subject, now);
    }

    // One immutable corpus version for the target brand. A re-run without the
    // migration-record guard would create version N+1, so this is the row the
    // v2MigrationRecords idempotency key exists for.
    const corpusKey = `verificationSeed:corpus:${brandId}`;
    if (await verificationSeedRecordExists(ctx, subject, corpusKey)) {
      summary.skipped += 1;
    } else if (dryRun) {
      summary.corpusCreated = true;
    } else {
      const latest = await ctx.db
        .query("corpora")
        .withIndex("by_brand_and_version", (q) => q.eq("brandId", brandId))
        .order("desc")
        .first();
      const version = (latest?.version ?? 0) + 1;
      const corpusId = await ctx.db.insert("corpora", {
        brandId,
        origin: "cli",
        version,
        status: "active",
        createdAt: now,
      });
      const documentId = await ctx.db.insert("corpusDocuments", {
        corpusId,
        name: "verification-seed.md",
        kind: "md",
        meta: { source: "ci", purpose: "feature-verification seed data" },
      });
      await ctx.db.insert("corpusExcerpts", {
        corpusId,
        documentId,
        seq: 1,
        text: "Verification seed excerpt: deterministic fixture text for CI runs. It carries no claim content and exists only so corpus-dependent criteria have an accepted excerpt to read.",
        provenance: "scripts/seed-verification.mjs",
        sensitivity: "public-safe",
        reviewState: "accepted",
      });
      await recordVerificationSeed(
        ctx,
        subject,
        corpusKey,
        "corpora",
        String(corpusId),
        now
      );
      await audit(ctx, {
        userId: subject,
        brandId,
        action: "corpus.verification_seed",
        summary: `Seeded corpus v${version} for feature verification.`,
        metadata: { corpusId: String(corpusId), version, origin: "cli" },
      });
      summary.corpusCreated = true;
    }

    // Brand budget row: reserveAttempt throws "Reservation budget is missing"
    // without it. Upsert-idempotent, keyed like the corpus.
    const budgetKey = `verificationSeed:budget:${brandId}`;
    if (await verificationSeedRecordExists(ctx, subject, budgetKey)) {
      summary.skipped += 1;
    } else if (dryRun) {
      summary.budgetCreated = true;
    } else {
      const existing = await ctx.db
        .query("v2VisualBudgets")
        .withIndex("by_brand", (q) => q.eq("brandId", brandId))
        .unique();
      if (existing) {
        // Another operator set a budget already; never clobber it.
        summary.skipped += 1;
      } else {
        const budgetId = await ctx.db.insert("v2VisualBudgets", {
          brandId,
          limitMicros: budgetLimitMicros,
          updatedBy: subject,
          updatedAt: now,
        });
        await recordVerificationSeed(
          ctx,
          subject,
          budgetKey,
          "v2VisualBudgets",
          String(budgetId),
          now
        );
        summary.budgetCreated = true;
      }
    }

    // A generated strategy plan for the seeded brand: the /aeo/plan screen
    // reads the latest strategyPlans row for the subject's brand, so without
    // this the plan step renders empty in verification runs and demos.
    // Keyed through the same idempotency record as corpus and budget.
    const planKey = `verificationSeed:strategyPlan:${brandId}`;
    if (await verificationSeedRecordExists(ctx, subject, planKey)) {
      summary.skipped += 1;
    } else if (dryRun) {
      summary.strategyPlanCreated = true;
    } else {
      const latestPlan = await ctx.db
        .query("strategyPlans")
        .withIndex("by_user_and_brand", (q) =>
          q.eq("userId", subject).eq("brandId", brandId)
        )
        .order("desc")
        .first();
      const version = (latestPlan?.version ?? 0) + 1;
      const planId = await ctx.db.insert("strategyPlans", {
        userId: subject,
        brandId,
        version,
        status: "draft",
        plan: verificationStrategyPlan(),
        createdAt: now,
      });
      await recordVerificationSeed(ctx, subject, planKey, "strategyPlans", String(planId), now);
      summary.strategyPlanCreated = true;
    }

    if (!dryRun) {
      await audit(ctx, {
        userId: subject,
        brandId,
        action: "verification.seed",
        summary: `Verification seed completed for ${subject} (corpus: ${summary.corpusCreated ? "created" : "present"}, budget: ${summary.budgetCreated ? "created" : "present"}, strategy plan: ${summary.strategyPlanCreated ? "created" : "present"}).`,
      });
    }

    return summary;
  },
});

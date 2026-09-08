import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import schema from "../schema";

const modules = import.meta.glob("../**/*.ts");

const JAKE = { subject: "user-jake", name: "Jake" };
const OTHER = { subject: "user-other", name: "Other User" };

function createTestHarness() {
  return convexTest(schema, modules);
}

async function seedBrand(t: ReturnType<typeof convexTest>) {
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("v2Brands", {
      brandId: "corvo",
      name: "Corvo Labs",
      description: "Test brand",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2BrandMemberships", {
      userId: JAKE.subject,
      brandId: "corvo",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2BrandMemberships", {
      userId: OTHER.subject,
      brandId: "lower-db",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function createCorpusWithExcerpt(t: ReturnType<typeof convexTest>) {
  const asUser = t.withIdentity(JAKE);
  const corpus = await asUser.mutation(api.corpora.createCorpusVersion, {
    brandId: "corvo",
    origin: "upload",
    documents: [
      {
        name: "reviewed-source.md",
        kind: "md",
        excerpts: [
          {
            text: "INTERNAL ONLY: the unreleased pricing pivot lands in Q3.",
            provenance: "p.1",
            sensitivity: "internal-only",
          },
        ],
      },
    ],
  });
  const view = await asUser.query(api.corpora.getCorpus, {
    corpusId: corpus.corpusId as never,
  });
  const excerptId = view!.excerpts[0]!._id as never;
  return { asUser, corpusId: corpus.corpusId, excerptId };
}

describe("updateExcerptReview (C7, D-17)", () => {
  let t: ReturnType<typeof convexTest>;

  beforeEach(async () => {
    t = createTestHarness();
    await seedBrand(t);
  });

  it("updates sensitivity and review state, writing an audit event with old → new values", async () => {
    const { asUser, excerptId } = await createCorpusWithExcerpt(t);

    // The D-17-governed flip: internal-only → public-safe makes the excerpt
    // quotable, so it must be auditable.
    const result = await asUser.mutation(api.corpora.updateExcerptReview, {
      excerptId,
      sensitivity: "public-safe",
      reviewState: "accepted",
    });
    expect(result.updated).toBe(true);

    const view = await asUser.query(api.corpora.getCorpus, {
      corpusId: (await asUser.query(api.corpora.listCorpora, { brandId: "corvo" }))[0]!._id,
    });
    expect(view!.excerpts[0]).toMatchObject({
      sensitivity: "public-safe",
      reviewState: "accepted",
    });

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    const event = audits.find(
      (entry) => entry.action === "corpus.excerpt_review"
    );
    expect(event).toBeDefined();
    expect(event!.summary).toContain("internal-only → public-safe");
    expect(event!.metadata).toMatchObject({
      corpusId: expect.any(String),
    });
  });

  it("records a partial update honestly (unchanged field not reported as changed)", async () => {
    const { asUser, excerptId } = await createCorpusWithExcerpt(t);

    await asUser.mutation(api.corpora.updateExcerptReview, {
      excerptId,
      reviewState: "flagged",
    });

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    const event = audits.find(
      (entry) => entry.action === "corpus.excerpt_review"
    )!;
    expect(event.summary).toContain("review state accepted → flagged");
    expect(event.summary).not.toContain("sensitivity internal-only →");
  });

  it("denies a user without membership in the corpus's brand", async () => {
    const { excerptId } = await createCorpusWithExcerpt(t);

    const otherUser = t.withIdentity(OTHER);
    await expect(
      otherUser.mutation(api.corpora.updateExcerptReview, {
        excerptId,
        sensitivity: "public-safe",
      })
    ).rejects.toThrow(/Brand access denied/);

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    expect(
      audits.find((entry) => entry.action === "corpus.excerpt_review")
    ).toBeUndefined();
  });
});

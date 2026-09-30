import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.restoreAllMocks());
async function fixture() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "editor" });
  await user.mutation(api.publishing.seedMvpWorkspace, {});
  const seriesId = await user.mutation(api.series.create, {
    brandId: "corvo",
    title: "Exact 3-post review",
  });
  const ids = [];
  for (const channelId of ["corvo-blog", "linkedin", "linkedin"] as const) {
    ids.push(
      (
        await user.mutation(api.publishing.createPostWithIntent, {
          brandId: "corvo",
          channelId,
          title: `Final ${ids.length}`,
          content: `Complete 42% copy ${ids.length}.\nPreserved number 1234 and source https://example.com/evidence`,
          scheduledDate: "2030-10-07",
          scheduledTime: "09:00",
          timezone: "America/Los_Angeles",
        })
      ).postId,
    );
  }
  const [articleId, one, two] = ids;
  await user.mutation(api.series.attach, {
    seriesId,
    key: "one",
    articlePostId: articleId,
    companionPostIds: [one, two],
  });
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(["sanitized receipt fixture"]),
    );
    await ctx.db.patch(articleId, {
      blogExcerpt: "Exact excerpt",
      blogAuthor: "Fixture author",
      blogCategory: "Development",
      blogTags: ["fixture"],
      blogSlug: "exact-article",
      blogPublicationIntent: "draft",
      coverImageAlt: "Fixture still image",
      heroImageStorageId: storageId,
      preparedHero: {
        sourceStorageId: storageId,
        storageId,
        sha256: "fixture-sha",
        width: 1600,
        height: 900,
        byteLength: 25,
        mimeType: "image/webp",
        crop: "centre",
      },
    });
  });
  return { t, user, seriesId, articleId, one, two };
}
async function packet(
  f: Awaited<ReturnType<typeof fixture>>,
  postIds = [f.one, f.two],
) {
  await f.user.mutation(api.seriesReview.select, {
    seriesId: f.seriesId,
    postIds,
    expectedRevision: 0,
  });
  const id = await f.user.mutation(api.seriesReview.prepare, {
    seriesId: f.seriesId,
    expectedRevision: 1,
  });
  return id;
}
describe("selected immutable editorial approval", () => {
  it("stores full review and exactly two selected receipts while keeping the article untouched and held companions unsubmitted", async () => {
    const f = await fixture();
    const original = await f.t.run((ctx) => ctx.db.get(f.articleId));
    const fetch = vi.spyOn(globalThis, "fetch");
    const id = await packet(f);
    const review = await f.user.query(api.seriesReview.packet, {
      seriesId: f.seriesId,
    });
    expect(review.rows).toHaveLength(2);
    expect(review.rows[0].snapshot.finalContent).toContain("1234");
    expect(review.rows[0].snapshot.holds.length).toBeGreaterThan(0);
    expect(review.rows[0].snapshot.warnings).toContain(
      "No stored research/citation receipt: independently review factual claims before approving.",
    );
    expect(
      (
        await f.user.mutation(api.seriesReview.approve, {
          packetId: id,
          expectedSelectionRevision: 1,
        })
      ).approved,
    ).toBe(true);
    for (const postId of [f.one, f.two])
      expect((await f.t.run((ctx) => ctx.db.get(postId)))!.approvalState).toBe(
        "approved",
      );
    expect(await f.t.run((ctx) => ctx.db.get(f.articleId))).toEqual(original);
    const rows = await f.t.run((ctx) =>
      ctx.db.query("seriesReviewRows").collect(),
    );
    expect(rows.every((r) => r.actor === "editor" && r.approvedAt)).toBe(true);
    expect(
      await f.t.run((ctx) => ctx.db.query("v2PublishAttempts").collect()),
    ).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
    await f.user.mutation(api.publishing.updateContent, {
      postId: f.one,
      content: "Material corrected 43%",
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.one)))!.approvalState).toBe(
      "unapproved",
    );
    expect((await f.t.run((ctx) => ctx.db.get(f.two)))!.approvalState).toBe(
      "approved",
    );
  });
  it.each([
    "copy",
    "selection",
    "membership",
    "ownership",
    "brand-access",
    "schedule",
  ])("writes zero approvals when %s changes", async (kind) => {
    const f = await fixture();
    const id = await packet(f);
    if (kind === "copy")
      await f.user.mutation(api.publishing.updateContent, {
        postId: f.two,
        content: "Changed",
      });
    if (kind === "selection")
      await f.user.mutation(api.seriesReview.select, {
        seriesId: f.seriesId,
        postIds: [f.one],
        expectedRevision: 1,
      });
    if (kind === "membership")
      await f.user.mutation(api.series.detach, {
        seriesId: f.seriesId,
        entryId: (
          await f.user.query(api.series.entries, {
            seriesId: f.seriesId,
            paginationOpts: { numItems: 10, cursor: null },
          })
        ).page[0]._id,
        postId: f.two,
      });
    if (kind === "ownership")
      await f.t.run((ctx) => ctx.db.patch(f.two, { userId: "other" }));
    if (kind === "brand-access")
      await f.t.run(async (ctx) => {
        const role = await ctx.db
          .query("v2BrandMemberships")
          .withIndex("by_user_and_brand", (q) =>
            q.eq("userId", "editor").eq("brandId", "corvo"),
          )
          .first();
        await ctx.db.delete(role!._id);
      });
    if (kind === "schedule")
      await f.user.mutation(api.publishing.reschedule, {
        postId: f.two,
        scheduledDate: "2030-10-08",
        scheduledTime: "09:00",
        timezone: "America/Los_Angeles",
      });
    if (kind === "brand-access")
      await expect(
        f.user.mutation(api.seriesReview.approve, {
          packetId: id,
          expectedSelectionRevision: 1,
        }),
      ).rejects.toThrow(/access/);
    else {
      const result = await f.user.mutation(api.seriesReview.approve, {
        packetId: id,
        expectedSelectionRevision: 1,
      });
      expect(result.approved).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    }
    for (const p of [f.one, f.two])
      expect((await f.t.run((ctx) => ctx.db.get(p)))!.approvalState).toBe(
        "unapproved",
      );
    expect(
      (
        await f.t.run((ctx) => ctx.db.query("seriesReviewRows").collect())
      ).every((row) => row.actor === undefined && row.approvedAt === undefined),
    ).toBe(true);
  });
  it("shows hero/alt/intent and source warnings, preserves receipts and date-only approvals, and rejects foreign packets/IDs", async () => {
    const f = await fixture();
    await f.t.run((ctx) =>
      ctx.db.patch(f.articleId, {
        sourceResearchBriefId: "unresolved-local-source",
      }),
    );
    const id = await packet(f, [f.articleId, f.one]);
    const view = await f.user.query(api.seriesReview.packet, {
      seriesId: f.seriesId,
    });
    expect(view.rows[0].snapshot.post.coverImageAlt).toBe(
      "Fixture still image",
    );
    expect(view.rows[0].snapshot.post.blogPublicationIntent).toBe("draft");
    expect(view.rows[0].heroUrl).toBeTruthy();
    expect(view.rows[0].snapshot.warnings).toContain(
      "Research brief is unavailable in this authorized workspace; review the original evidence.",
    );
    await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
    });
    await f.user.mutation(api.publishing.reschedule, {
      postId: f.one,
      scheduledDate: "2030-10-08",
      scheduledTime: "10:00",
      timezone: "America/Los_Angeles",
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.one)))!.approvalState).toBe(
      "approved",
    );
    expect(
      (await f.user.query(api.seriesReview.packet, { seriesId: f.seriesId }))
        .stale,
    ).toBe(true);
    const other = f.t.withIdentity({ subject: "other" });
    await expect(
      other.mutation(api.seriesReview.approve, {
        packetId: id,
        expectedSelectionRevision: 1,
      }),
    ).rejects.toThrow(/not found/);
    await expect(
      f.user.mutation(api.seriesReview.select, {
        seriesId: f.seriesId,
        postIds: [f.one, f.one],
        expectedRevision: 1,
      }),
    ).rejects.toThrow(/distinct/);
    const lower = (
      await f.user.mutation(api.publishing.createPostWithIntent, {
        brandId: "lower-db",
        channelId: "linkedin",
        title: "Other brand",
        content: "Owned outside series",
        timezone: "UTC",
      })
    ).postId;
    await expect(
      f.user.mutation(api.seriesReview.select, {
        seriesId: f.seriesId,
        postIds: [lower],
        expectedRevision: 1,
      }),
    ).rejects.toThrow(/mismatch/);
  });
  it("preserves delivery receipts/status while recording replay-safe approval and refuses viewers", async () => {
    const f = await fixture();
    await f.t.run((ctx) => ctx.db.patch(f.one, { status: "published" }));
    const before = await f.t.run((ctx) =>
      ctx.db.query("v2ProviderStates").collect(),
    );
    const id = await packet(f);
    await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.one)))!.status).toBe(
      "published",
    );
    expect(
      await f.t.run((ctx) => ctx.db.query("v2ProviderStates").collect()),
    ).toEqual(before);
    const again = await f.user.mutation(api.seriesReview.approve, {
      packetId: id,
      expectedSelectionRevision: 1,
    });
    expect(again.alreadyApproved).toBe(true);
    await f.t.run(async (ctx) => {
      const role = await ctx.db
        .query("v2BrandMemberships")
        .withIndex("by_user_and_brand", (q) =>
          q.eq("userId", "editor").eq("brandId", "corvo"),
        )
        .first();
      await ctx.db.patch(role!._id, { role: "viewer" });
    });
    await expect(
      f.user.mutation(api.publishing.setApproval, {
        postId: f.two,
        approvalState: "approved",
      }),
    ).rejects.toThrow(/Editor/);
  });
});

import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { destinationIdentity } from "../../lib/bufferContracts";
import { blogEditorialFingerprint } from "../../lib/blogContract";
import {
  companionReviewVersion,
  articleArtifactVersion,
} from "../../lib/articleContracts";
import { socialReleaseVersion } from "../../lib/socialPayload";
const modules = import.meta.glob("../**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "editor" });
  await user.mutation(api.publishing.seedMvpWorkspace, {});
  const seriesId = await user.mutation(api.series.create, {
    brandId: "corvo",
    title: "Fixture launch",
  });
  const article = await user.mutation(api.publishing.createPostWithIntent, {
    brandId: "corvo",
    channelId: "corvo-blog",
    title: "Article",
    content: "Original article",
    timezone: "UTC",
  });
  const destination = {
    channelId: "page",
    organizationId: "org",
    displayName: "Fixture Page",
    handle: "corvo-labs-us",
    accountType: "page",
    disconnected: false,
    locked: false,
    queuePaused: false,
    flagsVerified: true,
    checkedAt: Date.now(),
    firstComment: {
      value: "unknown" as const,
      source: "unknown" as const,
      checkedAt: Date.now(),
      evidence: "Fixture",
    },
  };
  await t.mutation(internal.bufferDestinations.record, {
    userId: "editor",
    brandId: "corvo",
    destination,
  });
  const identity = destinationIdentity(destination);
  await user.mutation(api.queuePlanning.confirmConstraint, {
    brandId: "corvo",
    identity,
    channelLimit: 10,
    dailyLimit: 5,
    evidence: "Sanitized account plan",
  });
  await t.mutation(internal.queuePlanning.record, {
    userId: "editor",
    brandId: "corvo",
    observation: {
      identity,
      channelId: "page",
      organizationId: "org",
      checkedAt: Date.now(),
      complete: true,
      organizationLimit: 100,
      providerPosts: [],
    },
  });
  const posts = [];
  for (let n = 0; n < 10; n++) {
    const item = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "linkedin",
      title: `Post ${n}`,
      content: `Exact copy ${n}`,
      scheduledDate: "2030-10-07",
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
    });
    await user.mutation(api.publishing.setApproval, {
      postId: item.postId,
      approvalState: "approved",
    });
    posts.push(item);
  }
  await user.mutation(api.series.attach, {
    seriesId,
    key: "launch",
    articlePostId: article.postId,
    companionPostIds: posts.slice(0, 2).map((p) => p.postId),
  });
  const reservations = [];
  for (const p of posts.slice(0, 2))
    reservations.push(
      await user.mutation(api.queuePlanning.reserve, {
        seriesId,
        postId: p.postId,
      }),
    );
  return { t, user, seriesId, posts, reservations, identity, destination };
}
describe("durable queue planning", () => {
  it("permits eight backlog posts, persists holds and rejects foreign ownership", async () => {
    const { t, user, reservations } = await fixture();
    const plan = await user.query(api.queuePlanning.plan, { brandId: "corvo" });
    expect(
      plan.candidates.filter((p: { eligible: boolean }) => p.eligible),
    ).toHaveLength(8);
    expect(plan.projection).toMatchObject({
      availableForBacklog: 8,
      channelReserved: 2,
    });
    await user.mutation(api.queuePlanning.saveDryRun, { brandId: "corvo" });
    expect(
      (
        await user.query(api.queuePlanning.lastPlan, { brandId: "corvo" })
      ).rows.filter((r: { hold: string | null }) => r.hold),
    ).toHaveLength(2);
    const foreign = t.withIdentity({ subject: "foreign" });
    await expect(
      foreign.mutation(api.queuePlanning.release, {
        reservationId: reservations[0],
      }),
    ).rejects.toThrow(/not found/);
    await user.mutation(api.queuePlanning.release, {
      reservationId: reservations[0],
    });
    expect(
      (await user.query(api.queuePlanning.plan, { brandId: "corvo" }))
        .projection.availableForBacklog,
    ).toBe(9);
    expect(
      await t.run((ctx) => ctx.db.query("v2PublishAttempts").collect()),
    ).toHaveLength(0);
    expect(
      (await t.run((ctx) => ctx.db.query("v2AuditEvents").collect())).some(
        (e) => e.action === "queue.dry_run",
      ),
    ).toBe(true);
  });
  it("consumes only a confirmed reservation outcome without counting the provider item twice", async () => {
    const { t, user, posts, identity } = await fixture();
    const original = (await t.run((ctx) => ctx.db.get(posts[0].postId)))!;
    const articleId = (await t.run((ctx) =>
      ctx.db.query("seriesEntries").first(),
    ))!.articlePostId;
    await t.run(async (ctx) => {
      await ctx.db.patch(articleId, {
        blogArtifact: {
          repository: "fixture/site",
          prNumber: 7,
          branchName: "fixture",
          mdxPath: "content/blog/2030-10-07-fixture.mdx",
          canonicalUrl: "https://corvolabs.com/blog/2030-10-07-fixture",
        },
      });
      const article = (await ctx.db.get(articleId))!;
      await ctx.db.insert("articlePublications", {
        userId: "editor",
        postId: articleId,
        key: "fixture",
        evidence: {
          checkedAt: Date.now(),
          editorialVersion: blogEditorialFingerprint(article),
          artifactVersion: articleArtifactVersion(article.blogArtifact),
          prState: "merged",
          mergeSha: "fixture-merge",
          deploymentSha: "fixture-merge",
          deploymentState: "success",
          deploymentContainsArticle: true,
          articleBlobSha: "fixture-blob",
          availability: "verified",
        },
      });
    });
    await user.mutation(api.articleDependencies.link, {
      postId: original._id,
      articlePostId: articleId,
      placement: "body",
      expectedVersion: companionReviewVersion(original),
    });
    const reviewed = (await t.run((ctx) => ctx.db.get(original._id)))!;
    await user.mutation(api.articleDependencies.applyLink, {
      postId: original._id,
      expectedVersion: companionReviewVersion(reviewed),
      canonicalUrl: "https://corvolabs.com/blog/2030-10-07-fixture",
    });
    await user.mutation(api.publishing.setApproval, {
      postId: original._id,
      approvalState: "approved",
    });
    const post = (await t.run((ctx) => ctx.db.get(original._id)))!;
    await user.mutation(api.bufferDestinations.pin, {
      postId: post._id,
      identity,
      expectedVersion: socialReleaseVersion(post),
    });
    const claimed = await t.mutation(
      internal.publishing.claimBufferSubmission,
      { postId: post._id, userId: "editor" },
    );
    expect(claimed.eligible).toBe(true);
    if (!claimed.eligible) throw new Error("Fixture claim");
    await t.mutation(internal.publishing.recordBufferSubmitResult, {
      postId: post._id,
      userId: "editor",
      brandId: "corvo",
      intentId: claimed.intentId,
      attemptId: claimed.attemptId,
      idempotencyKey: claimed.idempotencyKey,
      retryCount: claimed.retryCount,
      submissionSnapshot: {
        postId: claimed.submission.postId,
        brandId: claimed.submission.brandId,
        channelId: claimed.submission.channelId,
        title: claimed.submission.title,
        content: claimed.submission.content,
        scheduledDate: claimed.submission.scheduledDate,
        scheduledTime: claimed.submission.scheduledTime,
        timezone: claimed.submission.timezone,
      },
      ok: true,
      status: "success",
      providerStateStatus: "queued",
      providerPostId: "confirmed",
      sanitizedResponse: { dueAt: "2030-10-07T16:00:00Z" },
    });
    await t.mutation(internal.queuePlanning.record, {
      userId: "editor",
      brandId: "corvo",
      observation: {
        identity,
        channelId: "page",
        organizationId: "org",
        checkedAt: Date.now(),
        complete: true,
        organizationLimit: 100,
        providerPosts: [
          { id: "confirmed", channelId: "page", status: "scheduled" },
        ],
      },
    });
    const plan = await user.query(api.queuePlanning.plan, { brandId: "corvo" });
    expect(plan.projection).toMatchObject({
      channelUsed: 1,
      channelReserved: 1,
      availableForBacklog: 8,
    });
    expect(plan.reservations[0].status).toBe("consumed");
  });
  it("holds expired dates and incomplete counts without changing copy or schedules", async () => {
    const { t, user, posts, identity } = await fixture();
    await user.mutation(api.publishing.reschedule, {
      postId: posts[5].postId,
      scheduledDate: "2000-01-01",
      scheduledTime: "09:00",
    });
    let plan = await user.query(api.queuePlanning.plan, { brandId: "corvo" });
    expect(
      plan.candidates.find(
        (p: { post: { _id: string } }) => p.post._id === posts[5].postId,
      ).hold,
    ).toMatch(/passed/);
    await t.mutation(internal.queuePlanning.record, {
      userId: "editor",
      brandId: "corvo",
      observation: {
        identity,
        channelId: "page",
        organizationId: "org",
        checkedAt: Date.now(),
        complete: false,
        organizationLimit: 100,
        providerPosts: [],
      },
    });
    plan = await user.query(api.queuePlanning.plan, { brandId: "corvo" });
    expect(plan.candidates.some((p: { eligible: boolean }) => p.eligible)).toBe(
      false,
    );
    expect(
      (await t.run((ctx) => ctx.db.get(posts[5].postId)))!.scheduledDate,
    ).toBe("2000-01-01");
  });
});

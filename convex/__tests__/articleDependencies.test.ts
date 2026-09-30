import {seedCapacity} from "../../test-support/queueCapacityFixture";
import { describe, it, expect, afterEach, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { blogEditorialFingerprint } from "../../lib/blogContract";
import {
  articleArtifactVersion,
  companionReviewVersion,
} from "../../lib/articleContracts";
import { socialReleaseVersion } from "../../lib/socialPayload";
import { destinationIdentity } from "../../lib/bufferContracts";
const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.useRealTimers());
async function fixture() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "editor" });
  await user.mutation(api.publishing.seedMvpWorkspace, {});
  const { postId: articleId } = await user.mutation(
    api.publishing.createPostWithIntent,
    {
      brandId: "corvo",
      channelId: "corvo-blog",
      title: "Exact article",
      content: "Approved article 42%.",
      scheduledDate: "2000-01-01",
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
    },
  );
  const artifact = {
    repository: "fixture/site",
    prNumber: 7,
    branchName: "fixture",
    mdxPath: "content/blog/2000-01-01-fixture.mdx",
    canonicalUrl: "https://corvolabs.com/blog/2000-01-01-fixture",
  };
  await t.run((ctx) =>
    ctx.db.patch(articleId, {
      blogArtifact: artifact,
      prUrl: "https://github.com/fixture/site/pull/7",
      blogPublicationIntent: "published",
    }),
  );
  const { postId } = await user.mutation(api.publishing.createPostWithIntent, {
    brandId: "corvo",
    channelId: "linkedin",
    title: "Future drip",
    content: "Exact 42% companion.\n{{articleUrl}}",
    scheduledDate: "2030-10-07",
    scheduledTime: "09:00",
    timezone: "America/Los_Angeles",
  });
  await user.mutation(api.publishing.setApproval, {
    postId,
    approvalState: "approved",
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
      value: "supported" as const,
      source: "operator-confirmed" as const,
      checkedAt: Date.now(),
      evidence: "Fixture plan",
    },
  };
  await t.mutation(internal.bufferDestinations.record, {
    userId: "editor",
    brandId: "corvo",
    destination,
  });
  await seedCapacity(t,"editor","corvo",destination);
  return { t, user, articleId, postId, artifact, destination };
}
async function resolve(f: Awaited<ReturnType<typeof fixture>>) {
  let post = (await f.t.run((ctx) => ctx.db.get(f.postId)))!;
  await f.user.mutation(api.articleDependencies.link, {
    postId: f.postId,
    articlePostId: f.articleId,
    placement: "body",
    expectedVersion: companionReviewVersion(post),
  });
  expect((await f.t.run((ctx) => ctx.db.get(f.postId)))!.approvalState).toBe(
    "approved",
  );
  post = (await f.t.run((ctx) => ctx.db.get(f.postId)))!;
  await f.user.mutation(api.articleDependencies.applyLink, {
    postId: f.postId,
    canonicalUrl: f.artifact.canonicalUrl,
    expectedVersion: companionReviewVersion(post),
  });
  expect((await f.t.run((ctx) => ctx.db.get(f.postId)))!.approvalState).toBe(
    "unapproved",
  );
  await f.user.mutation(api.publishing.setApproval, {
    postId: f.postId,
    approvalState: "approved",
  });
  post = (await f.t.run((ctx) => ctx.db.get(f.postId)))!;
  await f.user.mutation(api.bufferDestinations.pin, {
    postId: f.postId,
    identity: destinationIdentity(f.destination),
    expectedVersion: socialReleaseVersion(post),
  });
}
async function record(
  f: Awaited<ReturnType<typeof fixture>>,
  overrides: Record<string, unknown> = {},
) {
  const article = (await f.t.run((ctx) => ctx.db.get(f.articleId)))!;
  const evidence = {
    checkedAt: Date.now(),
    editorialVersion: blogEditorialFingerprint(article),
    artifactVersion: articleArtifactVersion(article.blogArtifact),
    prState: "merged" as const,
    headSha: "fixture-head",
    mergeSha: "fixture-merge",
    deploymentSha: "fixture-merge",
    deploymentState: "success",
    deploymentContainsArticle: true,
    articleBlobSha: "fixture-blob",
    availability: "verified" as const,
    ...overrides,
  };
  return f.t.mutation(internal.articleDependencies.record, {
    postId: f.articleId,
    userId: "editor",
    expectedArtifactVersion: articleArtifactVersion(article.blogArtifact),
    key: JSON.stringify(overrides),
    evidence,
  });
}
describe("server-owned article dependency", () => {
  it.each([
    { prState: "open" },
    { deploymentState: "pending", articleBlobSha: undefined },
    { deploymentState: "failure", articleBlobSha: undefined },
    {
      deploymentSha: "wrong",
      articleBlobSha: undefined,
      reason: "Wrong deployment commit",
    },
    { availability: "blocked" },
  ])(
    "holds direct context and claim when article proof is incomplete (%j)",
    async (overrides) => {
      const f = await fixture();
      await resolve(f);
      await record(f, overrides);
      expect(
        await f.t.query(internal.publishing.getBufferSubmissionContext, {
          postId: f.postId,
          userId: "editor",
        }),
      ).toMatchObject({ eligible: false });
      expect(
        await f.t.mutation(internal.publishing.claimBufferSubmission, {
          postId: f.postId,
          userId: "editor",
        }),
      ).toMatchObject({ eligible: false });
      expect(
        await f.t.run((ctx) => ctx.db.query("v2PublishAttempts").collect()),
      ).toHaveLength(0);
    },
  );
  it("keeps future drip dates independent, requires full exact evidence, and deduplicates repeated checks", async () => {
    const f = await fixture();
    await resolve(f);
    await f.user.mutation(api.publishing.recordBlogPrStatus, {
      postId: f.articleId,
      prStatus: "merged",
    });
    expect((await f.t.run((ctx) => ctx.db.get(f.articleId)))!.status).not.toBe(
      "published",
    );
    expect(
      (
        await f.t.query(internal.publishing.getBufferSubmissionContext, {
          postId: f.postId,
          userId: "editor",
        })
      ).eligible,
    ).toBe(false);
    await record(f);
    await record(f);
    expect(
      await f.t.run((ctx) => ctx.db.query("articlePublications").collect()),
    ).toHaveLength(1);
    expect(
      await f.t.query(internal.publishing.getBufferSubmissionContext, {
        postId: f.postId,
        userId: "editor",
      }),
    ).toMatchObject({ eligible: true });
    expect(await f.t.run((ctx) => ctx.db.get(f.postId))).toMatchObject({
      scheduledDate: "2030-10-07",
      approvalState: "approved",
      content: `Exact 42% companion.\n${f.artifact.canonicalUrl}`,
    });
  });
  it("rejects expired schedules and foreign parents", async () => {
    const f = await fixture();
    await resolve(f);
    await record(f);
    await f.user.mutation(api.publishing.reschedule, {
      postId: f.postId,
      scheduledDate: "2000-01-01",
      scheduledTime: "09:00",
    });
    expect(
      (
        await f.t.query(internal.publishing.getBufferSubmissionContext, {
          postId: f.postId,
          userId: "editor",
        })
      ).reason,
    ).toMatch(/passed/);
    const post = (await f.t.run((ctx) => ctx.db.get(f.postId)))!;
    await expect(
      f.t
        .withIdentity({ subject: "foreign" })
        .mutation(api.articleDependencies.link, {
          postId: f.postId,
          articlePostId: f.articleId,
          placement: "body",
          expectedVersion: companionReviewVersion(post),
        }),
    ).rejects.toThrow(/not found/);
  });
  it("rejects an article edit while a publication check is in flight", async () => {
    const f = await fixture();
    const article = (await f.t.run((ctx) => ctx.db.get(f.articleId)))!;
    await f.user.mutation(api.publishing.updateContent, {
      postId: f.articleId,
      content: "Changed unpublished copy",
    });
    expect(
      await f.t.mutation(internal.articleDependencies.record, {
        postId: f.articleId,
        userId: "editor",
        expectedArtifactVersion: articleArtifactVersion(article.blogArtifact),
        key: "stale",
        evidence: {
          checkedAt: Date.now(),
          editorialVersion: blogEditorialFingerprint(article),
          artifactVersion: articleArtifactVersion(article.blogArtifact),
          prState: "merged",
          deploymentState: "success",
          deploymentContainsArticle: true,
          deploymentSha: "merge",
          articleBlobSha: "blob",
          availability: "verified",
        },
      }),
    ).toBe(false);
    expect(
      await f.t.run((ctx) => ctx.db.query("articlePublications").collect()),
    ).toHaveLength(0);
  });
});

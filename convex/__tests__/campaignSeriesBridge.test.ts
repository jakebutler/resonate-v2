import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { destinationIdentity, type BufferDestination } from "../../lib/bufferContracts";
import { seedCapacity } from "../../test-support/queueCapacityFixture";
import {
  articleArtifactVersion,
  articlePublicationSourceVersion,
  companionReviewVersion,
} from "../../lib/articleContracts";
import { blogEditorialFingerprint } from "../../lib/blogContract";
import { socialReleaseVersion } from "../../lib/socialPayload";
import { campaignFixture } from "./helpers/campaignFixture";

const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.restoreAllMocks());

/**
 * Campaign → series bridge (spec deliverable C2): materialized campaign
 * posts form a reviewable series automatically, so seriesReview batch
 * approval and queueRelease.prepare can run on a campaign-driven set.
 */
async function bridgeFixture() {
  const t = convexTest(schema, modules);
  const fixture = await campaignFixture(t);
  const campaignId = fixture.campaignId;
  const campaign = await t.run((ctx) => ctx.db.get(campaignId));
  const seriesId = campaign!.seriesId!;
  const series = await t.run((ctx) => ctx.db.get(seriesId));
  const postIds = fixture.queue.queue.map((entry) => entry.postId);
  return { t, fixture, seriesId, series, postIds };
}

async function bridgeLinks(
  t: ReturnType<typeof convexTest>,
  seriesId: string
) {
  return t.run(async (ctx) =>
    ctx.db
      .query("seriesPostLinks")
      .withIndex("by_series", (q) => q.eq("seriesId", seriesId as never))
      .collect()
  );
}

/**
 * Reviews the blog editorial metadata batch approval requires, seeding the
 * hero through ctx.storage.store — the same preparation seriesReview.test.ts
 * uses, kept offline so the suite does not depend on the Node-22 crypto
 * runtime the fixture's upload action needs.
 */
async function reviewBlogMetadataOffline(
  t: ReturnType<typeof convexTest>,
  postId: string
): Promise<void> {
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(
      new Blob(["sanitized receipt fixture"])
    );
    await ctx.db.patch(postId as never, {
      blogExcerpt: "Fixture excerpt",
      blogAuthor: "Fixture author",
      blogCategory: "strategy",
      blogTags: ["test"],
      blogPublicationIntent: "draft",
      coverImageAlt: "Fixture blog hero",
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
}

/**
 * Runs the seriesReview batch flow (select → prepare → approve) for the given
 * posts on the bridge series — the path the campaign queue now enables.
 */
async function batchApprove(
  fixture: Awaited<ReturnType<typeof bridgeFixture>>["fixture"],
  seriesId: string,
  postIds: string[]
) {
  await fixture.asUser.mutation(api.seriesReview.select, {
    seriesId: seriesId as never,
    postIds: postIds as never[],
    expectedRevision: 0,
  });
  const packetId = await fixture.asUser.mutation(api.seriesReview.prepare, {
    seriesId: seriesId as never,
    expectedRevision: 1,
  });
  return fixture.asUser.mutation(api.seriesReview.approve, {
    packetId,
    expectedSelectionRevision: 1,
  });
}

const releaseDestination: BufferDestination = {
  channelId: "fixture-page",
  organizationId: "fixture-org",
  displayName: "Corvo Labs",
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
    evidence: "Sanitized fixture plan",
  },
};

describe("campaign → series bridge (C2)", () => {
  it("links materialized campaign posts into a reviewable series at materialization, in slot order, with an audit event and untouched dispatch state", async () => {
    const { t, seriesId, series, postIds } = await bridgeFixture();

    expect(series).not.toBeNull();
    expect(series!.title).toBe("Campaign: Verification campaign");
    expect(series!.userId).toBe("user-fixture-jake");
    expect(series!.brandId).toBe("corvo");

    const links = await bridgeLinks(t, seriesId);
    expect(new Set(links.map((link) => String(link.postId)))).toEqual(
      new Set(postIds)
    );

    // The blog pillar anchors the entry; every social post is its companion
    // in slot order.
    const entries = await t.run(async (ctx) =>
      ctx.db
        .query("seriesEntries")
        .withIndex("by_series_and_sequence", (q) => q.eq("seriesId", seriesId as never))
        .collect()
    );
    expect(entries).toHaveLength(1);
    const [blogId, ...companionIds] = postIds;
    expect(String(entries[0]!.articlePostId)).toBe(blogId);
    expect(entries[0]!.companionPostIds.map(String)).toEqual(companionIds);

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    expect(audits.filter((entry) => entry.action === "campaign.series_bridge")).toHaveLength(1);

    // Dispatch gating untouched: no attempts, provider states not submitted.
    expect(await t.run((ctx) => ctx.db.query("v2PublishAttempts").collect())).toHaveLength(0);
    const states = await t.run(async (ctx) =>
      ctx.db.query("v2ProviderStates").collect()
    );
    expect(states.every((state) => state.status === "not-submitted")).toBe(true);
  });

  it("is idempotent: re-materializing an already-linked campaign writes nothing new", async () => {
    const { t, fixture, seriesId, postIds } = await bridgeFixture();

    const rematerialize = await fixture.asUser.mutation(api.queue.materializeDraftSet, {
      campaignId: fixture.campaignId,
    });
    expect(rematerialize.materialized).toBe(false);
    expect(rematerialize.reason).toBe("already materialized");
    expect(String(rematerialize.seriesId)).toBe(seriesId);

    const links = await bridgeLinks(t, seriesId);
    expect(links).toHaveLength(postIds.length);

    const audits = await t.run(async (ctx) =>
      ctx.db.query("v2AuditEvents").collect()
    );
    expect(audits.filter((entry) => entry.action === "campaign.series_bridge")).toHaveLength(1);

    const series = await t.run((ctx) => ctx.db.get(seriesId));
    expect(series!.revision).toBe(1);
  });

  it("drives batch approval for the campaign set through seriesReview", async () => {
    const { t, fixture, seriesId, postIds } = await bridgeFixture();

    const blog = fixture.queue.queue.find((entry) => entry.channel === "corvo-blog");
    expect(blog).toBeDefined();
    await reviewBlogMetadataOffline(t, blog!.postId);

    const result = await batchApprove(fixture, seriesId, postIds);
    expect(result.approved).toBe(true);
    expect(new Set(result.postIds.map(String))).toEqual(new Set(postIds));

    for (const postId of postIds) {
      const post = await t.run((ctx) => ctx.db.get(postId as never));
      expect(post!.approvalState).toBe("approved");
    }
    const queue = await fixture.asUser.query(api.queue.getCampaignQueue, {
      campaignId: fixture.campaignId,
    });
    expect(queue.allApproved).toBe(true);
    // The campaign queue now exposes the bridge series for release flows.
    expect(String(queue.seriesId)).toBe(seriesId);

    expect(await t.run((ctx) => ctx.db.query("v2PublishAttempts").collect())).toHaveLength(0);
  });

  it("prepares a queue release for the campaign-driven LinkedIn subset", async () => {
    const { t, fixture, seriesId } = await bridgeFixture();
    const userId = "user-fixture-jake";

    // Routability reads the v2Channels row for (brand, channel); campaign
    // posts never create one, so seed the workspace the release tests use.
    await fixture.asUser.mutation(api.publishing.seedMvpWorkspace, {});
    await t.mutation(internal.bufferDestinations.record, {
      userId,
      brandId: "corvo",
      destination: releaseDestination,
    });
    await seedCapacity(t, userId, "corvo", releaseDestination, 10);

    const linkedinIds = fixture.queue.queue
      .filter((entry) => entry.channel === "linkedin")
      .map((entry) => entry.postId);
    expect(linkedinIds.length).toBeGreaterThan(0);

    // The bridge changes review grouping, not gating: releasing campaign
    // posts as series companions walks the exact series dispatch discipline
    // (article artifact + publication evidence, reviewed canonical link,
    // destination pin) the existing queue release machinery requires.
    const blog = fixture.queue.queue.find((entry) => entry.channel === "corvo-blog")!;
    await reviewBlogMetadataOffline(t, blog.postId);
    const artifact = {
      repository: "fixture/site",
      prNumber: 1,
      branchName: "fixture",
      mdxPath: "content/blog/fixture.mdx",
      canonicalUrl: "https://corvolabs.com/blog/fixture",
    };
    await t.run((ctx) =>
      ctx.db.patch(blog.postId as never, {
        blogArtifact: artifact,
        blogPublicationIntent: "published",
      })
    );
    const articlePost = (await t.run((ctx) => ctx.db.get(blog.postId as never)))!;
    await t.mutation(internal.articleDependencies.record, {
      postId: blog.postId as never,
      userId,
      expectedArtifactVersion: articleArtifactVersion(artifact),
      expectedSourceVersion: articlePublicationSourceVersion(articlePost),
      key: "fixture-publication",
      evidence: {
        checkedAt: Date.now(),
        editorialVersion: blogEditorialFingerprint(articlePost),
        artifactVersion: articleArtifactVersion(artifact),
        prState: "merged",
        mergeSha: "fixture-merge",
        deploymentSha: "fixture-merge",
        deploymentState: "success",
        deploymentContainsArticle: true,
        articleBlobSha: "fixture-blob",
        availability: "verified",
      },
    });
    for (const postId of linkedinIds) {
      const entry = fixture.queue.queue.find((e) => e.postId === postId)!;
      await fixture.asUser.mutation(api.publishing.updateContent, {
        postId: postId as never,
        content: `${entry.content}\n${artifact.canonicalUrl}`,
      });
      const post = (await t.run((ctx) => ctx.db.get(postId as never)))!;
      await fixture.asUser.mutation(api.articleDependencies.link, {
        postId: postId as never,
        articlePostId: blog.postId as never,
        placement: "body",
        expectedVersion: companionReviewVersion(post),
      });
    }

    const approved = await batchApprove(fixture, seriesId, [
      ...linkedinIds,
      blog.postId,
    ]);
    expect(approved.approved).toBe(true);
    for (const postId of linkedinIds) {
      const post = (await t.run((ctx) => ctx.db.get(postId as never)))!;
      await fixture.asUser.mutation(api.bufferDestinations.pin, {
        postId: postId as never,
        expectedVersion: socialReleaseVersion(post),
        identity: destinationIdentity(releaseDestination),
      });
    }

    const reviewId = await fixture.asUser.mutation(api.queueRelease.prepare, {
      brandId: "corvo",
      seriesId: seriesId as never,
      postIds: linkedinIds as never[],
    });
    const review = await fixture.asUser.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: seriesId as never,
    });
    expect(String(review.review._id)).toBe(String(reviewId));
    expect(review.review.seriesId ? String(review.review.seriesId) : null).toBe(seriesId);
    expect(review.rows).toHaveLength(linkedinIds.length);
    expect(review.rows.every((row: { status: string }) => row.status === "ready")).toBe(true);
    // Prep reviews payloads; no provider submission happened.
    expect(await t.run((ctx) => ctx.db.query("v2PublishAttempts").collect())).toHaveLength(0);
  });

  it("rejects a campaign-driven release containing non-LinkedIn slots with the existing error", async () => {
    const { fixture, seriesId, postIds } = await bridgeFixture();

    await expect(
      fixture.asUser.mutation(api.queueRelease.prepare, {
        brandId: "corvo",
        seriesId: seriesId as never,
        postIds: postIds as never[],
      })
    ).rejects.toThrow("Queue review accepts LinkedIn posts only.");
  });

  it("keeps the bridge series owned by the campaign owner: another brand owner cannot review it", async () => {
    const { fixture, seriesId, postIds } = await bridgeFixture();

    await expect(
      fixture.otherUser.mutation(api.seriesReview.select, {
        seriesId: seriesId as never,
        postIds: postIds as never[],
        expectedRevision: 0,
      })
    ).rejects.toThrow("Series not found");
    await expect(
      fixture.otherUser.query(api.queue.getCampaignQueue, {
        campaignId: fixture.campaignId,
      })
    ).rejects.toThrow("Campaign not found");
  });

  it("leaves the operator attachEntry rule untouched: attaching a non-blog article still fails", async () => {
    const { fixture, seriesId, postIds } = await bridgeFixture();

    const [blogId, socialId] = postIds;
    await expect(
      fixture.asUser.mutation(api.series.attach, {
        seriesId: seriesId as never,
        key: "operator-entry",
        articlePostId: socialId as never,
        companionPostIds: [blogId as never],
      })
    ).rejects.toThrow("Article must be a blog; companions must use social channels");
  });
});

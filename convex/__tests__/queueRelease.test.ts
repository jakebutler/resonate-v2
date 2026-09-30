import { describe, it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { executeBufferSubmit } from "../bufferLive";
import { seedCapacity } from "../../test-support/queueCapacityFixture";
import { destinationIdentity } from "../../lib/bufferContracts";
import { socialReleaseVersion } from "../../lib/socialPayload";
import { blogEditorialFingerprint } from "../../lib/blogContract";
import {
  articleArtifactVersion,
  companionReviewVersion,
} from "../../lib/articleContracts";
const modules = import.meta.glob("../**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function fixture(count = 10, limit = 10) {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "editor" });
  await user.mutation(api.publishing.seedMvpWorkspace, {});
  const destination = {
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
  await t.mutation(internal.bufferDestinations.record, {
    userId: "editor",
    brandId: "corvo",
    destination,
  });
  await seedCapacity(t, "editor", "corvo", destination, limit);
  const seriesId = await user.mutation(api.series.create, {
    brandId: "corvo",
    title: "8 backlog / 2 launch",
  });
  const article = (
    await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "corvo-blog",
      title: "Published fixture parent",
      content: "Expected 42% article",
      timezone: "UTC",
    })
  ).postId;
  const artifact = {
    repository: "fixture/site",
    prNumber: 1,
    branchName: "fixture",
    mdxPath: "content/blog/2000-01-01-fixture.mdx",
    canonicalUrl: "https://corvolabs.com/blog/2000-01-01-fixture",
  };
  await t.run((ctx) =>
    ctx.db.patch(article, {
      blogArtifact: artifact,
      blogPublicationIntent: "published",
    }),
  );
  const articlePost = (await t.run((ctx) => ctx.db.get(article)))!;
  await t.mutation(internal.articleDependencies.record, {
    postId: article,
    userId: "editor",
    expectedArtifactVersion: articleArtifactVersion(artifact),
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
  const posts = [];
  for (let n = 0; n < count; n++)
    posts.push(
      (
        await user.mutation(api.publishing.createPostWithIntent, {
          brandId: "corvo",
          channelId: "linkedin",
          title: `${n < 2 ? "Launch" : "Backlog"} ${n}`,
          content: `Exact 42% body ${n}.\n${artifact.canonicalUrl}`,
          scheduledDate: "2030-10-07",
          scheduledTime: `${String(9 + Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`,
          timezone: "America/Los_Angeles",
        })
      ).postId,
    );
  await user.mutation(api.series.attach, {
    seriesId,
    key: "entry",
    articlePostId: article,
    companionPostIds: posts,
  });
  for (const postId of posts) {
    const post = (await t.run((ctx) => ctx.db.get(postId)))!;
    await user.mutation(api.articleDependencies.link, {
      postId,
      articlePostId: article,
      placement: "body",
      expectedVersion: companionReviewVersion(post),
    });
    await user.mutation(api.publishing.setApproval, {
      postId,
      approvalState: "approved",
    });
    await user.mutation(api.bufferDestinations.pin, {
      postId,
      expectedVersion: socialReleaseVersion(
        (await t.run((ctx) => ctx.db.get(postId)))!,
      ),
      identity: destinationIdentity(destination),
    });
  }
  const reservations = [];
  for (const postId of posts.slice(0, Math.min(2, count)))
    reservations.push(
      await user.mutation(api.queuePlanning.reserve, { postId, seriesId }),
    );
  return { t, user, destination, seriesId, article, posts, reservations };
}
function gates() {
  vi.stubEnv("BUFFER_LIVE_SUBMISSION", "approved");
  vi.stubEnv("LIVE_PROVIDER_VALIDATION_APPROVED", "approved");
  vi.stubEnv("BUFFER_API_KEY", "sanitized-fixture-secret");
}
function provider(
  options: {
    fullAt?: number;
    ambiguousAt?: number;
    beforeChannels?: () => Promise<void>;
    mockId?: boolean;
    draft?: boolean;
  } = {},
) {
  let creates = 0;
  const payloads: Record<string, unknown>[] = [];
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    let data: unknown;
    if (body.query.includes("BufferCreatePost")) {
      creates++;
      payloads.push(body.variables.input);
      if (creates === options.ambiguousAt)
        throw new Error("sanitized network timeout");
      data = {
        createPost:
          creates === options.fullAt
            ? { message: "Scheduled posts queue capacity limit exceeded" }
            : {
                post: {
                  id: `${options.mockId ? "mock" : "external"}-fixture-${creates}`,
                  status: options.draft ? "needsApproval" : "scheduled",
                  dueAt: body.variables.input.dueAt,
                  shareMode: "customScheduled",
                },
              },
      };
    } else if (body.query.includes("BufferChannels")) {
      await options.beforeChannels?.();
      data = {
        channels: [
          {
            id: "fixture-page",
            name: "corvo-labs-us",
            displayName: "Corvo Labs",
            organizationId: "fixture-org",
            type: "page",
            service: "linkedin",
            isDisconnected: false,
            isLocked: false,
            isQueuePaused: false,
          },
        ],
      };
    } else
      data = {
        account: {
          id: "account-fixture",
          organizations: [{ id: "fixture-org", name: "Fixture organization" }],
        },
      };
    return new Response(JSON.stringify({ data }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, payloads, creates: () => creates };
}
async function review(
  f: Awaited<ReturnType<typeof fixture>>,
  ids = f.posts.slice(2),
) {
  return f.user.mutation(api.queueRelease.prepare, {
    brandId: "corvo",
    seriesId: f.seriesId,
    postIds: ids,
  });
}
describe("explicit reviewed queue execution", () => {
  it("queues eight reviewed backlog posts once, retaining two launch reservations and exact payload/account/dates", async () => {
    const f = await fixture();
    gates();
    const p = provider();
    const reviewId = await review(f);
    expect(p.fetch).not.toHaveBeenCalled();
    const packet = await f.user.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: f.seriesId,
    });
    expect(packet.rows.every((r) => r.status === "ready")).toBe(true);
    expect(packet.rows[0].payloadHash).toMatch(/^[a-f0-9]{64}$/);
    await f.user.action(api.bufferLive.queueSelected, { reviewId });
    expect(p.creates()).toBe(8);
    expect(
      p.payloads.every(
        (p) => p.channelId === "fixture-page" && String(p.text).includes("42%"),
      ),
    ).toBe(true);
    expect(p.payloads.map((p) => p.dueAt)).toEqual(
      f.posts
        .slice(2)
        .map(
          (_, n) => `2030-10-07T16:${String(n + 2).padStart(2, "0")}:00.000Z`,
        ),
    );
    const final = await f.user.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: f.seriesId,
    });
    expect(final.review.status).toBe("complete");
    expect(
      final.rows.every((r) => r.status === "queued" && r.providerPostId),
    ).toBe(true);
    expect(
      (
        await f.t.run((ctx) => ctx.db.query("queueReservations").collect())
      ).every((r) => r.status === "reserved"),
    ).toBe(true);
    await f.user.action(api.bufferLive.queueSelected, { reviewId });
    expect(p.creates()).toBe(8);
    await f.user.mutation(api.publishing.updateContent, {
      postId: f.posts[2],
      content: "Edited after receipt",
    });
    await f.user.mutation(api.publishing.setApproval, {
      postId: f.posts[2],
      approvalState: "approved",
    });
    const changed = await review(f, [f.posts[2]]);
    await f.user.action(api.bufferLive.queueSelected, { reviewId: changed });
    expect(p.creates()).toBe(8);
  });
  it("stops on an external queue-full race and holds untouched rows without retrying successful posts", async () => {
    const f = await fixture(5, 10);
    gates();
    const p = provider({ fullAt: 2 });
    const reviewId = await review(f);
    await f.user.action(api.bufferLive.queueSelected, { reviewId });
    expect(p.creates()).toBe(2);
    const packet = await f.user.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: f.seriesId,
    });
    expect(packet.rows.map((r) => r.status)).toEqual([
      "queued",
      "held",
      "held",
    ]);
    expect(packet.review.status).toBe("stopped");
    const claims = await f.t.run((ctx) =>
      ctx.db.query("queueDispatchClaims").collect(),
    );
    expect(claims.map((c) => c.status)).toEqual(["confirmed", "released"]);
    expect(
      (await f.user.query(api.queuePlanning.plan, { brandId: "corvo" }))
        .projection.unknown,
    ).toBeTruthy();
    const remainingReview = await review(f, [f.posts[4]]);
    await f.user.action(api.bufferLive.queueSelected, {
      reviewId: remainingReview,
    });
    expect(p.creates()).toBe(2);
    await f.user.action(api.bufferLive.queueSelected, { reviewId });
    expect(p.creates()).toBe(2);
    await seedCapacity(f.t, "editor", "corvo", f.destination, 10);
    const freshReview = await review(f, f.posts.slice(3));
    const freshPacket = await f.user.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: f.seriesId,
    });
    expect(freshPacket.rows.map((r) => r.retry)).toEqual([true, false]);
    expect(freshPacket.rows.every((r) => r.status === "ready")).toBe(true);
    expect(p.creates()).toBe(2); // A fresh review alone never retries.
    await f.user.action(api.bufferLive.queueSelected, {
      reviewId: freshReview,
    });
    expect(p.creates()).toBe(4);
    expect(p.payloads.map((payload) => payload.text)).toEqual([
      expect.stringContaining("Exact 42% body 2"),
      expect.stringContaining("Exact 42% body 3"),
      expect.stringContaining("Exact 42% body 3"),
      expect.stringContaining("Exact 42% body 4"),
    ]);
    await f.user.action(api.bufferLive.queueSelected, {
      reviewId: freshReview,
    });
    expect(p.creates()).toBe(4);
  });
  it.each([
    "content",
    "schedule",
    "destination",
    "approval",
    "article",
    "capacity",
    "age",
    "expiry",
    "reservation",
  ])("rejects %s drift before any provider call", async (kind) => {
    const f = await fixture(3, 10);
    gates();
    const p = provider();
    const reviewId = await review(f);
    const postId = f.posts[2];
    if (kind === "content")
      await f.user.mutation(api.publishing.updateContent, {
        postId,
        content: "Changed material body",
      });
    if (kind === "schedule")
      await f.user.mutation(api.publishing.reschedule, {
        postId,
        scheduledDate: "2030-10-08",
        scheduledTime: "09:00",
      });
    if (kind === "destination")
      await f.t.mutation(internal.bufferDestinations.record, {
        userId: "editor",
        brandId: "corvo",
        destination: { ...f.destination, channelId: "different-page" },
      });
    if (kind === "approval")
      await f.user.mutation(api.publishing.setApproval, {
        postId,
        approvalState: "unapproved",
      });
    if (kind === "article")
      await f.t.run((ctx) =>
        ctx.db.patch(f.article, { content: "Changed source article" }),
      );
    if (kind === "capacity")
      await seedCapacity(f.t, "editor", "corvo", f.destination);
    if (kind === "age")
      await f.t.run((ctx) =>
        ctx.db.patch(reviewId, { createdAt: Date.now() - 300001 }),
      );
    if (kind === "reservation")
      await f.user.mutation(api.queuePlanning.release, {
        reservationId: f.reservations[0],
      });
    if (kind === "expiry")
      await f.user.mutation(api.publishing.reschedule, {
        postId,
        scheduledDate: "2000-01-01",
        scheduledTime: "09:00",
      });
    const displayed = await f.user.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: f.seriesId,
    });
    expect(displayed?.stale).toBe(true);
    await f.user.action(api.bufferLive.queueSelected, { reviewId });
    expect(p.fetch).not.toHaveBeenCalled();
    expect(
      await f.t.run((ctx) => ctx.db.query("v2PublishAttempts").collect()),
    ).toHaveLength(0);
  });
  it("rechecks after account discovery and before createPost", async () => {
    const f = await fixture(3);
    gates();
    let changed = false;
    const p = provider({
      beforeChannels: async () => {
        if (!changed) {
          changed = true;
          await f.user.mutation(api.publishing.updateContent, {
            postId: f.posts[2],
            content: "Drift while account query was in flight",
          });
        }
      },
    });
    const reviewId = await review(f);
    await f.user.action(api.bufferLive.queueSelected, { reviewId });
    expect(p.creates()).toBe(0);
    expect(
      (await f.t.run((ctx) => ctx.db.query("queueDispatchClaims").collect()))[0]
        .status,
    ).toBe("released");
  });
  it("serializes concurrent single/batch allocation and cannot borrow unselected reserved slots", async () => {
    const f = await fixture(4, 3);
    const reviewId = await review(f, [f.posts[2]]);
    const begin = await f.t.mutation(internal.queueRelease.begin, {
      reviewId,
      userId: "editor",
      runId: "fixture-run",
    });
    expect(begin.execute).toBe(true);
    const rowId = begin.rowIds[0];
    const results = await Promise.all([
      f.t.mutation(internal.publishing.claimBufferSubmission, {
        postId: f.posts[2],
        userId: "editor",
        reviewRowId: rowId,
        runId: "fixture-run",
      }),
      f.t.mutation(internal.publishing.claimBufferSubmission, {
        postId: f.posts[3],
        userId: "editor",
      }),
    ]);
    expect(results.filter((r) => r.eligible)).toHaveLength(1);
    expect(
      await f.t.run((ctx) => ctx.db.query("queueDispatchClaims").collect()),
    ).toHaveLength(1);
    expect(
      (await f.user.query(api.queuePlanning.plan, { brandId: "corvo" }))
        .projection.availableForBacklog,
    ).toBe(0);
  });
  it("retains ambiguous allocation, blocks edited-intent retry, and recovers read-only confirmed IDs without another create", async () => {
    const f = await fixture(4);
    gates();
    const p = provider({ ambiguousAt: 1 });
    const reviewId = await review(f);
    await f.user.action(api.bufferLive.queueSelected, { reviewId });
    expect(p.creates()).toBe(1);
    const claims = await f.t.run((ctx) =>
      ctx.db.query("queueDispatchClaims").collect(),
    );
    expect(claims[0].status).toBe("uncertain");
    await f.user.mutation(api.publishing.updateContent, {
      postId: f.posts[2],
      content: "Changed after uncertainty",
    });
    await f.user.mutation(api.publishing.setApproval, {
      postId: f.posts[2],
      approvalState: "approved",
    });
    await f.user.action(api.bufferLive.submit, {
      postId: f.posts[2],
      retry: true,
    });
    expect(p.creates()).toBe(1);
    const newReview = await review(f, [f.posts[2]]);
    expect(
      (
        await f.user.query(api.queueRelease.latest, {
          brandId: "corvo",
          seriesId: f.seriesId,
        })
      ).rows[0].status,
    ).toBe("held");
    await f.user.action(api.bufferLive.queueSelected, { reviewId: newReview });
    expect(p.creates()).toBe(1);
  });
  it("retains accepted ID when persistence fails and never replays createPost", async () => {
    const f = await fixture(3);
    gates();
    const p = provider();
    let rejected = false;
    const ctx = {
      runQuery: (
        ref: Parameters<typeof f.t.query>[0],
        args: Record<string, unknown>,
      ) => f.t.query(ref, args),
      runMutation: async (
        ref: Parameters<typeof f.t.mutation>[0],
        args: Record<string, unknown>,
      ) => {
        if (
          getFunctionName(ref) === "publishing:recordBufferSubmitResult" &&
          !rejected
        ) {
          rejected = true;
          throw new Error("Sanitized persistence interruption");
        }
        return f.t.mutation(ref, args);
      },
    };
    const result = await executeBufferSubmit(
      ctx as never,
      { postId: f.posts[2] },
      "editor",
    );
    expect(result.submitted).toBe(false);
    expect(result.providerPostId).toBe("external-fixture-1");
    const claims = await f.t.run((ctx) =>
      ctx.db.query("queueDispatchClaims").collect(),
    );
    expect(claims[0]).toMatchObject({
      status: "uncertain",
      providerPostId: "external-fixture-1",
    });
    await f.user.action(api.bufferLive.submit, { postId: f.posts[2] });
    expect(p.creates()).toBe(1);
    const restored = await f.t.query(internal.bufferDelivery.refreshContext, {
      postId: f.posts[2],
      userId: "editor",
    });
    expect(restored.providerPostId).toBe("external-fixture-1");
    const state = restored._id;

    await f.t.mutation(internal.publishing.recordBufferStatusRefresh, {
      providerStateId: state,
      postId: f.posts[2],
      providerPostId: "external-fixture-1",
      expectedAttemptId: claims[0].attemptId,
      ok: true,
      providerStateStatus: "queued",
      sanitizedResponse: { status: "scheduled" },
    });
    expect((await f.t.run((ctx) => ctx.db.get(claims[0]._id)))!.status).toBe(
      "confirmed",
    );
    await f.t.mutation(internal.publishing.recordBufferStatusRefresh, {
      providerStateId: state,
      postId: f.posts[2],
      providerPostId: "external-fixture-1",
      expectedAttemptId: claims[0].attemptId,
      ok: true,
      providerStateStatus: "published",
      sanitizedResponse: { publishedAt: "2030-10-07T16:02:00Z" },
    });
    expect((await f.t.run((ctx) => ctx.db.get(claims[0]._id)))!.status).toBe(
      "released",
    );
    expect(p.creates()).toBe(1);
  });
  it("uses only explicitly selected launch reservations and keeps the rest reserved", async () => {
    const f = await fixture(3, 3);
    gates();
    const p = provider();
    const id = await review(f, [...f.posts]);
    await f.user.action(api.bufferLive.queueSelected, { reviewId: id });
    expect(p.creates()).toBe(3);
    expect(
      (
        await f.t.run((ctx) => ctx.db.query("queueReservations").collect())
      ).every((r) => r.status === "consumed"),
    ).toBe(true);
    expect(
      (
        await f.user.query(api.queueRelease.latest, {
          brandId: "corvo",
          seriesId: f.seriesId,
        })
      ).review.status,
    ).toBe("complete");
  });
  it("honors a confirmed per-day ceiling and exposes dated/unknown evidence without sends", async () => {
    const f = await fixture(3);
    gates();
    const p = provider();
    await f.user.mutation(api.queuePlanning.confirmConstraint, {
      brandId: "corvo",
      identity: destinationIdentity(f.destination),
      channelLimit: 10,
      organizationLimit: 10,
      dailyLimit: 2,
      evidence: "Sanitized confirmed daily ceiling",
    });
    const id = await review(f);
    const packet = await f.user.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: f.seriesId,
    });
    expect(packet.rows[0].reason).toContain("daily");
    await f.user.action(api.bufferLive.queueSelected, { reviewId: id });
    expect(p.fetch).not.toHaveBeenCalled();
  });
  it("recovers an interrupted pending claim with no blind create, and rejects foreign release IDs", async () => {
    const f = await fixture(3);
    gates();
    const p = provider();
    const id = await review(f);
    const start = await f.t.mutation(internal.queueRelease.begin, {
      reviewId: id,
      userId: "editor",
      runId: "first-run",
    });
    const claimed = await f.t.mutation(
      internal.publishing.claimBufferSubmission,
      {
        postId: f.posts[2],
        userId: "editor",
        reviewRowId: start.rowIds[0],
        runId: "first-run",
      },
    );
    expect(claimed.eligible).toBe(true);
    await f.t.run((ctx) => ctx.db.patch(id, { claimedUntil: Date.now() - 1 }));
    await f.user.action(api.bufferLive.queueSelected, { reviewId: id });
    expect(p.fetch).not.toHaveBeenCalled();
    const packet = await f.user.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: f.seriesId,
    });
    expect(packet.rows[0].status).toBe("needs-review");
    expect(
      (await f.t.run((ctx) => ctx.db.query("queueDispatchClaims").collect()))[0]
        .status,
    ).toBe("active");
    const other = f.t.withIdentity({ subject: "other" });
    await expect(
      other.action(api.bufferLive.queueSelected, { reviewId: id }),
    ).rejects.toThrow(/not found/);
  });
  it("resumes from confirmed receipts and dispatches only untouched reviewed rows", async () => {
    const f = await fixture(4);
    gates();
    const p = provider();
    const id = await review(f);
    const begin = await f.t.mutation(internal.queueRelease.begin, {
      reviewId: id,
      userId: "editor",
      runId: "interrupted-run",
    });
    const claimed = await f.t.mutation(
      internal.publishing.claimBufferSubmission,
      {
        postId: f.posts[2],
        userId: "editor",
        reviewRowId: begin.rowIds[0],
        runId: "interrupted-run",
      },
    );
    if (!claimed.eligible) throw new Error("fixture claim held");
    const { expectedDestination, idempotencyKey, ...snapshot } =
      claimed.submission;
    void expectedDestination;
    void idempotencyKey;
    await f.t.mutation(internal.publishing.recordBufferSubmitResult, {
      postId: f.posts[2],
      userId: "editor",
      intentId: claimed.intentId,
      brandId: "corvo",
      attemptId: claimed.attemptId,
      idempotencyKey: claimed.idempotencyKey,
      retryCount: claimed.retryCount,
      submissionSnapshot: snapshot,
      ok: true,
      status: "success",
      providerStateStatus: "queued",
      providerPostId: "external-before-crash",
      sanitizedResponse: { status: "scheduled" },
    });
    await f.t.run((ctx) => ctx.db.patch(id, { claimedUntil: Date.now() - 1 }));
    await f.user.action(api.bufferLive.queueSelected, { reviewId: id });
    expect(p.creates()).toBe(1);
    const packet = await f.user.query(api.queueRelease.latest, {
      brandId: "corvo",
      seriesId: f.seriesId,
    });
    expect(packet.rows.map((r) => r.providerPostId)).toEqual([
      "external-before-crash",
      "external-fixture-1",
    ]);
    expect(packet.review.status).toBe("complete");
  });
  it.each(["shared", "independent"])(
    "coordinates %s organization capacity across users and different channels",
    async (isolation) => {
      const f = await fixture(1, 1);
      await f.user.mutation(api.queuePlanning.release, {
        reservationId: f.reservations[0],
      });
      const other = f.t.withIdentity({ subject: "second" });
      await other.mutation(api.publishing.seedMvpWorkspace, {});
      const d = {
        ...f.destination,
        channelId: "second-channel",
        organizationId:
          isolation === "shared"
            ? f.destination.organizationId
            : "independent-org",
      };
      await f.t.mutation(internal.bufferDestinations.record, {
        userId: "second",
        brandId: "corvo",
        destination: d,
      });
      await seedCapacity(f.t, "second", "corvo", d, 1);
      const postId = (
        await other.mutation(api.publishing.createPostWithIntent, {
          brandId: "corvo",
          channelId: "linkedin",
          title: "Second channel",
          content: "Separate future copy",
          scheduledDate: "2030-10-07",
          scheduledTime: "10:00",
          timezone: "America/Los_Angeles",
        })
      ).postId;
      await other.mutation(api.publishing.setApproval, {
        postId,
        approvalState: "approved",
      });
      await other.mutation(api.bufferDestinations.pin, {
        postId,
        identity: destinationIdentity(d),
        expectedVersion: socialReleaseVersion(
          (await f.t.run((ctx) => ctx.db.get(postId)))!,
        ),
      });
      const claims = await Promise.all([
        f.t.mutation(internal.publishing.claimBufferSubmission, {
          postId: f.posts[0],
          userId: "editor",
        }),
        f.t.mutation(internal.publishing.claimBufferSubmission, {
          postId,
          userId: "second",
        }),
      ]);
      expect(claims.filter((c) => c.eligible)).toHaveLength(
        isolation === "shared" ? 1 : 2,
      );
      if (isolation === "independent") {
        for (const u of [f.user, other]) {
          const plan = await u.query(api.queuePlanning.plan, {
            brandId: "corvo",
          });
          expect(plan.projection.unknown).toBeFalsy();
          expect(plan.projection.availableForBacklog).toBe(0);
        }
      }
    },
  );
  it.each(["gate", "validation", "mock", "draft"])(
    "never reports %s as real queued delivery",
    async (kind) => {
      const f = await fixture(3);
      gates();
      if (kind === "gate") vi.stubEnv("BUFFER_LIVE_SUBMISSION", "off");
      if (kind === "validation")
        vi.stubEnv("LIVE_PROVIDER_VALIDATION_APPROVED", "off");
      const p = provider({ mockId: kind === "mock", draft: kind === "draft" });
      const reviewId = await review(f);
      await f.user.action(api.bufferLive.queueSelected, { reviewId });
      const packet = await f.user.query(api.queueRelease.latest, {
        brandId: "corvo",
        seriesId: f.seriesId,
      });
      expect(packet.rows[0].status).not.toBe("queued");
      if (kind === "gate" || kind === "validation")
        expect(p.fetch).not.toHaveBeenCalled();
      else expect(p.creates()).toBe(1);
    },
  );
});

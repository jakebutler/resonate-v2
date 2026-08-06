import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const publishingPath = join(process.cwd(), "convex/publishing.ts");
const schemaPath = join(process.cwd(), "convex/schema.ts");
const v2TypesPath = join(process.cwd(), "lib/domain.ts");

const modules = import.meta.glob("../**/*.ts");
const CORVO_ONLY_USER = { subject: "user-corvo-only", name: "Corvo User" };

function createTestHarness() {
  return convexTest(schema, modules);
}

async function setupCorvoOnlyMember(t: ReturnType<typeof convexTest>) {
  const asUser = t.withIdentity(CORVO_ONLY_USER);
  const userId = CORVO_ONLY_USER.subject;
  const now = Date.now();

  await asUser.run(async (ctx) => {
    await ctx.db.insert("v2Brands", {
      brandId: "corvo",
      name: "Corvo Labs",
      description: "Test brand",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2Brands", {
      brandId: "lower-db",
      name: "the lower dB",
      description: "Test brand",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2BrandMemberships", {
      userId,
      brandId: "corvo",
      role: "owner",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2Channels", {
      brandId: "corvo",
      channelId: "linkedin",
      platformId: "linkedin",
      label: "linkedin",
      providerId: "buffer",
      routable: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2Channels", {
      brandId: "lower-db",
      channelId: "linkedin",
      platformId: "linkedin",
      label: "linkedin",
      providerId: "buffer",
      routable: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  return { asUser, userId };
}

async function insertLowerDbPost(
  t: ReturnType<typeof convexTest>,
  userId: string
): Promise<Id<"v2Posts">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const postId = await ctx.db.insert("v2Posts", {
      userId,
      brandId: "lower-db",
      channelId: "linkedin",
      platformId: "linkedin",
      title: "Lower dB post",
      content: "Test content",
      status: "draft",
      approvalState: "unapproved",
      timezone: "America/Los_Angeles",
      contentFingerprint: "Lower dB post\nTest content",
      createdAt: now,
      updatedAt: now,
    });
    const intentId = await ctx.db.insert("v2PublishingIntents", {
      postId,
      userId,
      brandId: "lower-db",
      channelId: "linkedin",
      platformId: "linkedin",
      timezone: "America/Los_Angeles",
      approvalState: "unapproved",
      contentFingerprint: "Lower dB post\nTest content",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("v2ProviderStates", {
      postId,
      intentId,
      providerId: "buffer",
      status: "not-submitted",
      createdAt: now,
      updatedAt: now,
    });
    return postId;
  });
}

describe("v2 publishing platform settings", () => {
  it("exposes getPostById for editor routing", () => {
    const publishing = readFileSync(publishingPath, "utf8");
    expect(publishing).toContain("export const getPostById = query");
    expect(publishing).toContain('args: { postId: v.string() }');
  });

  it("persists platform settings and clears approval", () => {
    const publishing = readFileSync(publishingPath, "utf8");
    expect(publishing).toContain("export const updatePlatformSettings = mutation");
    expect(publishing).toContain("platformSettings: args.platformSettings");
    expect(publishing).toContain('approvalState: "unapproved"');
    expect(publishing).toContain("post.platform_settings_change");
  });

  it("stores typed platform settings on v2Posts", () => {
    const schemaSource = readFileSync(schemaPath, "utf8");
    const v2Types = readFileSync(v2TypesPath, "utf8");

    expect(schemaSource).toContain("platformSettings: v.optional(v2PlatformSettings)");
    expect(v2Types).toContain("export type LinkedInPlatformSettings");
    expect(v2Types).toContain("export type RedditPlatformSettings");
    expect(v2Types).toContain("export type CorvoBlogPlatformSettings");
  });
});

describe("publishing cross-brand authorization", () => {
  it("denies setApproval on a lower-db post for corvo-only members", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const postId = await insertLowerDbPost(t, userId);

    await expect(
      asUser.mutation(api.publishing.setApproval, {
        postId,
        approvalState: "approved",
      })
    ).rejects.toThrow("Brand access denied");
  });

  it("denies updateContent on a lower-db post for corvo-only members", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const postId = await insertLowerDbPost(t, userId);

    await expect(
      asUser.mutation(api.publishing.updateContent, {
        postId,
        title: "Updated title",
      })
    ).rejects.toThrow("Brand access denied");
  });

  it("denies reschedule on a lower-db post for corvo-only members", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const postId = await insertLowerDbPost(t, userId);

    await expect(
      asUser.mutation(api.publishing.reschedule, {
        postId,
        scheduledDate: "2026-06-10",
      })
    ).rejects.toThrow("Brand access denied");
  });

  it("denies submitMockProvider on a lower-db post for corvo-only members", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const postId = await insertLowerDbPost(t, userId);

    await expect(
      asUser.mutation(api.publishing.submitMockProvider, {
        postId,
        mode: "success",
      })
    ).rejects.toThrow("Brand access denied");
  });

  it("auto-provisions workspace channels for a new signed-in user", async () => {
    const t = createTestHarness();
    const asUser = t.withIdentity({ subject: "fresh-user", name: "Fresh User" });

    const { postId } = await asUser.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "corvo-blog",
      title: "First blog draft",
      content: "Provisioned on first create.",
      scheduledDate: "2026-06-20",
    });

    const channel = await t.run(async (ctx) =>
      ctx.db
        .query("v2Channels")
        .withIndex("by_brand_and_channel", (q) =>
          q.eq("brandId", "corvo").eq("channelId", "corvo-blog")
        )
        .first()
    );
    const membership = await t.run(async (ctx) =>
      ctx.db
        .query("v2BrandMemberships")
        .withIndex("by_user_and_brand", (q) =>
          q.eq("userId", "fresh-user").eq("brandId", "corvo")
        )
        .first()
    );
    const post = await t.run(async (ctx) => ctx.db.get(postId));

    expect(channel?.providerId).toBe("github-pr");
    expect(membership?.role).toBe("owner");
    expect(post?.channelId).toBe("corvo-blog");
  });

  it("deletes a draft and related publishing records", async () => {
    const t = createTestHarness();
    const { asUser } = await setupCorvoOnlyMember(t);
    const { postId } = await asUser.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "linkedin",
      title: "Delete me",
      content: "Temporary draft",
    });

    await asUser.mutation(api.publishing.deletePost, { postId });

    const post = await t.run(async (ctx) => ctx.db.get(postId));
    const intents = await t.run(async (ctx) =>
      ctx.db
        .query("v2PublishingIntents")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .collect()
    );

    expect(post).toBeNull();
    expect(intents).toHaveLength(0);
  });

  it("allows setApproval on a corvo post for corvo members", async () => {
    const t = createTestHarness();
    const { asUser } = await setupCorvoOnlyMember(t);
    const { postId } = await asUser.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "linkedin",
      title: "Corvo post",
      content: "Allowed content",
    });

    await asUser.mutation(api.publishing.setApproval, {
      postId,
      approvalState: "approved",
    });

    const post = await t.run(async (ctx) => ctx.db.get(postId));
    expect(post?.approvalState).toBe("approved");
  });

  it("creates, accepts, and rejects variant posts linked to ideas", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const ideaId = await asUser.run(async (ctx) => {
      const now = Date.now();
      return await ctx.db.insert("capturedIdeas", {
        userId,
        brandId: "corvo",
        status: "inbox",
        tags: [],
        latestEntryPreview: "Variant source idea",
        lastCapturedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    });

    const { postId } = await asUser.mutation(api.publishing.createVariantPost, {
      ideaId,
      brandId: "corvo",
      channelId: "linkedin",
      title: "LinkedIn variant",
      content: "Generated draft body",
    });

    let post = await t.run(async (ctx) => ctx.db.get(postId));
    expect(post?.variantReviewStatus).toBe("pending");

    await asUser.mutation(api.publishing.acceptVariantPost, {
      postId,
      scheduledDate: "2026-06-20",
    });

    post = await t.run(async (ctx) => ctx.db.get(postId));
    expect(post?.variantReviewStatus).toBe("accepted");
    expect(post?.approvalState).toBe("approved");
    expect(post?.status).toBe("scheduled");

    const rejectId = (
      await asUser.mutation(api.publishing.createVariantPost, {
        ideaId,
        brandId: "corvo",
        channelId: "linkedin",
        title: "Reject me",
        content: "Another variant",
      })
    ).postId;

    await asUser.mutation(api.publishing.rejectVariantPost, { postId: rejectId });
    post = await t.run(async (ctx) => ctx.db.get(rejectId));
    expect(post?.variantReviewStatus).toBe("rejected");
    expect(post?.status).toBe("unavailable");
  });

  it("marks mock provider submissions as simulated", async () => {
    const t = createTestHarness();
    const { asUser } = await setupCorvoOnlyMember(t);
    const { postId } = await asUser.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "linkedin",
      title: "Simulated post",
      content: "Body",
      scheduledDate: "2026-06-20",
    });

    await asUser.mutation(api.publishing.setApproval, {
      postId,
      approvalState: "approved",
    });
    await asUser.mutation(api.publishing.submitMockProvider, {
      postId,
      mode: "success",
    });

    const providerState = await t.run(async (ctx) => {
      const intent = await ctx.db
        .query("v2PublishingIntents")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .first();
      return intent
        ? await ctx.db
            .query("v2ProviderStates")
            .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
            .first()
        : null;
    });

    expect(providerState?.simulated).toBe(true);
  });

  it("rejects Buffer live context for unapproved LinkedIn posts", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const { postId } = await asUser.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "linkedin",
      title: "Unapproved LinkedIn",
      content: "Must not hit Buffer",
      scheduledDate: "2026-06-20",
    });

    const context = await asUser.query(internal.publishing.getBufferSubmissionContext, {
      postId,
      userId,
    });

    expect(context.eligible).toBe(false);
    if (!context.eligible) {
      expect(context.reason).toBe("Post is not approved.");
    }
  });

  it("records Buffer submit attempt with provider post id and non-simulated state", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const { postId } = await asUser.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "linkedin",
      title: "Approved LinkedIn",
      content: "Queue me",
      scheduledDate: "2026-06-20",
      scheduledTime: "09:00",
    });
    await asUser.mutation(api.publishing.setApproval, {
      postId,
      approvalState: "approved",
    });

    const prepared = await asUser.query(internal.publishing.getBufferSubmissionContext, {
      postId,
      userId,
    });
    expect(prepared.eligible).toBe(true);
    if (!prepared.eligible) throw new Error("expected eligible");

    const recorded = await asUser.mutation(internal.publishing.recordBufferSubmitResult, {
      postId,
      userId,
      intentId: prepared.intentId,
      brandId: prepared.brandId,
      idempotencyKey: prepared.idempotencyKey,
      retryCount: prepared.retryCount,
      submissionSnapshot: {
        postId: prepared.submission.postId,
        brandId: prepared.submission.brandId,
        channelId: prepared.submission.channelId,
        title: prepared.submission.title,
        content: prepared.submission.content,
        scheduledDate: prepared.submission.scheduledDate,
        scheduledTime: prepared.submission.scheduledTime,
        timezone: prepared.submission.timezone,
      },
      ok: true,
      status: "success",
      providerStateStatus: "submitted",
      providerPostId: "buffer-post-123",
      sanitizedResponse: {
        providerId: "buffer",
        providerPostId: "buff...0123",
        accessToken: "should-not-persist",
      },
    });

    expect(recorded.submitted).toBe(true);

    const providerState = await t.run(async (ctx) => {
      const intent = await ctx.db
        .query("v2PublishingIntents")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .first();
      return intent
        ? await ctx.db
            .query("v2ProviderStates")
            .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
            .first()
        : null;
    });
    const attempt = await t.run(async (ctx) => ctx.db.get(recorded.attemptId));
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("v2AuditEvents")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .collect()
    );

    expect(providerState?.providerId).toBe("buffer");
    expect(providerState?.providerPostId).toBe("buffer-post-123");
    expect(providerState?.simulated).toBe(false);
    expect(providerState?.status).toBe("submitted");
    expect(attempt?.providerId).toBe("buffer");
    expect(attempt?.sanitizedResponse?.accessToken).toBe("[redacted]");
    expect(audits.some((event) => event.action === "provider.buffer_submit")).toBe(true);
  });

  it("records Buffer cancel round-trip against provider state", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const { postId } = await asUser.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "linkedin",
      title: "Cancel me",
      content: "Queued then cancelled",
      scheduledDate: "2026-06-21",
    });
    await asUser.mutation(api.publishing.setApproval, {
      postId,
      approvalState: "approved",
    });

    const prepared = await asUser.query(internal.publishing.getBufferSubmissionContext, {
      postId,
      userId,
    });
    if (!prepared.eligible) throw new Error("expected eligible");

    await asUser.mutation(internal.publishing.recordBufferSubmitResult, {
      postId,
      userId,
      intentId: prepared.intentId,
      brandId: prepared.brandId,
      idempotencyKey: prepared.idempotencyKey,
      retryCount: 0,
      submissionSnapshot: {
        postId: prepared.submission.postId,
        brandId: prepared.submission.brandId,
        channelId: prepared.submission.channelId,
        title: prepared.submission.title,
        content: prepared.submission.content,
        scheduledDate: prepared.submission.scheduledDate,
        scheduledTime: prepared.submission.scheduledTime,
        timezone: prepared.submission.timezone,
      },
      ok: true,
      status: "success",
      providerStateStatus: "submitted",
      providerPostId: "buffer-cancel-1",
      sanitizedResponse: { providerId: "buffer" },
    });

    const cancelContext = await asUser.query(internal.publishing.getBufferCancelContext, {
      postId,
      userId,
    });
    expect(cancelContext.eligible).toBe(true);
    if (!cancelContext.eligible) throw new Error("expected cancel eligible");
    expect(cancelContext.providerPostId).toBe("buffer-cancel-1");

    await asUser.mutation(internal.publishing.recordBufferCancelResult, {
      postId,
      userId,
      intentId: cancelContext.intentId,
      brandId: cancelContext.brandId,
      intentType: "cancel",
      ok: true,
      providerStateStatus: "cancel-intent-recorded",
      providerPostId: cancelContext.providerPostId,
      sanitizedResponse: { providerId: "buffer", deleted: true },
    });

    const providerState = await t.run(async (ctx) => {
      const intent = await ctx.db
        .query("v2PublishingIntents")
        .withIndex("by_post", (q) => q.eq("postId", postId))
        .first();
      return intent
        ? await ctx.db
            .query("v2ProviderStates")
            .withIndex("by_intent", (q) => q.eq("intentId", intent._id))
            .first()
        : null;
    });
    expect(providerState?.status).toBe("cancel-intent-recorded");
    expect(providerState?.simulated).toBe(false);
  });
});

describe("seedPreviewWorkspace", () => {
  const originalAllow = process.env.ALLOW_PREVIEW_SEED;

  beforeEach(() => {
    process.env.ALLOW_PREVIEW_SEED = "1";
  });

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.ALLOW_PREVIEW_SEED;
    } else {
      process.env.ALLOW_PREVIEW_SEED = originalAllow;
    }
  });

  it("seeds preview fixtures idempotently", async () => {
    const t = createTestHarness();
    const asUser = t.withIdentity(CORVO_ONLY_USER);

    const first = await asUser.mutation(api.publishing.seedPreviewWorkspace, {});
    expect(first.ideasCreated).toBe(1);
    expect(first.postsCreated).toBe(3);

    const second = await asUser.mutation(api.publishing.seedPreviewWorkspace, {});
    expect(second.skipped).toBeGreaterThanOrEqual(4);
    expect(second.ideasCreated).toBe(0);
    expect(second.postsCreated).toBe(0);
  });
});

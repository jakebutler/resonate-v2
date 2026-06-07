import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
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
});

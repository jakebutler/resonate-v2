import { convexTest } from "convex-test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const publishingPath = join(process.cwd(), "convex/v2Publishing.ts");
const schemaPath = join(process.cwd(), "convex/schema.ts");
const v2TypesPath = join(process.cwd(), "lib/v2.ts");

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
    expect(v2Types).toContain("export type V2LinkedInPlatformSettings");
    expect(v2Types).toContain("export type V2RedditPlatformSettings");
    expect(v2Types).toContain("export type V2CorvoBlogPlatformSettings");
  });
});

describe("v2Publishing cross-brand authorization", () => {
  it("denies setApproval on a lower-db post for corvo-only members", async () => {
    const t = createTestHarness();
    const { asUser, userId } = await setupCorvoOnlyMember(t);
    const postId = await insertLowerDbPost(t, userId);

    await expect(
      asUser.mutation(api.v2Publishing.setApproval, {
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
      asUser.mutation(api.v2Publishing.updateContent, {
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
      asUser.mutation(api.v2Publishing.reschedule, {
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
      asUser.mutation(api.v2Publishing.submitMockProvider, {
        postId,
        mode: "success",
      })
    ).rejects.toThrow("Brand access denied");
  });

  it("allows setApproval on a corvo post for corvo members", async () => {
    const t = createTestHarness();
    const { asUser } = await setupCorvoOnlyMember(t);
    const { postId } = await asUser.mutation(api.v2Publishing.createPostWithIntent, {
      brandId: "corvo",
      channelId: "linkedin",
      title: "Corvo post",
      content: "Allowed content",
    });

    await asUser.mutation(api.v2Publishing.setApproval, {
      postId,
      approvalState: "approved",
    });

    const post = await t.run(async (ctx) => ctx.db.get(postId));
    expect(post?.approvalState).toBe("approved");
  });
});

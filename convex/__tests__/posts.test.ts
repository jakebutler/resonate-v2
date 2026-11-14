import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it } from "vitest";
import schema from "../schema";

const api = anyApi;
const modules = import.meta.glob("../**/*.ts");
describe("legacy editor upload boundary", () => {
  it("requires authentication and tells an older composer to reload before upload", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.posts.generateUploadUrl, {})).rejects.toThrow("Unauthorized");
    await expect(t.withIdentity({ subject: "author" }).mutation(api.posts.generateUploadUrl, {})).rejects.toThrow("Reload the updated composer before uploading an image");
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toEqual([]);
  });

  it("keeps unregistered legacy upload bytes inaccessible to attachment writes", async () => {
    const t = convexTest(schema, modules);
    const storageId = await t.run(ctx => ctx.storage.store(new Blob(["SPECULATIVE unregistered image"], { type: "image/png" })));
    await expect(t.withIdentity({ subject: "author" }).mutation(api.posts.create, { type: "blog", title: "Fictional draft", content: "Offline test only", status: "draft", heroImageId: storageId })).rejects.toThrow(/Storage asset not found|access denied/i);
    expect(await t.run(ctx => ctx.db.query("posts").collect())).toEqual([]);
  });
});

describe("legacy post row ownership", () => {
  const createPost = (t: ReturnType<typeof convexTest>, subject: string) =>
    t.withIdentity({ subject }).mutation(api.posts.create, {
      type: "blog",
      title: "Owned draft",
      content: "Owned content",
      status: "draft",
    });

  const membershipRow = (userId: string) => ({
    userId,
    brandId: "corvo" as const,
    role: "owner" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it("stamps the creating user as owner", async () => {
    const t = convexTest(schema, modules);
    await createPost(t, "author");
    const posts = await t.run(ctx => ctx.db.query("posts").collect());
    expect(posts).toHaveLength(1);
    expect(posts[0].userId).toBe("author");
  });

  it("lets the owner update, read, and delete their post", async () => {
    const t = convexTest(schema, modules);
    const postId = await createPost(t, "author");
    const asAuthor = t.withIdentity({ subject: "author" });
    await asAuthor.mutation(api.posts.update, { id: postId, title: "Edited" });
    expect((await asAuthor.query(api.posts.getById, { id: postId })).title).toBe("Edited");
    await asAuthor.mutation(api.posts.remove, { id: postId });
    expect(await t.run(ctx => ctx.db.query("posts").collect())).toEqual([]);
  });

  it("throws Post not found when another user updates, reads, or deletes the post", async () => {
    const t = convexTest(schema, modules);
    const postId = await createPost(t, "author");
    const asAttacker = t.withIdentity({ subject: "attacker" });
    await expect(asAttacker.query(api.posts.getById, { id: postId })).rejects.toThrow("Post not found");
    await expect(asAttacker.mutation(api.posts.update, { id: postId, title: "Hijacked" })).rejects.toThrow("Post not found");
    await expect(asAttacker.mutation(api.posts.remove, { id: postId })).rejects.toThrow("Post not found");
    const post = await t.run(ctx => ctx.db.get(postId));
    expect(post?.title).toBe("Owned draft");
  });

  it("keeps historical ownerless rows restricted to Corvo workspace members", async () => {
    const t = convexTest(schema, modules);
    const postId = await t.run(ctx => ctx.db.insert("posts", {
      type: "blog",
      content: "Historical row",
      status: "draft",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    const asOutsider = t.withIdentity({ subject: "outsider" });
    await expect(asOutsider.query(api.posts.getById, { id: postId })).rejects.toThrow("Brand access denied");
    const asCorvoMember = t.withIdentity({ subject: "member" });
    await t.run(async ctx => { await ctx.db.insert("v2BrandMemberships", membershipRow("member")); });
    expect((await asCorvoMember.query(api.posts.getById, { id: postId })).content).toBe("Historical row");
    await asCorvoMember.mutation(api.posts.update, { id: postId, title: "Team edit" });
    await asCorvoMember.mutation(api.posts.remove, { id: postId });
    expect(await t.run(ctx => ctx.db.query("posts").collect())).toEqual([]);
  });
});

describe("posts.list scoping", () => {
  const createPost = (t: ReturnType<typeof convexTest>, subject: string) =>
    t.withIdentity({ subject }).mutation(api.posts.create, {
      type: "blog",
      title: `${subject} draft`,
      content: "Owned content",
      status: "draft",
    });

  const membershipRow = (userId: string) => ({
    userId,
    brandId: "corvo" as const,
    role: "owner" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  it("shows the owner only their own rows", async () => {
    const t = convexTest(schema, modules);
    const authorPostId = await createPost(t, "author");
    await createPost(t, "attacker");
    const titles = (await t.withIdentity({ subject: "author" }).query(api.posts.list, {})).map(p => p.title);
    expect(titles).toEqual(["author draft"]);
    expect(titles).not.toContain("attacker draft");
    expect(await t.run(ctx => ctx.db.get(authorPostId))).not.toBeNull();
  });

  it("excludes foreign rows even with a type filter", async () => {
    const t = convexTest(schema, modules);
    await createPost(t, "author");
    await t.withIdentity({ subject: "attacker" }).mutation(api.posts.create, {
      type: "linkedin",
      title: "attacker linkedin",
      content: "Owned content",
      status: "draft",
    });
    const asAuthor = t.withIdentity({ subject: "author" });
    expect((await asAuthor.query(api.posts.list, {})).map(p => p.title)).toEqual(["author draft"]);
    expect((await asAuthor.query(api.posts.list, { type: "linkedin" })).map(p => p.title)).toEqual([]);
  });

  it("shows historical ownerless rows only to Corvo workspace members", async () => {
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert("posts", {
      type: "blog",
      content: "Historical row",
      status: "published",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    await createPost(t, "attacker");
    await t.run(ctx => ctx.db.insert("v2BrandMemberships", membershipRow("member")));

    expect(await t.withIdentity({ subject: "outsider" }).query(api.posts.list, {})).toEqual([]);
    const memberTitles = (await t.withIdentity({ subject: "member" }).query(api.posts.list, {})).map(p => p.content);
    expect(memberTitles ?? memberTitles).toEqual(["Historical row"]);
    const attackerTitles = (await t.withIdentity({ subject: "attacker" }).query(api.posts.list, {})).map(p => p.title);
    expect(attackerTitles).toEqual(["attacker draft"]);
  });
});

describe("backfill upsert ownership and bounds", () => {
  const membershipRow = (userId: string) => ({
    userId,
    brandId: "corvo" as const,
    role: "owner" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  type ImportedPostArgs = {
    type: "blog" | "linkedin";
    title?: string;
    content: string;
    status: "published";
    scheduledDate: string;
    externalUrl: string;
    publishedAt: number;
  };

  const importedPost = (overrides: Partial<ImportedPostArgs> = {}): ImportedPostArgs => ({
    type: "blog" as const,
    content: "Imported content",
    status: "published" as const,
    scheduledDate: "2026-11-14",
    externalUrl: "https://www.corvolabs.com/blog/hello",
    publishedAt: Date.now(),
    ...overrides,
  });

  it("stamps inserted rows with the caller and lets them re-upsert their own row", async () => {
    const t = convexTest(schema, modules);
    const asAuthor = t.withIdentity({ subject: "author" });
    const first = await asAuthor.mutation(api.backfill.upsertMany, { posts: [importedPost()] });
    expect(first).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    const [row] = await t.run(ctx => ctx.db.query("posts").collect());
    expect(row.userId).toBe("author");
    const second = await asAuthor.mutation(api.backfill.upsertMany, {
      posts: [importedPost({ content: "Imported content v2" })],
    });
    expect(second).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
  });

  it("refuses to patch a post that another user imported", async () => {
    const t = convexTest(schema, modules);
    await t.withIdentity({ subject: "author" }).mutation(api.backfill.upsertMany, {
      posts: [importedPost()],
    });
    const asAttacker = t.withIdentity({ subject: "attacker" });
    await expect(asAttacker.mutation(api.backfill.upsertMany, {
      posts: [importedPost({ content: "Hijacked content" })],
    })).rejects.toThrow("Post not found");
    const [row] = await t.run(ctx => ctx.db.query("posts").collect());
    expect(row.content).toBe("Imported content");
    expect(row.userId).toBe("author");
  });

  it("keeps historical ownerless rows updatable only by Corvo members", async () => {
    const t = convexTest(schema, modules);
    await t.run(ctx => ctx.db.insert("posts", {
      type: "blog",
      content: "Historical content",
      status: "published",
      scheduledDate: "2026-11-14",
      externalUrl: "https://www.corvolabs.com/blog/legacy",
      publishedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    const asOutsider = t.withIdentity({ subject: "outsider" });
    await expect(asOutsider.mutation(api.backfill.upsertMany, {
      posts: [importedPost({ externalUrl: "https://www.corvolabs.com/blog/legacy", content: "Outsider edit" })],
    })).rejects.toThrow("Brand access denied");

    await t.run(ctx => ctx.db.insert("v2BrandMemberships", membershipRow("member")));
    const asCorvoMember = t.withIdentity({ subject: "member" });
    const result = await asCorvoMember.mutation(api.backfill.upsertMany, {
      posts: [importedPost({ externalUrl: "https://www.corvolabs.com/blog/legacy", content: "Corvo edit" })],
    });
    expect(result).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    const [row] = await t.run(ctx => ctx.db.query("posts").collect());
    expect(row.content).toBe("Corvo edit");
  });

  it("enforces the bounded batch size with a clear error", async () => {
    const t = convexTest(schema, modules);
    const oversized = Array.from({ length: 101 }, (_, i) =>
      importedPost({ externalUrl: `https://www.corvolabs.com/blog/post-${i}` })
    );
    await expect(
      t.withIdentity({ subject: "author" }).mutation(api.backfill.upsertMany, { posts: oversized })
    ).rejects.toThrow(/limited to 100/);
    expect(await t.run(ctx => ctx.db.query("posts").collect())).toEqual([]);
  });
});

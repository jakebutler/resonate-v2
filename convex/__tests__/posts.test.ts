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

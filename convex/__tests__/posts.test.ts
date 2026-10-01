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

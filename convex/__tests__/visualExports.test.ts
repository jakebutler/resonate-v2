// @vitest-environment node
import { createHash } from "node:crypto";
import sharp from "sharp";
import { anyApi } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";

const modules = import.meta.glob("../**/*.ts");

describe("owned immutable hero export", () => {
  it("prepares the exact persisted source into reviewable owned export bytes", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fixture: inspection", content: "A fictional raven inspects a gear." });
    await user.mutation(api.visualProfiles.saveRevision, { brandId: "corvo", expectedRevisionId: null,
      guidance: { artDirection: "Paper fixture", palette: [{ name: "Teal", color: "#2e5b60" }], mascotGuidance: "Raven", compositionGuidance: "Action", textPolicy: "None", heroChartPolicy: "None" }, referenceBindings: [], defaultRoute: null });
    const attemptId = await user.mutation(api.visualWorkflow.requestPlan, { postId, operationKey: "fixture-plan" });
    const source = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#2e5b60" } }).png().toBuffer();
    const versionId = await t.run(async ctx => {
      const attempt = (await ctx.db.get(attemptId))!;
      const planId = await ctx.db.insert("v2VisualPlans", { userId: "fixture-author", brandId: "corvo", postId, attemptId, input: attempt.input, scenes: [], status: "incomplete", reasons: ["Export fixture only"], createdAt: 1 });
      const storageId = await ctx.storage.store(new Blob([Uint8Array.from(source).buffer], { type: "image/png" }));
      return ctx.db.insert("v2VisualVersions", { userId: "fixture-author", brandId: "corvo", postId, attemptId, planId, parentVersionId: null, feedback: null, input: attempt.input, storageId, sha256: createHash("sha256").update(source).digest("hex"), contentType: "image/png", width: 900, height: 1200, bytes: source.length, provider: "offline-fixture", model: "offline-fixture", createdAt: 1 });
    });
    const prepared = await user.action(anyApi.visualExports.prepareHero, { versionId });
    const persisted = await t.run(ctx => ctx.db.get(versionId));
    expect(persisted?.exportHash).toBe(prepared.exportHash);
    expect(persisted?.approvedAt).toBeUndefined();
    const exported = await t.run(async ctx => (await ctx.storage.get(persisted!.exportStorageId!))!.arrayBuffer());
    const bytes = new Uint8Array(exported);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(prepared.exportHash);
    expect(await sharp(bytes).metadata()).toMatchObject({ width: 1600, height: 900, format: "webp" });
    expect(bytes.byteLength).toBeLessThan(150_000);
    const repeated = await user.action(anyApi.visualExports.prepareHero, { versionId });
    expect(repeated.exportStorageId).toBe(prepared.exportStorageId);
    expect(repeated.exportHash).toBe(prepared.exportHash);
    await expect(t.withIdentity({ subject: "foreign-author" }).action(anyApi.visualExports.prepareHero, { versionId })).rejects.toThrow("Post not found");
  });
});

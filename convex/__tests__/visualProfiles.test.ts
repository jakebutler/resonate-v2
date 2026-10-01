// @vitest-environment node
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { anyApi } from "convex/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { corvoSeedAssets, corvoSeed, CORVO_VISUAL_SEED_ID } from "../../lib/visualSeed";

const modules = import.meta.glob("../**/*.ts");
const profileApi = api.visualProfiles;
const OWNER = { subject: "visual-owner" };
const VIEWER = { subject: "visual-viewer" };
const FOREIGN_OWNER = { subject: "foreign-owner" };
const EDITOR = { subject: "visual-editor" };
const article7Context = { title: corvoSeed.manifest.approved_heroes.find(hero => hero.article === 7)!.title, blogSlug: "what-corvo-labs-learned-building-an-ai-editorial-workflow", channelId: "corvo-blog" };
const guidance = {
  artDirection: "Tactile layered matte paper under neutral daylight.",
  palette: [{ name: "Off white", color: "#ECE9E2" }],
  mascotGuidance: "A composed raven, when the scene calls for one.",
  compositionGuidance: "Keep the consequential action visible in a wide crop.",
  textPolicy: "Only the requested short labels.",
  heroChartPolicy: "Illustrative graphics carry no empirical data.",
};
function defined<T>(value: T | null): T {
  expect(value).not.toBeNull();
  return value!;
}

async function harness() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("v2BrandMemberships", {
      userId: OWNER.subject, brandId: "corvo", role: "owner",
      createdAt: Date.now(), updatedAt: Date.now(),
    });
  });
  return t;
}

describe("persistent visual profiles", () => {
  it("rejects an untrusted importer destination during dry-run preflight without exposing authentication values", () => {
    const token = "TEST_ONLY_AUTHORIZATION_HEADER_VALUE";
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/import-visual-seed.mjs", import.meta.url)), "--url", "https://untrusted.example"], { encoding: "utf8", env: { ...process.env, RESONATE_VISUAL_IMPORT_TOKEN: token } });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/destination validation/);
    expect(result.stderr + result.stdout).not.toContain(token);
  });
  it("accepts only canonical Convex origins or exact HTTP loopback and formats failures without raw headers", async () => {
    const { validateImportDestination, formatImportFailure } = await import("../../scripts/import-visual-seed.mjs");
    for (const url of ["https://trusted-test-123.convex.cloud", "https://trusted-test-123.convex.site/", "http://localhost:3210", "http://127.0.0.1:3210/", "http://[::1]:3210"]) expect(validateImportDestination(url)).toBe(new URL(url).origin);
    for (const url of ["https://untrusted.example", "https://trusted.convex.cloud.evil", "https://sub.trusted.convex.cloud", "https://trusted.convex.cloud:444", "http://trusted.convex.cloud", "ftp://localhost", "https://localhost", "http://127.1:3210", "http://2130706433:3210", "http://0.0.0.0:3210", "http://localhost:65536", "http://localhost:0", "https://TOKEN@trusted.convex.cloud", "https://trusted.convex.cloud/path", "https://trusted.convex.site?token=TOKEN", "https://trusted.convex.cloud#TOKEN", " https://trusted.convex.cloud", "https://trusted.\nconvex.cloud"]) expect(() => validateImportDestination(url)).toThrow(/canonical HTTPS Convex/);
    const message = formatImportFailure(new Error("Authorization: Bearer TOKEN; Cookie: SECRET_HEADER"), "TOKEN");
    expect(message).not.toMatch(/TOKEN|Authorization|Bearer|Cookie|SECRET_HEADER/);
    expect(message).toContain("argument preparation");
    const cli = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/import-visual-seed.mjs", import.meta.url)), "--apply", "--url", "https://TOKEN@trusted.convex.cloud"], { encoding: "utf8", env: { ...process.env, RESONATE_VISUAL_IMPORT_TOKEN: "TOKEN" } });
    expect(cli.status).toBe(1);
    expect(cli.stderr + cli.stdout).not.toContain("TOKEN");
    expect(cli.stderr).toContain("destination validation");
  });
  it("preflights an explicit article-7 title before any import or local source upload", () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../scripts/import-visual-seed.mjs", import.meta.url)), "--article-7-post-id", "fixture-id", "--article-7-title", "Different article"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exact manifest title");
    expect(result.stdout).not.toContain("Verified");
  });
  it("requires the viewed saved context on both exception writes and rejects a seeded binding to a different title", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const saved = await user.mutation(profileApi.saveRevision, { brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null });
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: article7Context.title, content: "Article seven" });
    await t.run(async ctx => {
      await ctx.db.patch(postId, { blogSlug: article7Context.blogSlug });
      await ctx.db.insert("v2VisualSeedImports", { brandId: "corvo", seedId: CORVO_VISUAL_SEED_ID, sourceDocumentSha256: corvoSeed.manifest.source_sha256, initialProfileRevisionId: saved.profileRevisionId, sourceDocument: corvoSeed.sourceDocument, manifestJson: JSON.stringify(corvoSeed.manifest), finalDirectionsJson: JSON.stringify(corvoSeed.finalDirections), lessonsJson: JSON.stringify(corvoSeed.lessons), importedBy: OWNER.subject, importedAt: 1 });
    });
    await expect(user.mutation(anyApi.visualProfiles.setPostException, { postId, expectedExceptionId: null, guidance: "Authored local instruction" })).rejects.toThrow();
    await expect(user.mutation(anyApi.visualProfiles.applyCorvoArticle7Exception, { postId, expectedExceptionId: null })).rejects.toThrow();
    await expect(user.mutation(profileApi.applyCorvoArticle7Exception, { postId, expectedExceptionId: null, expectedPostContext: { ...article7Context, title: "Stale viewed title" } })).rejects.toThrow(/Saved post context changed/);
    await t.run(ctx => ctx.db.patch(postId, { title: "Unrelated article with the old slug" }));
    await expect(user.mutation(profileApi.applyCorvoArticle7Exception, { postId, expectedExceptionId: null, expectedPostContext: { ...article7Context, title: "Unrelated article with the old slug" } })).rejects.toThrow(/article 7/);
    await t.run(ctx => ctx.db.patch(postId, { title: article7Context.title }));
    const applied = await user.mutation(profileApi.applyCorvoArticle7Exception, { postId, expectedExceptionId: null, expectedPostContext: article7Context });
    expect(defined(await user.query(profileApi.resolveForPost, { postId })).postExceptionId).toBe(applied.postExceptionId);
  });
  it("rejects a post exception click after its viewed saved context changes", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Viewed title", content: "Fixture" });
    await user.mutation(api.publishing.updateContent, { postId, title: "Changed title" });
    await expect(user.mutation(anyApi.visualProfiles.setPostException, { postId, expectedExceptionId: null, guidance: "Explicit local instruction", expectedPostContext: { title: "Viewed title", channelId: "corvo-blog" } })).rejects.toThrow("Saved post context changed");
    expect(await t.run(ctx => ctx.db.query("v2VisualPostExceptions").take(1))).toEqual([]);
  });
  it("denies every profile configuration and import write to viewers", async () => {
    const t = await harness();
    const { postId } = await t.withIdentity(OWNER).mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Viewer-owned saved fixture", content: "Fixture",
    });
    await t.run(async ctx => {
      await ctx.db.insert("v2BrandMemberships", {
        userId: VIEWER.subject, brandId: "corvo", role: "viewer", createdAt: Date.now(), updatedAt: Date.now(),
      });
      await ctx.db.patch(postId, { userId: VIEWER.subject });
    });
    const viewer = t.withIdentity(VIEWER);
    await expect(viewer.action(profileApi.uploadReference, {
      brandId: "corvo", fileName: "x.png", contentType: "image/png", bytes: new ArrayBuffer(0),
    })).rejects.toThrow(/write access denied/);
    await expect(viewer.action(profileApi.uploadSeedAsset, {
      brandId: "corvo", assetKey: "raven-character-sheet", bytes: new ArrayBuffer(0),
    })).rejects.toThrow(/write access denied/);
    await expect(viewer.mutation(profileApi.importCorvoSeed, { brandId: "corvo" })).rejects.toThrow(/write access denied/);
    await expect(viewer.mutation(profileApi.setPostException, {
      postId, expectedExceptionId: null, guidance: "Authored fixture", expectedPostContext: { title: "Stale viewer context", channelId: "corvo-blog" },
    })).rejects.toThrow(/write access denied/);
    await expect(viewer.mutation(profileApi.applyCorvoArticle7Exception, {
      postId, expectedExceptionId: null, expectedPostContext: { title: "Stale viewer context", channelId: "corvo-blog" },
    })).rejects.toThrow(/write access denied/);
  });

  it("rejects malformed and oversized image inputs before storing owned references", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const validMagic = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    for (const args of [
      { fileName: "valid.png", contentType: "image/png", bytes: new ArrayBuffer(0) },
      { fileName: "valid.png", contentType: "image/png", bytes: new ArrayBuffer(5 * 1024 * 1024 + 1) },
      { fileName: "valid.png", contentType: "image/png", bytes: Uint8Array.from([1, 2, 3]).buffer },
      { fileName: "valid.png", contentType: "image/svg+xml", bytes: validMagic },
      { fileName: "../unsafe.png", contentType: "image/png", bytes: validMagic },
    ]) await expect(user.action(profileApi.uploadReference, { brandId: "corvo", ...args })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("v2VisualReferences").take(1))).toEqual([]);
  });
  it("reports preserved authored guidance separately from seeded guidance and marks historical archives as archive-only", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const authored = await user.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null,
    });
    // Trusted fixture rows stand in for already verified source-byte uploads; no public provenance input exists.
    await t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob(["fixture"], { type: "image/png" }));
      for (const asset of corvoSeedAssets) await ctx.db.insert("v2VisualReferences", {
        brandId: "corvo", storageId, sha256: asset.sha256, byteLength: 7, contentType: "image/png",
        fileName: asset.fileName, kind: "approved_corvo_seed", seedAssetKey: asset.key, article: asset.article,
        approvalProvenance: asset.approvalProvenance, sourceDocumentSha256: corvoSeed.manifest.source_sha256,
        sourceRecord: "trusted test fixture", historicalProvider: corvoSeed.manifest.historical_provider,
        historicalModelId: null, uploadedBy: OWNER.subject, createdAt: Date.now(),
      });
    });
    const imported = await user.mutation(profileApi.importCorvoSeed, { brandId: "corvo" });
    expect(imported.profileRevisionId).toBe(authored.profileRevisionId);
    expect(imported.seededProfile).toBe(false);
    expect(await user.mutation(profileApi.importCorvoSeed, { brandId: "corvo" })).toEqual(imported);
    const current = defined(await user.query(profileApi.getProfile, { brandId: "corvo" }));
    expect(current.revision.referenceBindings).toEqual([]);
    expect(current.revision.seedId).toBeNull();
    const archive = defined(await user.query(profileApi.getSeedArchive, { brandId: "corvo" }));
    expect(archive.archiveOnly).toBe(true);
    expect(archive.finalDirectionsJson).toContain("## E. Next handoff");
    expect(archive.lessonsSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(archive.finalDirectionsSha256).toMatch(/^[a-f0-9]{64}$/);
    await t.run(async ctx => {
      for (const [userId, role] of [[VIEWER.subject, "viewer"], [EDITOR.subject, "editor"]] as const) await ctx.db.insert("v2BrandMemberships", { userId, brandId: "corvo", role, createdAt: 1, updatedAt: 1 });
    });
    await expect(t.withIdentity(VIEWER).query(profileApi.getSeedArchive, { brandId: "corvo" })).rejects.toThrow(/access denied/);
    expect(await t.withIdentity(EDITOR).query(profileApi.getSeedArchive, { brandId: "corvo" })).toEqual(archive);
    expect((await t.withIdentity(VIEWER).query(profileApi.getSeedStatus, { brandId: "corvo" })).imported).toBe(true);
  });
  it("omits a seeded article 7 exception after its source association changes and rejects duplicate slug mappings", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const saved = await user.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null,
    });
    const article7 = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: article7Context.title, content: "Article seven",
    });
    const other = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Other", content: "Other article",
    });
    const slug = "what-corvo-labs-learned-building-an-ai-editorial-workflow";
    await t.run(ctx => ctx.db.patch(article7.postId, { blogSlug: slug }));
    await expect(user.mutation(profileApi.applyCorvoArticle7Exception, { postId: article7.postId, expectedExceptionId: null, expectedPostContext: article7Context }))
      .rejects.toThrow(/Import the approved Corvo seed first/);
    await t.run(ctx => ctx.db.insert("v2VisualSeedImports", {
      brandId: "corvo", seedId: CORVO_VISUAL_SEED_ID, sourceDocumentSha256: corvoSeed.manifest.source_sha256,
      initialProfileRevisionId: saved.profileRevisionId, sourceDocument: corvoSeed.sourceDocument,
      manifestJson: JSON.stringify(corvoSeed.manifest), finalDirectionsJson: JSON.stringify(corvoSeed.finalDirections),
      lessonsJson: JSON.stringify(corvoSeed.lessons), importedBy: OWNER.subject, importedAt: Date.now(),
    }));
    await expect(user.mutation(profileApi.applyCorvoArticle7Exception, { postId: other.postId, expectedExceptionId: null, expectedPostContext: { title: "Other", channelId: "corvo-blog" } }))
      .rejects.toThrow(/article 7/);
    await user.mutation(profileApi.applyCorvoArticle7Exception, { postId: article7.postId, expectedExceptionId: null, expectedPostContext: article7Context });
    const before = defined(await user.query(profileApi.resolveForPost, { postId: article7.postId }));
    const pin = { profileRevisionId: before.profileRevisionId, referenceIds: before.referenceIds,
      lessonIds: before.lessonIds, postExceptionId: before.postExceptionId };
    await t.run(ctx => ctx.db.patch(article7.postId, { title: "A newly unrelated article" }));
    expect(defined(await user.query(profileApi.resolveForPost, { postId: article7.postId })).postExceptionId).toBeNull();
    await expect(user.query(profileApi.resolveFromPin, { postId: article7.postId, pin })).rejects.toThrow(/association changed/);
    await t.run(async ctx => {
      await ctx.db.patch(article7.postId, { title: article7Context.title, blogSlug: "unrelated-slug" });
    });
    expect(defined(await user.query(profileApi.resolveForPost, { postId: article7.postId })).postExceptionId).toBeNull();
    await t.run(async ctx => {
      await ctx.db.patch(article7.postId, { blogSlug: slug });
      await ctx.db.patch(other.postId, { title: article7Context.title, blogSlug: slug });
    });
    expect(defined(await user.query(profileApi.resolveForPost, { postId: article7.postId })).postExceptionId).toBeNull();
    await expect(user.query(profileApi.resolveFromPin, { postId: article7.postId, pin })).rejects.toThrow(/association changed/);
    await expect(user.mutation(profileApi.applyCorvoArticle7Exception, { postId: other.postId, expectedExceptionId: null, expectedPostContext: article7Context }))
      .rejects.toThrow(/unique/);
    await t.run(async ctx => {
      await ctx.db.patch(other.postId, { blogSlug: "other" });
      await ctx.db.patch(before.postExceptionId!, { brandId: "lower-db" });
    });
    expect(defined(await user.query(profileApi.resolveForPost, { postId: article7.postId })).postExceptionId).toBeNull();
  });
  it("retrieves the highest lesson revision despite later backfill and never borrows another post's lesson", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const first = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "First", content: "First article",
    });
    const second = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Second", content: "Second article",
    });
    await t.run(async ctx => {
      const base = {
        brandId: "corvo" as const, key: "backfilled", role: "image_generator" as const, sceneTags: ["physical"],
        modelScope: null, postId: null, title: "Connection", provenance: "reflection" as const,
        sourceDocumentSha256: null, sourceRecord: "fixture", exampleArticles: [], evidence: [],
        validation: "untested" as const, oneShotValidation: "not_tested" as const, changesBrandProfile: false as const,
        createdBy: OWNER.subject, createdAt: Date.now(),
      };
      await ctx.db.insert("v2VisualLessons", { ...base, revision: 2, instruction: "Current" });
      await ctx.db.insert("v2VisualLessons", { ...base, revision: 1, instruction: "Superseded backfill" });
      await ctx.db.insert("v2VisualLessons", { ...base, key: "other-post", revision: 1, instruction: "Other post only", postId: second.postId });
    });
    const retrieved = await user.query(profileApi.retrieveLessons, {
      brandId: "corvo", role: "image_generator", sceneTags: ["physical"], postId: first.postId,
    });
    expect(retrieved.map(lesson => [lesson.key, lesson.revision, lesson.instruction])).toEqual([["backfilled", 2, "Current"]]);
  });
  it("retains older seeded lesson keys after more than 128 newer same-role history rows", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const seed = corvoSeed.lessons.find(lesson => lesson.role === "image_generator")!;
    await t.run(async ctx => {
      const base = { brandId: "corvo" as const, role: "image_generator" as const, sceneTags: seed.applies_when, modelScope: null, postId: null, title: seed.title, instruction: seed.instruction,
        provenance: "seeded_observation" as const, sourceDocumentSha256: corvoSeed.manifest.source_sha256, sourceRecord: "trusted fixture", exampleArticles: [], evidence: [], validation: "observation" as const, oneShotValidation: "not_tested" as const, changesBrandProfile: false as const, createdBy: OWNER.subject, createdAt: 1 };
      await ctx.db.insert("v2VisualLessons", { ...base, key: seed.id, revision: 1 });
      for (let revision = 1; revision <= 140; revision++) await ctx.db.insert("v2VisualLessons", { ...base, key: "newer-history", revision, sceneTags: ["unrelated-scene"] });
    });
    const lessons = await user.query(profileApi.retrieveLessons, { brandId: "corvo", role: "image_generator", sceneTags: seed.applies_when });
    expect(lessons.map(lesson => lesson.key)).toEqual([seed.id]);
  });
  it("retrieves a complete 512-row lesson history and fails closed rather than silently truncating overflow", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const base = { brandId: "corvo" as const, key: "bounded", role: "image_generator" as const, sceneTags: ["physical"], modelScope: null, postId: null, title: "Connection", instruction: "Show the attachment", provenance: "reflection" as const, sourceDocumentSha256: null, sourceRecord: "fixture", exampleArticles: [], evidence: [], validation: "untested" as const, oneShotValidation: "not_tested" as const, changesBrandProfile: false as const, createdBy: OWNER.subject, createdAt: 1 };
    await t.run(async ctx => { for (let revision = 1; revision <= 512; revision++) await ctx.db.insert("v2VisualLessons", { ...base, revision }); });
    expect((await user.query(profileApi.retrieveLessons, { brandId: "corvo", role: "image_generator", sceneTags: ["physical"] }))[0].revision).toBe(512);
    await t.run(ctx => ctx.db.insert("v2VisualLessons", { ...base, revision: 513 }));
    await expect(user.query(profileApi.retrieveLessons, { brandId: "corvo", role: "image_generator", sceneTags: ["physical"] })).rejects.toThrow(/Lesson history exceeds.*512/);
  });
  it("rejects an ambiguous highest lesson revision instead of choosing by arrival order", async () => {
    const t = await harness();
    const base = { brandId: "corvo" as const, key: "duplicate-current", revision: 2, role: "image_generator" as const, sceneTags: ["physical"], modelScope: null, postId: null, title: "Connection", instruction: "Show the attachment", provenance: "reflection" as const, sourceDocumentSha256: null, sourceRecord: "fixture", exampleArticles: [], evidence: [], validation: "untested" as const, oneShotValidation: "not_tested" as const, changesBrandProfile: false as const, createdBy: OWNER.subject, createdAt: 1 };
    await t.run(async ctx => {
      await ctx.db.insert("v2VisualLessons", base);
      await ctx.db.insert("v2VisualLessons", { ...base, revision: 1 });
      await ctx.db.insert("v2VisualLessons", { ...base, instruction: "Conflicting highest revision", role: "creative_director" });
    });
    await expect(t.withIdentity(OWNER).query(profileApi.retrieveLessons, { brandId: "corvo", role: "image_generator", sceneTags: ["physical"] })).rejects.toThrow(/Ambiguous current lesson revision/);
  });
  it("reloads an exact full pin after newer profile, lesson and exception revisions, rejecting foreign pinned IDs", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const saved = await user.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null,
    });
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Pinned scene", content: "Original article",
    });
    const lessonId = await t.run(ctx => ctx.db.insert("v2VisualLessons", {
      brandId: "corvo", key: "pin-test", revision: 1, role: "image_generator", sceneTags: [],
      modelScope: null, postId, title: "Original", instruction: "Original instruction",
      provenance: "reflection", sourceDocumentSha256: null, sourceRecord: "fixture",
      exampleArticles: [], evidence: [], validation: "untested", oneShotValidation: "not_tested",
      changesBrandProfile: false, createdBy: OWNER.subject, createdAt: Date.now(),
    }));
    const firstException = await user.mutation(profileApi.setPostException, {
      postId, expectedExceptionId: null, guidance: "Original authored exception", expectedPostContext: { title: "Pinned scene", channelId: "corvo-blog" },
    });
    const resolved = defined(await user.query(profileApi.resolveForPost, { postId }));
    const pin = {
      profileRevisionId: resolved.profileRevisionId, referenceIds: resolved.referenceIds,
      lessonIds: resolved.lessonIds, postExceptionId: resolved.postExceptionId,
    };
    await user.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: saved.profileRevisionId,
      guidance: { ...guidance, artDirection: "New direction" }, referenceBindings: [], defaultRoute: null,
    });
    await user.mutation(profileApi.setPostException, {
      postId, expectedExceptionId: firstException.postExceptionId, guidance: "New authored exception", expectedPostContext: { title: "Pinned scene", channelId: "corvo-blog" },
    });
    const foreignLessonId = await t.run(async ctx => {
      const original = (await ctx.db.get(lessonId))!;
      const { _id: _oldId, _creationTime: _oldTime, ...fields } = original;
      void [_oldId, _oldTime]; // System metadata is retained on the original, never copied into a revision.
      await ctx.db.insert("v2VisualLessons", { ...fields, revision: 2, instruction: "New instruction" });
      return ctx.db.insert("v2VisualLessons", { ...fields, brandId: "lower-db", postId: null });
    });
    const reloaded = await user.query(profileApi.resolveFromPin, { postId, pin });
    expect(reloaded).toEqual(resolved);
    expect(reloaded.lessons[0].instruction).toBe("Original instruction");
    expect(reloaded.postException?.sourceRecord).toContain("authored by");
    await expect(user.query(profileApi.resolveFromPin, {
      postId, pin: { ...pin, lessonIds: [foreignLessonId] },
    })).rejects.toThrow(/Pinned lesson not found/);
    await expect(t.withIdentity(FOREIGN_OWNER).query(profileApi.resolveFromPin, { postId, pin }))
      .rejects.toThrow(/Post not found/);
  });
  it("persists an immutable profile revision readable by an independent session", async () => {
    const t = await harness();
    const firstSession = t.withIdentity(OWNER);
    const saved = await firstSession.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance,
      referenceBindings: [], defaultRoute: null,
    });
    const reloaded = defined(await t.withIdentity(OWNER).query(profileApi.getProfile, { brandId: "corvo" }));
    expect(reloaded.revision._id).toBe(saved.profileRevisionId);
    expect(reloaded.revision.artDirection).toBe(guidance.artDirection);
    expect(reloaded.revision.defaultRoute).toBeNull();
    expect(reloaded.revision.revision).toBe(1);
  });

  it("denies cross-brand reference incorporation and profile access, and denies viewer writes", async () => {
    const t = await harness();
    const foreignId = await t.run(async (ctx) => {
      await ctx.db.insert("v2BrandMemberships", {
        userId: VIEWER.subject, brandId: "corvo", role: "viewer",
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      await ctx.db.insert("v2BrandMemberships", {
        userId: FOREIGN_OWNER.subject, brandId: "lower-db", role: "owner",
        createdAt: Date.now(), updatedAt: Date.now(),
      });
      const storageId = await ctx.storage.store(new Blob(["foreign image"], { type: "image/png" }));
      return ctx.db.insert("v2VisualReferences", {
        brandId: "lower-db", storageId, sha256: "a".repeat(64), byteLength: 13,
        contentType: "image/png", fileName: "foreign.png", kind: "upload",
        seedAssetKey: null, article: null, approvalProvenance: null,
        sourceDocumentSha256: null, sourceRecord: "Uploaded by foreign-owner",
        historicalProvider: null, historicalModelId: null,
        uploadedBy: FOREIGN_OWNER.subject, createdAt: Date.now(),
      });
    });
    await expect(t.withIdentity(OWNER).mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance,
      referenceBindings: [{ referenceId: foreignId, role: "identity" }], defaultRoute: null,
    })).rejects.toThrow(/Visual reference not found/);
    await expect(t.withIdentity(FOREIGN_OWNER).query(profileApi.getProfile, { brandId: "corvo" }))
      .rejects.toThrow(/Brand access denied/);
    await expect(t.withIdentity(VIEWER).mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null,
    })).rejects.toThrow(/write access denied/);
  });
  it("restricts detailed reference provenance and storage URLs to owners and editors", async () => {
    const t = await harness();
    await t.run(async ctx => {
      for (const [userId, role] of [[VIEWER.subject, "viewer"], [EDITOR.subject, "editor"]] as const) await ctx.db.insert("v2BrandMemberships", { userId, brandId: "corvo", role, createdAt: 1, updatedAt: 1 });
    });
    const png = Uint8Array.from(await sharp({ create: { width: 1, height: 1, channels: 4, background: "#123456" } }).png().toBuffer());
    const { referenceId } = await t.withIdentity(OWNER).action(profileApi.uploadReference, { brandId: "corvo", fileName: "reference.png", contentType: "image/png", bytes: png.buffer });
    await expect(t.withIdentity(VIEWER).query(profileApi.getReference, { referenceId }).then(reference => Boolean(reference.url))).rejects.toThrow(/access denied/);
    const reference = await t.withIdentity(EDITOR).query(profileApi.getReference, { referenceId });
    expect(reference.uploadedBy).toBe(OWNER.subject);
    expect(reference.url).toBeTruthy();
  });
  it("denies viewer reference details across profile reads, post resolution and historical pin replay", async () => {
    const t = await harness();
    const owner = t.withIdentity(OWNER), editor = t.withIdentity(EDITOR), viewer = t.withIdentity(VIEWER);
    await t.run(async ctx => {
      for (const [userId, role] of [[VIEWER.subject, "viewer"], [EDITOR.subject, "editor"]] as const) await ctx.db.insert("v2BrandMemberships", { userId, brandId: "corvo", role, createdAt: 1, updatedAt: 1 });
    });
    const png = Uint8Array.from(await sharp({ create: { width: 1, height: 1, channels: 4, background: "#123456" } }).png().toBuffer());
    const { referenceId } = await owner.action(profileApi.uploadReference, { brandId: "corvo", fileName: "reference.png", contentType: "image/png", bytes: png.buffer });
    const saved = await owner.mutation(profileApi.saveRevision, { brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [{ referenceId, role: "identity" }], defaultRoute: null });
    const ownedPost = await owner.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Owner fixture", content: "Saved owner article." });
    const editorPost = await owner.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Editor fixture", content: "Saved editor article." });
    const viewerPost = await owner.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Viewer fixture", content: "Saved viewer article." });
    await t.run(async ctx => { await ctx.db.patch(editorPost.postId, { userId: EDITOR.subject }); await ctx.db.patch(viewerPost.postId, { userId: VIEWER.subject }); });
    const pin = { profileRevisionId: saved.profileRevisionId, referenceIds: [referenceId], lessonIds: [], postExceptionId: null };
    for (const profileRevisionId of [undefined, saved.profileRevisionId]) await expect(viewer.query(profileApi.getProfile, { brandId: "corvo", ...(profileRevisionId ? { profileRevisionId } : {}) }).then(profile => Boolean(profile?.references[0].storageId))).rejects.toThrow(/access denied/);
    await expect(viewer.query(profileApi.resolveForPost, { postId: viewerPost.postId }).then(profile => Boolean(profile?.references[0].storageId))).rejects.toThrow(/access denied/);
    await expect(viewer.query(profileApi.resolveFromPin, { postId: viewerPost.postId, pin }).then(profile => Boolean(profile.references[0].storageId))).rejects.toThrow(/access denied/);
    expect((await viewer.query(profileApi.getSeedStatus, { brandId: "corvo" })).assets).toHaveLength(16);
    for (const [session, postId] of [[owner, ownedPost.postId], [editor, editorPost.postId]] as const) {
      const profile = defined(await session.query(profileApi.getProfile, { brandId: "corvo", profileRevisionId: saved.profileRevisionId }));
      expect(profile.references[0].uploadedBy).toBe(OWNER.subject);
      expect(profile.references[0].storageId).toBeTruthy();
      const resolved = defined(await session.query(profileApi.resolveForPost, { postId }));
      expect(resolved.referenceIds).toEqual([referenceId]);
      expect(await session.query(profileApi.resolveFromPin, { postId, pin })).toEqual(resolved);
    }
  });

  it("resolves the configured immutable profile for an owned saved blog post", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const saved = await user.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null,
    });
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Visible cause", content: "A saved article about cause.",
    });
    const resolved = defined(await t.withIdentity(OWNER).query(profileApi.resolveForPost, {
      postId, role: "creative_director", sceneTags: ["scene_selection"],
    }));
    expect(resolved.profileRevisionId).toBe(saved.profileRevisionId);
    expect(resolved.referenceIds).toEqual([]);
    expect(resolved.postExceptionId).toBeNull();
    await expect(t.withIdentity(FOREIGN_OWNER).query(profileApi.resolveForPost, {
      postId, role: "creative_director", sceneTags: [],
    })).rejects.toThrow(/Post not found/);
  });

  it("stores supplied image bytes with a server hash and cannot resolve another brand's reference or raw storage ID", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const png = Uint8Array.from(await sharp({ create: { width: 1, height: 1, channels: 4, background: "#123456" } }).png().toBuffer());
    const uploaded = await user.action(profileApi.uploadReference, {
      brandId: "corvo", fileName: "reference.png", contentType: "image/png", bytes: png.buffer,
    });
    const reference = await user.query(profileApi.getReference, { referenceId: uploaded.referenceId });
    expect(reference.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(reference.byteLength).toBe(png.byteLength);
    expect(reference.approvalProvenance).toBeNull();
    expect(reference.kind).toBe("upload");
    await expect(t.withIdentity(FOREIGN_OWNER).query(profileApi.getReference, { referenceId: uploaded.referenceId }))
      .rejects.toThrow(/Brand access denied/);
    await expect(user.query(profileApi.getReference, { referenceId: reference.storageId as never }))
      .rejects.toThrow();
    const same = await user.action(profileApi.uploadReference, {
      brandId: "corvo", fileName: "again.png", contentType: "image/png", bytes: png.buffer,
    });
    expect(same.referenceId).toBe(uploaded.referenceId);
  });

  it("rejects a truncated reference natively before any storage or registration", async () => {
    const t = await harness();
    await expect(t.withIdentity(OWNER).action(profileApi.uploadReference, { brandId: "corvo", fileName: "broken.jpg", contentType: "image/jpeg", bytes: Uint8Array.from([0xff, 0xd8, 0xff]).buffer })).rejects.toThrow();
    expect(await t.run(ctx => ctx.db.query("v2VisualReferences").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toEqual([]);
  });

  it("preserves past guidance and treats duplicate saves as the same revision, with route changes reserved for owners", async () => {
    const t = await harness();
    const owner = t.withIdentity(OWNER);
    const initial = { brandId: "corvo" as const, expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null };
    const first = await owner.mutation(profileApi.saveRevision, initial);
    expect(await owner.mutation(profileApi.saveRevision, initial)).toEqual(first);
    await t.run(ctx => ctx.db.insert("v2BrandMemberships", {
      userId: EDITOR.subject, brandId: "corvo", role: "editor", createdAt: Date.now(), updatedAt: Date.now(),
    }));
    const edited = await t.withIdentity(EDITOR).mutation(profileApi.saveRevision, {
      ...initial, expectedRevisionId: first.profileRevisionId,
      guidance: { ...guidance, artDirection: "New approved paper guidance." },
    });
    expect(edited.revision).toBe(2);
    const pinned = defined(await owner.query(profileApi.getProfile, { brandId: "corvo", profileRevisionId: first.profileRevisionId }));
    expect(pinned.revision.artDirection).toBe(guidance.artDirection);
    await expect(t.withIdentity(EDITOR).mutation(profileApi.saveRevision, {
      ...initial, expectedRevisionId: edited.profileRevisionId,
      defaultRoute: { provider: "digitalocean", model: "gpt-image-2", qualification: "unqualified" },
    })).rejects.toThrow(/Only a brand owner can change the default route/);
    await expect(owner.mutation(profileApi.saveRevision, {
      ...initial, expectedRevisionId: first.profileRevisionId, guidance: { ...guidance, textPolicy: "Changed stale edit" },
    })).rejects.toThrow(/reload before saving/);
  });

  it("refuses to label substituted bytes as a historically approved seed image", async () => {
    const t = await harness();
    const png = Uint8Array.from(await sharp({ create: { width: 1, height: 1, channels: 4, background: "#123456" } }).png().toBuffer());
    await expect(t.withIdentity(OWNER).action(profileApi.uploadSeedAsset, {
      brandId: "corvo", assetKey: "article-07", bytes: png.buffer,
    })).rejects.toThrow(/approved seed hash/);
    await expect(t.withIdentity(OWNER).action(profileApi.uploadSeedAsset, {
      brandId: "corvo", assetKey: "invented", bytes: png.buffer,
    })).rejects.toThrow(/Unknown approved seed asset/);
  });

  it("requires all source images before importing the fixed approved seed", async () => {
    const t = await harness();
    await expect(t.withIdentity(OWNER).mutation(profileApi.importCorvoSeed, { brandId: "corvo" }))
      .rejects.toThrow(/Upload all approved seed images/);
    expect(await t.withIdentity(OWNER).query(profileApi.getProfile, { brandId: "corvo" })).toBeNull();
  });
  it("rejects a seed import that would collide with an existing lesson key without replacing the authored revision", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    const seed = corvoSeed.lessons[0];
    await t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob(["fixture"], { type: "image/png" }));
      for (const asset of corvoSeedAssets) await ctx.db.insert("v2VisualReferences", { brandId: "corvo", storageId, sha256: asset.sha256, byteLength: 7, contentType: "image/png", fileName: asset.fileName, kind: "approved_corvo_seed", seedAssetKey: asset.key, article: asset.article, approvalProvenance: asset.approvalProvenance, sourceDocumentSha256: corvoSeed.manifest.source_sha256, sourceRecord: "trusted fixture", historicalProvider: corvoSeed.manifest.historical_provider, historicalModelId: null, uploadedBy: OWNER.subject, createdAt: 1 });
      await ctx.db.insert("v2VisualLessons", { brandId: "corvo", key: seed.id, revision: 1, role: seed.role as "creative_director" | "image_generator", sceneTags: seed.applies_when, modelScope: null, postId: null, title: "Authored reflection", instruction: "Preserve this existing revision", provenance: "reflection", sourceDocumentSha256: null, sourceRecord: "fixture", exampleArticles: [], evidence: [], validation: "untested", oneShotValidation: "not_tested", changesBrandProfile: false, createdBy: OWNER.subject, createdAt: 1 });
    });
    await expect(user.mutation(profileApi.importCorvoSeed, { brandId: "corvo" })).rejects.toThrow(/Seed lesson key already exists/);
    expect(await user.query(profileApi.getProfile, { brandId: "corvo" })).toBeNull();
    expect((await t.run(ctx => ctx.db.query("v2VisualLessons").take(2))).map(lesson => lesson.instruction)).toEqual(["Preserve this existing revision"]);
  });

  // Local source contract check: no network/provider work, no writes to masters.
  it.runIf(Boolean(process.env.CORVO_VISUAL_SEED_SOURCE_DIRECTORY))("imports actual approved bytes and repeats without duplicate assets, lessons, or profile revisions", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    for (const asset of corvoSeedAssets) {
      const bytes = readFileSync(join(process.env.CORVO_VISUAL_SEED_SOURCE_DIRECTORY!, asset.fileName));
      await user.action(profileApi.uploadSeedAsset, {
        brandId: "corvo", assetKey: asset.key, bytes: Uint8Array.from(bytes).buffer,
      });
    }
    const imported = await user.mutation(profileApi.importCorvoSeed, { brandId: "corvo" });
    expect(imported.referenceCount).toBe(16);
    expect(imported.lessonCount).toBe(10);
    const profile = defined(await t.withIdentity(OWNER).query(profileApi.getProfile, { brandId: "corvo" }));
    expect(profile.revision.referenceBindings.map((binding: { role: string }) => binding.role)).toEqual(["identity", "style"]);
    expect(profile.revision.artDirection).toContain("matte paper");
    expect(profile.revision.artDirection).not.toContain("exactly ONE");
    expect(profile.revision.mascotGuidance).not.toContain("photographic hand");
    expect(profile.revision.defaultRoute).toBeNull();
    const second = await user.mutation(profileApi.importCorvoSeed, { brandId: "corvo" });
    expect(second).toEqual(imported);
    const archive = defined(await user.query(profileApi.getSeedArchive, { brandId: "corvo" }));
    expect(archive.sourceDocument).toContain("The photographic hand is intentionally retained");
    const lessons = await user.query(profileApi.retrieveLessons, {
      brandId: "corvo", role: "image_generator", sceneTags: ["character_scene"], limit: 5,
    });
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons.every(lesson =>
      lesson.modelScope === null && lesson.oneShotValidation === "not_tested" && lesson.provenance === "seeded_observation")).toBe(true);
    const article7 = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: article7Context.title, content: "A saved article.",
    });
    const article8 = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Article 8", content: "Another saved article.",
    });
    await t.run(ctx => ctx.db.patch(article7.postId, { blogSlug: "what-corvo-labs-learned-building-an-ai-editorial-workflow" }));
    const exception = await user.mutation(profileApi.applyCorvoArticle7Exception, { postId: article7.postId, expectedExceptionId: null, expectedPostContext: article7Context });
    expect(defined(await user.query(profileApi.resolveForPost, { postId: article7.postId })).postExceptionId).toBe(exception.postExceptionId);
    expect(defined(await user.query(profileApi.resolveForPost, { postId: article8.postId })).postExceptionId).toBeNull();
    await expect(user.mutation(profileApi.applyCorvoArticle7Exception, { postId: article8.postId, expectedExceptionId: null, expectedPostContext: { title: "Article 8", channelId: "corvo-blog" } }))
      .rejects.toThrow(/article 7/);
    const updated = await user.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: profile.revision._id, guidance,
      referenceBindings: profile.revision.referenceBindings, defaultRoute: null,
    });
    await user.mutation(profileApi.importCorvoSeed, { brandId: "corvo" });
    expect(defined(await user.query(profileApi.getProfile, { brandId: "corvo" })).revision._id).toBe(updated.profileRevisionId);
  });

  it("pins only relevant lessons for the owned post, role, and exact known model", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    await user.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null,
    });
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Workshop", content: "An owned saved article.",
    });
    await t.run(async ctx => {
      const base = {
        brandId: "corvo" as const, revision: 1, role: "image_generator" as const,
        sceneTags: ["mechanism_scene"], modelScope: null, postId: null,
        title: "Keep connections physical", instruction: "Show the actual attachment.",
        provenance: "reflection" as const, sourceDocumentSha256: null, sourceRecord: "fixture:approved-lineage",
        exampleArticles: [], evidence: [], validation: "untested" as const,
        oneShotValidation: "not_tested" as const, changesBrandProfile: false as const,
        createdBy: OWNER.subject, createdAt: Date.now(),
      };
      await ctx.db.insert("v2VisualLessons", { ...base, key: "general" });
      await ctx.db.insert("v2VisualLessons", { ...base, key: "matching", modelScope: { provider: "digitalocean", model: "gpt-image-2" } });
      await ctx.db.insert("v2VisualLessons", { ...base, key: "other-model", modelScope: { provider: "openai", model: "other-model" } });
      await ctx.db.insert("v2VisualLessons", { ...base, key: "different-scene", sceneTags: ["pastry_scene"] });
      await ctx.db.insert("v2VisualLessons", { ...base, key: "different-role", role: "creative_director" });
      await ctx.db.insert("v2VisualLessons", { ...base, key: "different-brand", brandId: "lower-db" });
    });
    const resolved = defined(await user.query(profileApi.resolveForPost, {
      postId, role: "image_generator", sceneTags: ["mechanism_scene"], provider: "digitalocean", model: "gpt-image-2",
    }));
    expect(resolved.lessons.map((lesson: { key: string }) => lesson.key)).toEqual(["general", "matching"]);
    expect(resolved.lessonIds).toEqual(resolved.lessons.map((lesson: { _id: string }) => lesson._id));
    const noModel = await user.query(profileApi.retrieveLessons, { brandId: "corvo", role: "image_generator", sceneTags: ["mechanism_scene"] });
    expect(noModel.map((lesson: { key: string }) => lesson.key)).toEqual(["general"]);
    await expect(user.query(profileApi.retrieveLessons, {
      brandId: "corvo", role: "image_generator", sceneTags: ["mechanism_scene"], limit: 100,
    })).rejects.toThrow(/between 0 and 5/);
  });

  it("keeps a photographic-hand exception on its exact post and preserves earlier exception revisions", async () => {
    const t = await harness();
    const user = t.withIdentity(OWNER);
    await user.mutation(profileApi.saveRevision, {
      brandId: "corvo", expectedRevisionId: null, guidance, referenceBindings: [], defaultRoute: null,
    });
    const article7 = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Article 7", content: "A saved article.",
    });
    const article8 = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Article 8", content: "Another saved article.",
    });
    const exception = await user.mutation(profileApi.setPostException, {
      postId: article7.postId, expectedExceptionId: null,
      guidance: "Retain the photographic hand for this post only; ordinary human elements remain paper.",
      expectedPostContext: { title: "Article 7", channelId: "corvo-blog" },
    });
    const first = defined(await user.query(profileApi.resolveForPost, { postId: article7.postId }));
    const second = defined(await user.query(profileApi.resolveForPost, { postId: article8.postId }));
    expect(first.postExceptionId).toBe(exception.postExceptionId);
    expect(second.postExceptionId).toBeNull();
    const next = await user.mutation(profileApi.setPostException, {
      postId: article7.postId, expectedExceptionId: exception.postExceptionId, guidance: "A new explicit exception.", expectedPostContext: { title: "Article 7", channelId: "corvo-blog" },
    });
    expect(next.postExceptionId).not.toBe(exception.postExceptionId);
    expect((await user.query(profileApi.getPostException, { postExceptionId: exception.postExceptionId })).guidance).toContain("photographic hand");
    await expect(t.withIdentity(FOREIGN_OWNER).query(profileApi.getPostException, { postExceptionId: exception.postExceptionId })).rejects.toThrow(/Post not found/);
  });

  it("reports the seed as absent with all 16 required source byte records, scoped to brand access", async () => {
    const t = await harness();
    const status = await t.withIdentity(OWNER).query(profileApi.getSeedStatus, { brandId: "corvo" });
    expect(status.imported).toBe(false);
    expect(status.assets).toHaveLength(16);
    expect(status.assets.every((asset: { referenceId: string | null }) => asset.referenceId === null)).toBe(true);
    expect(status.historicalModelId).toBeNull();
    expect(status.oneShotValidation).toBe("not_tested");
    await expect(t.withIdentity(FOREIGN_OWNER).query(profileApi.getSeedStatus, { brandId: "corvo" }))
      .rejects.toThrow(/Brand access denied/);
  });
});

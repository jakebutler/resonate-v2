// @vitest-environment node
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import sharp from "sharp";
import type { Id } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { anyApi } from "convex/server";
import { approvalArticleSignature, resolvePublicationSchedule } from "../../lib/publicationReview";

const modules = import.meta.glob("../**/*.ts");
beforeEach(() => { vi.stubEnv("BLOG_REPO_OWNER", "fictional-owner"); vi.stubEnv("BLOG_REPO_NAME", "fictional-reader"); });
afterEach(() => { vi.unstubAllEnvs(); });

// Genuine owned bytes and crop receipts through the same public interfaces as the composer.
// Synthetic editorial content; no provider calls or live qualification.
async function prepareOwnedBlogFixture(t: ReturnType<typeof convexTest>, user: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>, postId: Id<"v2Posts">) {
  const post = await user.query(api.publishing.getPostById, { postId });
  if (post?.channelId !== "corvo-blog") return;
  const bytes = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#345678" } }).png().toBuffer();
  const { storageId } = await user.action(api.v2Storage.uploadImage, { brandId: "corvo", bytes: Uint8Array.from(bytes).buffer, contentType: "image/png", fileName: "SPECULATIVE-integration-source.png" });
  await user.mutation(api.publishing.updateBlogMetadata, { postId, metadata: { blogExcerpt: "Fictional reviewed excerpt", blogAuthor: "Fictional editor", blogCategory: "Fictional category", blogTags: ["fictional"], blogPublicationIntent: "draft", coverImageAlt: "Fictional manually reviewed gear", blogSlug: "fictional-owned-integration", heroImageStorageId: storageId } });
  await user.action(api.blogHero.prepare, { postId, crop: "centre" });
  expect((await user.query(api.publishing.getPostById, { postId }))?.preparedHero).toMatchObject({ width: 1600, height: 900, mimeType: "image/webp" });
  expect(await t.run(ctx => ctx.db.query("v2StorageUploads").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique())).toMatchObject({ userId: "fixture-author", brandId: "corvo" });
}

describe("final post approval with editorial visuals", () => {
  it("asks an older composer to reload before new uploads without creating storage or changing saved content", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Historical upload compatibility", content: "Fictional retained draft." });
    const before = await user.query(api.publishing.getPostById, { postId });
    await expect(user.mutation(anyApi.v2Storage.generateUploadUrl, {})).rejects.toThrow("Reload the updated composer before uploading an image");
    await expect(t.mutation(anyApi.v2Storage.generateUploadUrl, {})).rejects.toThrow("Unauthorized");
    expect(await t.run(ctx => ctx.db.system.query("_storage").collect())).toEqual([]);
    expect(await t.run(ctx => ctx.db.query("v2StorageUploads").collect())).toEqual([]);
    expect(await user.query(api.publishing.getPostById, { postId })).toEqual(before);
  });
  it("keeps older composer saved hero reads through server-verified owned attachment binding", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Historical saved hero", content: "Fictional saved body." });
    const { fileId, orphanId } = await t.run(async ctx => {
      const fileId = await ctx.storage.store(new Blob(["historical saved hero"]));
      const orphanId = await ctx.storage.store(new Blob(["unregistered orphan"]));
      await ctx.db.patch(postId, { heroImageStorageId: fileId });
      return { fileId, orphanId };
    });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).resolves.toBeTruthy();
    await expect(user.query(api.v2Storage.getFileUrl, { fileId, postId })).resolves.toBeTruthy();
    await expect(t.withIdentity({ subject: "foreign-owner" }).query(api.v2Storage.getFileUrl, { fileId })).rejects.toThrow("Storage asset not found or access denied");
    await expect(user.query(api.v2Storage.getFileUrl, { fileId: orphanId })).rejects.toThrow("Storage asset not found or access denied");
    const other = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Different owned post", content: "Fictional context." });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId, postId: other.postId })).rejects.toThrow("Storage asset not found or access denied");
    await expect(user.query(api.posts.getFileUrl, { fileId })).rejects.toThrow("Storage asset not found or access denied");
    await t.run(async ctx => {
      const membership = (await ctx.db.query("v2BrandMemberships").withIndex("by_user_and_brand", q => q.eq("userId", "fixture-author").eq("brandId", "corvo")).unique())!;
      await ctx.db.delete(membership._id);
    });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).rejects.toThrow(/access denied/);
  });
  it("fails closed on ambiguous and mixed-brand historical bindings while keeping exact context readable", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Historical binding boundary", content: "Fictional saved body." });
    const fileId = await t.run(async ctx => {
      const fileId = await ctx.storage.store(new Blob(["historical binding"]));
      await ctx.db.patch(postId, { heroImageStorageId: fileId });
      const original = (await ctx.db.get(postId))!;
      const { _id: _oldId, _creationTime: _oldTime, ...fields } = original;
      void _oldId; void _oldTime;
      await ctx.db.insert("v2Posts", { ...fields, title: "Second historical binding" });
      await ctx.db.insert("v2Posts", { ...fields, title: "Third historical binding" });
      return fileId;
    });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).rejects.toThrow("Ambiguous historical attachment ownership");
    await expect(user.query(api.v2Storage.getFileUrl, { fileId, postId })).resolves.toBeTruthy();
    await t.run(async ctx => {
      const posts = await ctx.db.query("v2Posts").withIndex("by_user", q => q.eq("userId", "fixture-author")).collect();
      await ctx.db.delete(posts.find(post => post.title === "Third historical binding")!._id);
      await ctx.db.patch(posts.find(post => post.title === "Second historical binding")!._id, { brandId: "lower-db" });
      const member = await ctx.db.query("v2BrandMemberships").withIndex("by_user_and_brand", q => q.eq("userId", "fixture-author").eq("brandId", "lower-db")).unique();
      if (member) await ctx.db.delete(member._id);
    });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).rejects.toThrow(/access denied/);
    await expect(user.query(api.v2Storage.getFileUrl, { fileId, postId })).resolves.toBeTruthy();
  });
  it.each(["reference", "foreign-upload"] as const)("never uses a historical association to bypass classified %s denial", async kind => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Classified binding boundary", content: "Fictional saved body." });
    const fileId = await t.run(async ctx => {
      const fileId = await ctx.storage.store(new Blob(["classified fixture"]));
      await ctx.db.patch(postId, { heroImageStorageId: fileId });
      if (kind === "reference") {
        await ctx.db.insert("v2VisualReferences", { brandId: "corvo", storageId: fileId, sha256: "a".repeat(64), byteLength: 18, contentType: "image/png", fileName: "fixture.png", kind: "upload", seedAssetKey: null, article: null, approvalProvenance: null, sourceDocumentSha256: null, sourceRecord: "Offline fixture", historicalProvider: null, historicalModelId: null, uploadedBy: "fixture-author", createdAt: 1 });
        const member = (await ctx.db.query("v2BrandMemberships").withIndex("by_user_and_brand", q => q.eq("userId", "fixture-author").eq("brandId", "corvo")).unique())!;
        await ctx.db.patch(member._id, { role: "viewer" });
      } else {
        await ctx.db.insert("v2StorageUploads", { storageId: fileId, brandId: "corvo", userId: "foreign-owner", sha256: "a".repeat(64), bytes: 18, contentType: "image/png", fileName: "fixture.png", createdAt: 1 });
      }
      return fileId;
    });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).rejects.toThrow(/access denied/);
    await expect(user.query(api.v2Storage.getFileUrl, { fileId, postId })).rejects.toThrow(/access denied/);
  });
  it("refuses to record an old publication schedule after a date-only reschedule", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fictional dispatch schedule", content: "Fictional saved body.", scheduledDate: "2026-10-01", scheduledTime: "09:30", timezone: "UTC" });
    await prepareOwnedBlogFixture(t, user, postId);
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    const sent = await user.query(api.publishing.getPostForPublication, { postId });
    await user.mutation(api.publishing.reschedule, { postId, scheduledDate: "2026-10-02", scheduledTime: "12:30", timezone: "America/Los_Angeles" });
    const current = await user.query(api.publishing.getPostForPublication, { postId });
    expect(current.post.approvalState).toBe("approved");
    expect(current.reviewSignature).toBe(sent.reviewSignature);
    await expect(user.mutation(anyApi.publishing.recordVisualPublicationPr, {
      postId, expectedArticleSignature: JSON.stringify({ title: sent.post.title, content: sent.post.content, linkedinFirstComment: "" }), expectedVisualSignature: sent.reviewSignature,
      expectedIntentId: sent.intent._id, expectedSchedule: { scheduledDate: sent.intent.scheduledDate!, scheduledTime: sent.intent.scheduledTime, timezone: sent.intent.timezone! },
      result: { prUrl: "https://github.com/fictional-owner/fictional-reader/pull/987654", branchName: "blog/fictional-dispatch", prNumber: 987654, prStatus: "open", sanitizedResponse: { scheduledDate: sent.intent.scheduledDate, scheduledTime: sent.intent.scheduledTime, timezone: sent.intent.timezone } },
    })).rejects.toThrow("Publication schedule changed before PR recording");
    const retained = await t.run(async ctx => ({ post: await ctx.db.get(postId), attempts: await ctx.db.query("v2PublishAttempts").collect() }));
    expect(retained.post?.prUrl).toBeUndefined();
    expect(retained.post?.scheduledDate).toBe("2026-10-02");
    expect(retained.attempts).toEqual([]);
  });
  it.each(["time", "timezone", "intent"] as const)("binds publication recording to the dispatched %s", async change => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fictional dispatch context", content: "Fictional saved body.", scheduledDate: "2026-10-01", scheduledTime: "09:30", timezone: "UTC" });
    await prepareOwnedBlogFixture(t, user, postId);
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    const sent = await user.query(api.publishing.getPostForPublication, { postId });
    if (change === "intent") {
      await t.run(async ctx => {
        const { _id: _oldId, _creationTime: _oldTime, ...fields } = sent.intent;
        void _oldId; void _oldTime;
        await ctx.db.delete(sent.intent._id);
        await ctx.db.insert("v2PublishingIntents", fields);
      });
    } else {
      await user.mutation(api.publishing.reschedule, { postId, scheduledDate: "2026-10-01", scheduledTime: change === "time" ? "10:30" : "09:30", timezone: change === "timezone" ? "America/Los_Angeles" : "UTC" });
    }
    await expect(user.mutation(anyApi.publishing.recordVisualPublicationPr, {
      postId, expectedArticleSignature: approvalArticleSignature(sent.post), expectedVisualSignature: sent.reviewSignature,
      expectedIntentId: sent.intent._id, expectedSchedule: resolvePublicationSchedule(sent.post, sent.intent, "2026-10-01"),
      result: { prUrl: "https://github.com/fictional-owner/fictional-reader/pull/987654", branchName: "blog/fictional-context", prStatus: "open", sanitizedResponse: {} },
    })).rejects.toThrow("Publication schedule changed before PR recording");
    expect(await t.run(ctx => ctx.db.query("v2PublishAttempts").collect())).toEqual([]);
  });
  it("records the actual dispatched fallback date and resolved timezone without changing approval semantics", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fictional unscheduled dispatch", content: "Fictional saved body." });
    await prepareOwnedBlogFixture(t, user, postId);
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    const sent = await user.query(api.publishing.getPostForPublication, { postId });
    const expectedSchedule = resolvePublicationSchedule(sent.post, sent.intent, "2026-10-01");
    const exportClaimKey = "SPECULATIVE-fallback-export-claim";
    await user.mutation(api.publishing.claimBlogExport, { postId, fingerprint: sent.post.contentFingerprint, schedule: JSON.stringify([sent.post.scheduledDate, sent.post.scheduledTime, sent.post.timezone]), key: exportClaimKey });
    const result = await user.mutation(anyApi.publishing.recordVisualPublicationPr, {
      postId, expectedArticleSignature: approvalArticleSignature(sent.post), expectedVisualSignature: sent.reviewSignature,
      expectedIntentId: sent.intent._id, expectedSchedule,
      result: { exportClaimKey, artifact: { repository: "fictional-owner/fictional-reader", prNumber: 987654, branchName: "blog/fictional-fallback", mdxPath: "apps/blog/blog/2026-10-01-fictional-owned-integration.mdx", canonicalUrl: "https://fictional-reader.invalid/blog/2026-10-01-fictional-owned-integration", editorialFingerprint: sent.post.contentFingerprint }, prUrl: "https://github.com/fictional-owner/fictional-reader/pull/987654", branchName: "blog/fictional-fallback", prNumber: 987654, prStatus: "open", sanitizedResponse: expectedSchedule },
    });
    const attempt = await t.run(ctx => ctx.db.get(result.attemptId));
    expect(attempt?.submissionSnapshot).toMatchObject(expectedSchedule);
    expect(attempt?.sanitizedResponse).toEqual(expectedSchedule);
    expect((await user.query(api.publishing.getPostById, { postId }))?.status).toBe("pr-created");
  });
  it("blocks the final review of an inserted linked figure when upstream evidence changes before reimport", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const table = "| label | value | unit | population | denominator | citation |\n|---|---|---|---|---|---|\n| Fictional A | 12 | cases | Fictional set | 80 invented items | Local fictional report |\n| Fictional B | 20 | cases | Fictional set | 80 invented items | Local fictional report |";
    const { researchBriefId } = await user.mutation(api.research.saveResearchBrief, { brandId: "corvo", topic: "Fictional report", audience: "Fixture reader", thesis: "Fictional comparison", depth: "standard", riskLevel: "low", targetOutputs: ["blog"], provider: "offline-fixture", sources: [{ id: "fixture-report", title: "Fictional report", url: "https://fictional.invalid/report", evidenceLabel: "primary", status: "accepted", raw: { excerpt: table } }] });
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Linked figure fixture", content: `## Fictional comparison\n\n${table}`, sourceResearchBriefId: researchBriefId });
    const snapshot = (await user.query(api.visualLinkedEvidence.getSnapshot, { postId }))!;
    await user.mutation(api.visualLinkedEvidence.importLinkedEvidence, { postId, expectedSnapshotHash: snapshot.snapshotHash, expectedSourceId: null });
    const planned = await user.mutation(api.visualFigures.planFigures, { postId });
    const candidate = await user.query(api.visualFigures.getCandidate, { candidateId: planned.candidateIds[0] });
    await user.mutation(api.visualFigures.acceptCandidate, { candidateId: candidate._id, expectedDataSignature: candidate.dataSignature, expectedPresentationSignature: candidate.presentationSignature });
    expect((await user.query(api.publishing.getApprovalReview, { postId })).blockedReason).toBe("Approve a prepared hero before approving informational figures");
    await user.mutation(api.research.reviewSource, { researchBriefId, sourceId: "fixture-report", status: "rejected" });
    expect((await user.query(api.publishing.getApprovalReview, { postId })).blockedReason).toContain("Linked evidence changed after import");
    await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" })).rejects.toThrow("Linked evidence changed after import");
  });
  it("keeps unused and declined figure proposals outside the publication gate", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Figure proposal fixture", content: "## Fictional relationships\n\n| from | to | relation |\n|---|---|---|\n| Fictional author | Fictional draft | edits |" });
    const planned = await user.mutation(api.visualFigures.planFigures, { postId });
    expect(planned.candidateIds).toHaveLength(1);
    expect(await user.query(api.publishing.getApprovalReview, { postId })).toMatchObject({ hasVisuals: false, publicationQualified: true, blockedReason: null });
    await user.mutation(api.visualFigures.declineCandidate, { candidateId: planned.candidateIds[0] });
    expect(await user.query(api.publishing.getApprovalReview, { postId })).toMatchObject({ hasVisuals: false, publicationQualified: true, blockedReason: null });
    await prepareOwnedBlogFixture(t, user, postId);
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    expect((await user.query(api.publishing.getPostForPublication, { postId })).figures).toEqual([]);
  });
  it("restricts reference bearer URLs to owners and editors through both storage endpoints", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const fileId = await t.run(async ctx => {
      const id = await ctx.storage.store(new Blob(["reference fixture"], { type: "image/png" }));
      await ctx.db.insert("v2VisualReferences", { brandId: "corvo", storageId: id, sha256: "a".repeat(64), byteLength: 17, contentType: "image/png", fileName: "fixture.png", kind: "upload", seedAssetKey: null, article: null, approvalProvenance: null, sourceDocumentSha256: null, sourceRecord: "Offline fixture", historicalProvider: null, historicalModelId: null, uploadedBy: "fixture-author", createdAt: 1 });
      return id;
    });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).resolves.toBeTruthy();
    await t.run(async ctx => {
      const member = (await ctx.db.query("v2BrandMemberships").withIndex("by_user_and_brand", q => q.eq("userId", "fixture-author").eq("brandId", "corvo")).unique())!;
      await ctx.db.patch(member._id, { role: "viewer" });
    });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).rejects.toThrow("Visual reference access denied");
    await expect(user.query(api.posts.getFileUrl, { fileId })).rejects.toThrow("Visual reference access denied");
    await t.run(async ctx => {
      const member = (await ctx.db.query("v2BrandMemberships").withIndex("by_user_and_brand", q => q.eq("userId", "fixture-author").eq("brandId", "corvo")).unique())!;
      await ctx.db.patch(member._id, { role: "editor" });
    });
    await expect(user.query(api.posts.getFileUrl, { fileId })).resolves.toBeTruthy();
  });
  it("refuses a shared visual article slug across different posts and dates", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const first = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "First fixture", content: "Fictional draft.", scheduledDate: "2026-09-30" });
    const second = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Second fixture", content: "Another fictional draft.", scheduledDate: "2026-10-01" });
    await user.mutation(api.publishing.updateBlogMetadata, { postId: first.postId, metadata: { blogSlug: "shared-visual-slug" } });
    await t.run(ctx => ctx.db.insert("v2VisualStates", { userId: "fixture-author", brandId: "corvo", postId: second.postId, updatedAt: 1 }));
    await expect(user.mutation(api.publishing.updateBlogMetadata, { postId: second.postId, metadata: { blogSlug: "shared-visual-slug" } })).rejects.toThrow("Visual article slug is already used");
    expect((await user.query(api.publishing.getPostById, { postId: second.postId }))?.blogSlug).toBeUndefined();
  });
  it("keeps viewer reads while refusing publication and article mutations after role demotion", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Role fixture", content: "Fictional draft." });
    await prepareOwnedBlogFixture(t, user, postId);
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    await t.run(async ctx => {
      const membership = (await ctx.db.query("v2BrandMemberships").withIndex("by_user_and_brand", q => q.eq("userId", "fixture-author").eq("brandId", "corvo")).unique())!;
      await ctx.db.patch(membership._id, { role: "viewer" });
    });
    expect((await user.query(api.publishing.getPostById, { postId }))?.title).toBe("Role fixture");
    await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toThrow("Publishing requires an owner or editor");
    await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" })).rejects.toThrow("Editor access required");
    await expect(user.mutation(api.publishing.updateContent, { postId, content: "Unauthorized edit." })).rejects.toThrow("Publishing requires an owner or editor");
    await expect(user.mutation(api.publishing.updateBlogMetadata, { postId, metadata: { blogAuthor: "Unauthorized author" } })).rejects.toThrow("Publishing requires an owner or editor");
    expect((await user.query(api.publishing.getPostById, { postId }))?.approvalState).toBe("approved");
  });
  it("rejects client-created PR and merged status for visual publications", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fixture", content: "Fictional draft." });
    await t.run(ctx => ctx.db.insert("v2VisualStates", { userId: "fixture-author", brandId: "corvo", postId, updatedAt: 1 }));
    await expect(user.mutation(api.publishing.recordGithubPr, { postId, result: { prUrl: "https://github.com/test/test/pull/1", branchName: "fake", prNumber: 1, prStatus: "open", sanitizedResponse: {} } })).rejects.toThrow("Visual PR state requires server verification");
    await expect(user.mutation(api.publishing.recordBlogPrStatus, { postId, prStatus: "merged" })).rejects.toThrow("Visual PR state requires server verification");
    expect((await user.query(api.publishing.getPostById, { postId }))?.status).toBe("draft");
  });
  it("rejects final approval of a different article from the one reviewed", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fixture", content: "Reviewed fictional article." });
    const expectedArticleSignature = JSON.stringify({ title: "Fixture", content: "Reviewed fictional article.", linkedinFirstComment: "" });
    await user.mutation(api.publishing.updateContent, { postId, content: "Changed fictional article." });
    await expect(user.mutation(anyApi.publishing.setApproval, { postId, approvalState: "approved", expectedArticleSignature })).rejects.toThrow("Reviewed article changed");
    expect((await user.query(api.publishing.getPostById, { postId }))?.approvalState).toBe("unapproved");
  });
  it("requires current visuals when variant acceptance grants final blog approval", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fixture variant", content: "Fictional variant" });
    await t.run(async ctx => { await ctx.db.patch(postId, { variantReviewStatus: "pending" }); await ctx.db.insert("v2VisualStates", { userId: "fixture-author", brandId: "corvo", postId, updatedAt: 1 }); });
    await expect(user.mutation(api.publishing.acceptVariantPost, { postId })).rejects.toThrow("Select a hero before final post approval");
    expect((await user.query(api.publishing.getPostById, { postId }))?.approvalState).toBe("unapproved");
  });
  it("fails closed when a blob has more indexed owners than the bounded ownership check", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const fileId = await t.run(async ctx => {
      const id = await ctx.storage.store(new Blob(["fixture bytes"], { type: "image/png" }));
      for (let i = 0; i < 3; i++) await ctx.db.insert("v2VisualReferences", { brandId: "corvo", storageId: id, sha256: "a".repeat(64), byteLength: 13, contentType: "image/png", fileName: `fixture-${i}.png`, kind: "upload", seedAssetKey: null, article: null, approvalProvenance: null, sourceDocumentSha256: null, sourceRecord: "Offline fixture", historicalProvider: null, historicalModelId: null, uploadedBy: "fixture-author", createdAt: i });
      return id;
    });
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).rejects.toThrow("Ambiguous storage ownership");
  });
  it("preserves an inserted figure when a stale composer tries to overwrite its article", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fixture", content: "Original fictional article." });
    const baseline = await user.query(api.publishing.getPostById, { postId });
    await user.mutation(api.publishing.updateContent, { postId, content: "Original fictional article.\n\nReviewed figure placement." });
    await expect(user.mutation(anyApi.publishing.updateContent, { postId, content: "Stale composer overwrite.", expectedArticleSignature: JSON.stringify({ title: baseline!.title, content: baseline!.content, linkedinFirstComment: baseline!.linkedinFirstComment ?? "" }) })).rejects.toThrow("Article changed since this composer was loaded");
    expect((await user.query(api.publishing.getPostById, { postId }))?.content).toContain("Reviewed figure placement.");
  });
  it("refuses final approval for a saved visual workflow with no approved selected hero", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, {
      brandId: "corvo", channelId: "corvo-blog", title: "Fixture: inspection", content: "A fictional raven inspects a gear.",
    });
    await t.run(ctx => ctx.db.insert("v2VisualStates", { userId: "fixture-author", brandId: "corvo", postId, updatedAt: 1 }));
    await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" })).rejects.toThrow("Select a hero before final post approval");
    const post = await user.query(api.publishing.getPostById, { postId });
    expect(post?.approvalState).toBe("unapproved");
  });
  it("returns a single owned, approved publication snapshot and rejects a later content edit", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Legacy fixture", content: "Fictional draft." });
    await prepareOwnedBlogFixture(t, user, postId);
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    const snapshot = await user.query(api.publishing.getPostForPublication, { postId });
    expect(snapshot.post).toMatchObject({ _id: postId, title: "Legacy fixture", approvalState: "approved" });
    expect(snapshot.visuals).toBeNull();
    await user.mutation(api.publishing.updateContent, { postId, content: "Revised fictional draft." });
    await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toThrow("Post is not approved for publishing");
  });
  it("denies a guessed visual-reference storage URL to a different brand member", async () => {
    const t = convexTest(schema, modules);
    const owner = t.withIdentity({ subject: "fixture-author" });
    const foreign = t.withIdentity({ subject: "foreign-author" });
    await owner.mutation(api.publishing.seedMvpWorkspace, {});
    const storageId = await t.run(async ctx => {
      const id = await ctx.storage.store(new Blob(["fixture bytes"], { type: "image/png" }));
      await ctx.db.insert("v2VisualReferences", { brandId: "corvo", storageId: id, sha256: "a".repeat(64), byteLength: 13, contentType: "image/png", fileName: "fixture.png", kind: "upload", seedAssetKey: null, article: null, approvalProvenance: null, sourceDocumentSha256: null, sourceRecord: "Offline fixture", historicalProvider: null, historicalModelId: null, uploadedBy: "fixture-author", createdAt: 1 });
      return id;
    });
    await expect(foreign.query(api.v2Storage.getFileUrl, { fileId: storageId })).rejects.toThrow("Brand access denied");
    await expect(foreign.query(api.posts.getFileUrl, { fileId: storageId })).rejects.toThrow("Brand access denied");
    await expect(owner.query(api.v2Storage.getFileUrl, { fileId: storageId })).resolves.toBeTruthy();
  });
  it("refuses using a social post as a blog publication snapshot", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "linkedin", title: "Social fixture", content: "Fictional post." });
    await prepareOwnedBlogFixture(t, user, postId);
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toThrow("Only blog posts can create publication packages");
  });
  it("denies orphaned storage IDs through both legacy URL endpoints", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    const fileId = await t.run(ctx => ctx.storage.store(new Blob(["orphaned fixture"], { type: "image/png" })));
    await expect(user.query(api.posts.getFileUrl, { fileId })).rejects.toThrow("Storage asset not found or access denied");
    await expect(user.query(api.v2Storage.getFileUrl, { fileId })).rejects.toThrow("Storage asset not found or access denied");
  });
  it("records ownership when the authenticated upload action stores actual image bytes", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    const png = Uint8Array.from([137,80,78,71,13,10,26,10,1]);
    const { storageId } = await user.action(anyApi.v2Storage.uploadImage, { fileName: "fixture.png", contentType: "image/png", bytes: png.buffer });
    await expect(user.query(api.posts.getFileUrl, { fileId: storageId })).resolves.toBeTruthy();
    await expect(t.withIdentity({ subject: "foreign-author" }).query(api.posts.getFileUrl, { fileId: storageId })).rejects.toThrow("Storage asset not found or access denied");
  });
  it("does not let a legacy attachment manufacture ownership of orphaned bytes", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    const fileId = await t.run(ctx => ctx.storage.store(new Blob(["orphaned fixture"])));
    await expect(user.mutation(api.posts.create, { type: "blog", content: "Fixture", status: "draft", fileIds: [fileId] })).rejects.toThrow("Storage asset not found or access denied");
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fixture", content: "Fixture" });
    await expect(user.mutation(api.publishing.updateBlogMetadata, { postId, metadata: { heroImageStorageId: fileId } })).rejects.toThrow("Storage asset not found or access denied");
  });
  it("preserves historical attachments only through an explicit verified post context", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    const { fileId, legacyPostId } = await t.run(async ctx => {
      const fileId = await ctx.storage.store(new Blob(["historical attachment"]));
      const legacyPostId = await ctx.db.insert("posts", { type: "blog", content: "Historical shared legacy fixture", status: "draft", fileIds: [fileId], createdAt: 1, updatedAt: 1 });
      return { fileId, legacyPostId };
    });
    await expect(user.query(api.posts.getFileUrl, { fileId, postId: legacyPostId })).resolves.toBeTruthy();
    await expect(user.query(api.posts.getFileUrl, { fileId })).rejects.toThrow("Storage asset not found or access denied");
  });
  it("refuses ambiguous duplicate brand memberships instead of selecting a permission by row order", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    await t.run(ctx => ctx.db.insert("v2BrandMemberships", { userId: "fixture-author", brandId: "corvo", role: "viewer", createdAt: 1, updatedAt: 1 }));
    await expect(user.query(api.visualProfiles.getProfile, { brandId: "corvo" })).rejects.toThrow("Ambiguous brand membership");
  });
  it("rejects final post approval when an inserted figure token has no current reviewed asset", async () => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "fixture-author" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fixture", content: "![Fictional figure](resonate-figure://missingfixture)" });
    await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" })).rejects.toThrow("unapproved or ambiguous figure token");
  });
});

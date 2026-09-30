// @vitest-environment node
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { anyApi } from "convex/server";

const modules = import.meta.glob("../**/*.ts");

describe("final post approval with editorial visuals", () => {
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
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    await t.run(async ctx => {
      const membership = (await ctx.db.query("v2BrandMemberships").withIndex("by_user_and_brand", q => q.eq("userId", "fixture-author").eq("brandId", "corvo")).unique())!;
      await ctx.db.patch(membership._id, { role: "viewer" });
    });
    expect((await user.query(api.publishing.getPostById, { postId }))?.title).toBe("Role fixture");
    await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toThrow("Publishing requires an owner or editor");
    await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" })).rejects.toThrow("Publishing requires an owner or editor");
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

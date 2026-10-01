// @vitest-environment node
// Synthetic artifact and read-only provider double; no network or qualification evidence.
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import sharp from "sharp";
import { prepareBlogPublication } from "../../lib/github";
import { articleBodyForArtifact } from "../../lib/articlePublication";
import { approvalArticleSignature, resolvePublicationSchedule } from "../../lib/publicationReview";
import { blogEditorialFingerprint } from "../../lib/blogContract";
import { articleArtifactVersion } from "../../lib/articleContracts";

const transport = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../lib/articlePublication", async original => ({ ...await original<typeof import("../../lib/articlePublication")>(), readArticlePublication: transport.read }));
const modules = import.meta.glob("../**/*.ts");
const api = anyApi;
beforeEach(() => {
  vi.stubEnv("BLOG_REPO_OWNER", "fictional-owner");
  vi.stubEnv("BLOG_REPO_NAME", "fictional-repo");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function ownedUploadFixture() {
  const t = convexTest(schema, modules), user = t.withIdentity({ subject: "fixture-owner" });
  await user.mutation(api.publishing.seedMvpWorkspace, {});
  const bytes = await sharp({ create: { width: 100, height: 100, channels: 3, background: "#15616d" } }).png().toBuffer();
  const { storageId } = await user.action(api.v2Storage.uploadImage, { brandId: "corvo", bytes: Uint8Array.from(bytes).buffer, contentType: "image/png", fileName: "SPECULATIVE-unprepared-owned.png" });
  const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fictional unprepared hero", content: "Exact fictional article.", scheduledDate: "2030-10-07", scheduledTime: "09:30", timezone: "UTC" });
  await user.mutation(api.publishing.updateBlogMetadata, { postId, metadata: { blogExcerpt: "Fictional excerpt", blogAuthor: "Fictional editor", blogCategory: "Fictional", blogTags: ["fictional"], blogSlug: "fictional-unprepared", blogPublicationIntent: "published", coverImageAlt: "Unprepared fictional hero", heroImageStorageId: storageId } });
  return { t, user, postId };
}
async function fixture() {
  const t = convexTest(schema, modules), user = t.withIdentity({ subject: "fixture-owner" });
  const postId = await t.run(async ctx => {
    await ctx.db.insert("v2BrandMemberships", { userId: "fixture-owner", brandId: "corvo", role: "owner", createdAt: 1, updatedAt: 1 });
    const sourceStorageId = await ctx.storage.store(new Blob(["unprepared legacy source"], { type: "image/png" }));
    const id = await ctx.db.insert("v2Posts", { userId: "fixture-owner", brandId: "corvo", channelId: "corvo-blog", platformId: "corvo-blog", title: "Fictional bound export", content: "Exact fictional copy.", status: "pr-created", approvalState: "approved", timezone: "UTC", prUrl: "https://github.com/fictional-owner/fictional-repo/pull/1", branchName: "blog/fictional", contentFingerprint: "synthetic", heroImageStorageId: sourceStorageId, coverImageAlt: "Legacy alt", createdAt: 1, updatedAt: 1 });
    const post = (await ctx.db.get(id))!;
    await ctx.db.patch(id, { blogArtifact: { repository: "fictional-owner/fictional-repo", prNumber: 1, branchName: "blog/fictional", mdxPath: "apps/blog/blog/2026-10-01-fictional.mdx", heroPath: "apps/blog/public/images/blog/2026-10-01-fictional/hero.webp", canonicalUrl: "https://fictional.invalid/blog/fictional", editorialFingerprint: blogEditorialFingerprint(post), heroSha256: "a".repeat(64), coverImageAlt: "Exact approved visual alt" } });
    return id;
  });
  transport.read.mockReset();
  transport.read.mockImplementation(async params => ({ evidence: { checkedAt: Date.now(), editorialVersion: params.editorialVersion, artifactVersion: articleArtifactVersion(params.artifact), prState: "unknown", deploymentState: "unknown", availability: "blocked", reason: "SPECULATIVE no live publication" } }));
  return { t, user, postId };
}
describe("bound visual publication read adapter", () => {
  it("distinguishes an unapproved owned publication snapshot from a connection failure", async () => {
    const { user, postId } = await ownedUploadFixture();
    await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toMatchObject({ data: { code: "BLOG_PUBLICATION_APPROVAL_REQUIRED" } });
  });
  it("identifies missing publication metadata in an owned approved snapshot", async () => {
    const { t, user, postId } = await ownedUploadFixture();
    await t.run(ctx => ctx.db.patch(postId, { approvalState: "approved", blogExcerpt: undefined }));
    await expect(user.query(api.publishing.getPostForPublication, { postId })).rejects.toMatchObject({ data: { code: "BLOG_PUBLICATION_METADATA_REQUIRED" } });
  });
  it("rejects a caller-supplied hero binding for an unapproved, unprepared owned upload", async () => {
    const { user, postId } = await ownedUploadFixture();
    const before = await user.query(api.publishing.getPostById, { postId });
    await expect(user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" })).rejects.toThrow();
    const artifact = { repository: "fictional-owner/fictional-repo", prNumber: 987654, branchName: "blog/fictional", mdxPath: "apps/blog/blog/2030-10-07-fictional.mdx", heroPath: "apps/blog/public/images/blog/2030-10-07-fictional/hero.webp", canonicalUrl: "https://fictional.invalid/blog/fictional", editorialFingerprint: blogEditorialFingerprint(before), heroSha256: "", coverImageAlt: before.coverImageAlt };
    await expect(user.mutation(api.publishing.recordGithubPr, { postId, result: { artifact, prUrl: "https://github.com/fictional-owner/fictional-repo/pull/987654", prNumber: 987654, branchName: artifact.branchName, sanitizedResponse: {} } })).rejects.toThrow(/approval|prepared|hero/i);
    expect(await user.query(api.publishing.getPostById, { postId })).toEqual(before);
    expect(await user.query(api.publishing.getPostAuditTrail, { postId })).toMatchObject({ attempts: [] });
  });

  it("binds a legacy PR hero hash to the actual approved prepared bytes", async () => {
    const { user, postId } = await ownedUploadFixture();
    await user.action(api.blogHero.prepare, { postId, crop: "centre" });
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    const before = await user.query(api.publishing.getPostById, { postId });
    const artifact = { repository: "fictional-owner/fictional-repo", prNumber: 987654, branchName: "blog/fictional", mdxPath: "apps/blog/blog/2030-10-07-fictional.mdx", heroPath: "apps/blog/public/images/blog/2030-10-07-fictional/hero.webp", canonicalUrl: "https://fictional.invalid/blog/fictional", editorialFingerprint: blogEditorialFingerprint(before), heroSha256: "a".repeat(64), coverImageAlt: before.coverImageAlt };
    const result = { artifact, prUrl: "https://github.com/fictional-owner/fictional-repo/pull/987654", prNumber: 987654, branchName: artifact.branchName, sanitizedResponse: {} };
    await expect(user.mutation(api.publishing.recordGithubPr, { postId, result })).rejects.toThrow(/hero|prepared/i);
    expect(await user.query(api.publishing.getPostById, { postId })).toEqual(before);
    const bound = { ...artifact, heroSha256: before.preparedHero.sha256, heroSourceUrl: before.heroImageUrl };
    expect(await user.mutation(api.publishing.recordGithubPr, { postId, result: { ...result, artifact: bound } })).toMatchObject({ recorded: true });
    expect((await user.query(api.publishing.getPostById, { postId })).blogArtifact).toEqual(bound);
  });

  it("records the legacy export's approved hero alt with surrounding whitespace", async () => {
    const { user, postId } = await ownedUploadFixture();
    await user.mutation(api.publishing.updateBlogMetadata, { postId, metadata: { coverImageAlt: "  Exact approved legacy alt  " } });
    await user.action(api.blogHero.prepare, { postId, crop: "centre" });
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    const before = await user.query(api.publishing.getPostById, { postId });
    const artifact = { repository: "fictional-owner/fictional-repo", prNumber: 987654, branchName: "blog/fictional", mdxPath: "apps/blog/blog/2030-10-07-fictional.mdx", heroPath: "apps/blog/public/images/blog/2030-10-07-fictional/hero.webp", canonicalUrl: "https://fictional.invalid/blog/fictional", editorialFingerprint: blogEditorialFingerprint(before), heroSha256: before.preparedHero.sha256, coverImageAlt: before.coverImageAlt, heroSourceUrl: before.heroImageUrl };
    expect(artifact.coverImageAlt).toBe("  Exact approved legacy alt  ");
    const result = { artifact, prUrl: "https://github.com/fictional-owner/fictional-repo/pull/987654", prNumber: 987654, branchName: artifact.branchName, sanitizedResponse: {} };
    await expect(user.mutation(api.publishing.recordGithubPr, { postId, result: { ...result, artifact: { ...artifact, coverImageAlt: "Different unapproved alt" } } })).rejects.toThrow(/hero binding/i);
    expect(await user.query(api.publishing.getPostById, { postId })).toEqual(before);
    expect(await user.mutation(api.publishing.recordGithubPr, { postId, result })).toMatchObject({ recorded: true });
    expect((await user.query(api.publishing.getPostById, { postId })).blogArtifact).toEqual(artifact);
  });

  it("roundtrips the preparer's exact inline hero identity through current approval, claim and trusted recording while holding changed identity", async () => {
    const t = convexTest(schema, modules), user = t.withIdentity({ subject: "fixture-owner" });
    const fetchMock = vi.fn(() => { throw new Error("Fixture forbids all HTTP"); }); vi.stubGlobal("fetch", fetchMock);
    transport.read.mockReset();
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const bytes = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#15616d" } }).png().toBuffer();
    const { storageId } = await user.action(api.v2Storage.uploadImage, { brandId: "corvo", bytes: Uint8Array.from(bytes).buffer, contentType: "image/png", fileName: "SPECULATIVE-roundtrip-source.png" });
    const heroSourceUrl = await user.query(api.v2Storage.getFileUrl, { fileId: storageId });
    const changedSourceUrl = "https://fictional.invalid/changed-source.png";
    const content = Array.from({ length: 6 }, (_, index) => `Exact fictional paragraph ${index + 1}.`).join("\n\n") + `\n\n![Exact manual alt](${heroSourceUrl})\n\nExact ending.`;
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fictional inline hero roundtrip", content, scheduledDate: "2030-10-07", scheduledTime: "09:30", timezone: "UTC" });
    await user.mutation(api.publishing.updateBlogMetadata, { postId, metadata: { blogExcerpt: "Exact reviewed excerpt", blogAuthor: "Fictional editor", blogCategory: "Fictional category", blogTags: ["fictional"], blogSlug: "fictional-hero-roundtrip", blogPublicationIntent: "draft", coverImageAlt: "Exact manual alt", heroImageStorageId: storageId } });
    await user.action(api.blogHero.prepare, { postId, crop: "centre" });
    await user.mutation(api.publishing.setApproval, { postId, approvalState: "approved" });
    const sent = await user.query(api.publishing.getPostForPublication, { postId });
    const preparedHero = await user.action(api.blogHero.getApprovedBytes, { postId });
    const expectedSchedule = resolvePublicationSchedule(sent.post, sent.intent, "2030-10-07");
    const prepared = await prepareBlogPublication({ title: sent.post.title, content: sent.post.content, ...expectedSchedule, status: sent.post.blogPublicationIntent!, slug: sent.post.blogSlug, excerpt: sent.post.blogExcerpt, author: sent.post.blogAuthor, category: sent.post.blogCategory, tags: sent.post.blogTags, coverImageAlt: sent.post.coverImageAlt, images: [{ sourceUrl: heroSourceUrl!, isCover: true }], preparedHero: { bytes: Buffer.from(preparedHero.base64, "base64"), sha256: preparedHero.sha256 } });
    const artifact = { repository: "fictional-owner/fictional-repo", prNumber: 987654, branchName: prepared.branchName, mdxPath: prepared.filePath, heroPath: prepared.files.find(file => file.path.endsWith("/hero.webp"))!.path, canonicalUrl: "https://corvolabs.com/blog/2030-10-07-fictional-hero-roundtrip", editorialFingerprint: sent.post.contentFingerprint, heroSha256: prepared.heroSha256, coverImageAlt: prepared.coverImageAlt, heroSourceUrl: prepared.heroSourceUrl, figureAssets: prepared.figureAssets };
    expect(artifact.heroSourceUrl).toBe(heroSourceUrl);
    expect(articleBodyForArtifact(sent.post.content, artifact)).toBe(Buffer.from(prepared.fileContent, "base64").toString().split("\n---\n")[1].replace(/^\n/, ""));
    const exportClaimKey = "SPECULATIVE-inline-hero-claim";
    await user.mutation(api.publishing.claimBlogExport, { postId, fingerprint: sent.post.contentFingerprint, schedule: JSON.stringify([sent.post.scheduledDate, sent.post.scheduledTime, sent.post.timezone]), key: exportClaimKey });
    const record = { postId, expectedArticleSignature: approvalArticleSignature(sent.post), expectedVisualSignature: sent.reviewSignature, expectedIntentId: sent.intent._id, expectedSchedule, result: { exportClaimKey, artifact, prUrl: "https://github.com/fictional-owner/fictional-repo/pull/987654", prNumber: 987654, branchName: prepared.branchName, prStatus: "open" as const, sanitizedResponse: {} } };
    await expect(user.mutation(api.publishing.recordVisualPublicationPr, { ...record, result: { ...record.result, prUrl: "https://github.com/foreign-owner/foreign-repo/pull/987654" } })).rejects.toThrow("Recorded visual PR target is invalid");
    expect((await user.query(api.publishing.getPostById, { postId })).blogArtifact).toBeUndefined();
    expect(await t.run(ctx => ctx.db.query("v2PublishAttempts").collect())).toEqual([]);
    await expect(user.mutation(api.publishing.recordVisualPublicationPr, { ...record, expectedArticleSignature: approvalArticleSignature({ ...sent.post, content: sent.post.content.replace(heroSourceUrl!, changedSourceUrl) }) })).rejects.toThrow("Reviewed article changed");
    expect((await user.query(api.publishing.getPostById, { postId })).blogArtifact).toBeUndefined();
    expect(await t.run(ctx => ctx.db.query("v2PublishAttempts").collect())).toEqual([]);
    expect(await user.mutation(api.publishing.recordVisualPublicationPr, record)).toMatchObject({ recorded: true });
    expect((await user.query(api.publishing.getPostById, { postId })).blogArtifact).toEqual(artifact);
    await user.mutation(api.publishing.updateContent, { postId, content: sent.post.content.replace(heroSourceUrl!, changedSourceUrl) });
    expect(await user.action(api.articlePublication.refresh, { postId })).toMatchObject({ recorded: false, reason: expect.stringContaining("editorial version changed") });
    expect((await user.query(api.publishing.getPostById, { postId })).blogArtifact).toEqual(artifact);
    expect(await t.run(ctx => ctx.db.query("articlePublications").first())).toBeNull();
    expect(transport.read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses only current bound visual hero hash and manual alt without requiring a legacy crop", async () => {
    const f = await fixture();
    expect(await f.user.action(api.articlePublication.refresh, { postId: f.postId })).toMatchObject({ recorded: true });
    expect(transport.read).toHaveBeenCalledTimes(1);
    expect(transport.read.mock.calls[0][0]).toMatchObject({ heroSha256: "a".repeat(64), coverImageAlt: "Exact approved visual alt" });
  });
  it("holds a retained artifact with an empty hero hash before any publication read or receipt", async () => {
    const f = await fixture();
    const post = await f.user.query(api.publishing.getPostById, { postId: f.postId });
    await f.t.run(ctx => ctx.db.patch(f.postId, { blogArtifact: { ...post.blogArtifact, heroSha256: "" } }));
    expect(await f.user.action(api.articlePublication.refresh, { postId: f.postId })).toMatchObject({ recorded: false, reason: expect.stringMatching(/hero.*hash|hero.*unverified/i) });
    expect(transport.read).not.toHaveBeenCalled();
    expect(await f.t.run(ctx => ctx.db.query("articlePublications").first())).toBeNull();
    expect((await f.user.query(api.publishing.getPostById, { postId: f.postId })).status).toBe("pr-created");
  });
  it("blocks stale artifact editorial identity before any provider read or publication receipt write", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.postId, { content: "Changed exact copy." }));
    expect(await f.user.action(api.articlePublication.refresh, { postId: f.postId })).toMatchObject({ recorded: false, reason: expect.stringContaining("editorial version changed") });
    expect(transport.read).not.toHaveBeenCalled();
    expect(await f.t.run(ctx => ctx.db.query("articlePublications").first())).toBeNull();
  });
});

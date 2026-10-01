// @vitest-environment node
/// <reference types="vite/client" />
import { createHash } from "node:crypto";
import sharp from "sharp";
import { anyApi, type FunctionReturnType } from "convex/server";
import { convexTest } from "convex-test";
import { v } from "convex/values";
import { beforeEach, describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import { query, mutation, internalMutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { requireUserId } from "../campaignAccess";
import { fingerprintPostContent } from "../../lib/domain";
import { blogEditorialFingerprint } from "../../lib/blogContract";
import { assertFigureInsertionAnchor, buildFigureMarkdownBlock, figureSignatures, planFigureCandidates } from "../../lib/visualFigures";

const transport = vi.hoisted(() => ({ create: vi.fn(), refresh: vi.fn() }));
vi.mock("../../lib/github", async importOriginal => ({
  ...await importOriginal<typeof import("../../lib/github")>(),
  createBlogPostPR: transport.create,
  fetchBlogPrStatus: transport.refresh,
}));

const modules = import.meta.glob("../**/*.ts");
const OWNER = { subject: "publication-owner" };
type Snapshot = FunctionReturnType<typeof api.publishing.getPostForPublication>;
async function harness() {
  const records: unknown[] = [];
  const claims: unknown[] = [];
  const statusRecords: unknown[] = [];
  const reads: string[] = [];
  let recordingError: string | null = null;
  const owned = async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) => {
    if (await requireUserId(ctx) !== OWNER.subject) throw new Error("Post not found");
  };
  const t = convexTest(schema, { ...modules, "../publishing.ts": async () => ({
    getPostForPublication: query({ args: { postId: v.string() }, returns: v.any(), handler: async (ctx, args) => {
      await owned(ctx); if (args.postId !== snapshot.post._id) throw new Error("Post not found"); reads.push(args.postId); return snapshot;
    } }),
    claimBlogExport: mutation({ args: { postId: v.id("v2Posts"), fingerprint: v.string(), schedule: v.string(), key: v.string(), expectedVisualSignature: v.string(), expectedIntentId: v.id("v2PublishingIntents"), expectedSchedule: v.object({ scheduledDate: v.string(), scheduledTime: v.optional(v.string()), timezone: v.string() }) }, returns: v.string(), handler: async (ctx, args) => {
      await owned(ctx); claims.push(args); return args.key;
    } }),
    recordVisualPublicationPr: internalMutation({ args: { postId: v.id("v2Posts"), result: v.any(), expectedArticleSignature: v.string(), expectedVisualSignature: v.string(), expectedIntentId: v.id("v2PublishingIntents"), expectedSchedule: v.object({ scheduledDate: v.string(), scheduledTime: v.optional(v.string()), timezone: v.string() }) }, returns: v.any(), handler: async (ctx, args) => {
      await owned(ctx); records.push(args); if (recordingError) throw new Error(recordingError); return { recorded: true, attemptId: "retained-attempt" };
    } }),
    getVisualPublicationPr: query({ args: { postId: v.string() }, returns: v.any(), handler: async (ctx, args) => {
      await owned(ctx); if (args.postId !== snapshot.post._id || !snapshot.post.prUrl) throw new Error("Recorded visual publication PR not found"); return snapshot.post;
    } }),
    recordVisualPublicationPrStatus: internalMutation({ args: { postId: v.id("v2Posts"), expectedPrUrl: v.string(), prStatus: v.string(), prNumber: v.optional(v.number()) }, returns: v.any(), handler: async (ctx, args) => {
      await owned(ctx); statusRecords.push(args); if (recordingError) throw new Error(recordingError); if (args.expectedPrUrl !== snapshot.post.prUrl) throw new Error("Recorded PR changed before server status recording"); return { updated: true, prStatus: args.prStatus };
    } }),
  }) });
  const bytes = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#2e5b60" } }).webp().toBuffer();
  const snapshot: Snapshot = await t.run(async ctx => {
    const postId = await ctx.db.insert("v2Posts", { userId: OWNER.subject, brandId: "corvo", channelId: "corvo-blog", platformId: "corvo-blog", title: "Fictional publication inspection", content: "A fictional raven checks a gear.", status: "draft", approvalState: "approved", scheduledDate: "2026-10-04", scheduledTime: "10:30", timezone: "UTC", blogExcerpt: "Saved excerpt", blogAuthor: "Saved author", blogCategory: "strategy", blogPublicationIntent: "draft", blogTags: ["Saved tag"], blogSlug: "fictional-inspection", contentFingerprint: "fixture", createdAt: 1, updatedAt: 1 });
    const post = (await ctx.db.get(postId))!;
    const intentId = await ctx.db.insert("v2PublishingIntents", { postId, userId: OWNER.subject, brandId: "corvo", channelId: "corvo-blog", platformId: "corvo-blog", scheduledDate: "2026-10-04", scheduledTime: "10:30", timezone: "UTC", approvalState: "approved", contentFingerprint: fingerprintPostContent(post), createdAt: 1, updatedAt: 1 });
    const storageId = await ctx.storage.store(new Blob([Uint8Array.from(bytes).buffer], { type: "image/webp" }));
    return { post, intent: (await ctx.db.get(intentId))!, figures: [], reviewSignature: "reviewed-visual-signature", visuals: {
      articleSignature: "reviewed-article-signature", hero: { versionId: "trusted-query-hero" as Id<"v2VisualVersions">, storageId, sha256: createHash("sha256").update(bytes).digest("hex"), alt: "A fictional raven checking a gear", metadata: { width: 1600, height: 900, bytes: bytes.length, format: "webp", crop: "reviewed crop" }, approvedBy: OWNER.subject, approvedAt: 1, provider: "offline-fixture", model: "offline-fixture", quoteProvenance: "LOCAL OFFLINE FIXTURE", qualification: "offline-fixture", url: "https://owned-storage.invalid/hero" },
    } };
  });
  return { t, user: t.withIdentity(OWNER), snapshot, bytes, records, claims, reads, statusRecords, failRecording: (message: string) => { recordingError = message; } };
}

function qualifiedMock(snapshot: Snapshot) {
  Object.assign(snapshot.visuals!.hero, { provider: "mock-provider", model: "mock-model", quoteProvenance: "Mock trusted snapshot receipt", qualification: "live-receipt" });
}
const created = { prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/123456", branchName: "blog/mock-review", sanitizedResponse: { repo: "jakebutler/corvo-labs-dot-com", prUrl: "https://github.com/jakebutler/corvo-labs-dot-com/pull/123456", branchName: "blog/mock-review", number: 123456, state: "open", scheduleTrigger: "pr-body" as const, scheduledDate: "2026-10-04", scheduledTime: "10:30", timezone: "UTC" } };

beforeEach(() => { transport.create.mockReset(); transport.refresh.mockReset(); });
describe("server-owned visual publication", () => {
  it("claims the exact visual version and schedule before transport can create a PR", async () => {
    const { user, snapshot, claims } = await harness();
    qualifiedMock(snapshot);
    transport.create.mockImplementation(async () => { expect(claims).toHaveLength(1); return created; });
    await user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id });
    expect(claims).toEqual([expect.objectContaining({ postId: snapshot.post._id,
      fingerprint: blogEditorialFingerprint(snapshot.post),
      schedule: JSON.stringify([snapshot.post.scheduledDate, snapshot.post.scheduledTime, snapshot.post.timezone]),
      expectedVisualSignature: snapshot.reviewSignature, expectedIntentId: snapshot.intent._id,
      expectedSchedule: { scheduledDate: "2026-10-04", scheduledTime: "10:30", timezone: "UTC" } })]);
    expect(transport.create).toHaveBeenCalledTimes(1);
  });
  it("pauses a new publication dispatch server-side before transport while preserving retained PR status refresh", async () => {
    const { user, snapshot, records } = await harness();
    qualifiedMock(snapshot);
    snapshot.post.prUrl = created.prUrl;
    transport.create.mockResolvedValue(created);
    transport.refresh.mockResolvedValue({ prUrl: created.prUrl, prStatus: "open", prNumber: 123456 });
    vi.stubEnv("EDITORIAL_VISUALS_ENABLED", "0");
    try {
      await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id })).rejects.toThrow("Editorial visual admissions are paused");
      expect(transport.create).not.toHaveBeenCalled();
      expect(records).toEqual([]);
      expect(await user.action(anyApi.visualPublication.refreshPr, { postId: snapshot.post._id })).toMatchObject({ recorded: true, prStatus: "open" });
      expect(transport.refresh).toHaveBeenCalledExactlyOnceWith(created.prUrl);
    } finally { vi.unstubAllEnvs(); }
  });
  it("rejects offline engineering provenance through the public action before GitHub transport", async () => {
    const { user, snapshot, records } = await harness();
    await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id })).rejects.toThrow(/Offline engineering visuals cannot be published/);
    expect(transport.create).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });
  it("rejects an operator qualification probe even after human image approval", async () => {
    const { user, snapshot, records } = await harness();
    Object.assign(snapshot.visuals!.hero, { provider: "openai", model: "gpt-image-1-mini", quoteProvenance: "Reviewed operator qualification packet", qualification: "qualification-probe" });
    await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id })).rejects.toThrow("Qualification probe images cannot be published");
    expect(transport.create).not.toHaveBeenCalled();
    expect(records).toEqual([]);
  });

  it("publishes exactly one trusted saved snapshot and passes its complete hero and figure proofs to mocked transport", async () => {
    const { user, snapshot, bytes, records, reads } = await harness();
    qualifiedMock(snapshot);
    const article = { id: "articleSource", name: "Saved article", format: "markdown" as const, purpose: "article" as const, content: "## Fictional flow\n\n| from | to | relation |\n|---|---|---|\n| Reader | Editor | sends feedback |" };
    const spec = planFigureCandidates(article, []).candidates[0];
    const signatures = await figureSignatures(spec);
    const anchor = assertFigureInsertionAnchor(article.content, spec.insertionAnchor);
    snapshot.post.content = article.content.slice(0, anchor) + "\n\n" + buildFigureMarkdownBlock("candidate1", spec) + article.content.slice(anchor);
    snapshot.post.linkedinFirstComment = "Saved first comment";
    const bodyHash = createHash("sha256").update(snapshot.post.content).digest("hex");
    const figure: Snapshot["figures"][number] = { candidateId: "candidate1" as Id<"v2FigureCandidates">, spec, ...signatures, url: "resonate-figure://candidate1", caption: spec.presentation.caption, sourceNote: spec.presentation.sourceNote, alt: spec.presentation.alt,
      postId: snapshot.post._id, postContentSha256: bodyHash, postContentFingerprint: fingerprintPostContent(snapshot.post), acceptedBy: OWNER.subject, acceptedAt: 1, evidenceSources: [{ sourceId: article.id as Id<"v2FigureSources">, sha256: createHash("sha256").update(article.content).digest("hex"), revision: 1, purpose: "article", currentSourceId: null, currentSha256: bodyHash, currentRevision: null }] };
    snapshot.figures.push(figure);
    transport.create.mockResolvedValue(created);
    expect(await user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id })).toEqual({ ...created, recorded: true });
    expect(reads).toEqual([snapshot.post._id]);
    expect(transport.create).toHaveBeenCalledTimes(1);
    const params = transport.create.mock.calls[0][0];
    expect(params).toMatchObject({ postId: snapshot.post._id, title: snapshot.post.title, content: snapshot.post.content, linkedinFirstComment: snapshot.post.linkedinFirstComment, scheduledDate: snapshot.intent.scheduledDate, scheduledTime: snapshot.intent.scheduledTime, timezone: snapshot.intent.timezone,
      scheduleTrigger: "pr-body", status: "draft", featured: false, excerpt: snapshot.post.blogExcerpt, author: snapshot.post.blogAuthor, tags: snapshot.post.blogTags, category: snapshot.post.blogCategory, slug: snapshot.post.blogSlug, coverImageAlt: snapshot.visuals!.hero.alt });
    expect(params).not.toHaveProperty("subtitle");
    expect(Buffer.from(params.images[0].export.bytes)).toEqual(bytes);
    expect(params.images[0].export.hero).toEqual({ provider: "mock-provider", model: "mock-model", quoteProvenance: "Mock trusted snapshot receipt", qualification: "live-receipt", approvedBy: OWNER.subject, approvedAt: 1 });
    expect(params.images[1].export.figure).toEqual({ spec, rendererVersion: signatures.rendererVersion, dataSignature: signatures.dataSignature, presentationSignature: signatures.presentationSignature, postId: snapshot.post._id, postContentSha256: bodyHash, postContentFingerprint: fingerprintPostContent(snapshot.post), acceptedBy: OWNER.subject, acceptedAt: 1, evidenceSources: figure.evidenceSources });
    expect(records).toEqual([{ postId: snapshot.post._id, result: { ...created, exportClaimKey: expect.any(String), prStatus: "open", prNumber: 123456 }, expectedArticleSignature: JSON.stringify({ title: snapshot.post.title, content: snapshot.post.content, linkedinFirstComment: snapshot.post.linkedinFirstComment }), expectedVisualSignature: snapshot.reviewSignature, expectedIntentId: snapshot.intent._id, expectedSchedule: { scheduledDate: "2026-10-04", scheduledTime: "10:30", timezone: "UTC" } }]);
  });

  it("refreshes only the server-recorded PR URL and records the server-fetched status", async () => {
    const { user, snapshot, statusRecords } = await harness();
    snapshot.post.prUrl = created.prUrl;
    transport.refresh.mockResolvedValue({ prUrl: created.prUrl, prStatus: "merged", prNumber: 123456 });
    expect(await user.action(anyApi.visualPublication.refreshPr, { postId: snapshot.post._id })).toEqual({ prUrl: created.prUrl, prStatus: "merged", prNumber: 123456, recorded: true });
    expect(transport.refresh).toHaveBeenCalledExactlyOnceWith(created.prUrl);
    expect(statusRecords).toEqual([{ postId: snapshot.post._id, expectedPrUrl: created.prUrl, prStatus: "merged", prNumber: 123456 }]);
  });

  it("retains the created PR in a review error when approval changes before recording, without retrying transport", async () => {
    const { user, snapshot, records, failRecording } = await harness();
    qualifiedMock(snapshot);
    failRecording("Reviewed visuals changed; reload before final approval");
    transport.create.mockResolvedValue(created);
    await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id })).rejects.toMatchObject({ data: {
      code: "VISUAL_PR_RECORDING_REQUIRES_REVIEW", message: expect.stringMatching(/Inspect this retained PR.*before any retry/), prUrl: created.prUrl, branchName: created.branchName, sanitizedResponse: created.sanitizedResponse,
    } });
    expect(transport.create).toHaveBeenCalledTimes(1);
    expect(records).toHaveLength(1);
    expect(snapshot.post.prUrl).toBeUndefined();
  });

  it("denies anonymous and foreign calls before transport, including a guessed post ID", async () => {
    const { t, user, snapshot } = await harness();
    qualifiedMock(snapshot);
    snapshot.post.prUrl = created.prUrl;
    for (const name of ["createPr", "refreshPr"]) {
      await expect(t.action(anyApi.visualPublication[name], { postId: snapshot.post._id })).rejects.toThrow("Unauthorized");
      await expect(t.withIdentity({ subject: "foreign-owner" }).action(anyApi.visualPublication[name], { postId: snapshot.post._id })).rejects.toThrow("Post not found");
    }
    await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.intent.postId.replace(/^./u, "x") })).rejects.toThrow();
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.refresh).not.toHaveBeenCalled();
  });

  it("preserves actual publishing-query ownership and approval checks when the database supplies the snapshot", async () => {
    const t = convexTest(schema, modules);
    await t.run(async ctx => {
      for (const [userId, brandId, role] of [[OWNER.subject, "corvo", "owner"], ["foreign-owner", "lower-db", "owner"], ["viewer", "corvo", "viewer"]] as const) {
        await ctx.db.insert("v2BrandMemberships", { userId, brandId, role, createdAt: 1, updatedAt: 1 });
      }
    });
    const user = t.withIdentity(OWNER);
    const { postId } = await user.mutation(api.publishing.createPostWithIntent, { brandId: "corvo", channelId: "corvo-blog", title: "Fictional saved ownership", content: "Saved fictional body." });
    for (const identity of [{ subject: "foreign-owner" }, { subject: "viewer" }]) {
      await expect(t.withIdentity(identity).action(anyApi.visualPublication.createPr, { postId })).rejects.toThrow("Post not found");
      await expect(t.withIdentity(identity).action(anyApi.visualPublication.refreshPr, { postId })).rejects.toThrow("Post not found");
    }
    await expect(user.action(anyApi.visualPublication.createPr, { postId })).rejects.toThrow("Post is not approved");
    await expect(user.action(anyApi.visualPublication.refreshPr, { postId })).rejects.toThrow("Recorded visual publication PR not found");
    expect(transport.create).not.toHaveBeenCalled();
    expect(transport.refresh).not.toHaveBeenCalled();
  });

  it("rejects altered hero bytes, metadata, missing hero and client-supplied publication fields before transport", async () => {
    const { user, snapshot, bytes } = await harness();
    qualifiedMock(snapshot);
    const hero = snapshot.visuals!.hero;
    hero.sha256 = "a".repeat(64);
    await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id })).rejects.toThrow(/reviewed hash/);
    hero.sha256 = createHash("sha256").update(bytes).digest("hex");
    hero.metadata.bytes += 1;
    await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id })).rejects.toThrow(/reviewed export/);
    snapshot.visuals = null;
    await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id })).rejects.toThrow(/Approve a prepared hero/);
    await expect(user.action(anyApi.visualPublication.createPr, { postId: snapshot.post._id, title: "Client title", content: "Client content", status: "published", images: [] })).rejects.toThrow();
    expect(transport.create).not.toHaveBeenCalled();
  });

  it("does not record a refreshed status if the saved PR URL changes during its fetch", async () => {
    const { user, snapshot, statusRecords } = await harness();
    snapshot.post.prUrl = created.prUrl;
    transport.refresh.mockImplementation(async () => {
      snapshot.post.prUrl = "https://github.com/jakebutler/corvo-labs-dot-com/pull/123457";
      return { prUrl: created.prUrl, prStatus: "merged", prNumber: 123456 };
    });
    await expect(user.action(anyApi.visualPublication.refreshPr, { postId: snapshot.post._id })).rejects.toThrow(/Recorded PR changed/);
    expect(transport.refresh).toHaveBeenCalledTimes(1);
    expect(statusRecords).toEqual([{ postId: snapshot.post._id, expectedPrUrl: created.prUrl, prStatus: "merged", prNumber: 123456 }]);
  });
});

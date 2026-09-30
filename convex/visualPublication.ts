"use node";

import { createHash } from "node:crypto";
import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { requireUserId } from "./campaignAccess";
import { assertVisualAdmissionEnabled } from "./visualRollout";
import { resolvePublicationSchedule } from "../lib/publicationReview";
import { createBlogPostPR, fetchBlogPrStatus, prepareBlogPublication, type BlogPublicationParams, type BlogPrStatus } from "../lib/github";

const sanitizedResponseValidator = v.object({
  repo: v.string(), prUrl: v.string(), branchName: v.string(), number: v.optional(v.number()), state: v.optional(v.string()),
  scheduleTrigger: v.union(v.literal("frontmatter"), v.literal("pr-body")), scheduledDate: v.string(),
  scheduledTime: v.optional(v.string()), timezone: v.optional(v.string()),
});
type CreatedPr = Awaited<ReturnType<typeof createBlogPostPR>> & { recorded: true };
const prStatusValidator = v.union(v.literal("open"), v.literal("merged"), v.literal("closed"), v.literal("draft"));

/** The caller selects an owned post; the approved database snapshot supplies every publication field. */
export const createPr = action({
  args: { postId: v.id("v2Posts") },
  returns: v.object({ prUrl: v.string(), branchName: v.string(), sanitizedResponse: sanitizedResponseValidator, recorded: v.literal(true) }),
  handler: async (ctx, args): Promise<CreatedPr> => {
    const userId = await requireUserId(ctx);
    const snapshot = await ctx.runQuery(api.publishing.getPostForPublication, { postId: args.postId });
    assertVisualAdmissionEnabled(userId);
    const { post, intent } = snapshot;
    const hero = snapshot.visuals?.hero;
    if (!hero) throw new Error("Approve a prepared hero before creating a visual publication PR");
    const blob = await ctx.storage.get(hero.storageId);
    if (!blob) throw new Error("Approved hero bytes are missing");
    if (blob.size >= 150_000) throw new Error("Approved hero must be below 150 KB");
    const heroBytes = new Uint8Array(await blob.arrayBuffer());
    if (createHash("sha256").update(heroBytes).digest("hex") !== hero.sha256) throw new Error("Approved hero bytes no longer match their reviewed hash");
    if (hero.metadata.width !== 1600 || hero.metadata.height !== 900 || hero.metadata.format !== "webp" || hero.metadata.bytes !== heroBytes.byteLength) {
      throw new Error("Approved hero metadata no longer matches its reviewed export");
    }
    const dispatchSchedule = resolvePublicationSchedule(post, intent, new Date().toISOString().slice(0, 10));
    const params: BlogPublicationParams = {
      postId: post._id, title: post.title, content: post.content, linkedinFirstComment: post.linkedinFirstComment,
      ...dispatchSchedule,
      scheduleTrigger: "pr-body", status: "draft", featured: false,
      excerpt: post.blogExcerpt, author: post.blogAuthor, tags: post.blogTags, category: post.blogCategory, slug: post.blogSlug,
      coverImageAlt: hero.alt,
      images: [{ sourceUrl: hero.url, alt: hero.alt, isCover: true, export: {
        bytes: heroBytes, sha256: hero.sha256, fileName: "hero.webp", contentType: "image/webp",
        hero: { provider: hero.provider, model: hero.model, quoteProvenance: hero.quoteProvenance, qualification: hero.qualification, approvedBy: hero.approvedBy, approvedAt: hero.approvedAt },
      } }, ...snapshot.figures.map(figure => ({ sourceUrl: figure.url, alt: figure.alt, export: {
        bytes: new TextEncoder().encode(figure.svg), sha256: figure.svgSha256, fileName: `figure-${figure.candidateId}.svg`, contentType: "image/svg+xml" as const,
        figure: { spec: figure.spec, rendererVersion: figure.rendererVersion, dataSignature: figure.dataSignature, presentationSignature: figure.presentationSignature,
          postId: figure.postId, postContentSha256: figure.postContentSha256, postContentFingerprint: figure.postContentFingerprint,
          acceptedBy: figure.acceptedBy, acceptedAt: figure.acceptedAt, evidenceSources: figure.evidenceSources },
      } }))],
    };
    // Validate actual bytes and all provenance before the transport can create a branch.
    await prepareBlogPublication(params);
    const result = await createBlogPostPR(params);
    try {
      await ctx.runMutation(internal.publishing.recordVisualPublicationPr, {
        postId: args.postId, result: { ...result, prStatus: "open", ...(result.sanitizedResponse.number === undefined ? {} : { prNumber: result.sanitizedResponse.number }) },
        expectedArticleSignature: JSON.stringify({ title: post.title, content: post.content, linkedinFirstComment: post.linkedinFirstComment ?? "" }),
        expectedVisualSignature: snapshot.reviewSignature,
        expectedIntentId: intent._id, expectedSchedule: dispatchSchedule,
      });
    } catch {
      throw new ConvexError({ code: "VISUAL_PR_RECORDING_REQUIRES_REVIEW", message: "The PR was created, but its saved publication state could not be recorded. Inspect this retained PR and reload the current approval before any retry.", prUrl: result.prUrl, branchName: result.branchName, sanitizedResponse: result.sanitizedResponse });
    }
    return { ...result, recorded: true };
  },
});

/** Fetch status for the owned recorded URL, never a URL or status supplied by the client. */
export const refreshPr = action({
  args: { postId: v.id("v2Posts") },
  returns: v.object({ prUrl: v.string(), prStatus: prStatusValidator, prNumber: v.union(v.number(), v.null()), recorded: v.literal(true) }),
  handler: async (ctx, args): Promise<{ prUrl: string; prStatus: BlogPrStatus; prNumber: number | null; recorded: true }> => {
    await requireUserId(ctx);
    const post = await ctx.runQuery(api.publishing.getVisualPublicationPr, { postId: args.postId });
    if (!post.prUrl) throw new Error("Recorded visual publication PR not found");
    const status = await fetchBlogPrStatus(post.prUrl);
    await ctx.runMutation(internal.publishing.recordVisualPublicationPrStatus, {
      postId: args.postId, expectedPrUrl: post.prUrl, prStatus: status.prStatus,
      ...(status.prNumber === null ? {} : { prNumber: status.prNumber }),
    });
    return { prUrl: post.prUrl, prStatus: status.prStatus, prNumber: status.prNumber, recorded: true };
  },
});

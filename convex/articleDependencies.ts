import { priorDispatchHold } from "./bufferAttempts";
import { articleArtifactVersion, articlePublicationSourceVersion } from "../lib/articleContracts";
import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { audit, requireUserId, requireBrandAccess } from "./campaignAccess";
import { seriesPost } from "./series";
import { blogEditorialFingerprint } from "../lib/blogContract";
import {
  companionReviewVersion,
  proposeArticleLink,
  publicationEvidenceHold,
  exactScheduleHold,
  hasCanonicalLink,
} from "../lib/articleContracts";
import { fingerprintPostContent } from "../lib/domain";
import { blogArtifactValidator } from "./blogValidators";
import { publicationEvidenceValidator } from "./articleValidators";
import type { Doc, Id } from "./_generated/dataModel";
export async function latestPublication(
  ctx: QueryCtx | MutationCtx,
  postId: Id<"v2Posts">,
) {
  return ctx.db
    .query("articlePublications")
    .withIndex("by_post_and_time", (q) => q.eq("postId", postId))
    .order("desc")
    .first();
}
export async function companionSubmissionHold(
  ctx: QueryCtx | MutationCtx,
  post: Doc<"v2Posts">,
) {
  const schedule = exactScheduleHold(post);
  if (schedule) return schedule;
  if (!post.companionLink) {
    if (
      await ctx.db
        .query("seriesPostLinks")
        .withIndex("by_post", (q) => q.eq("postId", post._id))
        .first()
    )
      return "Link the series companion's parent article and review its canonical URL.";
    return null;
  }
  const link = post.companionLink;
  if (link.placement === "first-comment" && post.channelId !== "linkedin") return "First-comment placement requires LinkedIn; review a body link.";
  const article = await ctx.db.get(link.articlePostId);
  if (
    !article ||
    article.userId !== post.userId ||
    article.brandId !== post.brandId ||
    article.channelId !== "corvo-blog"
  )
    return "Parent article is inaccessible or has changed.";
  try {
    await requireBrandAccess(ctx, post.userId, article.brandId);
  } catch {
    return "Parent article access was revoked.";
  }
  if (
    !article.blogArtifact ||
    link.canonicalUrl !== article.blogArtifact.canonicalUrl
  )
    return "Review the current canonical article URL.";
  const final =
    link.placement === "body"
      ? post.content
      : (post.linkedinFirstComment ?? "");
  if (
    link.resolvedPlacement !== link.placement ||
    !hasCanonicalLink(final, link.canonicalUrl) ||
    post.content.includes("{{articleUrl}}") ||
    post.linkedinFirstComment?.includes("{{articleUrl}}")
  )
    return "Resolve the final article link in the reviewed body/comment.";
  const receipt = await latestPublication(ctx, article._id);
  return publicationEvidenceHold(
    receipt?.evidence,
    blogEditorialFingerprint(article),
    articleArtifactVersion(article.blogArtifact),
  );
}
async function own(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  id: Id<"v2Posts">,
  edit = false,
) {
  const post = await ctx.db.get(id);
  if (!post || post.userId !== userId) throw new Error("Post not found");
  const role = await requireBrandAccess(ctx, userId, post.brandId);
  if (edit && role.role === "viewer") throw new Error("Editor access required");
  return post;
}
export const context = internalQuery({
  args: { postId: v.id("v2Posts"), userId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const post = await own(ctx, args.userId, args.postId, true);
    if (post.channelId !== "corvo-blog") throw new Error("Article required");
    return post;
  },
});
export const record = internalMutation({
  args: {
    postId: v.id("v2Posts"),
    userId: v.string(),
    expectedArtifactVersion: v.string(),
    expectedSourceVersion: v.string(),
    evidence: publicationEvidenceValidator,
    key: v.string(),
    artifact: v.optional(blogArtifactValidator),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const post = await own(ctx, args.userId, args.postId, true);
    if (
      articlePublicationSourceVersion(post) !== args.expectedSourceVersion ||
      post.channelId !== "corvo-blog" ||
      blogEditorialFingerprint(post) !== args.evidence.editorialVersion ||
      articleArtifactVersion(post.blogArtifact) !== args.expectedArtifactVersion
    )
      return false;
    const latest = await latestPublication(ctx, post._id);
    if (latest && latest.evidence.checkedAt > args.evidence.checkedAt)
      return false;
    if (
      args.artifact &&
      (!post.blogArtifact ||
        articleArtifactVersion(post.blogArtifact) !==
          articleArtifactVersion(args.artifact))
    ) {
      if (post.blogArtifact) return false;
      await ctx.db.patch(post._id, { blogArtifact: args.artifact });
      await audit(ctx, {
        userId: args.userId,
        brandId: post.brandId,
        postId: post._id,
        action: "blog.artifact_recovered",
        summary:
          "Recovered one exact article artifact from complete PR files without editing copy or receipts.",
        metadata: { artifact: args.artifact },
      });
    }
    const existing = await ctx.db
      .query("articlePublications")
      .withIndex("by_post_and_key", (q) =>
        q.eq("postId", post._id).eq("key", args.key),
      )
      .first();
    if (existing) await ctx.db.patch(existing._id, { evidence: args.evidence });
    else
      await ctx.db.insert("articlePublications", {
        postId: post._id,
        userId: args.userId,
        key: args.key,
        evidence: args.evidence,
      });
    const patch: Partial<Doc<"v2Posts">> = {};
    if (args.evidence.prState !== "unknown") {
      patch.blogPrStatus = args.evidence.prState;
      patch.blogPrUpdatedAt = args.evidence.checkedAt;
    }
    if (
      !publicationEvidenceHold(
        args.evidence,
        blogEditorialFingerprint(post),
        articleArtifactVersion(args.artifact ?? post.blogArtifact),
      )
    )
      patch.status = "published";
    await ctx.db.patch(post._id, patch);
    if (!existing)
      await audit(ctx, {
        userId: args.userId,
        brandId: post.brandId,
        postId: post._id,
        action: "blog.publication_checked",
        summary:
          args.evidence.reason ??
          "Verified exact Production commit and canonical article content.",
        metadata: {
          key: args.key,
          prState: args.evidence.prState,
          mergeSha: args.evidence.mergeSha,
          deploymentSha: args.evidence.deploymentSha,
          availability: args.evidence.availability,
        },
      });
    return true;
  },
});
export const details = query({
  args: { postId: v.id("v2Posts") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await own(ctx, userId, args.postId);
    const article =
      post.channelId === "corvo-blog"
        ? post
        : post.companionLink
          ? await seriesPost(
              ctx,
              userId,
              post.brandId,
              post.companionLink.articlePostId,
            )
          : null;
    const receipt = article ? await latestPublication(ctx, article._id) : null;
    return {
      post,
      article,
      receipt,
      hold:
        post.channelId === "corvo-blog"
          ? publicationEvidenceHold(
              receipt?.evidence,
              blogEditorialFingerprint(post),
              articleArtifactVersion(post.blogArtifact),
            )
          : await companionSubmissionHold(ctx, post),
      scheduleHold: await priorDispatchHold(ctx, post._id),
      proposal:
        post.companionLink && article?.blogArtifact
          ? proposeArticleLink(
              post,
              article.blogArtifact.canonicalUrl,
              post.companionLink.placement,
            )
          : null,
      version: companionReviewVersion(post),
    };
  },
});
export const candidates = query({
  args: { postId: v.id("v2Posts") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await own(ctx, userId, args.postId);
    const rows = await ctx.db
      .query("v2Posts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(501);
    return {
      posts: rows
        .slice(0, 500)
        .filter(
          (p) => p.brandId === post.brandId && p.channelId === "corvo-blog",
        ),
      partial: rows.length > 500,
    };
  },
});
export const link = mutation({
  args: {
    postId: v.id("v2Posts"),
    articlePostId: v.id("v2Posts"),
    placement: v.union(v.literal("body"), v.literal("first-comment")),
    expectedVersion: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await own(ctx, userId, args.postId, true);
    const article = await seriesPost(
      ctx,
      userId,
      post.brandId,
      args.articlePostId,
    );
    if (
      post.channelId === "corvo-blog" ||
      article.channelId !== "corvo-blog" ||
      companionReviewVersion(post) !== args.expectedVersion
    )
      throw new Error("Companion or parent selection changed; review again.");
    if (args.placement === "first-comment" && post.channelId !== "linkedin") throw new Error("First-comment placement requires LinkedIn; use a body link for this channel.");
    const url = article.blogArtifact?.canonicalUrl;
    const field =
      args.placement === "body" ? post.content : post.linkedinFirstComment;
    const companionLink = {
      articlePostId: article._id,
      placement: args.placement,
      canonicalUrl:
        url && field && hasCanonicalLink(field, url)
          ? url
          : post.companionLink?.canonicalUrl,
      resolvedPlacement:
        url && field && hasCanonicalLink(field, url)
          ? args.placement
          : post.companionLink?.resolvedPlacement,
    };
    await ctx.db.patch(post._id, {
      companionLink,
      destinationReview: undefined,
    });
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: post._id,
      action: "companion.link",
      summary:
        "Linked article dependency without altering copy, approval, schedules or publication receipts.",
      metadata: { articlePostId: article._id, placement: args.placement },
    });
    return null;
  },
});
export const applyLink = mutation({
  args: {
    postId: v.id("v2Posts"),
    expectedVersion: v.string(),
    canonicalUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await own(ctx, userId, args.postId, true);
    if (
      !post.companionLink ||
      companionReviewVersion(post) !== args.expectedVersion
    )
      throw new Error("Companion changed; review the complete proposal again.");
    const article = await seriesPost(
      ctx,
      userId,
      post.brandId,
      post.companionLink.articlePostId,
    );
    if (article.blogArtifact?.canonicalUrl !== args.canonicalUrl)
      throw new Error("Canonical artifact changed; refresh the proposal.");
    if (post.companionLink.placement === "first-comment" && post.channelId !== "linkedin") throw new Error("First-comment placement requires LinkedIn.");
    const proposal = proposeArticleLink(
      post,
      args.canonicalUrl,
      post.companionLink.placement,
    );
    if (!proposal.content.trim())
      throw new Error(
        "Link placement leaves an empty body; explicitly write companion copy first.",
      );
    const changed =
      proposal.content !== post.content ||
      proposal.linkedinFirstComment !== post.linkedinFirstComment;
    const fingerprint = fingerprintPostContent({
      title: post.title,
      ...proposal,
    });
    await ctx.db.patch(post._id, {
      ...proposal,
      companionLink: {
        ...post.companionLink,
        canonicalUrl: args.canonicalUrl,
        resolvedPlacement: post.companionLink.placement,
      },
      destinationReview: undefined,
      ...(changed
        ? {
            approvalState: "unapproved" as const,
            contentFingerprint: fingerprint,
            updatedAt: Date.now(),
          }
        : {}),
    });
    if (changed) {
      const intent = await ctx.db
        .query("v2PublishingIntents")
        .withIndex("by_post_and_updated_at", (q) => q.eq("postId", post._id))
        .order("desc")
        .first();
      if (intent)
        await ctx.db.patch(intent._id, {
          approvalState: "unapproved",
          contentFingerprint: fingerprint,
          updatedAt: Date.now(),
        });
    }
    await audit(ctx, {
      userId,
      brandId: post.brandId,
      postId: post._id,
      action: "companion.resolve_link",
      summary: changed
        ? "Applied the explicitly reviewed canonical link proposal; editorial reapproval required."
        : "Canonical URL already matched saved copy; approval and receipts preserved.",
      metadata: {
        articlePostId: article._id,
        canonicalUrl: args.canonicalUrl,
        placement: post.companionLink.placement,
      },
    });
    return null;
  },
});

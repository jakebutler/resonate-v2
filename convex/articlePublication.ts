"use node";
import { articleArtifactVersion, articlePublicationSourceVersion } from "../lib/articleContracts";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./campaignAccess";
import {
  readArticlePublication,
  articleEvidenceKey,
} from "../lib/articlePublication";
import { blogEditorialFingerprint } from "../lib/blogContract";
import type { Doc } from "./_generated/dataModel";
export const refresh = action({
  args: { postId: v.id("v2Posts") },
  returns: v.object({ recorded: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (
    ctx,
    args,
  ): Promise<{ recorded: boolean; reason?: string }> => {
    const userId = await requireUserId(ctx);
    const post: Doc<"v2Posts"> = await ctx.runQuery(
      internal.articleDependencies.context,
      { ...args, userId },
    );
    if (!post.prUrl)
      return {
        recorded: false,
        reason: "Open or adopt the bound article PR first.",
      };
    if (
      post.heroImageStorageId &&
      (!post.preparedHero ||
        post.preparedHero.sourceStorageId !== post.heroImageStorageId)
    )
      return {
        recorded: false,
        reason:
          "Prepare and review the current uploaded hero before checking publication.",
      };
    const result = await readArticlePublication({
      prUrl: post.prUrl,
      branchName: post.branchName,
      title: post.title,
      content: post.content,
      slug: post.blogSlug,
      artifact: post.blogArtifact,
      publicationIntent: post.blogPublicationIntent,
      excerpt: post.blogExcerpt,
      author: post.blogAuthor,
      category: post.blogCategory,
      tags: post.blogTags,
      coverImageAlt: post.coverImageAlt,
      heroSha256:
        post.preparedHero?.sourceStorageId === post.heroImageStorageId
          ? post.preparedHero?.sha256
          : undefined,
      editorialVersion: blogEditorialFingerprint(post),
    });
    const recorded = await ctx.runMutation(
      internal.articleDependencies.record,
      {
        ...args,
        userId,
        expectedArtifactVersion: articleArtifactVersion(post.blogArtifact),
        expectedSourceVersion: articlePublicationSourceVersion(post),
        ...result,
        key: articleEvidenceKey(result.evidence),
      },
    );
    return {
      recorded,
      reason: recorded
        ? result.evidence.reason
        : "Article changed during verification; check the current version again.",
    };
  },
});

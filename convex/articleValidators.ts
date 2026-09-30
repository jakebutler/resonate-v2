import { v } from "convex/values";
export const companionLinkValidator = v.object({
  articlePostId: v.id("v2Posts"),
  placement: v.union(v.literal("body"), v.literal("first-comment")),
  resolvedPlacement: v.optional(
    v.union(v.literal("body"), v.literal("first-comment")),
  ),
  canonicalUrl: v.optional(v.string()),
});
export const publicationEvidenceValidator = v.object({
  checkedAt: v.number(),
  editorialVersion: v.string(),
  artifactVersion: v.string(),
  prState: v.union(
    v.literal("open"),
    v.literal("draft"),
    v.literal("merged"),
    v.literal("closed"),
    v.literal("unknown"),
  ),
  headSha: v.optional(v.string()),
  mergeSha: v.optional(v.string()),
  deploymentId: v.optional(v.number()),
  deploymentSha: v.optional(v.string()),
  deploymentState: v.string(),
  deploymentContainsArticle: v.optional(v.boolean()),
  environment: v.optional(v.string()),
  articleBlobSha: v.optional(v.string()),
  availability: v.union(
    v.literal("verified"),
    v.literal("unverified"),
    v.literal("blocked"),
  ),
  canonicalUrl: v.optional(v.string()),
  expectedHash: v.optional(v.string()),
  observedHash: v.optional(v.string()),
  reason: v.optional(v.string()),
});

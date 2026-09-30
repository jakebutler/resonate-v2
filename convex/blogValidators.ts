import { v } from "convex/values";
export const blogArtifactValidator = v.object({
  repository: v.string(), prNumber: v.number(), branchName: v.string(), mdxPath: v.string(),
  heroPath: v.optional(v.string()), canonicalUrl: v.string(),
  figureAssets: v.optional(v.array(v.object({ sourceUrl: v.string(), path: v.string(), sha256: v.string() }))),
  heroSha256: v.optional(v.string()), coverImageAlt: v.optional(v.string()),
  editorialFingerprint: v.optional(v.string()),
});
export const preparedHeroValidator = v.object({
  sourceStorageId: v.id("_storage"), storageId: v.id("_storage"),
  width: v.literal(1600), height: v.literal(900), mimeType: v.literal("image/webp"),
  byteLength: v.number(), sha256: v.string(),
  crop: v.union(v.literal("centre"), v.literal("north"), v.literal("south")),
});

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { brandIdValidator } from "./campaignAccess";

export const visualReferenceRoleValidator = v.union(
  v.literal("identity"), v.literal("style"), v.literal("composition"),
);
export const visualReferenceBindingValidator = v.object({
  referenceId: v.id("v2VisualReferences"), role: visualReferenceRoleValidator,
});
export const visualGuidanceValidator = v.object({
  artDirection: v.string(),
  palette: v.array(v.object({ name: v.string(), color: v.string() })),
  mascotGuidance: v.string(), compositionGuidance: v.string(),
  textPolicy: v.string(), heroChartPolicy: v.string(),
});
export const visualDefaultRouteValidator = v.union(v.null(), v.object({
  provider: v.string(), model: v.string(), qualification: v.literal("unqualified"),
}));
export const visualLessonRoleValidator = v.union(v.literal("creative_director"), v.literal("image_generator"));
export const visualModelScopeValidator = v.union(v.null(), v.object({
  provider: v.union(v.null(), v.string()), model: v.string(),
}));
const referenceFields = {
  brandId: brandIdValidator, storageId: v.id("_storage"), sha256: v.string(),
  byteLength: v.number(), contentType: v.string(), fileName: v.string(),
  kind: v.union(v.literal("upload"), v.literal("approved_corvo_seed")),
  seedAssetKey: v.union(v.null(), v.string()), article: v.union(v.null(), v.number()),
  approvalProvenance: v.union(v.null(), v.string()),
  sourceDocumentSha256: v.union(v.null(), v.string()), sourceRecord: v.string(),
  historicalProvider: v.union(v.null(), v.string()), historicalModelId: v.union(v.null(), v.string()),
  uploadedBy: v.string(), createdAt: v.number(),
};
const revisionFields = {
  brandId: brandIdValidator, profileId: v.id("v2VisualProfiles"), revision: v.number(),
  ...visualGuidanceValidator.fields,
  referenceBindings: v.array(visualReferenceBindingValidator), defaultRoute: visualDefaultRouteValidator,
  seedId: v.union(v.null(), v.string()), createdBy: v.string(), createdAt: v.number(),
};
const exceptionFields = {
  brandId: brandIdValidator, postId: v.id("v2Posts"), revision: v.number(), guidance: v.string(),
  seedId: v.union(v.null(), v.string()), sourceRecord: v.string(),
  sourcePostTitle: v.optional(v.string()), sourceBlogSlug: v.optional(v.string()),
  createdBy: v.string(), createdAt: v.number(),
};
export const visualLessonEvidenceValidator = v.object({
  source: v.string(), startLine: v.number(), endLine: v.number(), excerpt: v.string(),
});
const lessonFields = {
  brandId: brandIdValidator, key: v.string(), revision: v.number(),
  role: visualLessonRoleValidator, sceneTags: v.array(v.string()),
  modelScope: visualModelScopeValidator, postId: v.union(v.null(), v.id("v2Posts")),
  title: v.string(), instruction: v.string(),
  provenance: v.union(v.literal("seeded_observation"), v.literal("reflection")),
  sourceDocumentSha256: v.union(v.null(), v.string()), sourceRecord: v.string(),
  exampleArticles: v.array(v.number()), evidence: v.array(visualLessonEvidenceValidator),
  validation: v.union(v.literal("observation"), v.literal("untested")),
  oneShotValidation: v.literal("not_tested"),
  changesBrandProfile: v.literal(false),
  createdBy: v.string(), createdAt: v.number(),
};
export const visualProfileRevisionValidator = v.object({
  _id: v.id("v2VisualProfileRevisions"), _creationTime: v.number(), ...revisionFields,
});
export const visualReferenceValidator = v.object({
  _id: v.id("v2VisualReferences"), _creationTime: v.number(), ...referenceFields,
});
export const visualPostExceptionValidator = v.object({
  _id: v.id("v2VisualPostExceptions"), _creationTime: v.number(), ...exceptionFields,
});
export const visualLessonValidator = v.object({
  _id: v.id("v2VisualLessons"), _creationTime: v.number(), ...lessonFields,
});
export const visualProfilePinValidator = v.object({
  profileRevisionId: v.id("v2VisualProfileRevisions"),
  referenceIds: v.array(v.id("v2VisualReferences")),
  lessonIds: v.array(v.id("v2VisualLessons")),
  postExceptionId: v.union(v.null(), v.id("v2VisualPostExceptions")),
});

/** Additive tables. Only the profile's active pointer is mutable. */
export const visualProfileTables = {
  v2VisualProfiles: defineTable({
    brandId: brandIdValidator, activeRevisionId: v.optional(v.id("v2VisualProfileRevisions")),
    createdBy: v.string(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_brandId", ["brandId"]),
  v2VisualProfileRevisions: defineTable(revisionFields)
    .index("by_profileId_and_revision", ["profileId", "revision"]),
  v2VisualReferences: defineTable(referenceFields)
    .index("by_brandId_and_sha256", ["brandId", "sha256"])
    .index("by_brandId_and_seedAssetKey", ["brandId", "seedAssetKey"])
    .index("by_storageId", ["storageId"]),
  v2VisualPostExceptions: defineTable(exceptionFields)
    .index("by_postId_and_revision", ["postId", "revision"]),
  v2VisualLessons: defineTable(lessonFields)
    .index("by_brandId_and_role", ["brandId", "role"])
    .index("by_brandId_and_key_and_revision", ["brandId", "key", "revision"]),
  v2VisualSeedImports: defineTable({
    brandId: brandIdValidator, seedId: v.string(), sourceDocumentSha256: v.string(),
    initialProfileRevisionId: v.id("v2VisualProfileRevisions"),
    sourceDocument: v.string(), manifestJson: v.string(), finalDirectionsJson: v.string(),
    lessonsJson: v.string(), importedBy: v.string(), importedAt: v.number(),
  }).index("by_brandId_and_seedId", ["brandId", "seedId"]),
};

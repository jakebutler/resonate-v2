import { defineTable } from "convex/server";
import { v } from "convex/values";
import { brandIdValidator } from "./campaignAccess";

export const visualStageValidator = v.union(v.literal("planning"), v.literal("generation"), v.literal("edit"), v.literal("reflection"));
export const visualStatusValidator = v.union(v.literal("queued"), v.literal("running"), v.literal("completed"), v.literal("failed"), v.literal("uncertain"));
export const sceneValidator = v.object({ title: v.string(), subject: v.string(), metaphor: v.string(), action: v.string(), reveal: v.string(), articleConnection: v.string(), articleAnchor: v.string() });
export const workflowPinValidator = v.object({ profileRevisionId: v.id("v2VisualProfileRevisions"), referenceIds: v.array(v.id("v2VisualReferences")), lessonIds: v.array(v.id("v2VisualLessons")), postExceptionId: v.union(v.null(), v.id("v2VisualPostExceptions")) });
export const visualReferenceValidator = v.object({ referenceId: v.id("v2VisualReferences"), storageId: v.id("_storage"), role: v.union(v.literal("identity"), v.literal("style"), v.literal("composition")), sha256: v.string() });
export const attemptInputValidator = v.object({
  article: v.object({ title: v.string(), content: v.string(), signature: v.string() }),
  pins: workflowPinValidator,
  references: v.array(visualReferenceValidator),
  scene: v.union(v.null(), sceneValidator),
  planId: v.union(v.null(), v.id("v2VisualPlans")),
  parentVersionId: v.union(v.null(), v.id("v2VisualVersions")),
  parentStorageId: v.union(v.null(), v.id("_storage")),
  selectionAtQueue: v.optional(v.object({ planId: v.id("v2VisualPlans"), sceneIndex: v.number(), refinedSceneSignature: v.string() })),
  selectedVersionIdAtQueue: v.optional(v.union(v.null(), v.id("v2VisualVersions"))),
  authorProductionInstructions: v.optional(v.string()),
  previousFeedback: v.optional(v.array(v.string())),
  prompt: v.string(),
  feedback: v.union(v.null(), v.string()),
  provider: v.union(v.null(), v.string()),
  model: v.union(v.null(), v.string()),
  size: v.string(),
  outputFormat: v.union(v.literal("png"), v.literal("jpeg"), v.literal("webp")),
});
export const exportMetadataValidator = v.object({ width: v.number(), height: v.number(), bytes: v.number(), format: v.literal("webp"), crop: v.string() });

export const visualWorkflowTables = {
  v2VisualBudgets: defineTable({ brandId: brandIdValidator, limitMicros: v.number(), unacknowledgedOverrunMicros: v.optional(v.number()), unacknowledgedLateChargeMicros: v.optional(v.number()), updatedBy: v.string(), updatedAt: v.number() }).index("by_brand", ["brandId"]),
  v2VisualBudgetMonths: defineTable({ brandId: brandIdValidator, month: v.string(), reservedMicros: v.number(), spentMicros: v.number(), overrunMicros: v.optional(v.number()), updatedAt: v.number() }).index("by_brand_and_month", ["brandId", "month"]),
  v2VisualDispatchQuotes: defineTable({ attemptId: v.id("v2VisualAttempts"), inputSignature: v.string(), stage: visualStageValidator, provider: v.string(), model: v.string(), maximumMicros: v.number(), qualification: v.union(v.literal("offline-fixture"), v.literal("offline-contract"), v.literal("live-receipt")), boundVerified: v.boolean(), capabilityReceiptIds: v.array(v.string()), provenance: v.string(), createdAt: v.number() }).index("by_attempt", ["attemptId"]),
  v2VisualAttempts: defineTable({
    userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"), stage: visualStageValidator,
    operationKey: v.string(), inputSignature: v.string(), input: attemptInputValidator,
    status: visualStatusValidator, pauseReason: v.optional(v.string()),
    reservationMonth: v.optional(v.string()), reservedMicros: v.optional(v.number()),
    quoteId: v.optional(v.id("v2VisualDispatchQuotes")), quotedProvider: v.optional(v.string()), quotedModel: v.optional(v.string()), quoteProvenance: v.optional(v.string()),
    claimKey: v.optional(v.string()), dispatchedAt: v.optional(v.number()),
    costOverrunMicros: v.optional(v.number()), reportedActualMicros: v.optional(v.number()), estimatedActualMicros: v.optional(v.number()),
    runningRecoverySignature: v.optional(v.string()), runningRecoveredBy: v.optional(v.string()),
    lateUsageReceipt: v.optional(v.string()), lateCompletionSignature: v.optional(v.string()), lateActualMicros: v.optional(v.number()), lateUsageKind: v.optional(v.union(v.literal("reported"), v.literal("estimated"))), lateUsageDeltaMicros: v.optional(v.number()), lateCostOverrunMicros: v.optional(v.number()), lateOutputStorageId: v.optional(v.id("_storage")),
    ownerReconciledBy: v.optional(v.string()), ownerReconciliationSignature: v.optional(v.string()), usageReceipt: v.optional(v.string()), error: v.optional(v.string()), completionSignature: v.optional(v.string()),
    resultPlanId: v.optional(v.id("v2VisualPlans")), resultVersionId: v.optional(v.id("v2VisualVersions")),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_post", ["postId"]).index("by_post_and_stage_and_operation_key", ["postId", "stage", "operationKey"]).index("by_post_and_stage_and_status", ["postId", "stage", "status"]),
  v2VisualPlans: defineTable({ userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"), attemptId: v.id("v2VisualAttempts"), input: attemptInputValidator, scenes: v.array(sceneValidator), status: v.union(v.literal("complete"), v.literal("incomplete")), reasons: v.array(v.string()), createdAt: v.number() }).index("by_post", ["postId"]),
  v2VisualStates: defineTable({
    userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"),
    selectedPlanId: v.optional(v.id("v2VisualPlans")), selectedSceneIndex: v.optional(v.number()), refinedScene: v.optional(sceneValidator),
    selectedVersionId: v.optional(v.id("v2VisualVersions")), activeImageAttemptId: v.optional(v.id("v2VisualAttempts")),
    relevanceReason: v.optional(v.string()), updatedAt: v.number(),
  }).index("by_post", ["postId"]),
  v2VisualVersions: defineTable({
    userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"), attemptId: v.id("v2VisualAttempts"),
    planId: v.id("v2VisualPlans"), parentVersionId: v.union(v.null(), v.id("v2VisualVersions")), feedback: v.union(v.null(), v.string()),
    input: attemptInputValidator, storageId: v.id("_storage"), sha256: v.string(), contentType: v.string(), width: v.number(), height: v.number(), bytes: v.number(),
    provider: v.string(), model: v.string(), revisedPrompt: v.optional(v.string()),
    exportStorageId: v.optional(v.id("_storage")), exportHash: v.optional(v.string()), exportMetadata: v.optional(exportMetadataValidator),
    approvedBy: v.optional(v.string()), approvedAt: v.optional(v.number()), approvedAlt: v.optional(v.string()), approvedExportHash: v.optional(v.string()), approvedExportMetadataSignature: v.optional(v.string()),
    approvedArticleSignature: v.optional(v.string()), approvedRelevanceSignature: v.optional(v.string()), relevanceReviewedArticleSignature: v.optional(v.string()), relevanceConfirmedSignature: v.optional(v.string()), relevanceConfirmedBy: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_post", ["postId"]).index("by_storageId", ["storageId"]).index("by_exportStorageId", ["exportStorageId"]),
  v2VisualReflections: defineTable({ userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"), versionId: v.id("v2VisualVersions"), attemptId: v.id("v2VisualAttempts"), approvalSignature: v.optional(v.string()), approvedExportStorageId: v.id("_storage"), approvedExportHash: v.string(), approvedAlt: v.optional(v.string()), approvedArticleSignature: v.optional(v.string()), approvedExportMetadataSignature: v.optional(v.string()), lineageVersionIds: v.array(v.id("v2VisualVersions")), originalVersionId: v.optional(v.id("v2VisualVersions")), lineageComplete: v.optional(v.boolean()), lineageResumeVersionId: v.optional(v.id("v2VisualVersions")), contextBytes: v.optional(v.number()), deferredReason: v.optional(v.string()), candidatePrompt: v.optional(v.string()), validationStatus: v.literal("untested"), lessonIds: v.array(v.id("v2VisualLessons")), profileChangeProposals: v.array(v.string()), createdAt: v.number() }).index("by_version", ["versionId"]).index("by_version_and_approval_signature", ["versionId", "approvalSignature"]).index("by_post", ["postId"]).index("by_attempt", ["attemptId"]),
};

export const visualAttemptDocValidator = v.object({ _id: v.id("v2VisualAttempts"), _creationTime: v.number(), ...visualWorkflowTables.v2VisualAttempts.validator.fields });
export const visualPlanDocValidator = v.object({ _id: v.id("v2VisualPlans"), _creationTime: v.number(), ...visualWorkflowTables.v2VisualPlans.validator.fields });
export const visualStateDocValidator = v.object({ _id: v.id("v2VisualStates"), _creationTime: v.number(), ...visualWorkflowTables.v2VisualStates.validator.fields });
export const visualVersionDocValidator = v.object({ _id: v.id("v2VisualVersions"), _creationTime: v.number(), ...visualWorkflowTables.v2VisualVersions.validator.fields });
export const visualReflectionDocValidator = v.object({ _id: v.id("v2VisualReflections"), _creationTime: v.number(), ...visualWorkflowTables.v2VisualReflections.validator.fields });
export const visualBudgetDocValidator = v.object({ _id: v.id("v2VisualBudgets"), _creationTime: v.number(), ...visualWorkflowTables.v2VisualBudgets.validator.fields });
export const visualBudgetMonthDocValidator = v.object({ _id: v.id("v2VisualBudgetMonths"), _creationTime: v.number(), ...visualWorkflowTables.v2VisualBudgetMonths.validator.fields });
export const publicationVisualsValidator = v.union(v.null(), v.object({ hero: v.object({ versionId: v.id("v2VisualVersions"), storageId: v.id("_storage"), sha256: v.string(), alt: v.string(), metadata: exportMetadataValidator, approvedBy: v.string(), approvedAt: v.number(), provider: v.string(), model: v.string(), quoteProvenance: v.string(), qualification: v.union(v.literal("offline-fixture"), v.literal("offline-contract"), v.literal("live-receipt")), url: v.string() }), articleSignature: v.string() }));

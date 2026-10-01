import { defineTable } from "convex/server";
import { v } from "convex/values";
import { brandIdValidator } from "./campaignAccess";

export const figureFormatValidator = v.union(v.literal("markdown"), v.literal("text"), v.literal("csv"));
export const figurePurposeValidator = v.union(v.literal("article"), v.literal("claim-trace"), v.literal("data"));
export const figureBindingValidator = v.object({ sourceId: v.string(), start: v.number(), end: v.number(), text: v.string(), row: v.number() });
export const figureSpecValidator = v.object({
  version: v.literal(1), family: v.union(v.literal("bars"), v.literal("lines"), v.literal("flow"), v.literal("sequence"), v.literal("timeline")),
  columns: v.array(v.string()), rows: v.array(v.array(v.string())),
  evidence: v.array(figureBindingValidator), claimTraceEvidence: v.array(figureBindingValidator),
  presentation: v.object({ title: v.string(), caption: v.string(), alt: v.string(), sourceNote: v.string(), background: v.string(), ink: v.string(), accent: v.string() }),
  insertionAnchor: v.string(),
});
const sourceFields = {
  userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"), key: v.string(), revision: v.number(),
  name: v.string(), format: figureFormatValidator, purpose: figurePurposeValidator,
  content: v.string(), sha256: v.string(), parseErrors: v.array(v.string()), createdAt: v.number(),
};
const planFields = {
  userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"),
  articleSourceId: v.id("v2FigureSources"), sourceIds: v.array(v.id("v2FigureSources")),
  candidateIds: v.array(v.id("v2FigureCandidates")), reasons: v.array(v.string()), createdAt: v.number(),
};
const candidateFields = {
  userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"), planId: v.id("v2FigurePlans"),
  parentCandidateId: v.union(v.null(), v.id("v2FigureCandidates")),
  spec: figureSpecValidator, dataSignature: v.string(), presentationSignature: v.string(),
  svg: v.string(), svgSha256: v.string(), rendererVersion: v.string(), createdAt: v.number(),
};
export const figureStatusValidator = v.union(v.literal("proposed"), v.literal("accepted"), v.literal("declined"), v.literal("removed"), v.literal("needs-review"), v.literal("superseded"));
const stateFields = {
  userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"), rootCandidateId: v.id("v2FigureCandidates"),
  selectedCandidateId: v.id("v2FigureCandidates"), acceptedCandidateId: v.union(v.null(), v.id("v2FigureCandidates")),
  status: figureStatusValidator, insertedBlock: v.union(v.null(), v.string()),
  acceptedBy: v.union(v.null(), v.string()), acceptedAt: v.union(v.null(), v.number()), updatedAt: v.number(),
  reviewReason: v.optional(v.string()),
};
const reviewEventFields = {
  userId: v.string(), brandId: brandIdValidator, postId: v.id("v2Posts"), stateId: v.id("v2FigureStates"), candidateId: v.id("v2FigureCandidates"),
  priorStatus: figureStatusValidator, status: figureStatusValidator,
  decision: v.union(v.literal("accepted"), v.literal("declined"), v.literal("edited"), v.literal("moved"), v.literal("removed"), v.literal("invalidated"), v.literal("superseded")),
  actorId: v.union(v.string(), v.null()), dataSignature: v.string(), presentationSignature: v.string(), postContentSha256: v.string(), reason: v.optional(v.string()), createdAt: v.number(),
};
export const figureReviewEventValidator = v.object({ _id: v.id("v2FigureReviewEvents"), _creationTime: v.number(), ...reviewEventFields });
export const figureSourceValidator = v.object({ _id: v.id("v2FigureSources"), _creationTime: v.number(), ...sourceFields });
export const figurePlanValidator = v.object({ _id: v.id("v2FigurePlans"), _creationTime: v.number(), ...planFields });
export const figureCandidateValidator = v.object({ _id: v.id("v2FigureCandidates"), _creationTime: v.number(), ...candidateFields });
export const figureStateValidator = v.object({ _id: v.id("v2FigureStates"), _creationTime: v.number(), ...stateFields });
export const visualFigureTables = {
  v2FigureReviewEvents: defineTable(reviewEventFields).index("by_post", ["postId"]).index("by_state", ["stateId"]),
  v2FigureSources: defineTable(sourceFields).index("by_post", ["postId"]).index("by_post_key_revision", ["postId", "key", "revision"]),
  v2FigureSourceHeads: defineTable({ postId: v.id("v2Posts"), key: v.string(), sourceId: v.id("v2FigureSources"), updatedAt: v.number() })
    .index("by_post", ["postId"]).index("by_post_key", ["postId", "key"]),
  v2FigurePlans: defineTable(planFields).index("by_post", ["postId"]),
  v2FigureCandidates: defineTable(candidateFields).index("by_post", ["postId"]).index("by_plan", ["planId"]),
  v2FigureStates: defineTable(stateFields).index("by_post", ["postId"]).index("by_post_status", ["postId", "status"]).index("by_candidate", ["selectedCandidateId"]).index("by_root_candidate", ["rootCandidateId"]),
};

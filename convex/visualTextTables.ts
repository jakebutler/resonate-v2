import { defineTable } from "convex/server";
import { v } from "convex/values";

export const textStageValidator = v.union(v.literal("planning"), v.literal("reflection"));
export const textRouteFields = {
  provider: v.union(v.literal("openai"), v.literal("cortex")), model: v.string(), stages: v.array(textStageValidator),
  maxInputBytes: v.number(), maxInputTokens: v.number(), maxMessageOverheadTokens: v.number(), contextWindowTokens: v.number(), maxOutputTokens: v.number(),
  inputPriceMicrosPerMillion: v.number(), outputPriceMicrosPerMillion: v.number(),
  capabilityReceiptIds: v.array(v.string()), tokenBoundReceiptId: v.string(), priceReceiptId: v.string(),
  reviewedBy: v.string(), provenance: v.string(), expiresAt: v.number(),
};

export const visualTextTables = {
  v2VisualTextRoutes: defineTable({ ...textRouteFields, enabled: v.boolean(), maximumMicros: v.number(), createdAt: v.number() }).index("by_provider", ["provider"]),
};
export const textRouteDocValidator = v.object({ _id: v.id("v2VisualTextRoutes"), _creationTime: v.number(), ...visualTextTables.v2VisualTextRoutes.validator.fields });

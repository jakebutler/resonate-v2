import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { audit, brandIdValidator } from "./campaignAccess";

/**
 * Internal-only: lets the /api/ops/lab-import route record rejected import
 * attempts (bad secret, rate-limited, failed import) in the audit trail.
 * There is no caller identity on the ops path, so events use the ops actor.
 */
export const recordLabImportRejection = internalMutation({
  args: {
    brandId: brandIdValidator,
    reason: v.string(),
    attemptedBrand: v.optional(v.string()),
    fileCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await audit(ctx, {
      userId: "ops:lab-import",
      brandId: args.brandId,
      action: "corpus.lab_import_rejected",
      summary: `Lab import rejected: ${args.reason}.`,
      metadata: {
        reason: args.reason,
        attemptedBrand: args.attemptedBrand,
        fileCount: args.fileCount,
      },
    });
    return { recorded: true };
  },
});

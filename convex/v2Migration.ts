import { v } from "convex/values";
import { mutation } from "./_generated/server";

const brandIdValidator = v.union(
  v.literal("personal"),
  v.literal("corvo"),
  v.literal("lower-db"),
  v.literal("freshproof")
);

const capturedIdeaStatusValidator = v.union(
  v.literal("inbox"),
  v.literal("reviewing"),
  v.literal("ready"),
  v.literal("used"),
  v.literal("archived")
);

const importIdeaValidator = v.object({
  legacyTable: v.string(),
  legacyId: v.string(),
  brandId: brandIdValidator,
  text: v.string(),
  title: v.optional(v.string()),
  tags: v.array(v.string()),
  sourceUrl: v.optional(v.string()),
  status: capturedIdeaStatusValidator,
});

function buildIdeaPreview(content: string, maxLength = 140) {
  const trimmed = content.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

function deriveSourceDomain(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

async function requireUserId(ctx: {
  auth: { getUserIdentity: () => Promise<{ subject: string } | null> };
}) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) throw new Error("Unauthorized");
  return identity.subject;
}

export const importV1Ideas = mutation({
  args: {
    ideas: v.array(importIdeaValidator),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const imported: string[] = [];
    const skipped: string[] = [];

    for (const idea of args.ideas) {
      const existing = await ctx.db
        .query("v2MigrationRecords")
        .withIndex("by_legacy", (q) =>
          q.eq("legacyTable", idea.legacyTable).eq("legacyId", idea.legacyId)
        )
        .first();

      if (existing) {
        skipped.push(`${idea.legacyTable}:${idea.legacyId}`);
        continue;
      }

      if (args.dryRun) {
        imported.push(`${idea.legacyTable}:${idea.legacyId}`);
        continue;
      }

      const text = idea.text.trim();
      if (!text) {
        skipped.push(`${idea.legacyTable}:${idea.legacyId}:empty`);
        continue;
      }

      const ideaId = await ctx.db.insert("capturedIdeas", {
        userId,
        brandId: idea.brandId,
        status: idea.status,
        tags: idea.tags,
        sourceUrl: idea.sourceUrl,
        normalizedSourceUrl: idea.sourceUrl,
        sourceTitle: idea.title,
        sourceDomain: deriveSourceDomain(idea.sourceUrl),
        latestEntryPreview: buildIdeaPreview(text),
        lastCapturedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert("capturedIdeaEntries", {
        ideaId,
        userId,
        content: text,
        captureChannel: "web",
        createdAt: now,
      });

      await ctx.db.insert("v2MigrationRecords", {
        userId,
        legacyTable: idea.legacyTable,
        legacyId: idea.legacyId,
        targetTable: "capturedIdeas",
        targetId: ideaId,
        createdAt: now,
      });

      imported.push(`${idea.legacyTable}:${idea.legacyId}`);
    }

    return {
      dryRun: Boolean(args.dryRun),
      imported: imported.length,
      skipped: skipped.length,
      importedIds: imported,
      skippedIds: skipped,
    };
  },
});

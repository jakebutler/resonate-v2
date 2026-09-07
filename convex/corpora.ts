import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  audit,
  brandIdValidator,
  requireBrandAccess,
  requireUserId,
  type BrandId,
} from "./campaignAccess";
import {
  buildLabDocument,
  summarizeLabBundle,
} from "@/lib/labImport";

const excerptSensitivityValidator = v.union(
  v.literal("unreviewed"),
  v.literal("internal-only"),
  v.literal("public-safe")
);

const excerptReviewStateValidator = v.union(
  v.literal("accepted"),
  v.literal("flagged"),
  v.literal("excluded")
);

const corpusDocumentKindValidator = v.union(
  v.literal("md"),
  v.literal("txt"),
  v.literal("json"),
  v.literal("csv"),
  v.literal("pdf")
);

const corpusOriginValidator = v.union(
  v.literal("upload"),
  v.literal("cli"),
  v.literal("paste")
);

const excerptInputValidator = v.object({
  text: v.string(),
  provenance: v.string(),
  sensitivity: v.optional(excerptSensitivityValidator),
  labels: v.optional(v.array(v.string())),
});

const documentInputValidator = v.object({
  name: v.string(),
  kind: corpusDocumentKindValidator,
  meta: v.optional(v.any()),
  excerpts: v.array(excerptInputValidator),
});

export const createCorpusVersion = mutation({
  args: {
    brandId: brandIdValidator,
    origin: corpusOriginValidator,
    documents: v.array(documentInputValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);

    if (args.documents.length === 0) {
      throw new Error("A corpus version requires at least one document.");
    }
    const excerptCount = args.documents.reduce(
      (total, document) => total + document.excerpts.length,
      0
    );
    if (excerptCount === 0) {
      throw new Error(
        "A corpus version requires at least one accepted excerpt."
      );
    }

    const result = await insertCorpusVersion(ctx, {
      userId,
      brandId: args.brandId,
      origin: args.origin,
      documents: args.documents,
      auditAction: "corpus.version_created",
    });
    return result;
  },
});

type CorpusDocumentInput = {
  name: string;
  kind: "md" | "txt" | "json" | "csv" | "pdf";
  meta?: unknown;
  excerpts: {
    text: string;
    provenance: string;
    sensitivity?: "unreviewed" | "internal-only" | "public-safe";
    labels?: string[];
  }[];
};

/** Shared immutable-version insert helper for both ingest journeys. */
async function insertCorpusVersion(
  ctx: MutationCtx,
  input: {
    userId: string;
    brandId: BrandId;
    origin: "upload" | "cli" | "paste";
    documents: CorpusDocumentInput[];
    auditAction: string;
  }
) {
  const { userId, brandId, origin, documents } = input;
  const excerptCount = documents.reduce(
    (total, document) => total + document.excerpts.length,
    0
  );
  if (documents.length === 0) {
    throw new Error("A corpus version requires at least one document.");
  }
  if (excerptCount === 0) {
    throw new Error("A corpus version requires at least one accepted excerpt.");
  }

  const latest = await ctx.db
    .query("corpora")
    .withIndex("by_brand_and_version", (q) => q.eq("brandId", brandId))
    .order("desc")
    .first();
  const version = (latest?.version ?? 0) + 1;
  const now = Date.now();

  const corpusId = await ctx.db.insert("corpora", {
    brandId,
    origin,
    version,
    status: "active",
    createdAt: now,
  });

  let seq = 0;
  for (const document of documents) {
    const documentId = await ctx.db.insert("corpusDocuments", {
      corpusId,
      name: document.name,
      kind: document.kind,
      meta: document.meta,
    });
    for (const excerpt of document.excerpts) {
      seq += 1;
      await ctx.db.insert("corpusExcerpts", {
        corpusId,
        documentId,
        seq,
        text: excerpt.text,
        provenance: excerpt.provenance,
        sensitivity: excerpt.sensitivity ?? "unreviewed",
        labels: excerpt.labels,
        reviewState: "accepted",
      });
    }
  }

  await audit(ctx, {
    userId,
    brandId,
    action: input.auditAction,
    summary: `Created corpus v${version} — ${documents.length} document(s), ${excerptCount} excerpt(s), origin ${origin}.`,
    metadata: { corpusId: String(corpusId), version, origin },
  });

  return { corpusId: String(corpusId), version, excerptCount };
}

/**
 * Lab-folder import (C8, D-18): the CLI script scans a folder locally, then
 * posts raw document text here. This mutation is the authoritative gate —
 * no user identity exists on the CLI path, so it is guarded by the ops secret
 * (mirroring the /api/ops pattern), re-runs the secret scan server-side
 * (hard fail), and reuses the shared immutable-version insert helper.
 */
export const importLabBundle = mutation({
  args: {
    brandId: brandIdValidator,
    opsSecret: v.string(),
    files: v.array(
      v.object({
        name: v.string(),
        text: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const expected = process.env.V2_OPS_SECRET?.trim();
    const provided = args.opsSecret.trim();
    if (!expected || provided !== expected) {
      throw new Error("Unauthorized: invalid ops secret for lab import.");
    }

    if (args.files.length === 0) {
      throw new Error("The lab bundle contains no files.");
    }

    // Authoritative server-side classification + secret scan (hard fail, D-18).
    const built = args.files.map((file) => buildLabDocument(file.name, file.text));
    const summary = summarizeLabBundle(built);

    const documents = built
      .map((document) => ({
        name: document.name,
        kind: document.kind,
        meta: { source: "cli", bytes: document.text.length },
        excerpts: document.excerpts
          .filter((excerpt) => !excerpt.unusable)
          .map((excerpt) => ({
            text: excerpt.text,
            provenance: excerpt.provenance,
          })),
      }))
      .filter((document) => document.excerpts.length > 0);

    const result = await insertCorpusVersion(ctx, {
      userId: "cli:lab-import",
      brandId: args.brandId,
      origin: "cli",
      documents,
      auditAction: "corpus.lab_import",
    });

    await audit(ctx, {
      userId: "cli:lab-import",
      brandId: args.brandId,
      action: "corpus.lab_import_report",
      summary: `Lab import scan: ${summary.documentCount} document(s), ${summary.excerptCount} excerpt candidate(s), ${summary.usableCount} usable.`,
    });

    return result;
  },
});

export const recordExcerptCorrection = mutation({
  args: {
    brandId: brandIdValidator,
    documentName: v.string(),
    excerptPreview: v.string(),
    correction: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);

    const correction = args.correction.trim();
    if (!correction) {
      throw new Error("A correction note is required.");
    }

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "corpus.excerpt_correction",
      summary: `Captured parser correction for an unusable extract from "${args.documentName}". The extract stays blocked from the corpus.`,
      metadata: {
        documentName: args.documentName,
        excerptPreview: args.excerptPreview.slice(0, 280),
        correction,
      },
    });

    return { recorded: true };
  },
});

export const updateExcerptReview = mutation({
  args: {
    excerptId: v.id("corpusExcerpts"),
    sensitivity: v.optional(excerptSensitivityValidator),
    reviewState: v.optional(excerptReviewStateValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const excerpt = await ctx.db.get(args.excerptId);
    if (!excerpt) throw new Error("Excerpt not found");
    const corpus = await ctx.db.get(excerpt.corpusId);
    if (!corpus) throw new Error("Corpus not found");
    await requireBrandAccess(ctx, userId, corpus.brandId);

    await ctx.db.patch(args.excerptId, {
      ...(args.sensitivity !== undefined ? { sensitivity: args.sensitivity } : {}),
      ...(args.reviewState !== undefined ? { reviewState: args.reviewState } : {}),
    });
    return { updated: true };
  },
});

export const listCorpora = query({
  args: { brandId: brandIdValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    return await ctx.db
      .query("corpora")
      .withIndex("by_brand_and_version", (q) =>
        q.eq("brandId", args.brandId)
      )
      .order("desc")
      .collect();
  },
});

export const getCorpus = query({
  args: { corpusId: v.id("corpora") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const corpusId = ctx.db.normalizeId("corpora", args.corpusId);
    if (!corpusId) return null;
    const corpus = await ctx.db.get(corpusId);
    if (!corpus) return null;
    try {
      await requireBrandAccess(ctx, userId, corpus.brandId as BrandId);
    } catch {
      return null;
    }

    const documents = await ctx.db
      .query("corpusDocuments")
      .withIndex("by_corpus", (q) => q.eq("corpusId", corpusId))
      .collect();
    const excerpts = await ctx.db
      .query("corpusExcerpts")
      .withIndex("by_corpus", (q) => q.eq("corpusId", corpusId))
      .collect();

    return {
      corpus,
      documents: documents.sort((a, b) => a._creationTime - b._creationTime),
      excerpts: excerpts.sort((a, b) => a.seq - b.seq),
    };
  },
});

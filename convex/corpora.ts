import { v } from "convex/values";
import {
  mutation,
  query,
} from "./_generated/server";
import {
  audit,
  brandIdValidator,
  requireBrandAccess,
  requireUserId,
  type BrandId,
} from "./campaignAccess";

const excerptSensitivityValidator = v.union(
  v.literal("unreviewed"),
  v.literal("internal-only"),
  v.literal("public-safe")
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

    const latest = await ctx.db
      .query("corpora")
      .withIndex("by_brand_and_version", (q) =>
        q.eq("brandId", args.brandId)
      )
      .order("desc")
      .first();
    const version = (latest?.version ?? 0) + 1;
    const now = Date.now();

    const corpusId = await ctx.db.insert("corpora", {
      brandId: args.brandId,
      origin: args.origin,
      version,
      status: "active",
      createdAt: now,
    });

    let seq = 0;
    for (const document of args.documents) {
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
      brandId: args.brandId,
      action: "corpus.version_created",
      summary: `Created corpus v${version} — ${args.documents.length} document(s), ${excerptCount} excerpt(s), origin ${args.origin}.`,
      metadata: { corpusId: String(corpusId), version, origin: args.origin },
    });

    return { corpusId: String(corpusId), version, excerptCount };
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

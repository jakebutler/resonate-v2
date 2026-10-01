import { v, type Infer } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { brandIdValidator, requireBrandAccess, requireUserId, type BrandId } from "./campaignAccess";
import { visualDefaultRouteValidator, visualGuidanceValidator, visualLessonRoleValidator, visualLessonValidator, visualPostExceptionValidator, visualProfilePinValidator, visualProfileRevisionValidator, visualReferenceBindingValidator, visualReferenceRoleValidator, visualReferenceValidator } from "./visualProfileTables";
import type { Doc, Id } from "./_generated/dataModel";
import { assertVisualImage, hashVisualBytes, validateVisualProfileContent } from "../lib/visualProfile";
import { assertVisualAdmissionEnabled } from "./visualRollout";
import { approvedCorvoSeedAsset, corvoCurrentGuidance, corvoSeed, corvoSeedAssets, corvoSeedIntegrity, verifyCorvoSeedIntegrity, CORVO_VISUAL_SEED_ID } from "../lib/visualSeed";

async function requireProfileWrite(ctx: QueryCtx | MutationCtx, userId: string, brandId: BrandId, write = true) {
  const member = await requireBrandAccess(ctx, userId, brandId);
  if (member.role !== "owner" && member.role !== "editor") throw new Error("Visual profile write access denied");
  if (write) assertVisualAdmissionEnabled(userId);
  return member;
}

async function currentProfile(ctx: QueryCtx | MutationCtx, brandId: BrandId) {
  const profile = await ctx.db.query("v2VisualProfiles").withIndex("by_brandId", q => q.eq("brandId", brandId)).unique();
  const revision = profile?.activeRevisionId ? await ctx.db.get(profile.activeRevisionId) : null;
  return { profile, revision };
}

function sameRoute(a: Infer<typeof visualDefaultRouteValidator>, b: Infer<typeof visualDefaultRouteValidator>): boolean {
  return a === null ? b === null : b !== null && a.provider === b.provider && a.model === b.model && a.qualification === b.qualification;
}

export const saveRevision = mutation({
  args: {
    brandId: brandIdValidator, expectedRevisionId: v.union(v.null(), v.id("v2VisualProfileRevisions")),
    guidance: visualGuidanceValidator, referenceBindings: v.array(visualReferenceBindingValidator), defaultRoute: visualDefaultRouteValidator,
  },
  returns: v.object({ profileRevisionId: v.id("v2VisualProfileRevisions"), revision: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const membership = await requireProfileWrite(ctx, userId, args.brandId);
    validateVisualProfileContent(args);
    for (const binding of args.referenceBindings) {
      const reference = await ctx.db.get(binding.referenceId);
      if (!reference || reference.brandId !== args.brandId) throw new Error("Visual reference not found");
    }
    const { profile, revision } = await currentProfile(ctx, args.brandId);
    if (membership.role !== "owner" && !sameRoute(revision?.defaultRoute ?? null, args.defaultRoute)) {
      throw new Error("Only a brand owner can change the default route");
    }
    const sameGuidance = revision && Object.entries(args.guidance).every(([key, value]) => key === "palette"
      ? revision.palette.length === args.guidance.palette.length && revision.palette.every((color, index) =>
        color.name === args.guidance.palette[index].name && color.color === args.guidance.palette[index].color)
      : revision[key as Exclude<keyof typeof args.guidance, "palette">] === value);
    if (sameGuidance && revision.referenceBindings.length === args.referenceBindings.length &&
      revision.referenceBindings.every((binding, index) => binding.referenceId === args.referenceBindings[index].referenceId &&
        binding.role === args.referenceBindings[index].role) && sameRoute(revision.defaultRoute, args.defaultRoute)) {
      return { profileRevisionId: revision._id, revision: revision.revision };
    }
    if ((revision?._id ?? null) !== args.expectedRevisionId) throw new Error("Visual profile changed; reload before saving");
    const now = Date.now();
    const profileId = profile?._id ?? await ctx.db.insert("v2VisualProfiles", {
      brandId: args.brandId, createdBy: userId, createdAt: now, updatedAt: now,
    });
    const number = (revision?.revision ?? 0) + 1;
    const profileRevisionId = await ctx.db.insert("v2VisualProfileRevisions", {
      brandId: args.brandId, profileId, revision: number, ...args.guidance,
      referenceBindings: args.referenceBindings, defaultRoute: args.defaultRoute,
      seedId: null, createdBy: userId, createdAt: now,
    });
    await ctx.db.patch(profileId, { activeRevisionId: profileRevisionId, updatedAt: now });
    return { profileRevisionId, revision: number };
  },
});

export const getProfile = query({
  args: { brandId: brandIdValidator, profileRevisionId: v.optional(v.id("v2VisualProfileRevisions")) },
  returns: v.union(v.null(), v.object({ revision: visualProfileRevisionValidator, references: v.array(visualReferenceValidator) })),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProfileWrite(ctx, userId, args.brandId, false);
    const revision = args.profileRevisionId ? await ctx.db.get(args.profileRevisionId) : (await currentProfile(ctx, args.brandId)).revision;
    if (!revision) return null;
    if (revision.brandId !== args.brandId) throw new Error("Visual profile revision not found");
    const references: Doc<"v2VisualReferences">[] = [];
    for (const binding of revision.referenceBindings) {
      const reference = await ctx.db.get(binding.referenceId);
      if (!reference || reference.brandId !== args.brandId) throw new Error("Visual reference not found");
      references.push(reference);
    }
    return { revision, references };
  },
});

export const resolvedVisualProfileValidator = v.object({
  ...visualProfilePinValidator.fields,
  revision: visualProfileRevisionValidator,
  references: v.array(v.object({
    referenceId: v.id("v2VisualReferences"), storageId: v.id("_storage"),
    role: visualReferenceRoleValidator, sha256: v.string(), reference: visualReferenceValidator,
  })),
  postException: v.union(v.null(), visualPostExceptionValidator),
  lessons: v.array(visualLessonValidator),
});

const ARTICLE7_SLUG = "what-corvo-labs-learned-building-an-ai-editorial-workflow";
const ARTICLE7_TITLE = corvoSeed.manifest.approved_heroes.find(hero => hero.article === 7)!.title;
async function exceptionApplies(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">, exception: Doc<"v2VisualPostExceptions">): Promise<boolean> {
  if (exception.brandId !== post.brandId || exception.postId !== post._id) return false;
  if (exception.seedId !== CORVO_VISUAL_SEED_ID) return true;
  if (post.brandId !== "corvo" || post.channelId !== "corvo-blog" || post.blogSlug !== ARTICLE7_SLUG || post.title !== ARTICLE7_TITLE ||
    exception.sourceBlogSlug !== ARTICLE7_SLUG || exception.sourcePostTitle !== ARTICLE7_TITLE) return false;
  const matching = await ctx.db.query("v2Posts")
    .withIndex("by_brand_and_blogSlug", q => q.eq("brandId", "corvo").eq("blogSlug", ARTICLE7_SLUG)).take(2);
  return matching.length === 1 && matching[0]._id === post._id;
}

/** Shared owned-post resolver for planning/generation; pin the returned IDs. */
export async function resolveVisualProfileForPost(
  ctx: QueryCtx | MutationCtx, userId: string, postId: Id<"v2Posts">,
  options: {
    profileRevisionId?: Id<"v2VisualProfileRevisions">;
    role?: "creative_director" | "image_generator";
    sceneTags?: string[]; provider?: string; model?: string; lessonLimit?: number;
  } = {},
) {
  const post = await ctx.db.get(postId);
  if (!post || post.userId !== userId) throw new Error("Post not found");
  await requireBrandAccess(ctx, userId, post.brandId);
  if (post.channelId !== "corvo-blog") throw new Error("Visual profiles require a saved blog post");
  const revision = options.profileRevisionId
    ? await ctx.db.get(options.profileRevisionId)
    : (await currentProfile(ctx, post.brandId)).revision;
  if (!revision) return null;
  if (revision.brandId !== post.brandId) throw new Error("Visual profile revision not found");
  const references = [];
  for (const binding of revision.referenceBindings) {
    const reference = await ctx.db.get(binding.referenceId);
    if (!reference || reference.brandId !== post.brandId) throw new Error("Visual reference not found");
    references.push({
      referenceId: reference._id, storageId: reference.storageId,
      role: binding.role, sha256: reference.sha256, reference,
    });
  }
  const latestException = await ctx.db.query("v2VisualPostExceptions")
    .withIndex("by_postId_and_revision", q => q.eq("postId", postId)).order("desc").first();
  const postException = latestException && await exceptionApplies(ctx, post, latestException) ? latestException : null;
  const lessons = await relevantLessons(ctx, post.brandId, {
    role: options.role ?? "image_generator", sceneTags: options.sceneTags ?? [],
    provider: options.provider, model: options.model, postId, limit: options.lessonLimit,
  });
  return {
    profileRevisionId: revision._id, revision,
    referenceIds: references.map(reference => reference.referenceId), references,
    postExceptionId: postException?._id ?? null, postException,
    lessonIds: lessons.map(lesson => lesson._id), lessons,
  };
}

export const resolveForPost = query({
  args: {
    postId: v.id("v2Posts"), profileRevisionId: v.optional(v.id("v2VisualProfileRevisions")),
    role: v.optional(visualLessonRoleValidator), sceneTags: v.optional(v.array(v.string())),
    provider: v.optional(v.string()), model: v.optional(v.string()), lessonLimit: v.optional(v.number()),
  },
  returns: v.union(v.null(), resolvedVisualProfileValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedBlogPost(ctx, userId, args.postId);
    await requireProfileWrite(ctx, userId, post.brandId, false);
    return resolveVisualProfileForPost(ctx, userId, args.postId, args);
  },
});

/**
 * Exact immutable-ID inspection/replay, not authority for a new dispatch.
 * Workflows persist server-selected resolveForPost pins for their operation scope;
 * model prompts project lesson title/instruction only, never full audit documents.
 * Historical lesson/exception revisions intentionally do not become current here.
 */
export async function resolveVisualProfileFromPin(
  ctx: QueryCtx | MutationCtx, userId: string, postId: Id<"v2Posts">,
  pin: Infer<typeof visualProfilePinValidator>,
) {
  const post = await ownedBlogPost(ctx, userId, postId);
  const revision = await ctx.db.get(pin.profileRevisionId);
  if (!revision || revision.brandId !== post.brandId) throw new Error("Visual profile revision not found");
  if (pin.referenceIds.length > 8 || pin.lessonIds.length > 5 || new Set(pin.lessonIds).size !== pin.lessonIds.length) {
    throw new Error("Invalid visual profile pin limits");
  }
  if (pin.referenceIds.length !== revision.referenceBindings.length ||
    pin.referenceIds.some((id, index) => id !== revision.referenceBindings[index].referenceId)) {
    throw new Error("Pinned references must match the ordered profile revision");
  }
  const references = [];
  for (const binding of revision.referenceBindings) {
    const reference = await ctx.db.get(binding.referenceId);
    if (!reference || reference.brandId !== post.brandId) throw new Error("Visual reference not found");
    references.push({ referenceId: reference._id, storageId: reference.storageId, role: binding.role, sha256: reference.sha256, reference });
  }
  const postException = pin.postExceptionId ? await ctx.db.get(pin.postExceptionId) : null;
  if (pin.postExceptionId && (!postException || postException.postId !== postId || postException.brandId !== post.brandId)) {
    throw new Error("Pinned post exception not found");
  }
  if (postException && !await exceptionApplies(ctx, post, postException)) throw new Error("Pinned post exception association changed");
  const lessons = [];
  for (const lessonId of pin.lessonIds) {
    const lesson = await ctx.db.get(lessonId);
    if (!lesson || lesson.brandId !== post.brandId || (lesson.postId !== null && lesson.postId !== postId)) {
      throw new Error("Pinned lesson not found");
    }
    lessons.push(lesson);
  }
  return { ...pin, revision, references, postException, lessons };
}

export const resolveFromPin = query({
  args: { postId: v.id("v2Posts"), pin: visualProfilePinValidator },
  returns: resolvedVisualProfileValidator,
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedBlogPost(ctx, userId, args.postId);
    await requireProfileWrite(ctx, userId, post.brandId, false);
    return resolveVisualProfileFromPin(ctx, userId, args.postId, args.pin);
  },
});

export const authorizeReferenceUpload = internalQuery({
  args: { brandId: brandIdValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireProfileWrite(ctx, await requireUserId(ctx), args.brandId);
    return null;
  },
});

export const recordReferenceUpload = internalMutation({
  args: {
    brandId: brandIdValidator, storageId: v.id("_storage"), sha256: v.string(),
    byteLength: v.number(), contentType: v.string(), fileName: v.string(),
    seedAssetKey: v.optional(v.string()),
  },
  returns: v.object({ referenceId: v.id("v2VisualReferences"), storageId: v.id("_storage") }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProfileWrite(ctx, userId, args.brandId);
    const seedAsset = args.seedAssetKey ? approvedCorvoSeedAsset(args.seedAssetKey) : null;
    if (seedAsset && (args.brandId !== "corvo" || seedAsset.sha256 !== args.sha256)) {
      throw new Error("Image bytes do not match the approved seed hash");
    }
    const metadata = await ctx.db.system.get(args.storageId);
    // convex-test 0.0.53 returns base64 digests; live storage returns hex.
    const base64Digest = btoa(String.fromCharCode(...(args.sha256.match(/../gu) ?? []).map(hex => parseInt(hex, 16))));
    if (!metadata || metadata.size !== args.byteLength ||
      (metadata.sha256 !== args.sha256 && metadata.sha256 !== base64Digest) ||
      (metadata.contentType !== undefined && metadata.contentType !== args.contentType)) {
      throw new Error("Visual storage bytes missing or changed");
    }
    const matches = await ctx.db.query("v2VisualReferences")
      .withIndex("by_brandId_and_sha256", q => q.eq("brandId", args.brandId).eq("sha256", args.sha256)).take(2);
    const kind = seedAsset ? "approved_corvo_seed" as const : "upload" as const;
    const existing = matches.find(reference => reference.kind === kind);
    if (existing) return { referenceId: existing._id, storageId: existing.storageId };
    const storageId = matches[0]?.storageId ?? args.storageId;
    const referenceId = await ctx.db.insert("v2VisualReferences", {
      brandId: args.brandId, storageId, sha256: args.sha256, byteLength: args.byteLength,
      contentType: args.contentType, fileName: seedAsset?.fileName ?? args.fileName,
      kind, seedAssetKey: seedAsset?.key ?? null, article: seedAsset?.article ?? null,
      approvalProvenance: seedAsset?.approvalProvenance ?? null,
      sourceDocumentSha256: seedAsset ? corvoSeed.manifest.source_sha256 : null,
      sourceRecord: seedAsset ? `hero-image-prompts.md: ${seedAsset.fileName}` : `Uploaded by ${userId}`,
      historicalProvider: seedAsset ? corvoSeed.manifest.historical_provider : null,
      historicalModelId: null, uploadedBy: userId, createdAt: Date.now(),
    });
    return { referenceId, storageId };
  },
});

/** Accept bytes directly: clients never attach arbitrary or guessed storage IDs. */
export const uploadReference = action({
  args: { brandId: brandIdValidator, fileName: v.string(), contentType: v.string(), bytes: v.bytes() },
  returns: v.object({ referenceId: v.id("v2VisualReferences") }),
  handler: async (ctx, args): Promise<{ referenceId: Id<"v2VisualReferences"> }> => {
    await ctx.runQuery(internal.visualProfiles.authorizeReferenceUpload, { brandId: args.brandId });
    assertVisualImage(args.bytes, args.contentType);
    if (!args.fileName.trim() || args.fileName.length > 160 || /[\\/\u0000]/u.test(args.fileName)) {
      throw new Error("Visual reference needs a safe file name");
    }
    const verified = await ctx.runAction(internal.visualProviderActions.verifyReferenceUpload, { bytes: args.bytes, contentType: args.contentType });
    const sha256 = verified.sha256;
    const storageId = await ctx.storage.store(new Blob([args.bytes], { type: args.contentType }));
    // Retain bytes if the mutation result is uncertain; deleting could break a committed reference.
    const saved = await ctx.runMutation(internal.visualProfiles.recordReferenceUpload, {
      brandId: args.brandId, storageId, sha256, byteLength: args.bytes.byteLength,
      contentType: args.contentType, fileName: args.fileName.trim(),
    });
    if (saved.storageId !== storageId) await ctx.storage.delete(storageId);
    return { referenceId: saved.referenceId };
  },
});

export const getReference = query({
  args: { referenceId: v.id("v2VisualReferences") },
  returns: v.object({ ...visualReferenceValidator.fields, url: v.union(v.null(), v.string()) }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const reference = await ctx.db.get(args.referenceId);
    if (!reference) throw new Error("Visual reference not found");
    await requireProfileWrite(ctx, userId, reference.brandId, false);
    return { ...reference, url: await ctx.storage.getUrl(reference.storageId) };
  },
});

export const uploadSeedAsset = action({
  args: { brandId: v.literal("corvo"), assetKey: v.string(), bytes: v.bytes() },
  returns: v.object({ referenceId: v.id("v2VisualReferences") }),
  handler: async (ctx, args): Promise<{ referenceId: Id<"v2VisualReferences"> }> => {
    await ctx.runQuery(internal.visualProfiles.authorizeReferenceUpload, { brandId: args.brandId });
    await verifyCorvoSeedIntegrity();
    const asset = approvedCorvoSeedAsset(args.assetKey);
    assertVisualImage(args.bytes, "image/png");
    const sha256 = await hashVisualBytes(args.bytes);
    if (sha256 !== asset.sha256) throw new Error("Image bytes do not match the approved seed hash");
    const storageId = await ctx.storage.store(new Blob([args.bytes], { type: "image/png" }));
    const saved = await ctx.runMutation(internal.visualProfiles.recordReferenceUpload, {
      brandId: args.brandId, seedAssetKey: asset.key, storageId, sha256,
      byteLength: args.bytes.byteLength, contentType: "image/png", fileName: asset.fileName,
    });
    if (saved.storageId !== storageId) await ctx.storage.delete(storageId);
    return { referenceId: saved.referenceId };
  },
});

export const importCorvoSeed = mutation({
  args: { brandId: v.literal("corvo") },
  returns: v.object({
    profileRevisionId: v.id("v2VisualProfileRevisions"), referenceCount: v.number(), lessonCount: v.number(),
    seededProfile: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireProfileWrite(ctx, userId, args.brandId);
    await verifyCorvoSeedIntegrity();
    const references = new Map<string, Doc<"v2VisualReferences">>();
    for (const asset of corvoSeedAssets) {
      const reference = await ctx.db.query("v2VisualReferences")
        .withIndex("by_brandId_and_seedAssetKey", q => q.eq("brandId", args.brandId).eq("seedAssetKey", asset.key)).unique();
      if (!reference || reference.kind !== "approved_corvo_seed" || reference.sha256 !== asset.sha256) {
        throw new Error("Upload all approved seed images before importing the profile");
      }
      references.set(asset.key, reference);
    }
    const previous = await ctx.db.query("v2VisualSeedImports")
      .withIndex("by_brandId_and_seedId", q => q.eq("brandId", args.brandId).eq("seedId", CORVO_VISUAL_SEED_ID)).unique();
    if (previous) return {
      profileRevisionId: previous.initialProfileRevisionId,
      referenceCount: corvoSeedAssets.length, lessonCount: corvoSeed.lessons.length,
      seededProfile: (await ctx.db.get(previous.initialProfileRevisionId))?.seedId === CORVO_VISUAL_SEED_ID,
    };
    for (const lesson of corvoSeed.lessons) {
      const existing = await ctx.db.query("v2VisualLessons")
        .withIndex("by_brandId_and_key_and_revision", q => q.eq("brandId", args.brandId).eq("key", lesson.id)).take(1);
      if (existing.length) throw new Error("Seed lesson key already exists; resolve the collision before importing the archive");
    }
    const now = Date.now();
    const { profile, revision } = await currentProfile(ctx, args.brandId);
    let profileRevisionId = revision?._id;
    if (!profileRevisionId) {
      const profileId = profile?._id ?? await ctx.db.insert("v2VisualProfiles", {
        brandId: args.brandId, createdBy: userId, createdAt: now, updatedAt: now,
      });
      profileRevisionId = await ctx.db.insert("v2VisualProfileRevisions", {
        brandId: args.brandId, profileId, revision: 1, ...corvoCurrentGuidance,
        referenceBindings: [
          { referenceId: references.get("raven-character-sheet")!._id, role: "identity" },
          { referenceId: references.get("article-04")!._id, role: "style" },
        ],
        defaultRoute: null, seedId: CORVO_VISUAL_SEED_ID, createdBy: userId, createdAt: now,
      });
      await ctx.db.patch(profileId, { activeRevisionId: profileRevisionId, updatedAt: now });
    }
    for (const lesson of corvoSeed.lessons) {
      await ctx.db.insert("v2VisualLessons", {
        brandId: args.brandId, key: lesson.id, revision: 1,
        role: lesson.role as "creative_director" | "image_generator", sceneTags: lesson.applies_when,
        modelScope: null, postId: null, title: lesson.title, instruction: lesson.instruction,
        provenance: "seeded_observation", sourceDocumentSha256: corvoSeed.manifest.source_sha256,
        sourceRecord: `prompting-lessons.json:${lesson.id}`, exampleArticles: lesson.approved_example_articles,
        evidence: lesson.evidence.map(evidence => ({
          source: evidence.source, startLine: evidence.start_line, endLine: evidence.end_line, excerpt: evidence.excerpt,
        })),
        validation: "observation", oneShotValidation: "not_tested", changesBrandProfile: false,
        createdBy: userId, createdAt: now,
      });
    }
    await ctx.db.insert("v2VisualSeedImports", {
      brandId: args.brandId, seedId: CORVO_VISUAL_SEED_ID,
      sourceDocumentSha256: corvoSeed.manifest.source_sha256,
      initialProfileRevisionId: profileRevisionId, sourceDocument: corvoSeed.sourceDocument,
      manifestJson: JSON.stringify(corvoSeed.manifest), finalDirectionsJson: JSON.stringify(corvoSeed.finalDirections),
      lessonsJson: JSON.stringify(corvoSeed.lessons), importedBy: userId, importedAt: now,
    });
    return { profileRevisionId, referenceCount: references.size, lessonCount: corvoSeed.lessons.length, seededProfile: !revision };
  },
});

export const getSeedArchive = query({
  args: { brandId: v.literal("corvo") },
  returns: v.union(v.null(), v.object({
    seedId: v.string(), sourceDocumentSha256: v.string(), sourceDocument: v.string(),
    manifestJson: v.string(), finalDirectionsJson: v.string(), lessonsJson: v.string(),
    archiveOnly: v.literal(true), lessonsSha256: v.string(), finalDirectionsSha256: v.string(),
  })),
  handler: async (ctx, args) => {
    await requireProfileWrite(ctx, await requireUserId(ctx), args.brandId, false);
    const archive = await ctx.db.query("v2VisualSeedImports")
      .withIndex("by_brandId_and_seedId", q => q.eq("brandId", args.brandId).eq("seedId", CORVO_VISUAL_SEED_ID)).unique();
    if (!archive) return null;
    if (archive.sourceDocumentSha256 !== corvoSeed.manifest.source_sha256) throw new Error("Stored Corvo seed archive source identity changed");
    for (const [text, expected] of [
      [archive.sourceDocument, archive.sourceDocumentSha256], [archive.manifestJson, corvoSeedIntegrity.archive.manifest],
      [archive.lessonsJson, corvoSeedIntegrity.archive.lessons], [archive.finalDirectionsJson, corvoSeedIntegrity.archive.finalDirections],
    ]) {
      if (await hashVisualBytes(new TextEncoder().encode(text).buffer) !== expected) throw new Error("Stored Corvo seed archive integrity check failed");
    }
    return {
      seedId: archive.seedId, sourceDocumentSha256: archive.sourceDocumentSha256,
      sourceDocument: archive.sourceDocument, manifestJson: archive.manifestJson,
      finalDirectionsJson: archive.finalDirectionsJson, lessonsJson: archive.lessonsJson,
      archiveOnly: true as const, lessonsSha256: corvoSeedIntegrity.archive.lessons,
      finalDirectionsSha256: corvoSeedIntegrity.archive.finalDirections,
    };
  },
});

async function relevantLessons(
  ctx: QueryCtx | MutationCtx, brandId: BrandId,
  options: { role: "creative_director" | "image_generator"; sceneTags: string[]; provider?: string; model?: string; postId?: Id<"v2Posts">; limit?: number },
) {
  const limit = options.limit ?? 5;
  if (!Number.isInteger(limit) || limit < 0 || limit > 5) throw new Error("Lesson limit must be between 0 and 5");
  if (options.sceneTags.length > 20 || options.sceneTags.some(tag => tag.length > 80)) throw new Error("Too many or invalid lesson scene tags");
  const tags = new Set(options.sceneTags);
  if ((tags.size === 0 && !options.postId) || limit === 0) return [];
  const candidates = await ctx.db.query("v2VisualLessons")
    .withIndex("by_brandId_and_role", q => q.eq("brandId", brandId).eq("role", options.role)).order("desc").take(513);
  if (candidates.length > 512) throw new Error("Lesson history exceeds the bounded 512-row retrieval; resolve the history before selecting new pins");
  const newest = new Map<string, Doc<"v2VisualLessons">>();
  for (const lesson of candidates) {
    if (newest.has(lesson.key)) continue;
    const latest = await ctx.db.query("v2VisualLessons")
      .withIndex("by_brandId_and_key_and_revision", q => q.eq("brandId", brandId).eq("key", lesson.key))
      .order("desc").take(2);
    if (latest.length === 2 && latest[0].revision === latest[1].revision) throw new Error("Ambiguous current lesson revision; resolve duplicate keys before selecting new pins");
    if (latest[0]) newest.set(lesson.key, latest[0]);
  }
  return Array.from(newest.values()).filter(lesson =>
    lesson.role === options.role &&
    (lesson.postId === null || lesson.postId === options.postId) &&
    (lesson.modelScope === null || (lesson.modelScope.model === options.model &&
      (lesson.modelScope.provider === null || lesson.modelScope.provider === options.provider))) &&
    ((lesson.postId !== null && lesson.postId === options.postId) || lesson.sceneTags.some(tag => tags.has(tag))),
  ).sort((a, b) => {
    const score = (lesson: Doc<"v2VisualLessons">) => lesson.sceneTags.filter(tag => tags.has(tag)).length;
    return score(b) - score(a) || a.key.localeCompare(b.key);
  }).slice(0, limit);
}

export const retrieveLessons = query({
  args: {
    brandId: brandIdValidator, role: visualLessonRoleValidator, sceneTags: v.array(v.string()),
    provider: v.optional(v.string()), model: v.optional(v.string()), postId: v.optional(v.id("v2Posts")), limit: v.optional(v.number()),
  },
  returns: v.array(visualLessonValidator),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);
    if (args.postId) {
      const post = await ctx.db.get(args.postId);
      if (!post || post.userId !== userId || post.brandId !== args.brandId) throw new Error("Post not found");
    }
    return relevantLessons(ctx, args.brandId, args);
  },
});

async function ownedBlogPost(ctx: QueryCtx | MutationCtx, userId: string, postId: Id<"v2Posts">) {
  const post = await ctx.db.get(postId);
  if (!post || post.userId !== userId) throw new Error("Post not found");
  await requireBrandAccess(ctx, userId, post.brandId);
  if (post.channelId !== "corvo-blog") throw new Error("Visual profiles require a saved blog post");
  return post;
}

const viewedPostContextValidator = v.object({ title: v.string(), blogSlug: v.optional(v.string()), channelId: v.string() });
function assertViewedPostContext(post: Doc<"v2Posts">, expected: { title: string; blogSlug?: string; channelId: string }) {
  if (expected.title !== post.title || expected.blogSlug !== post.blogSlug || expected.channelId !== post.channelId) {
    throw new Error("Saved post context changed; reload before editing its visual exception");
  }
}

export const setPostException = mutation({
  args: {
    postId: v.id("v2Posts"), expectedExceptionId: v.union(v.null(), v.id("v2VisualPostExceptions")), guidance: v.string(),
    expectedPostContext: viewedPostContextValidator,
  },
  returns: v.object({ postExceptionId: v.id("v2VisualPostExceptions"), revision: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedBlogPost(ctx, userId, args.postId);
    await requireProfileWrite(ctx, userId, post.brandId);
    assertViewedPostContext(post, args.expectedPostContext);
    const guidance = args.guidance.trim();
    if (!guidance || guidance.length > 4000) throw new Error("Post exception must have 1 to 4000 characters");
    const latest = await ctx.db.query("v2VisualPostExceptions")
      .withIndex("by_postId_and_revision", q => q.eq("postId", args.postId)).order("desc").first();
    if (latest?.guidance === guidance) return { postExceptionId: latest._id, revision: latest.revision };
    if ((latest?._id ?? null) !== args.expectedExceptionId) throw new Error("Post exception changed; reload before saving");
    const revision = (latest?.revision ?? 0) + 1;
    const postExceptionId = await ctx.db.insert("v2VisualPostExceptions", {
      brandId: post.brandId, postId: post._id, revision, guidance, seedId: null,
      sourceRecord: `Explicit post exception authored by ${userId}`, createdBy: userId, createdAt: Date.now(),
    });
    return { postExceptionId, revision };
  },
});

export const getPostException = query({
  args: { postExceptionId: v.id("v2VisualPostExceptions") }, returns: visualPostExceptionValidator,
  handler: async (ctx, args) => {
    const exception = await ctx.db.get(args.postExceptionId);
    if (!exception) throw new Error("Post exception not found");
    const post = await ownedBlogPost(ctx, await requireUserId(ctx), exception.postId);
    if (post.brandId !== exception.brandId) throw new Error("Post exception not found");
    return exception;
  },
});

export const applyCorvoArticle7Exception = mutation({
  args: { postId: v.id("v2Posts"), expectedExceptionId: v.union(v.null(), v.id("v2VisualPostExceptions")), expectedPostContext: viewedPostContextValidator },
  returns: v.object({ postExceptionId: v.id("v2VisualPostExceptions"), revision: v.number() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const post = await ownedBlogPost(ctx, userId, args.postId);
    await requireProfileWrite(ctx, userId, post.brandId);
    assertViewedPostContext(post, args.expectedPostContext);
    if (post.brandId !== "corvo" || post.title !== ARTICLE7_TITLE || post.blogSlug !== ARTICLE7_SLUG || post.channelId !== "corvo-blog") {
      throw new Error("The approved photographic hand belongs only to Corvo article 7");
    }
    const imported = await ctx.db.query("v2VisualSeedImports")
      .withIndex("by_brandId_and_seedId", q => q.eq("brandId", "corvo").eq("seedId", CORVO_VISUAL_SEED_ID)).unique();
    if (!imported) throw new Error("Import the approved Corvo seed first");
    const matching = await ctx.db.query("v2Posts")
      .withIndex("by_brand_and_blogSlug", q => q.eq("brandId", "corvo").eq("blogSlug", ARTICLE7_SLUG)).take(2);
    if (matching.length !== 1 || matching[0]._id !== post._id) throw new Error("Article 7 must have a unique saved post mapping");
    const latest = await ctx.db.query("v2VisualPostExceptions")
      .withIndex("by_postId_and_revision", q => q.eq("postId", post._id)).order("desc").first();
    if (latest?.seedId === CORVO_VISUAL_SEED_ID && await exceptionApplies(ctx, post, latest)) return { postExceptionId: latest._id, revision: latest.revision };
    if ((latest?._id ?? null) !== args.expectedExceptionId) throw new Error("Post exception changed; reload before saving");
    const revision = (latest?.revision ?? 0) + 1;
    const postExceptionId = await ctx.db.insert("v2VisualPostExceptions", {
      brandId: "corvo", postId: post._id, revision,
      guidance: "Retain the photographic hand intentionally for article 7. It is not the construction reference for other human elements; ordinary human elements remain paper.",
      seedId: CORVO_VISUAL_SEED_ID, sourceRecord: "hero-image-prompts.md:569-574; article-07-hero.png",
      sourcePostTitle: post.title, sourceBlogSlug: post.blogSlug,
      createdBy: userId, createdAt: Date.now(),
    });
    return { postExceptionId, revision };
  },
});

export const getSeedStatus = query({
  args: { brandId: v.literal("corvo") },
  returns: v.object({
    seedId: v.string(), imported: v.boolean(), historicalModelId: v.null(), oneShotValidation: v.literal("not_tested"),
    assets: v.array(v.object({
      key: v.string(), fileName: v.string(), sha256: v.string(), article: v.union(v.null(), v.number()),
      referenceId: v.union(v.null(), v.id("v2VisualReferences")),
    })),
  }),
  handler: async (ctx, args) => {
    await requireBrandAccess(ctx, await requireUserId(ctx), args.brandId);
    const imported = await ctx.db.query("v2VisualSeedImports")
      .withIndex("by_brandId_and_seedId", q => q.eq("brandId", args.brandId).eq("seedId", CORVO_VISUAL_SEED_ID)).unique();
    const assets = [];
    for (const asset of corvoSeedAssets) {
      const reference = await ctx.db.query("v2VisualReferences")
        .withIndex("by_brandId_and_seedAssetKey", q => q.eq("brandId", args.brandId).eq("seedAssetKey", asset.key)).unique();
      assets.push({
        key: asset.key, fileName: asset.fileName, sha256: asset.sha256, article: asset.article,
        referenceId: reference?.kind === "approved_corvo_seed" && reference.sha256 === asset.sha256 ? reference._id : null,
      });
    }
    return { seedId: CORVO_VISUAL_SEED_ID, imported: Boolean(imported), assets, historicalModelId: null, oneShotValidation: "not_tested" as const };
  },
});

import { v } from "convex/values";
import { internalMutation, internalQuery, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { imageRouteFields } from "./visualWorkflowTables";
import { VISUAL_PROVIDER_CAPABILITIES, MAX_VISUAL_IMAGE_BYTES } from "../lib/visualProviders";
import { requireUserId, requireBrandAccess } from "./campaignAccess";
import { publicationTransitionRequired } from "../lib/publicationReview";
import { assertVisualAdmissionEnabled } from "./visualRollout";

const routeValidator = v.object({ _id: v.id("v2VisualImageRoutes"), _creationTime: v.number(), ...imageRouteFields, enabled: v.boolean(), createdAt: v.number() });

/** Admin-only reviewed evidence ingestion. No defaults or public client can qualify a route. */
export const registerReviewedImageRoute = internalMutation({
  args: imageRouteFields, returns: v.id("v2VisualImageRoutes"),
  handler: async (ctx, args) => {
    if (args.inputFidelity && !["gpt-image-1-mini", "gpt-image-1"].includes(args.model)) throw new Error("Input fidelity requires an explicit GPT Image1 model");
    const documented = VISUAL_PROVIDER_CAPABILITIES.find(route => route.provider === args.provider && route.model === args.model && route.apiModelId === args.apiModelId);
    if (!documented || !args.operations.length || args.operations.some(op => !documented.operations.includes(op)) ||
      args.referenceInputs && !documented.referenceInputs || !Number.isSafeInteger(args.maxInputImages) || args.maxInputImages < 0 || args.maxInputImages > documented.maxInputImages ||
      !documented.sizes.includes(args.size) || !documented.outputFormats.includes(args.outputFormat)) throw new Error("Unsupported reviewed image contract");
    for (const amount of [args.maximumMicros, args.maxPromptBytes, args.maxInputBytes]) if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Reviewed positive integer cost/input bounds required");
    if (args.maxPromptBytes > 200_000 || args.maxInputBytes > MAX_VISUAL_IMAGE_BYTES || !Number.isSafeInteger(args.expiresAt) || args.expiresAt <= Date.now()) throw new Error("Invalid or expired reviewed bounds");
    const probe = args.qualification === "qualification-probe";
    if (probe && (!args.operatorUserId?.trim() || !args.probeAttemptId || !args.reviewedPacketId?.trim() || args.capabilityReceiptIds.length)) throw new Error("Exact operator probe packet required; no invented capability receipts");
    if ((!probe && !args.capabilityReceiptIds.length) || args.capabilityReceiptIds.length > 16 || [...args.capabilityReceiptIds, args.boundReceiptId].some(id => !/^[a-zA-Z0-9._:-]{1,160}$/.test(id)) ||
      !args.reviewedBy.trim() || args.reviewedBy.length > 200 || !args.provenance.trim() || args.provenance.length > 1000) throw new Error("Reviewed capability and bound evidence required");
    return ctx.db.insert("v2VisualImageRoutes", { ...args, ...(["gpt-image-1-mini", "gpt-image-1"].includes(args.model) ? { inputFidelity: args.inputFidelity ?? "low" } : {}), enabled: true, createdAt: Date.now() });
  },
});

export const getReviewedImageRoutes = internalQuery({
  args: { provider: v.union(v.null(), v.string()), model: v.string() }, returns: v.array(routeValidator),
  handler: async (ctx, args) => {
    const providers = args.provider ? [args.provider] : ["digitalocean", "openai"];
    const rows: Doc<"v2VisualImageRoutes">[] = [];
    for (const provider of providers) if (provider === "digitalocean" || provider === "openai") {
      const found = await ctx.db.query("v2VisualImageRoutes").withIndex("by_provider_and_model", q => q.eq("provider", provider).eq("model", args.model)).order("desc").take(20);
      rows.push(...found.filter(route => route.enabled && route.expiresAt > Date.now()));
    }
    return rows;
  },
});

export const getAvailability = query({
  args: { postId: v.id("v2Posts") }, returns: v.object({ imageRoutes: v.array(v.object({ provider: v.string(), model: v.string(), apiModelId: v.string(), quality: v.union(v.literal("low"), v.literal("medium"), v.literal("high")), inputFidelity: v.union(v.null(), v.literal("low"), v.literal("high")), size: v.string(), outputFormat: v.union(v.literal("png"), v.literal("jpeg"), v.literal("webp")), generation: v.boolean(), edit: v.boolean() })), reason: v.union(v.null(), v.string()) }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx), post = await ctx.db.get(args.postId);
    if (!post || post.userId !== userId) throw new Error("Post not found");
    const member = await requireBrandAccess(ctx, userId, post.brandId);
    if (!["owner", "editor"].includes(member.role)) throw new Error("Brand edit access denied");
    if (post.channelId !== "corvo-blog" || publicationTransitionRequired(post)) return { imageRoutes: [], reason: "separate-publishing-transition-required" };
    try { assertVisualAdmissionEnabled(userId); } catch { return { imageRoutes: [], reason: "editorial-visual-admissions-paused" }; }
    const state = await ctx.db.query("v2VisualStates").withIndex("by_post", q => q.eq("postId", post._id)).unique();
    const plan = state?.selectedPlanId ? await ctx.db.get(state.selectedPlanId) : null;
    const parent = state?.selectedVersionId ? await ctx.db.get(state.selectedVersionId) : null;
    if (plan && (plan.postId !== post._id || plan.userId !== userId || plan.brandId !== post.brandId) || parent && (parent.postId !== post._id || parent.userId !== userId || parent.brandId !== post.brandId)) throw new Error("Owned visual route context is unavailable");
    const generationInputs = plan?.input.references.length ?? 0;
    const editInputs = (parent?.input.references.length ?? 0) + 1;
    const imageRoutes = [];
    for (const provider of ["digitalocean", "openai"] as const) for (const model of ["gpt-image-2", "gpt-image-1-mini", "gpt-image-1"]) {
      const routes = await ctx.db.query("v2VisualImageRoutes").withIndex("by_provider_and_model", q => q.eq("provider", provider).eq("model", model)).order("desc").take(20);
      const seen = new Set<string>();
      for (const route of routes) if (route.enabled && route.qualification !== "qualification-probe" && route.expiresAt > Date.now() && route.size === "1536x1024") {
        const generation = route.operations.includes("generate") && generationInputs <= route.maxInputImages && (!generationInputs || route.referenceInputs);
        const edit = route.operations.includes("edit") && route.referenceInputs && editInputs <= route.maxInputImages;
        const key = JSON.stringify([provider, route.model, route.apiModelId, route.quality, route.inputFidelity ?? null, route.size, route.outputFormat, generation, edit]);
        if (seen.has(key)) continue;
        seen.add(key);
        imageRoutes.push({ provider, model: route.model, apiModelId: route.apiModelId, quality: route.quality, inputFidelity: route.inputFidelity ?? null, size: route.size, outputFormat: route.outputFormat, generation, edit });
      }
    }
    return { imageRoutes, reason: imageRoutes.length ? null : "no-qualified-route-and-cost-bound" };
  },
});

export function imageRouteBindsAttempt(route: Doc<"v2VisualImageRoutes">, attempt: Doc<"v2VisualAttempts">) {
  const input = attempt.input;
  return route.enabled && route.expiresAt > Date.now() && (route.qualification !== "qualification-probe" || route.operatorUserId === attempt.userId && route.probeAttemptId === attempt._id && Boolean(route.reviewedPacketId)) && ["generation", "edit"].includes(attempt.stage) &&
    route.operations.includes(attempt.stage === "edit" ? "edit" : "generate") &&
    (input.provider === null || input.provider === route.provider) && (input.model === null || input.model === route.model) &&
    input.size === route.size && input.outputFormat === route.outputFormat && (input.quality ?? "medium") === route.quality && (input.inputFidelity ?? (["gpt-image-1-mini", "gpt-image-1"].includes(input.model ?? "") ? "low" : null)) === (route.inputFidelity ?? null) &&
    new TextEncoder().encode(input.prompt).length <= route.maxPromptBytes &&
    input.references.length + Number(Boolean(input.parentStorageId)) <= route.maxInputImages &&
    (!input.references.length && !input.parentStorageId || route.referenceInputs);
}

export async function validateLiveImageQuote(ctx: QueryCtx | MutationCtx, attempt: Doc<"v2VisualAttempts">, quote: Doc<"v2VisualDispatchQuotes">) {
  const route = quote.imageRouteId ? await ctx.db.get(quote.imageRouteId) : null;
  if (!route || !imageRouteBindsAttempt(route, attempt) || !quote.requestSha256 || !/^[a-f0-9]{64}$/.test(quote.requestSha256) ||
    (quote.qualification === "qualification-probe") !== (route.qualification === "qualification-probe") || quote.provider !== route.provider || quote.model !== route.model || quote.maximumMicros !== route.maximumMicros ||
    quote.provenance !== route.provenance || JSON.stringify(quote.capabilityReceiptIds) !== JSON.stringify(route.capabilityReceiptIds)) throw new Error("No qualified live route and verified cost bound");
  for (const storageId of [...attempt.input.references.map(reference => reference.storageId), ...(attempt.input.parentStorageId ? [attempt.input.parentStorageId] : [])]) {
    const stored = await ctx.db.system.get(storageId);
    if (!stored || stored.size > route.maxInputBytes) throw new Error("Pinned inputs exceed the reviewed image cost bound");
  }
}

export const registerImageDispatchQuote = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), routeId: v.id("v2VisualImageRoutes"), requestSha256: v.string() }, returns: v.id("v2VisualDispatchQuotes"),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId), route = await ctx.db.get(args.routeId);
    if (!attempt || !route || !imageRouteBindsAttempt(route, attempt) || !/^[a-f0-9]{64}$/.test(args.requestSha256)) throw new Error("Reviewed route does not bind this image attempt");
    const existing = await ctx.db.query("v2VisualDispatchQuotes").withIndex("by_attempt", q => q.eq("attemptId", attempt._id)).take(21);
    if (existing.length > 20) throw new Error("Too many dispatch quotes; reconcile the attempt before execution");
    const bound = existing.find(quote => quote.imageRouteId !== undefined);
    if (bound) {
      if (bound.imageRouteId !== route._id || bound.requestSha256 !== args.requestSha256) throw new Error("Image attempt already binds a different reviewed request");
      return bound._id;
    }
    return ctx.db.insert("v2VisualDispatchQuotes", { attemptId: attempt._id, inputSignature: attempt.inputSignature, stage: attempt.stage,
      provider: route.provider, model: route.model, maximumMicros: route.maximumMicros, qualification: route.qualification ?? "live-receipt", boundVerified: true,
      capabilityReceiptIds: route.capabilityReceiptIds, provenance: route.provenance, requestSha256: args.requestSha256, imageRouteId: route._id, createdAt: Date.now() });
  },
});

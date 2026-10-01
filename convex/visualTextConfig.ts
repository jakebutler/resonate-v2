import { v } from "convex/values";
import { internalMutation, internalQuery, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { textRouteFields, textRouteDocValidator } from "./visualTextTables";
import { prepareTextRequest, textMaximumMicros, visualTextCredential, visualTextOriginAllowed } from "../lib/visualTextRuntime";
import { verifiedReflectionContext } from "./visualWorkflow";
import { requireUserId, requireBrandAccess } from "./campaignAccess";
import { publicationTransitionRequired } from "../lib/publicationReview";
import { assertVisualAdmissionEnabled } from "./visualRollout";

/** Trusted server evidence ingestion only. Absent records are unqualified; no client-supplied price or key grants admission. */
export const registerReviewedTextRoute = internalMutation({
  args: textRouteFields, returns: v.id("v2VisualTextRoutes"),
  handler: async (ctx, args) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(args.model) || !args.stages.length || new Set(args.stages).size !== args.stages.length) throw new Error("Reviewed explicit text model/stages required");
    for (const amount of [args.maxInputBytes, args.maxInputTokens, args.maxMessageOverheadTokens, args.contextWindowTokens, args.maxOutputTokens, args.inputPriceMicrosPerMillion, args.outputPriceMicrosPerMillion]) if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Reviewed positive integer text bounds/prices required");
    if (args.maxInputBytes > 220_000 || args.maxInputTokens > 1_000_000 || args.maxOutputTokens > 20_000 || args.maxInputTokens < args.maxInputBytes + args.maxMessageOverheadTokens || args.contextWindowTokens < args.maxInputTokens + args.maxOutputTokens || !Number.isSafeInteger(args.expiresAt) || args.expiresAt <= Date.now()) throw new Error("Invalid or expired text tokenizer/context bounds");
    if (args.vision) {
      const vision = args.vision;
      if (!args.stages.includes("reflection") || [vision.maxImageBytes, vision.maxImageInputTokens, vision.maxRequestBytes].some(value => !Number.isSafeInteger(value) || value <= 0) || vision.maxImageBytes >= 150_000 || vision.maxImageInputTokens > 1_000_000 || vision.maxRequestBytes > 500_000 || vision.maxRequestBytes < args.maxInputBytes + Math.ceil(vision.maxImageBytes / 3) * 4 + 100 || args.maxInputTokens < args.maxInputBytes + args.maxMessageOverheadTokens + vision.maxImageInputTokens) throw new Error("Invalid reviewed vision byte/token/context bounds");
      if (!vision.capabilityReceiptIds.length || vision.capabilityReceiptIds.length > 16 || [...vision.capabilityReceiptIds, vision.tokenBoundReceiptId, vision.priceReceiptId].some(id => !/^[a-zA-Z0-9._:-]{1,160}$/.test(id))) throw new Error("Separate vision capability and image-token bound evidence required");
    }
    if (!args.capabilityReceiptIds.length || args.capabilityReceiptIds.length > 16 || [...args.capabilityReceiptIds, args.tokenBoundReceiptId, args.priceReceiptId].some(id => !/^[a-zA-Z0-9._:-]{1,160}$/.test(id)) || !args.reviewedBy.trim() || args.reviewedBy.length > 200 || !args.provenance.trim() || args.provenance.length > 1000) throw new Error("Trusted capability, UTF-8 token upper bound and price evidence required");
    const active = await ctx.db.query("v2VisualTextRoutes").withIndex("by_provider_and_enabled_and_expires_at", q => q.eq("provider", args.provider).eq("enabled", true).gt("expiresAt", Date.now())).take(20);
    if (active.length >= 20) throw new Error("Active text route limit reached; disable or expire reviewed routes before registering another");
    return ctx.db.insert("v2VisualTextRoutes", { ...args, maximumMicros: textMaximumMicros(args), enabled: true, createdAt: Date.now() });
  },
});

async function routesForStage(ctx: QueryCtx | MutationCtx, stage: "planning" | "reflection") {
  const routes: Doc<"v2VisualTextRoutes">[] = [];
  for (const provider of ["openai", "cortex"] as const) {
    if (!visualTextOriginAllowed(provider)) continue;
    const rows = await ctx.db.query("v2VisualTextRoutes").withIndex("by_provider_and_enabled_and_expires_at", q => q.eq("provider", provider).eq("enabled", true).gt("expiresAt", Date.now())).order("desc").take(20);
    routes.push(...rows.sort((a, b) => b._creationTime - a._creationTime).filter(route => route.enabled && route.expiresAt > Date.now() && route.stages.includes(stage) && (stage !== "reflection" || !!route.vision)));
  }
  return routes;
}
export const getReviewedTextRoutes = internalQuery({
  args: { stage: v.union(v.literal("planning"), v.literal("reflection")) }, returns: v.array(textRouteDocValidator),
  handler: (ctx, args) => routesForStage(ctx, args.stage),
});

async function preparedForAttempt(ctx: QueryCtx | MutationCtx, attempt: Doc<"v2VisualAttempts">, route: Doc<"v2VisualTextRoutes">) {
  if (!visualTextOriginAllowed(route.provider)) throw new Error("Text origin is not reviewed");
  if (!route.enabled || route.expiresAt <= Date.now() || !["planning", "reflection"].includes(attempt.stage) || !route.stages.includes(attempt.stage as "planning" | "reflection") || route.maximumMicros !== textMaximumMicros(route)) throw new Error("Text route does not bind stored attempt");
  const reflection = attempt.stage === "reflection" ? await verifiedReflectionContext(ctx, attempt) : null;
  if (attempt.stage === "reflection" && (!reflection || !route.vision)) throw new Error("Current approved image and reviewed vision route required");
  return prepareTextRequest({ ...attempt, stage: attempt.stage as "planning" | "reflection" }, route, reflection?.context, reflection ? { identity: reflection.approvedImage } : undefined);
}
export async function validateTextQuote(ctx: QueryCtx | MutationCtx, attempt: Doc<"v2VisualAttempts">, quote: Doc<"v2VisualDispatchQuotes">) {
  const route = quote.textRouteId ? await ctx.db.get(quote.textRouteId) : null;
  if (!route || quote.imageRouteId || quote.qualification !== "live-receipt" || quote.provider !== route.provider || quote.model !== route.model || quote.maximumMicros !== route.maximumMicros || quote.provenance !== route.provenance || JSON.stringify(quote.capabilityReceiptIds) !== JSON.stringify(route.capabilityReceiptIds)) throw new Error("No qualified text route and verified cost bound");
  const prepared = await preparedForAttempt(ctx, attempt, route);
  if (quote.requestSha256 !== prepared.requestSha256) throw new Error("Text quote differs from exact pinned request");
}
export const registerTextDispatchQuote = internalMutation({
  args: { attemptId: v.id("v2VisualAttempts"), routeId: v.id("v2VisualTextRoutes"), requestSha256: v.string(), userId: v.string(), trustedReflectionScheduler: v.optional(v.boolean()) }, returns: v.union(v.null(), v.id("v2VisualDispatchQuotes")),
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId), route = await ctx.db.get(args.routeId);
    let authenticatedUserId: string | null = null;
    try { authenticatedUserId = await requireUserId(ctx); } catch (error) { if (!(error instanceof Error) || error.message !== "Unauthorized") throw error; }
    const userId = args.trustedReflectionScheduler && !authenticatedUserId && attempt?.stage === "reflection" ? args.userId : authenticatedUserId;
    if (!userId) throw new Error("Unauthorized");
    if (userId !== args.userId || args.trustedReflectionScheduler && attempt?.stage !== "reflection") throw new Error("Text dispatch actor mismatch");
    if (!attempt || attempt.userId !== userId || !route) throw new Error("Owned text attempt and reviewed route required");
    const member = await requireBrandAccess(ctx, userId, attempt.brandId);
    if (!["owner", "editor"].includes(member.role)) throw new Error("Brand edit access denied");
    assertVisualAdmissionEnabled(userId);
    if (attempt.status !== "queued") return null;
    const prepared = await preparedForAttempt(ctx, attempt, route);
    if (args.requestSha256 !== prepared.requestSha256) throw new Error("Text request hash differs from trusted preparation");
    return ctx.db.insert("v2VisualDispatchQuotes", { attemptId: attempt._id, inputSignature: attempt.inputSignature, stage: attempt.stage, provider: route.provider, model: route.model, maximumMicros: route.maximumMicros, qualification: "live-receipt", boundVerified: true, capabilityReceiptIds: route.capabilityReceiptIds, provenance: route.provenance, requestSha256: prepared.requestSha256, textRouteId: route._id, createdAt: Date.now() });
  },
});

export const getAvailability = query({
  args: { postId: v.id("v2Posts") }, returns: v.object({ planning: v.boolean(), reflection: v.boolean(), reason: v.union(v.null(), v.string()) }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx), post = await ctx.db.get(args.postId);
    if (!post || post.userId !== userId) throw new Error("Post not found");
    const member = await requireBrandAccess(ctx, userId, post.brandId);
    if (!["owner", "editor"].includes(member.role)) throw new Error("Brand edit access denied");
    if (post.channelId !== "corvo-blog" || publicationTransitionRequired(post)) return { planning: false, reflection: false, reason: "separate-publishing-transition-required" };
    try { assertVisualAdmissionEnabled(userId); } catch { return { planning: false, reflection: false, reason: "editorial-visual-admissions-paused" }; }
    const planning = (await routesForStage(ctx, "planning")).some(route => !!visualTextCredential(route.provider));
    const reflection = (await routesForStage(ctx, "reflection")).some(route => !!visualTextCredential(route.provider));
    return { planning, reflection, reason: planning || reflection ? null : "no-qualified-text-route-and-credential" };
  },
});

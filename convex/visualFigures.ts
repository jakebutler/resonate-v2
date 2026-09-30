import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireBrandAccess, requireUserId } from "./campaignAccess";
import { figureCandidateValidator, figureFormatValidator, figurePlanValidator, figureReviewEventValidator, figureSourceValidator, figureStateValidator } from "./visualFigureTables";
import { buildFigureMarkdownBlock, figureArticleTokens, assertFigureInsertionAnchor, assertFigureMarkdownBlockPlacement, assertFigureEvidence, figureSignatures, parseFigureSource, planFigureCandidates, type FigureSource, type FigureSpec } from "../lib/visualFigures";
import { hashVisualBytes } from "../lib/visualProfile";
import { fingerprintPostContent } from "../lib/domain";
import { onArticleChange } from "./visualWorkflow";
import { assertVisualAdmissionEnabled } from "./visualRollout";
import { publicationTransitionRequired } from "../lib/publicationReview";

async function ownedPost(ctx: QueryCtx | MutationCtx, userId: string, postId: Id<"v2Posts">, write = false) {
  const post = await ctx.db.get(postId);
  if (!post || post.userId !== userId) throw new Error("Post not found");
  const member = await requireBrandAccess(ctx, userId, post.brandId);
  if (write && member.role !== "owner" && member.role !== "editor") throw new Error("Figure write access denied");
  if (write && publicationTransitionRequired(post)) throw new Error("Separate publishing transition required before figure changes");
  if (post.channelId !== "corvo-blog") throw new Error("Figures require a saved blog post");
  if (write) assertVisualAdmissionEnabled(userId);
  return post;
}
const textHash = (text: string) => hashVisualBytes(new TextEncoder().encode(text).buffer);
const sourceInput = (source: Doc<"v2FigureSources">): FigureSource => ({ id: source._id, name: source.name, format: source.format, purpose: source.purpose, content: source.content });
async function sourceHead(ctx: QueryCtx | MutationCtx, postId: Id<"v2Posts">, key: string) {
  return ctx.db.query("v2FigureSourceHeads").withIndex("by_post_key", q => q.eq("postId", postId).eq("key", key)).unique();
}
async function saveSource(ctx: MutationCtx, post: Doc<"v2Posts">, data: {
  key: string; name: string; format: FigureSource["format"]; purpose: FigureSource["purpose"]; content: string;
}, expectedSourceId?: Id<"v2FigureSources"> | null) {
  const head = await sourceHead(ctx, post._id, data.key);
  const previous = head ? await ctx.db.get(head.sourceId) : null;
  const sha256 = await textHash(data.content);
  if (previous?.sha256 === sha256 && previous.name === data.name && previous.format === data.format && previous.purpose === data.purpose) return { sourceId: previous._id, revision: previous.revision };
  if (expectedSourceId !== undefined && (previous?._id ?? null) !== expectedSourceId) throw new Error("Evidence changed; reload before replacing it");
  const heads = await ctx.db.query("v2FigureSourceHeads").withIndex("by_post", q => q.eq("postId", post._id)).take(18);
  if (!head && data.purpose !== "article" && heads.filter(head => head.key !== "__article__").length >= 16) throw new Error("At most 16 evidence attachments per article");
  const parsed = parseFigureSource({ id: "pending", ...data });
  const revision = (previous?.revision ?? 0) + 1;
  const sourceId = await ctx.db.insert("v2FigureSources", {
    userId: post.userId, brandId: post.brandId, postId: post._id, ...data, revision, sha256, parseErrors: parsed.errors, createdAt: Date.now(),
  });
  if (head) await ctx.db.patch(head._id, { sourceId, updatedAt: Date.now() });
  else await ctx.db.insert("v2FigureSourceHeads", { postId: post._id, key: data.key, sourceId, updatedAt: Date.now() });
  return { sourceId, revision };
}
export const attachEvidence = mutation({
  args: {
    postId: v.id("v2Posts"), key: v.string(), expectedSourceId: v.union(v.null(), v.id("v2FigureSources")),
    name: v.string(), format: figureFormatValidator, purpose: v.union(v.literal("claim-trace"), v.literal("data")), content: v.string(),
  },
  returns: v.object({ sourceId: v.id("v2FigureSources"), revision: v.number() }),
  handler: async (ctx, args) => {
    const post = await ownedPost(ctx, await requireUserId(ctx), args.postId, true);
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/u.test(args.key) || !args.name.trim() || args.name.length > 160 || /[\\/\u0000-\u001f]/u.test(args.name)) throw new Error("Evidence requires a safe key and file name");
    if (!args.content.trim() || new TextEncoder().encode(args.content).length > 65536) throw new Error("Evidence must contain at most 64 KiB of UTF-8 text");
    const saved = await saveSource(ctx, post, { key: args.key, name: args.name, format: args.format, purpose: args.purpose, content: args.content }, args.expectedSourceId);
    await onFigureArticleChange(ctx, post, post.content);
    return saved;
  },
});
export const getSource = query({
  args: { sourceId: v.id("v2FigureSources") }, returns: figureSourceValidator,
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) throw new Error("Evidence source not found");
    const post = await ownedPost(ctx, await requireUserId(ctx), source.postId);
    if (source.userId !== post.userId || source.brandId !== post.brandId) throw new Error("Evidence source not found");
    return source;
  },
});

async function currentSources(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">) {
  const heads = await ctx.db.query("v2FigureSourceHeads").withIndex("by_post", q => q.eq("postId", post._id)).take(18);
  if (heads.length > 17) throw new Error("Evidence attachment limit exceeded");
  const sources: Doc<"v2FigureSources">[] = [];
  for (const head of heads) {
    const source = await ctx.db.get(head.sourceId);
    if (!source || source.postId !== post._id || source.userId !== post.userId || source.brandId !== post.brandId) throw new Error("Evidence source not found");
    sources.push(source);
  }
  return sources;
}
async function activeStates(ctx: QueryCtx | MutationCtx, postId: Id<"v2Posts">) {
  const accepted = await ctx.db.query("v2FigureStates").withIndex("by_post_status", q => q.eq("postId", postId).eq("status", "accepted")).take(4);
  const review = await ctx.db.query("v2FigureStates").withIndex("by_post_status", q => q.eq("postId", postId).eq("status", "needs-review")).take(4);
  if (accepted.length + review.length > 3) throw new Error("At most three inserted figures per article");
  return [...accepted, ...review];
}
async function saveCandidate(ctx: MutationCtx, post: Doc<"v2Posts">, planId: Id<"v2FigurePlans">, spec: FigureSpec, parentCandidateId: Id<"v2FigureCandidates"> | null = null) {
  return ctx.db.insert("v2FigureCandidates", {
    userId: post.userId, brandId: post.brandId, postId: post._id, planId, parentCandidateId, spec,
    ...await figureSignatures(spec), createdAt: Date.now(),
  });
}
export const planFigures = mutation({
  args: { postId: v.id("v2Posts") },
  returns: v.object({ planId: v.id("v2FigurePlans"), candidateIds: v.array(v.id("v2FigureCandidates")), reasons: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const post = await ownedPost(ctx, await requireUserId(ctx), args.postId, true);
    if (new TextEncoder().encode(post.content).length > 200000) throw new Error("Article exceeds deterministic figure planning limit");
    const article = await saveSource(ctx, post, { key: "__article__", name: "Article draft", format: "markdown", purpose: "article", content: post.content });
    const sources = await currentSources(ctx, post);
    const articleSource = sources.find(source => source._id === article.sourceId)!;
    const active = await activeStates(ctx, post._id);
    const semantics = (spec: FigureSpec) => JSON.stringify({ family: spec.family, columns: spec.columns, rows: spec.rows });
    const represented: string[] = [];
    for (const state of active) {
      const selected = await ctx.db.get(state.selectedCandidateId);
      if (selected) represented.push(semantics(selected.spec));
    }
    const planned = planFigureCandidates(sourceInput(articleSource), sources.filter(source => source.purpose !== "article").map(sourceInput), {
      requireClaimTrace: true, excludedRepresentations: represented, limit: 3 - active.length,
    });
    const reasons = [...planned.reasons];
    if (!planned.candidates.length && !reasons.length) reasons.push("No additional supported figures; existing representations or the combined limit already cover this plan");
    const previousPlan = await ctx.db.query("v2FigurePlans").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").first();
    for (const id of previousPlan?.candidateIds ?? []) {
      const oldState = await ctx.db.query("v2FigureStates").withIndex("by_root_candidate", q => q.eq("rootCandidateId", id)).unique();
      if (oldState?.status === "proposed" && !oldState.insertedBlock) {
        const oldCandidate = await ctx.db.get(oldState.selectedCandidateId);
        if (!oldCandidate || oldCandidate.postId !== post._id || oldCandidate.userId !== post.userId || oldCandidate.brandId !== post.brandId) throw new Error("Prior proposal not found");
        await reviewEvent(ctx, post, oldState, oldCandidate, "superseded", "superseded", post.userId, post.content, "A new plan explicitly superseded this unused proposal");
        await ctx.db.patch(oldState._id, { status: "superseded", reviewReason: "Superseded by a newer plan", updatedAt: Date.now() });
      }
    }
    const planId = await ctx.db.insert("v2FigurePlans", {
      userId: post.userId, brandId: post.brandId, postId: post._id, articleSourceId: article.sourceId,
      sourceIds: sources.map(source => source._id), candidateIds: [], reasons, createdAt: Date.now(),
    });
    const candidateIds: Id<"v2FigureCandidates">[] = [];
    for (const spec of planned.candidates) {
      try { assertFigureEvidence(spec, sources.map(sourceInput), true); }
      catch (error) { reasons.push(error instanceof Error ? error.message : "Figure evidence validation failed"); continue; }
      const candidateId = await saveCandidate(ctx, post, planId, spec); candidateIds.push(candidateId);
      await ctx.db.insert("v2FigureStates", {
        userId: post.userId, brandId: post.brandId, postId: post._id, rootCandidateId: candidateId, selectedCandidateId: candidateId,
        acceptedCandidateId: null, status: "proposed", insertedBlock: null, acceptedBy: null, acceptedAt: null, updatedAt: Date.now(),
      });
    }
    await ctx.db.patch(planId, { candidateIds, reasons });
    return { planId, candidateIds, reasons };
  },
});
export const getCandidate = query({
  args: { candidateId: v.id("v2FigureCandidates") }, returns: figureCandidateValidator,
  handler: async (ctx, args) => {
    const candidate = await ctx.db.get(args.candidateId);
    if (!candidate) throw new Error("Figure candidate not found");
    const post = await ownedPost(ctx, await requireUserId(ctx), candidate.postId);
    if (candidate.userId !== post.userId || candidate.brandId !== post.brandId) throw new Error("Figure candidate not found");
    return candidate;
  },
});
export const getWorkspace = query({
  args: { postId: v.id("v2Posts") },
  returns: v.object({ sources: v.array(figureSourceValidator), plan: v.union(v.null(), figurePlanValidator), candidates: v.array(figureCandidateValidator), states: v.array(figureStateValidator) }),
  handler: async (ctx, args) => {
    const post = await ownedPost(ctx, await requireUserId(ctx), args.postId);
    const plan = await ctx.db.query("v2FigurePlans").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").first();
    const candidates: Doc<"v2FigureCandidates">[] = []; const states: Doc<"v2FigureStates">[] = await activeStates(ctx, post._id);
    for (const rootId of plan?.candidateIds ?? []) {
      const state = await ctx.db.query("v2FigureStates").withIndex("by_root_candidate", q => q.eq("rootCandidateId", rootId)).unique();
      if (state && !states.some(existing => existing._id === state._id)) states.push(state);
    }
    for (const id of new Set(states.map(state => state.selectedCandidateId))) {
      const candidate = await ctx.db.get(id);
      if (!candidate || candidate.postId !== post._id || candidate.brandId !== post.brandId || candidate.userId !== post.userId) throw new Error("Figure candidate not found");
      candidates.push(candidate);
    }
    return { sources: await currentSources(ctx, post), plan, candidates, states };
  },
});

async function candidateContext(ctx: QueryCtx | MutationCtx, userId: string, candidateId: Id<"v2FigureCandidates">, write = false) {
  const candidate = await ctx.db.get(candidateId);
  if (!candidate) throw new Error("Figure candidate not found");
  const post = await ownedPost(ctx, userId, candidate.postId, write);
  if (candidate.userId !== post.userId || candidate.brandId !== post.brandId) throw new Error("Figure candidate not found");
  const state = await ctx.db.query("v2FigureStates").withIndex("by_candidate", q => q.eq("selectedCandidateId", candidateId)).unique();
  if (!state || state.postId !== post._id || state.userId !== post.userId || state.brandId !== post.brandId) throw new Error("Review the currently selected figure revision");
  return { candidate, post, state };
}
type EvidenceSourceProof = { sourceId: Id<"v2FigureSources">; sha256: string; revision: number; purpose: FigureSource["purpose"]; currentSourceId: Id<"v2FigureSources"> | null; currentSha256: string; currentRevision: number | null };
async function evidenceForCandidate(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">, candidate: Doc<"v2FigureCandidates">) {
  const sourceIds = [...new Set([...candidate.spec.evidence, ...candidate.spec.claimTraceEvidence].map(binding => binding.sourceId))];
  if (sourceIds.length > 2) throw new Error("Invalid figure evidence source count");
  const sources: FigureSource[] = []; const evidenceSources: EvidenceSourceProof[] = [];
  for (const sourceId of sourceIds) {
    const id = ctx.db.normalizeId("v2FigureSources", sourceId);
    const original = id ? await ctx.db.get(id) : null;
    if (!original || original.postId !== post._id || original.userId !== post.userId || original.brandId !== post.brandId) throw new Error("Figure evidence source not found");
    if (await textHash(original.content) !== original.sha256) throw new Error("Figure evidence archive bytes changed");
    for (const binding of [...candidate.spec.evidence, ...candidate.spec.claimTraceEvidence].filter(binding => binding.sourceId === sourceId)) {
      if (original.content.slice(binding.start, binding.end) !== binding.text || original.content.slice(0, binding.start).split("\n").length !== binding.row) throw new Error("Figure evidence archive locator changed");
    }
    if (original.purpose === "article") {
      sources.push({ ...sourceInput(original), content: post.content });
      const currentSha256 = await textHash(post.content);
      const head = await sourceHead(ctx, post._id, original.key);
      const current = head ? await ctx.db.get(head.sourceId) : null;
      if (current && (current.postId !== post._id || current.userId !== post.userId || current.brandId !== post.brandId || await textHash(current.content) !== current.sha256)) throw new Error("Figure article archive changed");
      const exact = current?.sha256 === currentSha256 ? current : null;
      evidenceSources.push({ sourceId: original._id, sha256: original.sha256, revision: original.revision, purpose: original.purpose, currentSourceId: exact?._id ?? null, currentSha256, currentRevision: exact?.revision ?? null });
    }
    else {
      const head = await sourceHead(ctx, post._id, original.key);
      const current = head ? await ctx.db.get(head.sourceId) : null;
      if (!current || current._id !== original._id || current.sha256 !== original.sha256 || current.revision !== original.revision || current.name !== original.name || current.format !== original.format || current.purpose !== original.purpose ||
        current.postId !== post._id || current.userId !== post.userId || current.brandId !== post.brandId || await textHash(current.content) !== current.sha256) throw new Error("Figure evidence source version changed; remove and replan against the new immutable source before review");
      sources.push({ ...sourceInput(original), content: current.content });
      evidenceSources.push({ sourceId: original._id, sha256: original.sha256, revision: original.revision, purpose: original.purpose, currentSourceId: current._id, currentSha256: current.sha256, currentRevision: current.revision });
    }
  }
  return { sources, evidenceSources };
}
async function validateCandidate(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">, candidate: Doc<"v2FigureCandidates">) {
  const evidence = await evidenceForCandidate(ctx, post, candidate);
  assertFigureEvidence(candidate.spec, evidence.sources, true);
  const rendered = await figureSignatures(candidate.spec);
  if (rendered.svg !== candidate.svg || rendered.svgSha256 !== candidate.svgSha256 || rendered.rendererVersion !== candidate.rendererVersion ||
    rendered.dataSignature !== candidate.dataSignature || rendered.presentationSignature !== candidate.presentationSignature) throw new Error("Figure preview or bound signatures changed");
  return evidence;
}
async function reviewEvent(ctx: MutationCtx, post: Doc<"v2Posts">, state: Doc<"v2FigureStates">, candidate: Doc<"v2FigureCandidates">, decision: Doc<"v2FigureReviewEvents">["decision"], status: Doc<"v2FigureStates">["status"], actorId: string | null, content = post.content, reason?: string) {
  await ctx.db.insert("v2FigureReviewEvents", { userId: post.userId, brandId: post.brandId, postId: post._id, stateId: state._id, candidateId: candidate._id,
    priorStatus: state.status, status, decision, actorId, dataSignature: candidate.dataSignature, presentationSignature: candidate.presentationSignature,
    postContentSha256: await textHash(content), ...(reason ? { reason } : {}), createdAt: Date.now() });
}
export const getReviewHistory = query({
  args: { postId: v.id("v2Posts") }, returns: v.array(figureReviewEventValidator),
  handler: async (ctx, args) => {
    const post = await ownedPost(ctx, await requireUserId(ctx), args.postId);
    return ctx.db.query("v2FigureReviewEvents").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").take(64);
  },
});
const reviewArgs = { candidateId: v.id("v2FigureCandidates"), expectedDataSignature: v.string(), expectedPresentationSignature: v.string() };
function assertPreview(candidate: Doc<"v2FigureCandidates">, args: { expectedDataSignature: string; expectedPresentationSignature: string }) {
  if (candidate.dataSignature !== args.expectedDataSignature || candidate.presentationSignature !== args.expectedPresentationSignature) throw new Error("Figure preview changed; reload before reviewing");
}
function insertedBlock(candidate: Doc<"v2FigureCandidates">) {
  return buildFigureMarkdownBlock(candidate._id, candidate.spec);
}
function uniqueOccurrence(content: string, text: string, kind: string): number {
  const index = content.indexOf(text);
  if (!text || index < 0 || content.lastIndexOf(text) !== index) throw new Error(`${kind} must match exactly once; resolve placement explicitly`);
  return index;
}
function removeInsertedEnvelope(content: string, state: Doc<"v2FigureStates">): { content: string; detached: boolean } {
  const block = state.insertedBlock!;
  const index = content.indexOf(block);
  const token = `resonate-figure://${state.acceptedCandidateId}`;
  if (index < 0) {
    if (content.includes(token)) throw new Error("A partial or duplicate figure token remains; remove that token explicitly before detaching or reinserting");
    return { content, detached: true };
  }
  uniqueOccurrence(content, block, "Inserted figure block");
  uniqueOccurrence(content, token, "Inserted figure token");
  if (!/^(?:\r?\n[ \t]*(?:\r?\n|$)|$)/u.test(content.slice(index + block.length))) throw new Error("Figure placement contains a partial source-note block; remove the modified token explicitly before detaching or reinserting");
  const envelope = `\n\n${block}\n\n`;
  if (index >= 2 && content.slice(index - 2, index + block.length + 2) === envelope) {
    return { content: content.slice(0, index - 2) + content.slice(index + block.length + 2), detached: false };
  }
  return { content: content.slice(0, index) + content.slice(index + block.length), detached: false };
}
function wholeLineAnchor(content: string, anchor: string, kind = "Figure insertion anchor") {
  return assertFigureInsertionAnchor(content, anchor, kind);
}
async function assertSiblingPlacements(ctx: MutationCtx, post: Doc<"v2Posts">, content: string, ownStateId: Id<"v2FigureStates">, anchor?: string, quarantinedRemoval = false) {
  for (const sibling of (await activeStates(ctx, post._id)).filter(state => state._id !== ownStateId)) {
    const candidate = await ctx.db.get(sibling.selectedCandidateId);
    if (!candidate || candidate.postId !== post._id || candidate.userId !== post.userId || candidate.brandId !== post.brandId) throw new Error("Sibling figure not found");
    if (anchor === candidate.spec.insertionAnchor) throw new Error("This insertion anchor is already used by another active figure");
    try {
      await validateCandidate(ctx, { ...post, content }, candidate);
      if (!sibling.insertedBlock) throw new Error("Missing block");
      assertInsertionPlacement(content, candidate, sibling.insertedBlock);
    } catch (error) {
      // Removing only a trusted stored figure envelope may preserve an already quarantined sibling.
      // This grants no approval and lets multiple invalidated figures be explicitly removed one by one.
      if (quarantinedRemoval && sibling.status === "needs-review") {
        try {
          await validateCandidate(ctx, post, candidate);
          if (!sibling.insertedBlock) throw new Error("Missing block");
          assertInsertionPlacement(post.content, candidate, sibling.insertedBlock);
        } catch { continue; }
      }
      throw new Error(`Sibling figure evidence or placement requires review before this atomic change: ${error instanceof Error ? error.message : "validation failed"}`);
    }
  }
}
function insertAtAnchor(content: string, anchor: string, block: string) {
  const index = wholeLineAnchor(content, anchor);
  return `${content.slice(0, index)}\n\n${block}\n\n${content.slice(index)}`;
}
function assertInsertionPlacement(content: string, candidate: Doc<"v2FigureCandidates">, block: string) {
  assertFigureMarkdownBlockPlacement(content, candidate.spec.insertionAnchor, block);
}
async function updateArticle(ctx: MutationCtx, post: Doc<"v2Posts">, content: string) {
  const fingerprint = fingerprintPostContent({ title: post.title, content, linkedinFirstComment: post.linkedinFirstComment });
  await onArticleChange(ctx, post, { title: post.title, content });
  await clearFigureFinalApproval(ctx, post);
  await ctx.db.patch(post._id, { content, contentFingerprint: fingerprint, approvalState: "unapproved", status: post.status === "approved" ? "draft" : post.status, updatedAt: Date.now() });
  const latest = await ctx.db.query("v2PublishingIntents").withIndex("by_post", q => q.eq("postId", post._id)).order("desc").first();
  if (latest) await ctx.db.patch(latest._id, { approvalState: "unapproved", contentFingerprint: fingerprint, updatedAt: Date.now() });
}
async function clearFigureFinalApproval(ctx: MutationCtx, post: Doc<"v2Posts">) {
  await ctx.db.patch(post._id, { approvalState: "unapproved", status: post.status === "approved" ? "draft" : post.status, updatedAt: Date.now() });
  let cursor: string | null = null;
  for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
    const page = await ctx.db.query("v2PublishingIntents")
      .withIndex("by_post_and_approval_state", q => q.eq("postId", post._id).eq("approvalState", "approved")).paginate({ cursor, numItems: 128 });
    for (const intent of page.page) await ctx.db.patch(intent._id, { approvalState: "unapproved", updatedAt: Date.now() });
    if (page.isDone) return;
    cursor = page.continueCursor;
  }
  throw new Error("Reconcile approved publishing intents before this atomic figure transition");
}
export async function onFigureArticleChange(ctx: MutationCtx, post: Doc<"v2Posts">, newContent: string) {
  const after = { ...post, content: newContent }; let invalidated = false;
  for (const state of await activeStates(ctx, post._id)) {
    const candidate = await ctx.db.get(state.selectedCandidateId);
    try {
      if (!candidate || candidate.postId !== post._id || candidate.brandId !== post.brandId || candidate.userId !== post.userId) throw new Error("Accepted figure not found");
      await validateCandidate(ctx, after, candidate);
      if (!state.insertedBlock) throw new Error("Accepted figure block is missing");
      assertInsertionPlacement(newContent, candidate, state.insertedBlock);
    } catch (error) {
      invalidated = true;
      const reason = error instanceof Error ? error.message : "Figure evidence requires review";
      if (candidate && (state.status !== "needs-review" || state.reviewReason !== reason)) await reviewEvent(ctx, post, state, candidate, "invalidated", "needs-review", null, newContent, reason);
      await ctx.db.patch(state._id, { status: "needs-review", reviewReason: reason, updatedAt: Date.now() });
    }
  }
  if (invalidated) await clearFigureFinalApproval(ctx, post);
}
export const declineCandidate = mutation({
  args: { candidateId: v.id("v2FigureCandidates") }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { state, post, candidate } = await candidateContext(ctx, userId, args.candidateId, true);
    if (state.insertedBlock !== null) throw new Error("Use explicit removal for an inserted figure");
    if (state.status === "superseded" || state.status === "removed") throw new Error("This figure is superseded or removed; create a new plan");
    if (state.status === "declined") return null;
    await reviewEvent(ctx, post, state, candidate, "declined", "declined", userId);
    await ctx.db.patch(state._id, { status: "declined", updatedAt: Date.now() }); return null;
  },
});
export const acceptCandidate = mutation({
  args: reviewArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { candidate, post, state } = await candidateContext(ctx, userId, args.candidateId, true);
    assertPreview(candidate, args); await validateCandidate(ctx, post, candidate);
    if (["declined", "removed", "superseded"].includes(state.status)) throw new Error(`This figure is ${state.status}; create an explicit new plan`);
    if (state.status === "accepted" && state.acceptedCandidateId === candidate._id) {
      assertInsertionPlacement(post.content, candidate, state.insertedBlock!); return null;
    }
    const active = await activeStates(ctx, post._id);
    if (!active.some(active => active._id === state._id) && active.length >= 3) throw new Error("At most three inserted figures per article");
    for (const existing of active.filter(existing => existing._id !== state._id)) {
      const other = await ctx.db.get(existing.selectedCandidateId);
      if (other && other.spec.family === candidate.spec.family && JSON.stringify(other.spec.columns) === JSON.stringify(candidate.spec.columns) && JSON.stringify(other.spec.rows) === JSON.stringify(candidate.spec.rows)) throw new Error("This evidence representation is already inserted");
    }
    let content = post.content;
    if (state.insertedBlock) content = removeInsertedEnvelope(content, state).content;
    const block = insertedBlock(candidate); content = insertAtAnchor(content, candidate.spec.insertionAnchor, block);
    // Recheck after insertion so an anchor can never corrupt the represented source table.
    await validateCandidate(ctx, { ...post, content }, candidate);
    assertInsertionPlacement(content, candidate, block);
    await assertSiblingPlacements(ctx, post, content, state._id, candidate.spec.insertionAnchor);
    await updateArticle(ctx, post, content);
    await reviewEvent(ctx, post, state, candidate, "accepted", "accepted", userId, content);
    await ctx.db.patch(state._id, { status: "accepted", acceptedCandidateId: candidate._id, insertedBlock: block, acceptedBy: userId, acceptedAt: Date.now(), reviewReason: undefined, updatedAt: Date.now() });
    return null;
  },
});

const paletteValidator = v.object({ background: v.string(), ink: v.string(), accent: v.string() });
export const editCandidate = mutation({
  args: { ...reviewArgs, rows: v.optional(v.array(v.array(v.string()))), palette: v.optional(paletteValidator), insertionAnchor: v.optional(v.string()) },
  returns: v.object({ candidateId: v.id("v2FigureCandidates") }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { candidate, post, state } = await candidateContext(ctx, userId, args.candidateId, true);
    assertPreview(candidate, args);
    if (["declined", "removed", "superseded"].includes(state.status)) throw new Error(`This figure is ${state.status}; create an explicit new plan`);
    let spec: FigureSpec = candidate.spec;
    if (args.rows && JSON.stringify(args.rows) !== JSON.stringify(candidate.spec.rows)) {
      const article = await saveSource(ctx, post, { key: "__article__", name: "Article draft", format: "markdown", purpose: "article", content: post.content });
      const sources = await currentSources(ctx, post);
      const articleSource = sources.find(source => source._id === article.sourceId)!;
      const choices = planFigureCandidates(sourceInput(articleSource), sources.filter(source => source.purpose !== "article").map(sourceInput), { requireClaimTrace: true, limit: 3, requiredRepresentation: JSON.stringify({ family: candidate.spec.family, columns: candidate.spec.columns, rows: args.rows }) }).candidates;
      const bound = choices.find(choice => choice.family === candidate.spec.family && JSON.stringify(choice.columns) === JSON.stringify(candidate.spec.columns) && JSON.stringify(choice.rows) === JSON.stringify(args.rows));
      if (!bound) throw new Error("Edited labels, values, units, order and relationships must match exact current article evidence and claim trace");
      spec = bound;
    }
    spec = { ...spec, insertionAnchor: args.insertionAnchor ?? candidate.spec.insertionAnchor,
      presentation: { ...spec.presentation, ...(args.palette ?? { background: candidate.spec.presentation.background, ink: candidate.spec.presentation.ink, accent: candidate.spec.presentation.accent }) } };
    wholeLineAnchor(post.content, spec.insertionAnchor);
    await validateCandidateEvidence(ctx, post, { ...candidate, spec });
    const signatures = await figureSignatures(spec);
    if (signatures.dataSignature === candidate.dataSignature && signatures.presentationSignature === candidate.presentationSignature) return { candidateId: candidate._id };
    const candidateId = await saveCandidate(ctx, post, candidate.planId, spec, candidate._id);
    await reviewEvent(ctx, post, state, (await ctx.db.get(candidateId))!, "edited", state.insertedBlock ? "needs-review" : "proposed", userId);
    await ctx.db.patch(state._id, { selectedCandidateId: candidateId, status: state.insertedBlock ? "needs-review" : "proposed", reviewReason: state.insertedBlock ? "Review the edited figure before replacing the inserted version" : undefined, updatedAt: Date.now() });
    if (state.insertedBlock) await clearFigureFinalApproval(ctx, post);
    return { candidateId };
  },
});
async function validateCandidateEvidence(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">, candidate: Doc<"v2FigureCandidates">) {
  const evidence = await evidenceForCandidate(ctx, post, candidate);
  assertFigureEvidence(candidate.spec, evidence.sources, true);
}
export const moveFigure = mutation({
  args: { ...reviewArgs, insertionAnchor: v.string() }, returns: v.object({ candidateId: v.id("v2FigureCandidates") }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { candidate, post, state } = await candidateContext(ctx, userId, args.candidateId, true);
    assertPreview(candidate, args); await validateCandidate(ctx, post, candidate);
    if (!state.insertedBlock || state.acceptedCandidateId !== candidate._id) throw new Error("Only the selected inserted figure can move");
    const without = removeInsertedEnvelope(post.content, state).content;
    const spec = { ...candidate.spec, insertionAnchor: args.insertionAnchor };
    await validateCandidateEvidence(ctx, post, { ...candidate, spec });
    const candidateId = await saveCandidate(ctx, post, candidate.planId, spec, candidate._id);
    const moved = (await ctx.db.get(candidateId))!; const block = insertedBlock(moved);
    const content = insertAtAnchor(without, spec.insertionAnchor, block);
    await validateCandidate(ctx, { ...post, content }, moved);
    assertInsertionPlacement(content, moved, block);
    await assertSiblingPlacements(ctx, post, content, state._id, spec.insertionAnchor);
    await updateArticle(ctx, post, content);
    await reviewEvent(ctx, post, state, moved, "moved", "accepted", userId, content);
    await ctx.db.patch(state._id, { selectedCandidateId: candidateId, acceptedCandidateId: candidateId, status: "accepted", insertedBlock: block, acceptedBy: userId, acceptedAt: Date.now(), reviewReason: undefined, updatedAt: Date.now() });
    return { candidateId };
  },
});
export const removeFigure = mutation({
  args: { candidateId: v.id("v2FigureCandidates") }, returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const { post, state, candidate } = await candidateContext(ctx, userId, args.candidateId, true);
    if (!state.insertedBlock) throw new Error("Figure is not inserted");
    const removed = removeInsertedEnvelope(post.content, state);
    await assertSiblingPlacements(ctx, post, removed.content, state._id, undefined, true);
    if (removed.content !== post.content) await updateArticle(ctx, post, removed.content);
    else await clearFigureFinalApproval(ctx, post);
    await reviewEvent(ctx, post, state, candidate, "removed", "removed", userId, removed.content, removed.detached ? "Complete figure block and token were already absent; explicitly detached" : undefined);
    await ctx.db.patch(state._id, { status: "removed", insertedBlock: null, reviewReason: removed.detached ? "Explicitly detached after the complete figure block and token were manually removed" : undefined, updatedAt: Date.now() });
    return null;
  },
});

/** Unused proposals are outside this gate. Every inserted token must resolve to one exact current accepted revision. */
export async function assertCurrentFigures(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">) {
  const states = await activeStates(ctx, post._id); const candidates: Doc<"v2FigureCandidates">[] = [];
  for (const state of states) {
    if (state.status !== "accepted" || !state.acceptedBy || state.acceptedAt === null || state.acceptedCandidateId !== state.selectedCandidateId || !state.insertedBlock) throw new Error("Inserted figure requires explicit current review");
    const candidate = await ctx.db.get(state.selectedCandidateId);
    if (!candidate || candidate.postId !== post._id || candidate.userId !== post.userId || candidate.brandId !== post.brandId) throw new Error("Accepted figure not found");
    await validateCandidate(ctx, post, candidate);
    if (state.insertedBlock !== insertedBlock(candidate)) throw new Error("Accepted figure presentation changed");
    assertInsertionPlacement(post.content, candidate, state.insertedBlock); candidates.push(candidate);
  }
  const tokens = figureArticleTokens(post.content);
  if (tokens.length !== candidates.length || tokens.some(id => !candidates.some(candidate => candidate._id === id))) throw new Error("Article contains an unapproved or ambiguous figure token");
  return candidates;
}
export async function buildPublicationFigures(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">) {
  const candidates = await assertCurrentFigures(ctx, post);
  const postContentSha256 = await textHash(post.content);
  const postContentFingerprint = fingerprintPostContent({ title: post.title, content: post.content, linkedinFirstComment: post.linkedinFirstComment });
  return Promise.all(candidates.sort((a, b) => post.content.indexOf(`resonate-figure://${a._id}`) - post.content.indexOf(`resonate-figure://${b._id}`)).map(async candidate => {
    const state = await ctx.db.query("v2FigureStates").withIndex("by_candidate", q => q.eq("selectedCandidateId", candidate._id)).unique();
    if (!state?.acceptedBy || state.acceptedAt === null || state.acceptedCandidateId !== candidate._id) throw new Error("Figure acceptance provenance is missing");
    const { evidenceSources } = await evidenceForCandidate(ctx, post, candidate);
    return {
      postId: post._id, postContentSha256, postContentFingerprint, acceptedBy: state.acceptedBy, acceptedAt: state.acceptedAt, evidenceSources,
      candidateId: candidate._id, spec: candidate.spec, svg: candidate.svg, svgSha256: candidate.svgSha256,
      rendererVersion: candidate.rendererVersion, dataSignature: candidate.dataSignature, presentationSignature: candidate.presentationSignature,
      url: `resonate-figure://${candidate._id}`, caption: candidate.spec.presentation.caption, sourceNote: candidate.spec.presentation.sourceNote, alt: candidate.spec.presentation.alt,
    };
  }));
}
export const publicationFigureValidator = v.object({
  postId: v.id("v2Posts"), postContentSha256: v.string(), postContentFingerprint: v.string(), acceptedBy: v.string(), acceptedAt: v.number(),
  evidenceSources: v.array(v.object({ sourceId: v.id("v2FigureSources"), sha256: v.string(), revision: v.number(), purpose: v.union(v.literal("article"), v.literal("claim-trace"), v.literal("data")), currentSourceId: v.union(v.id("v2FigureSources"), v.null()), currentSha256: v.string(), currentRevision: v.union(v.number(), v.null()) })),
  candidateId: v.id("v2FigureCandidates"), spec: figureCandidateValidator.fields.spec, svg: v.string(), svgSha256: v.string(),
  rendererVersion: v.string(), dataSignature: v.string(), presentationSignature: v.string(), url: v.string(), caption: v.string(), sourceNote: v.string(), alt: v.string(),
});
export const getPublicationFigures = query({
  args: { postId: v.id("v2Posts") }, returns: v.array(publicationFigureValidator),
  handler: async (ctx, args) => buildPublicationFigures(ctx, await ownedPost(ctx, await requireUserId(ctx), args.postId)),
});

import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireBrandAccess, requireUserId } from "./campaignAccess";
import { hashVisualBytes } from "../lib/visualProfile";
import { stableInputSignature, serializedUtf8Bytes } from "../lib/visualWorkflow";
import { parseFigureSource } from "../lib/visualFigures";
import { onFigureArticleChange } from "./visualFigures";
import { parseCorpusCitation } from "../lib/campaignGrounding";

const SOURCE_KEY = "linked-research";
class UnsupportedLinkedEvidence extends Error {}
const sourceIdValidator = v.union(v.null(), v.id("v2FigureSources"));
const recordValidator = v.object({ kind: v.union(v.literal("claim"), v.literal("source-excerpt"), v.literal("corpus-excerpt")), id: v.string(), sourceIds: v.array(v.string()), status: v.string(), eligible: v.boolean(), text: v.string(), sha256: v.string(), updatedAt: v.number(), reason: v.union(v.null(), v.string()) });
const snapshotValidator = v.object({ snapshotHash: v.string(), expectedSourceId: sourceIdValidator, sourceKey: v.string(), content: v.string(), records: v.array(recordValidator), reasons: v.array(v.string()) });
type EvidenceRecord = { kind: "claim" | "source-excerpt" | "corpus-excerpt"; id: string; sourceIds: string[]; status: string; eligible: boolean; text: string; sha256: string; updatedAt: number; reason: string | null };
const textHash = (text: string) => hashVisualBytes(new TextEncoder().encode(text).buffer);
function bounded(text: string, maximum: number, label: string) {
  if (new TextEncoder().encode(text).byteLength > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) throw new Error(`${label} exceeds safe stored-text bounds`);
  return text;
}
function exactExcerpt(source: Doc<"v2ResearchSources">) {
  // Only these explicit stored passage fields are understood; never serialize or infer from raw.
  const raw: unknown = source.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const value = raw as Record<string, unknown>;
  return typeof value.excerpt === "string" ? bounded(value.excerpt, 8192, "Source excerpt") : typeof value.csv === "string" ? bounded(value.csv, 8192, "Source CSV") : "";
}
async function ownedPost(ctx: QueryCtx | MutationCtx, userId: string, postId: Id<"v2Posts">, write: boolean) {
  const post = await ctx.db.get(postId);
  if (!post || post.userId !== userId) throw new Error("Post not found");
  const membership = await requireBrandAccess(ctx, userId, post.brandId);
  if (write && membership.role !== "owner" && membership.role !== "editor") throw new Error("Linked evidence write access denied");
  if (write && ["published", "submitted", "pr-created"].includes(post.status)) throw new Error("Separate publishing transition required before importing evidence");
  if (post.channelId !== "corvo-blog") throw new Error("Linked evidence requires a saved blog post");
  return post;
}
async function currentHead(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">) {
  const head = await ctx.db.query("v2FigureSourceHeads").withIndex("by_post_key", q => q.eq("postId", post._id).eq("key", SOURCE_KEY)).unique();
  const source = head ? await ctx.db.get(head.sourceId) : null;
  if (head && (!source || source.userId !== post.userId || source.brandId !== post.brandId || source.postId !== post._id || source.key !== SOURCE_KEY || await textHash(source.content) !== source.sha256)) throw new Error("Linked evidence archive is unavailable or changed");
  return { head, source };
}

/** Atomic same-owner/same-brand projection. No caller chooses a brief or claim map. */
export async function resolveLinkedEvidenceSnapshot(ctx: QueryCtx | MutationCtx, userId: string, postId: Id<"v2Posts">, write = false) {
  const post = await ownedPost(ctx, userId, postId, write);
  const briefId = post.sourceResearchBriefId ? ctx.db.normalizeId("v2ResearchBriefs", post.sourceResearchBriefId) : null;
  if (post.sourceResearchBriefId && !briefId) throw new UnsupportedLinkedEvidence("Saved post has no supported persisted research brief link");
  if (!briefId && !post.sourceExcerptIds?.length) throw new UnsupportedLinkedEvidence("Saved post has no supported persisted evidence links");
  const brief = briefId ? await ctx.db.get(briefId) : null;
  if (briefId && !brief) throw new UnsupportedLinkedEvidence("Persisted linked research no longer exists");
  if (brief && (brief.userId !== userId || brief.brandId !== post.brandId)) throw new Error("Linked research is unavailable or unauthorized");
  let readBytes = brief ? serializedUtf8Bytes(brief) : 0;
  const account = (docs: unknown[]) => { readBytes += docs.reduce<number>((sum, doc) => sum + serializedUtf8Bytes(doc), 0); if (readBytes > 4_000_000) throw new Error("Linked research exceeds bounded snapshot read limit"); };
  const sources = briefId ? await ctx.db.query("v2ResearchSources").withIndex("by_brief", q => q.eq("researchBriefId", briefId)).take(9) : [];
  account(sources);
  if (sources.length > 8) throw new Error("Linked snapshot supports at most eight stored sources");
  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (source.userId !== userId || source.brandId !== post.brandId || sourceIds.has(source.sourceId)) throw new Error("Linked source chain is unavailable or ambiguous");
    sourceIds.add(bounded(source.sourceId, 160, "Source ID"));
  }
  const maps = briefId ? await ctx.db.query("v2ClaimMaps").withIndex("by_research_brief", q => q.eq("researchBriefId", briefId)).take(5) : [];
  account(maps);
  if (maps.length > 4) throw new Error("Linked snapshot supports at most four claim maps");
  const records: EvidenceRecord[] = [];
  const provenanceSources: { id: string; sourceId: string; title: string; url: string; status: string; updatedAt: number; sha256: string }[] = [];
  for (const source of sources) {
    const text = exactExcerpt(source);
    const sha256 = await textHash(text);
    provenanceSources.push({ id: source._id, sourceId: source.sourceId, title: bounded(source.title, 1000, "Source title"), url: bounded(source.url, 2000, "Source URL"), status: source.status, updatedAt: source.updatedAt, sha256 });
    records.push({ kind: "source-excerpt", id: source._id, sourceIds: [source.sourceId], status: source.status, eligible: source.status === "accepted" && Boolean(text.trim()), text, sha256, updatedAt: source.updatedAt, reason: source.status !== "accepted" ? "Source is not accepted" : !text.trim() ? "No exact stored source excerpt or CSV" : null });
  }
  const provenanceMaps: { id: string; status: string; updatedAt: number }[] = [];
  for (const map of maps) {
    if (map.userId !== userId || map.brandId !== post.brandId) throw new Error("Linked claim map is unavailable or unauthorized");
    provenanceMaps.push({ id: map._id, status: map.status, updatedAt: map.updatedAt });
    const claims = await ctx.db.query("v2Claims").withIndex("by_claim_map", q => q.eq("claimMapId", map._id)).take(9);
    account(claims);
    if (claims.length > 8) throw new Error("Linked snapshot supports at most eight claims per map");
    const claimIds = new Set<string>();
    for (const claim of claims) {
      if (claim.userId !== userId || claim.brandId !== post.brandId || claimIds.has(claim.claimId)) throw new Error("Linked claim chain is unavailable or ambiguous");
      claimIds.add(bounded(claim.claimId, 160, "Claim ID"));
      if (claim.sourceIds.length > 8) throw new Error("Claim has too many source bindings");
      claim.sourceIds.forEach(id => bounded(id, 160, "Claim source ID"));
      const text = bounded(claim.text, 8192, "Claim text");
      const supported = claim.sourceIds.length > 0 && claim.sourceIds.every(id => sources.some(source => source.sourceId === id && source.status === "accepted"));
      const eligible = claim.status === "accepted" && supported && Boolean(text.trim());
      records.push({ kind: "claim", id: claim._id, sourceIds: claim.sourceIds, status: claim.status, eligible, text, sha256: await textHash(text), updatedAt: claim.updatedAt, reason: claim.status !== "accepted" ? "Claim is not accepted" : !supported ? "Claim lacks an exact accepted linked source chain" : !text.trim() ? "Claim text is empty" : null });
    }
  }
  const links = { researchBriefId: briefId, sourceCampaignId: post.sourceCampaignId ?? null, sourceExcerptIds: post.sourceExcerptIds ?? [] };
  if (serializedUtf8Bytes(links) > 4000) throw new Error("Post links exceed bounded snapshot limit");
  const provenanceExcerpts: { id: string; corpusId: string; corpusVersion: number; documentId: string; seq: number; sensitivity: string; reviewState: string; provenance: string; sha256: string }[] = [];
  let campaign: Doc<"campaigns"> | null = null;
  if (post.sourceCampaignId) {
    campaign = await ctx.db.get(post.sourceCampaignId);
    if (!campaign || campaign.userId !== userId || campaign.brandId !== post.brandId) throw new Error("Linked campaign is unavailable or unauthorized");
    account([campaign]);
  }
  if (links.sourceExcerptIds.length > 12 || new Set(links.sourceExcerptIds).size !== links.sourceExcerptIds.length) throw new Error("Saved excerpt links exceed bounds or are ambiguous");
  for (const citation of links.sourceExcerptIds) {
    const parsed = parseCorpusCitation(citation);
    const corpusId = parsed ? ctx.db.normalizeId("corpora", parsed.corpusId) : null;
    if (!parsed || !corpusId || parsed.brandId !== post.brandId || !campaign?.corpusIds.includes(corpusId)) throw new Error("Saved excerpt is not attached to the owned same-brand campaign");
    const corpus = await ctx.db.get(corpusId);
    if (!corpus || corpus.brandId !== post.brandId) throw new Error("Linked corpus is unavailable or unauthorized");
    const rows = await ctx.db.query("corpusExcerpts").withIndex("by_corpus_and_seq", q => q.eq("corpusId", corpusId).eq("seq", parsed.seq)).take(2);
    if (rows.length !== 1) throw new Error("Linked excerpt is unavailable or ambiguous");
    const excerpt = rows[0];
    const document = await ctx.db.get(excerpt.documentId);
    if (!document || document.corpusId !== corpusId) throw new Error("Linked excerpt document chain is unavailable");
    account([corpus, excerpt, document]);
    const sha256 = await textHash(bounded(excerpt.text, 8192, "Corpus excerpt"));
    const eligible = excerpt.reviewState === "accepted" && excerpt.sensitivity === "public-safe" && Boolean(excerpt.text.trim());
    provenanceExcerpts.push({ id: excerpt._id, corpusId, corpusVersion: corpus.version, documentId: document._id, seq: excerpt.seq, sensitivity: excerpt.sensitivity, reviewState: excerpt.reviewState, provenance: bounded(excerpt.provenance, 2000, "Excerpt provenance"), sha256 });
    records.push({ kind: "corpus-excerpt", id: excerpt._id, sourceIds: [citation], status: excerpt.reviewState, eligible, text: eligible ? excerpt.text : "", sha256, updatedAt: corpus.createdAt, reason: eligible ? null : "Excerpt requires accepted review and public-safe sensitivity" });
  }
  const provenance = { links, brief: brief ? { id: briefId, status: brief.status, updatedAt: brief.updatedAt } : null, campaign: campaign ? { id: campaign._id, status: campaign.status, updatedAt: campaign.updatedAt } : null, sources: provenanceSources, claimMaps: provenanceMaps, corpusExcerpts: provenanceExcerpts, records: records.map(({ text: _text, ...metadata }) => { void _text; return metadata; }) };
  const eligible = records.filter(record => record.eligible);
  const passages = [...new Set(eligible.map(record => record.text))];
  const content = `Stored linked research snapshot; review statuses are preserved. No new research or approval is inferred.\n\nProvenance:\n\`\`\`json\n${stableInputSignature(provenance)}\n\`\`\`\n\n${passages.map(text => `Records with this exact passage:\n\`\`\`json\n${stableInputSignature(eligible.filter(record => record.text === text).map(({ text: _text, ...metadata }) => { void _text; return metadata; }))}\n\`\`\`\n\n${text}`).join("\n\n")}`;
  bounded(content, 65536, "Linked evidence snapshot");
  if (serializedUtf8Bytes(records) > 100_000) throw new Error("Linked inspection exceeds bounded snapshot limit");
  const parsed = parseFigureSource({ id: "pending", name: "Linked research.md", format: "markdown", purpose: "claim-trace", content });
  const reasons = [...new Set([...records.filter(record => !record.eligible).map(record => record.reason!), ...parsed.errors, ...(!parsed.tables.length ? ["No exact structured rows in accepted linked content; text remains available for inspection"] : [])])];
  const snapshotHash = await textHash(stableInputSignature({ provenance, records }));
  const { source } = await currentHead(ctx, post);
  return { post, snapshot: { snapshotHash, expectedSourceId: source?._id ?? null, sourceKey: SOURCE_KEY, content, records, reasons }, parsed };
}

export const getSnapshot = query({ args: { postId: v.id("v2Posts") }, returns: v.union(v.null(), snapshotValidator), handler: async (ctx, args) => {
  try { return (await resolveLinkedEvidenceSnapshot(ctx, await requireUserId(ctx), args.postId)).snapshot; }
  catch (error) { if (error instanceof UnsupportedLinkedEvidence) return null; throw error; }
} });

/** Root approval/publication snapshots must call this alongside current figure validation. */
export async function assertCurrentLinkedEvidence(ctx: QueryCtx | MutationCtx, post: Doc<"v2Posts">, referencedSourceIds?: readonly string[]) {
  await ownedPost(ctx, post.userId, post._id, false);
  if (referencedSourceIds !== undefined) {
    if (referencedSourceIds.length > 6) throw new Error("At most six publication evidence sources can be checked");
    let referenced = false;
    for (const value of new Set(referencedSourceIds)) {
      const id = ctx.db.normalizeId("v2FigureSources", value);
      const archive = id ? await ctx.db.get(id) : null;
      if (!archive || archive.postId !== post._id || archive.userId !== post.userId || archive.brandId !== post.brandId) throw new Error("Referenced evidence source is unavailable or unauthorized");
      if (archive.key === SOURCE_KEY) referenced = true;
    }
    if (!referenced) return null;
  }
  const { source } = await currentHead(ctx, post);
  if (!source) return null;
  let resolved: Awaited<ReturnType<typeof resolveLinkedEvidenceSnapshot>>;
  try { resolved = await resolveLinkedEvidenceSnapshot(ctx, post.userId, post._id); }
  catch { throw new Error("Linked evidence changed after import; review current links and reimport or remove dependent figures"); }
  if (source.content !== resolved.snapshot.content || source.sha256 !== await textHash(resolved.snapshot.content) || source.format !== "markdown" || source.purpose !== "claim-trace") throw new Error("Linked evidence changed after import; review current links and reimport or remove dependent figures");
  return { sourceId: source._id, revision: source.revision, snapshotHash: resolved.snapshot.snapshotHash };
}
export const getCurrentImport = query({
  args: { postId: v.id("v2Posts") }, returns: v.union(v.null(), v.object({ sourceId: v.id("v2FigureSources"), revision: v.number(), snapshotHash: v.string() })),
  handler: async (ctx, args) => assertCurrentLinkedEvidence(ctx, await ownedPost(ctx, await requireUserId(ctx), args.postId, false)),
});

export const importLinkedEvidence = mutation({
  args: { postId: v.id("v2Posts"), expectedSnapshotHash: v.string(), expectedSourceId: sourceIdValidator },
  returns: v.object({ sourceId: v.id("v2FigureSources"), revision: v.number(), snapshotHash: v.string(), reasons: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const { post, snapshot, parsed } = await resolveLinkedEvidenceSnapshot(ctx, await requireUserId(ctx), args.postId, true);
    if (snapshot.snapshotHash !== args.expectedSnapshotHash) throw new Error("Linked research changed; review the current snapshot before importing");
    if (!snapshot.records.some(record => record.eligible)) throw new Error("No accepted linked evidence to import; review statuses were not upgraded");
    const { head, source } = await currentHead(ctx, post);
    const sha256 = await textHash(snapshot.content);
    if (source?.sha256 === sha256 && source.name === "Linked research.md" && source.format === "markdown" && source.purpose === "claim-trace") return { sourceId: source._id, revision: source.revision, snapshotHash: snapshot.snapshotHash, reasons: snapshot.reasons };
    if ((source?._id ?? null) !== args.expectedSourceId) throw new Error("Evidence changed; reload before replacing it");
    const heads = await ctx.db.query("v2FigureSourceHeads").withIndex("by_post", q => q.eq("postId", post._id)).take(18);
    if (!head && heads.filter(item => item.key !== "__article__").length >= 16) throw new Error("At most 16 evidence attachments per article");
    const revision = (source?.revision ?? 0) + 1;
    const sourceId = await ctx.db.insert("v2FigureSources", { userId: post.userId, brandId: post.brandId, postId: post._id, key: SOURCE_KEY, revision, name: "Linked research.md", format: "markdown", purpose: "claim-trace", content: snapshot.content, sha256, parseErrors: [...parsed.errors, ...(!parsed.tables.length ? ["No exact structured rows in accepted linked content; text remains available for inspection"] : [])], createdAt: Date.now() });
    if (head) await ctx.db.patch(head._id, { sourceId, updatedAt: Date.now() });
    else await ctx.db.insert("v2FigureSourceHeads", { postId: post._id, key: SOURCE_KEY, sourceId, updatedAt: Date.now() });
    await onFigureArticleChange(ctx, post, post.content);
    return { sourceId, revision, snapshotHash: snapshot.snapshotHash, reasons: snapshot.reasons };
  },
});

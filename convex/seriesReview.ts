import { v } from "convex/values";
import {
  query,
  mutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireUserId } from "./campaignAccess";
import { ownedSeries, seriesPost } from "./series";
import { latestIntent, applyEditorialApproval } from "./publishing";
import { readDestination } from "./bufferDestinations";
import { destinationHold } from "../lib/bufferContracts";
import {
  blogEditorialFingerprint,
  missingBlogEditorialFields,
} from "../lib/blogContract";
import {
  linkedInPayload,
  socialReleaseVersion,
  postScheduleVersion,
} from "../lib/socialPayload";
import { scheduleToUtcIso } from "../lib/schedules";
import {
  companionSubmissionHold,
  latestPublication,
} from "./articleDependencies";
import { queueCapacity } from "./queuePlanning";
type Ctx = QueryCtx | MutationCtx;
export function editorialVersion(post: Doc<"v2Posts">) {
  return post.channelId === "corvo-blog"
    ? blogEditorialFingerprint(post)
    : socialReleaseVersion(post);
}
async function selected(ctx: Ctx, userId: string, seriesId: Id<"postSeries">) {
  return ctx.db
    .query("seriesReviewSelections")
    .withIndex("by_user_and_series", (q) =>
      q.eq("userId", userId).eq("seriesId", seriesId),
    )
    .first();
}
async function membership(
  ctx: Ctx,
  userId: string,
  series: Doc<"postSeries">,
  id: Id<"v2Posts">,
) {
  const post = await seriesPost(ctx, userId, series.brandId, id);
  if (
    !(await ctx.db
      .query("seriesPostLinks")
      .withIndex("by_series_and_post", (q) =>
        q.eq("seriesId", series._id).eq("postId", id),
      )
      .first())
  )
    throw new Error("Post is no longer a selected series member");
  return post;
}
export async function sourceWarnings(ctx: Ctx, post: Doc<"v2Posts">) {
  const warnings: string[] = [];
  const citations = post.sourceExcerptIds ?? [];
  if (citations.length)
    warnings.push(
      "Review the cited excerpts against the complete final copy; citation IDs do not prove every claim.",
    );
  if (post.sourceResearchBriefId) {
    const id = ctx.db.normalizeId(
      "v2ResearchBriefs",
      post.sourceResearchBriefId,
    );
    const brief = id ? await ctx.db.get(id) : null;
    if (
      !brief ||
      brief.userId !== post.userId ||
      brief.brandId !== post.brandId
    )
      warnings.push(
        "Research brief is unavailable in this authorized workspace; review the original evidence.",
      );
    else {
      if (brief.warning) warnings.push(brief.warning);
      const sources = await ctx.db
        .query("v2ResearchSources")
        .withIndex("by_brief", (q) => q.eq("researchBriefId", brief._id))
        .take(101);
      if (sources.length > 100)
        warnings.push(
          "Source review exceeds this bounded packet; inspect the research workspace.",
        );
      if (sources.some((s) => s.status !== "accepted"))
        warnings.push("Research sources include items not accepted for use.");
    }
  }
  if (post.content.includes("[EVIDENCE:") || post.content.includes("[SOURCE:"))
    warnings.push(
      "Evidence markers remain in the final copy. Check the source passages and publication formatting.",
    );
  if (!citations.length && !post.sourceResearchBriefId)
    warnings.push(
      "No stored research/citation receipt: independently review factual claims before approving.",
    );
  return {
    warnings,
    citations,
    sourceIdeaId: post.sourceIdeaId ?? null,
    sourceResearchBriefId: post.sourceResearchBriefId ?? null,
    sourceCampaignId: post.sourceCampaignId ?? null,
  };
}
export async function reviewRow(
  ctx: Ctx,
  post: Doc<"v2Posts">,
  capacity?: Awaited<ReturnType<typeof queueCapacity>>,
) {
  const holds: string[] = [];
  let dueAt: string | null = null;
  if (post.scheduledDate && post.scheduledTime) {
    try {
      dueAt = scheduleToUtcIso({
        scheduledDate: post.scheduledDate,
        scheduledTime: post.scheduledTime,
        timezone: post.timezone,
      });
    } catch {
      holds.push("Invalid date, IANA timezone or DST time.");
    }
  } else holds.push("Exact schedule is incomplete.");
  let approvalError: string | null = post.blogExportClaimKey
    ? "Blog export is pending; reconcile before approval."
    : null;
  const intent = await latestIntent(ctx, post._id);
  if (!intent) approvalError = "Publishing intent is missing.";
  if (post.channelId === "corvo-blog") {
    const missing = missingBlogEditorialFields(post);
    if (missing.length)
      approvalError = `Review blog metadata: ${missing.join(", ")}`;
  }
  const destination =
    post.channelId === "linkedin"
      ? ((await readDestination(ctx, post.userId, post.brandId))?.destination ??
        null)
      : null;
  let articleReceipt: Doc<"articlePublications"> | null = null;
  if (post.companionLink)
    articleReceipt = await latestPublication(
      ctx,
      post.companionLink.articlePostId as Id<"v2Posts">,
    );
  if (post.channelId === "linkedin") {
    const dependency = await companionSubmissionHold(ctx, post);
    if (dependency) holds.push(dependency);
    const d = destinationHold(
      destination,
      Boolean(post.linkedinFirstComment?.trim()),
    );
    if (d) holds.push(d);
    const c = capacity ?? (await queueCapacity(ctx, post.userId, post.brandId));
    if (c.projection.unknown) holds.push(c.projection.unknown);
    else if ((c.projection.availableForBacklog ?? 0) <= 0)
      holds.push(
        "Queue capacity is full or reserved; editorial approval does not dispatch this post.",
      );
  }
  const source = await sourceWarnings(ctx, post);
  const state = await ctx.db
    .query("v2ProviderStates")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .order("desc")
    .first();
  const snapshot = {
    post,
    finalContent:
      post.channelId === "linkedin"
        ? linkedInPayload(post.content, post.platformSettings)
        : post.content,
    destination,
    dueAt,
    articleReceipt,
    holds,
    approvalError,
    ...source,
    providerState: state,
  };
  const reviewVersion = JSON.stringify([
    postScheduleVersion(post),
    destination,
    articleReceipt
      ? {
          id: articleReceipt._id,
          key: articleReceipt.key,
          checkedAt: articleReceipt.evidence.checkedAt,
        }
      : null,
    source,
    approvalError,
    holds,
  ]);
  return { snapshot, editorialVersion: editorialVersion(post), reviewVersion };
}
export const selection = query({
  args: { seriesId: v.id("postSeries") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await ownedSeries(ctx, userId, args.seriesId);
    return selected(ctx, userId, args.seriesId);
  },
});
export const select = mutation({
  args: {
    seriesId: v.id("postSeries"),
    postIds: v.array(v.id("v2Posts")),
    expectedRevision: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const series = await ownedSeries(ctx, userId, args.seriesId, true);
    const old = await selected(ctx, userId, args.seriesId);
    if ((old?.revision ?? 0) !== args.expectedRevision)
      throw new Error("Selection changed in another view; reload it.");
    if (
      args.postIds.length > 50 ||
      new Set(args.postIds).size !== args.postIds.length
    )
      throw new Error("Select at most 50 distinct series posts.");
    for (const id of args.postIds) await membership(ctx, userId, series, id);
    const data = {
      userId,
      seriesId: series._id,
      postIds: args.postIds,
      revision: (old?.revision ?? 0) + 1,
      updatedAt: Date.now(),
    };
    return old
      ? (await ctx.db.patch(old._id, data), old._id)
      : ctx.db.insert("seriesReviewSelections", data);
  },
});
export const prepare = mutation({
  args: { seriesId: v.id("postSeries"), expectedRevision: v.number() },
  returns: v.id("seriesReviewPackets"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const series = await ownedSeries(ctx, userId, args.seriesId, true);
    const selection = await selected(ctx, userId, series._id);
    if (
      !selection?.postIds.length ||
      selection.revision !== args.expectedRevision
    )
      throw new Error("Select and review the current posts first.");
    const capacity = await queueCapacity(ctx, userId, series.brandId);
    const rows = [];
    let bytes = 0;
    for (const id of selection.postIds) {
      const post = await membership(ctx, userId, series, id);
      const row = await reviewRow(ctx, post, capacity);
      const size = new TextEncoder().encode(JSON.stringify(row)).length;
      if (size > 300000)
        throw new Error(
          `Post ${id} exceeds the bounded review size; review it individually.`,
        );
      bytes += size;
      if (bytes > 6000000)
        throw new Error("Review packet exceeds 6 MB; select fewer posts.");
      rows.push({ postId: id, ...row });
    }
    const packetId = await ctx.db.insert("seriesReviewPackets", {
      userId,
      seriesId: series._id,
      selectionId: selection._id,
      selectionRevision: selection.revision,
      seriesRevision: series.revision,
      status: "reviewed",
      createdAt: Date.now(),
    });
    for (const row of rows)
      await ctx.db.insert("seriesReviewRows", { packetId, ...row });
    return packetId;
  },
});
async function ownPacket(
  ctx: Ctx,
  userId: string,
  id: Id<"seriesReviewPackets">,
) {
  const packet = await ctx.db.get(id);
  if (!packet || packet.userId !== userId)
    throw new Error("Review packet not found");
  await ownedSeries(ctx, userId, packet.seriesId);
  return packet;
}
export const packet = query({
  args: {
    seriesId: v.id("postSeries"),
    packetId: v.optional(v.id("seriesReviewPackets")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const series = await ownedSeries(ctx, userId, args.seriesId);
    const packet = args.packetId
      ? await ownPacket(ctx, userId, args.packetId)
      : await ctx.db
          .query("seriesReviewPackets")
          .withIndex("by_user_and_series", (q) =>
            q.eq("userId", userId).eq("seriesId", series._id),
          )
          .order("desc")
          .first();
    if (!packet) return null;
    if (packet.seriesId !== series._id)
      throw new Error("Review series mismatch");
    const selection = await selected(ctx, userId, series._id);
    const rows = await ctx.db
      .query("seriesReviewRows")
      .withIndex("by_packet", (q) => q.eq("packetId", packet._id))
      .take(51);
    let stale =
      selection?.revision !== packet.selectionRevision ||
      series.revision !== packet.seriesRevision;
    const capacity = await queueCapacity(ctx, userId, series.brandId);
    const current = [];
    for (const row of rows) {
      let reason: string | null = null;
      try {
        const post = await membership(ctx, userId, series, row.postId);
        const fresh = await reviewRow(ctx, post, capacity);
        if (fresh.editorialVersion !== row.editorialVersion)
          reason = "Content or editorial metadata changed.";
        else if (fresh.reviewVersion !== row.reviewVersion)
          reason =
            "Schedule, destination, evidence or readiness changed; refresh this packet.";
      } catch {
        reason = "Post is inaccessible or no longer a series member.";
      }
      if (reason) stale = true;
      current.push({
        ...row,
        staleReason: reason,
        heroUrl: row.snapshot.post.preparedHero
          ? await ctx.storage.getUrl(row.snapshot.post.preparedHero.storageId)
          : row.snapshot.post.heroImageStorageId
            ? await ctx.storage.getUrl(row.snapshot.post.heroImageStorageId)
            : (row.snapshot.post.heroImageUrl ?? null),
      });
    }
    return { packet, rows: current, stale };
  },
});
export const approve = mutation({
  args: {
    packetId: v.id("seriesReviewPackets"),
    expectedSelectionRevision: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const packet = await ownPacket(ctx, userId, args.packetId);
    const series = await ownedSeries(ctx, userId, packet.seriesId, true);
    const selection = await selected(ctx, userId, series._id);
    const rows = await ctx.db
      .query("seriesReviewRows")
      .withIndex("by_packet", (q) => q.eq("packetId", packet._id))
      .take(51);
    if (
      !selection ||
      selection.revision !== packet.selectionRevision ||
      selection.revision !== args.expectedSelectionRevision ||
      series.revision !== packet.seriesRevision ||
      rows.length !== selection.postIds.length ||
      rows.some((row) => !selection.postIds.includes(row.postId))
    )
      return {
        approved: false,
        errors: [
          {
            postId: null,
            reason:
              "Selection or series membership changed; prepare a new packet.",
          },
        ],
      };
    const errors: { postId: Id<"v2Posts">; reason: string }[] = [];
    const capacity = await queueCapacity(ctx, userId, series.brandId);
    const posts = [];
    for (const row of rows) {
      try {
        const post = await membership(ctx, userId, series, row.postId);
        const fresh = await reviewRow(ctx, post, capacity);
        const reason =
          fresh.editorialVersion !== row.editorialVersion
            ? "Content or editorial metadata changed."
            : fresh.reviewVersion !== row.reviewVersion
              ? "Schedule, destination, evidence or readiness changed; refresh the packet."
              : fresh.snapshot.approvalError;
        if (reason) errors.push({ postId: row.postId, reason });
        posts.push(post);
      } catch {
        errors.push({
          postId: row.postId,
          reason: "Post is inaccessible or no longer selected.",
        });
      }
    }
    if (errors.length) return { approved: false, errors };
    if (packet.status === "approved")
      return { approved: true, alreadyApproved: true };
    const now = Date.now();
    for (let i = 0; i < posts.length; i++) {
      await applyEditorialApproval(ctx, userId, posts[i], "approved");
      await ctx.db.patch(rows[i]._id, { approvedAt: now, actor: userId });
    }
    await ctx.db.patch(packet._id, {
      status: "approved",
      approvedAt: now,
      actor: userId,
    });
    await audit(ctx, {
      userId,
      brandId: series.brandId,
      action: "series.batch_approval",
      summary: `Approved exactly ${posts.length} reviewed editorial versions; no release authorization or dispatch.`,
      metadata: {
        packetId: packet._id,
        postIds: posts.map((p) => p._id),
        actor: userId,
        approvedAt: now,
      },
    });
    return { approved: true, postIds: posts.map((p) => p._id) };
  },
});

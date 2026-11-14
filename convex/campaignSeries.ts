import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { audit, requireBrandAccess } from "./campaignAccess";

/**
 * Campaign → series bridge (spec deliverable C2). Campaign materialization
 * produces `v2Posts` with `sourceCampaignId`, but batch review
 * (`seriesReview`) and queue release (`queueRelease`) operate on `postSeries`
 * membership. This module links a campaign's materialized posts into a
 * reviewable series — automatically, at materialization — so the campaign
 * queue can drive batch review and queue release. It changes ownership and
 * review grouping only: no approval, no dispatch, no gating change.
 */

type BridgeDraft = {
  post: Pick<Doc<"v2Posts">, "_id" | "channelId">;
  seq: number;
};

type DesiredEntry = {
  key: string;
  articlePostId: Id<"v2Posts">;
  companionPostIds: Id<"v2Posts">[];
};

/**
 * The series UI caps companions per entry at 100 (`series.addCompanions`);
 * campaign presets have at most 7 slots, so this only guards a pathological
 * custom shape.
 */
const MAX_BRIDGE_POSTS = 100;

function entryKey(draft: BridgeDraft): string {
  return `campaign-slot-${draft.seq}`;
}

/**
 * Find or create the campaign's bridge series and ensure every materialized
 * post is a series member. Idempotent: a fully linked campaign returns its
 * series id without writing anything, so re-materialization and campaigns
 * materialized before the bridge existed are handled by the same call.
 *
 * Grouping rule: `seriesPostLinks` (what the review machinery checks) hangs
 * off `seriesEntries`, and an entry needs an article anchor. The campaign's
 * corvo-blog post anchors the entry with every social post as a companion
 * (matching every shape preset's single pillar); additional blog posts anchor
 * their own entries; a campaign with no blog post anchors on its first post
 * in slot order. The operator-facing `series.attachEntry` rule ("article must
 * be a blog") is untouched — the bridge creates grouping links only, and
 * never edits publication records.
 */
export async function ensureCampaignSeries(
  ctx: MutationCtx,
  userId: string,
  campaign: Doc<"campaigns">,
  drafts: BridgeDraft[]
): Promise<Id<"postSeries"> | null> {
  if (drafts.length > MAX_BRIDGE_POSTS) {
    throw new Error(
      `Campaign has ${drafts.length} materialized posts; the series bridge links at most ${MAX_BRIDGE_POSTS}.`
    );
  }

  let series: Doc<"postSeries"> | null = null;
  if (campaign.seriesId) {
    const normalized = ctx.db.normalizeId("postSeries", campaign.seriesId);
    series = normalized ? ((await ctx.db.get(normalized)) ?? null) : null;
  }

  // Posts already linked to the bridge series stay put; only the missing
  // links are created.
  const linked = new Set<string>();
  if (series) {
    const links = await ctx.db
      .query("seriesPostLinks")
      .withIndex("by_series", (q) => q.eq("seriesId", series!._id))
      .collect();
    for (const link of links) linked.add(String(link.postId));
  }
  if (drafts.every((draft) => linked.has(String(draft.post._id)))) {
    return series?._id ?? null;
  }

  const membership = await requireBrandAccess(ctx, userId, campaign.brandId);
  if (membership.role === "viewer") {
    throw new Error("Series editing requires an editor");
  }

  if (!series) {
    const now = Date.now();
    const seriesId = await ctx.db.insert("postSeries", {
      userId,
      brandId: campaign.brandId,
      title: `Campaign: ${campaign.title}`.slice(0, 300),
      revision: 0,
      createdAt: now,
      updatedAt: now,
    });
    const created = await ctx.db.get(seriesId);
    if (!created) throw new Error("Series creation failed");
    series = created;
    await ctx.db.patch(campaign._id, {
      seriesId,
      updatedAt: now,
    });
  }

  const ordered = [...drafts].sort((a, b) => a.seq - b.seq);
  const blogs = ordered.filter((draft) => draft.post.channelId === "corvo-blog");
  const social = ordered.filter((draft) => draft.post.channelId !== "corvo-blog");

  const desired: DesiredEntry[] = [];
  if (blogs.length > 0) {
    desired.push({
      key: entryKey(blogs[0]!),
      articlePostId: blogs[0]!.post._id,
      companionPostIds: social.map((draft) => draft.post._id),
    });
    for (const extra of blogs.slice(1)) {
      desired.push({
        key: entryKey(extra),
        articlePostId: extra.post._id,
        companionPostIds: [],
      });
    }
  } else if (social.length > 0) {
    desired.push({
      key: entryKey(social[0]!),
      articlePostId: social[0]!.post._id,
      companionPostIds: social.slice(1).map((draft) => draft.post._id),
    });
  }

  const lastEntry = await ctx.db
    .query("seriesEntries")
    .withIndex("by_series_and_sequence", (q) => q.eq("seriesId", series!._id))
    .order("desc")
    .first();
  let nextSequence = (lastEntry?.sequence ?? 0) + 1;

  let touched = false;
  for (const entry of desired) {
    let entryRow = await ctx.db
      .query("seriesEntries")
      .withIndex("by_series_and_key", (q) =>
        q.eq("seriesId", series!._id).eq("key", entry.key)
      )
      .first();
    if (!entryRow) {
      const entryId = await ctx.db.insert("seriesEntries", {
        seriesId: series._id,
        key: entry.key,
        sequence: nextSequence,
        articlePostId: entry.articlePostId,
        companionPostIds: entry.companionPostIds,
      });
      nextSequence += 1;
      entryRow = await ctx.db.get(entryId);
      touched = true;
    }
    if (!entryRow) throw new Error("Series entry creation failed");
    for (const postId of [entry.articlePostId, ...entry.companionPostIds]) {
      if (linked.has(String(postId))) continue;
      await ctx.db.insert("seriesPostLinks", {
        seriesId: series._id,
        entryId: entryRow._id,
        postId,
      });
      linked.add(String(postId));
      touched = true;
    }
    // Reconcile the denormalized companion list if a partial earlier run
    // created the entry: links are the source of truth for membership.
    const mergedCompanions = [
      ...entryRow.companionPostIds,
      ...entry.companionPostIds.filter(
        (id) => !entryRow!.companionPostIds.some((existing) => existing === id)
      ),
    ];
    if (
      mergedCompanions.length !== entryRow.companionPostIds.length ||
      mergedCompanions.some((id, i) => id !== entryRow!.companionPostIds[i])
    ) {
      await ctx.db.patch(entryRow._id, { companionPostIds: mergedCompanions });
      touched = true;
    }
  }

  if (touched) {
    await ctx.db.patch(series._id, {
      revision: series.revision + 1,
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.series_bridge",
      summary: `Linked ${drafts.length} materialized campaign post(s) into a reviewable series for "${campaign.title}". No approval or dispatch.`,
      metadata: {
        campaignId: String(campaign._id),
        seriesId: String(series._id),
        postCount: drafts.length,
      },
    });
  }

  return series._id;
}

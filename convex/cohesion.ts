import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  audit,
  getOwnedCampaign,
  requireUserId,
} from "./campaignAccess";
import {
  applyRegeneratedOpener,
  computeBotLikelihood,
  computeSeoAeo,
  runCohesionChecks,
  type CohesionDraftInput,
} from "@/lib/cohesion";
import { composePlaceholderDraft } from "@/lib/campaignDrafts";

function contentFingerprint(title: string, content: string) {
  return `${title.trim()}\n${content.trim()}`;
}

export const runCohesionGate = mutation({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const materialization = (
      await ctx.db
        .query("materializations")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .collect()
    ).sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!materialization) {
      throw new Error("Generate the draft set before running the cohesion gate.");
    }

    const shape = await ctx.db.get(materialization.shapeId);
    if (!shape) throw new Error("Shape for this draft set is missing.");
    const slots = (
      await ctx.db
        .query("campaignSlots")
        .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
        .collect()
    ).sort((a, b) => a.seq - b.seq);

    const posts = (
      await ctx.db
        .query("v2Posts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).filter((post) => post.sourceCampaignId === campaign._id);

    const draftInputs: CohesionDraftInput[] = [];
    for (const post of posts) {
      const slot = slots.find(
        (candidate) => String(candidate._id) === String(post.sourceSlotId)
      );
      if (!slot) continue;
      draftInputs.push({
        postId: String(post._id),
        slotId: String(slot._id),
        seq: slot.seq,
        role: slot.role,
        title: post.title,
        content: post.content,
        excerptCitations: post.sourceExcerptIds,
      });
    }

    const report = runCohesionChecks(draftInputs);
    const autoFixLog: { checkId: string; note: string; fixedAt: number }[] = [];
    const now = Date.now();

    for (const fix of report.autoFixes) {
      if (fix.action.type === "add-cta-slot") {
        const nextSeq = slots.length + 1;
        const slotId = await ctx.db.insert("campaignSlots", {
          shapeId: shape._id,
          seq: nextSeq,
          channel: "linkedin",
          mediaType: "post",
          role: "cta",
          title: "The ask — follow the build",
        });
        const idea = draftInputs[0];
        const draft = composePlaceholderDraft({
          seq: nextSeq,
          role: "cta",
          channel: "linkedin",
          mediaType: "post",
          title: "The ask — follow the build",
          angle: "name the single action this campaign drives",
          ideaText: idea?.content,
          excerptCitations: idea?.excerptCitations,
        });
        const postId = await ctx.db.insert("v2Posts", {
          userId,
          brandId: campaign.brandId,
          channelId: "linkedin",
          platformId: "linkedin",
          title: draft.title,
          content: draft.content,
          status: "draft",
          approvalState: "unapproved",
          timezone: "America/Los_Angeles",
          sourceCampaignId: campaign._id,
          sourceSlotId: slotId,
          contentFingerprint: contentFingerprint(draft.title, draft.content),
          createdAt: now,
          updatedAt: now,
        });
        slots.push({
          _id: slotId,
          _creationTime: now,
          shapeId: shape._id,
          seq: nextSeq,
          channel: "linkedin",
          mediaType: "post",
          role: "cta",
          title: draft.title,
          angle: undefined,
          ideaId: undefined,
        });
        draftInputs.push({
          postId: String(postId),
          slotId: String(slotId),
          seq: nextSeq,
          role: "cta",
          title: draft.title,
          content: draft.content,
          excerptCitations: idea?.excerptCitations,
        });
        autoFixLog.push({ checkId: fix.checkId, note: fix.note, fixedAt: now });
      } else if (fix.action.type === "regenerate-opener") {
        const openerPostId = fix.action.postId;
        const post = posts.find((candidate) => String(candidate._id) === openerPostId);
        if (post) {
          const updated = applyRegeneratedOpener(post.content, fix.action.opener);
          await ctx.db.patch(post._id, {
            content: updated,
            approvalState: "unapproved",
            status: "draft",
            contentFingerprint: contentFingerprint(post.title, updated),
            updatedAt: now,
          });
          autoFixLog.push({ checkId: fix.checkId, note: fix.note, fixedAt: now });
        }
      }
    }

    const checks = report.checks.map((check) => ({
      ...check,
      passed: check.passed || autoFixLog.some((fix) => fix.checkId === check.id),
    }));
    const blockingFailures = checks.filter(
      (check) => !check.passed && check.blocking
    );
    const passed = blockingFailures.length === 0;

    const previousRuns = await ctx.db
      .query("cohesionRuns")
      .withIndex("by_materialization", (q) =>
        q.eq("materializationId", materialization._id)
      )
      .collect();
    const runNumber = previousRuns.length + 1;

    const runId = await ctx.db.insert("cohesionRuns", {
      materializationId: materialization._id,
      checks,
      autoFixLog,
      passed,
      createdAt: now,
    });

    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.cohesion_gate",
      summary: `Cohesion gate run #${runNumber}: ${passed ? "passing" : "blocking"} — ${autoFixLog.length} auto-fix(es) applied.`,
      metadata: {
        campaignId: String(campaign._id),
        runId: String(runId),
        passed,
        autoFixCount: autoFixLog.length,
      },
    });

    return {
      runId: String(runId),
      runNumber,
      passed,
      checks,
      autoFixLog,
      blockingFailures,
    };
  },
});

export const getReviewPasses = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const materialization = (
      await ctx.db
        .query("materializations")
        .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
        .collect()
    ).sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!materialization) {
      return { campaign, materialization: null, latestRun: null, seoAeo: [], botLikelihood: [] };
    }

    const shape = await ctx.db.get(materialization.shapeId);
    const slots = shape
      ? (
          await ctx.db
            .query("campaignSlots")
            .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
            .collect()
        ).sort((a, b) => a.seq - b.seq)
      : [];

    const posts = (
      await ctx.db
        .query("v2Posts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).filter((post) => post.sourceCampaignId === campaign._id);

    const draftInputs: CohesionDraftInput[] = [];
    for (const post of posts) {
      const slot = slots.find(
        (candidate) => String(candidate._id) === String(post.sourceSlotId)
      );
      if (!slot) continue;
      draftInputs.push({
        postId: String(post._id),
        slotId: String(slot._id),
        seq: slot.seq,
        role: slot.role,
        title: post.title,
        content: post.content,
        excerptCitations: post.sourceExcerptIds,
      });
    }
    draftInputs.sort((a, b) => a.seq - b.seq);

    const latestRun = (
      await ctx.db
        .query("cohesionRuns")
        .withIndex("by_materialization", (q) =>
          q.eq("materializationId", materialization._id)
        )
        .collect()
    ).sort((a, b) => b.createdAt - a.createdAt)[0];

    return {
      campaign,
      materialization,
      latestRun: latestRun ?? null,
      seoAeo: computeSeoAeo(draftInputs),
      botLikelihood: computeBotLikelihood(draftInputs),
      draftCount: draftInputs.length,
    };
  },
});

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
  type CohesionCheck,
  type CohesionDraftInput,
} from "@/lib/cohesion";
import { composePlaceholderDraft } from "@/lib/campaignDrafts";
import { draftSetFingerprint } from "@/lib/draftSetFingerprint";

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

    const collectState = async () => {
      const slots = (
        await ctx.db
          .query("campaignSlots")
          .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
          .collect()
      ).sort((a, b) => a.seq - b.seq);
      const posts = await ctx.db
        .query("v2Posts")
        .withIndex("by_user_and_campaign", (q) =>
          q.eq("userId", userId).eq("sourceCampaignId", campaign._id)
        )
        .collect();
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
      return { slots, posts, draftInputs };
    };

    const { slots, posts, draftInputs } = await collectState();

    const report = runCohesionChecks(draftInputs);
    const autoFixLog: { checkId: string; note: string; fixedAt: number }[] = [];
    const now = Date.now();

    for (const fix of report.autoFixes) {
      if (fix.action.type === "add-cta-slot") {
        const nextSeq = slots.length + 1;
        // D-7/D-11: the auto-created CTA slot links a working-set idea so the
        // shape stays complete for materialization.
        const memberJoin = (
          await ctx.db
            .query("campaignIdeas")
            .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
            .collect()
        )
          .filter((join) => join.state === "member")
          .sort((a, b) => a.addedAt - b.addedAt)[0];
        const ctaIdea = memberJoin ? await ctx.db.get(memberJoin.ideaId) : null;
        const slotId = await ctx.db.insert("campaignSlots", {
          shapeId: shape._id,
          seq: nextSeq,
          channel: "linkedin",
          mediaType: "post",
          role: "cta",
          title: "The ask — follow the build",
          ideaId: ctaIdea ? ctaIdea._id : undefined,
        });
        const idea = draftInputs[0];
        const draft = composePlaceholderDraft({
          seq: nextSeq,
          role: "cta",
          channel: "linkedin",
          mediaType: "post",
          title: "The ask — follow the build",
          angle: "name the single action this campaign drives",
          ideaText: ctaIdea?.text ?? idea?.content,
          excerptCitations: ctaIdea?.excerptCitations ?? idea?.excerptCitations,
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
          sourceExcerptIds: ctaIdea?.excerptCitations ?? idea?.excerptCitations,
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
          ideaId: ctaIdea ? ctaIdea._id : undefined,
        });
        draftInputs.push({
          postId: String(postId),
          slotId: String(slotId),
          seq: nextSeq,
          role: "cta",
          title: draft.title,
          content: draft.content,
          excerptCitations: ctaIdea?.excerptCitations ?? idea?.excerptCitations,
        });
        autoFixLog.push({ checkId: fix.checkId, note: fix.note, fixedAt: now });
      } else if (fix.action.type === "regenerate-opener") {
        const openerPostId = fix.action.postId;
        const post = posts.find(
          (candidate) => String(candidate._id) === openerPostId
        );
        if (post) {
          const updated = applyRegeneratedOpener(post.content, fix.action.opener);
          await ctx.db.patch(post._id, {
            content: updated,
            approvalState: "unapproved",
            status: "draft",
            contentFingerprint: contentFingerprint(post.title, updated),
            updatedAt: now,
          });
          post.content = updated;
          const input = draftInputs.find((entry) => entry.postId === openerPostId);
          if (input) input.content = updated;
          autoFixLog.push({ checkId: fix.checkId, note: fix.note, fixedAt: now });
        }
      }
    }

    // Verification pass (D-13): fixes are asserted, not trusted. Re-run the
    // checks against the post-fix state — a mechanical fix can reintroduce a
    // violation (e.g. the regenerated-opener pool repeating) and then the run
    // blocks instead of reporting a false pass.
    const verification = runCohesionChecks(draftInputs);
    const checks: CohesionCheck[] = verification.checks;
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
      draftSetFingerprint: draftSetFingerprint(
        draftInputs.map(({ postId, seq, title, content }) => ({
          postId,
          seq,
          title,
          content,
        }))
      ),
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

    const posts = await ctx.db
      .query("v2Posts")
      .withIndex("by_user_and_campaign", (q) =>
        q.eq("userId", userId).eq("sourceCampaignId", campaign._id)
      )
      .collect();

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

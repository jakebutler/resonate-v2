// Live campaign draft generation (real LLM drafting over the citation
// plumbing). The mock-gated placeholder path stays in convex/draftSet.ts,
// still behind its server-issued acknowledgment token; this action activates
// exactly where the live tier already activates — a verified gateway
// credential (Cortex with the OpenAI-compatible fallback, per the answer
// engine) and a user-triggered call.
//
// L8: generation only. Every draft lands unapproved; nothing here approves,
// schedules, or publishes.

import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal, api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  audit,
  getOwnedCampaign,
  requireUserId,
} from "./campaignAccess";
import {
  assertGroundingAllowed,
  parseCorpusCitation,
} from "@/lib/campaignGrounding";
import {
  budgetRefusalMessage,
  campaignDraftingCredential,
  campaignDraftingRunLimits,
  composeSlotDraft,
  planDraftGenerationRun,
  type DraftingExcerpt,
  type DraftingSlotInput,
} from "@/lib/campaignDrafting";

/** Slots + grounding excerpts for one live generation run. */
export const loadLiveDraftContext = internalQuery({
  args: {
    campaignId: v.id("campaigns"),
    userId: v.string(),
  },
  returns: v.object({
    brandId: v.string(),
    shapeId: v.id("campaignShapes"),
    slots: v.array(
      v.object({
        slotId: v.id("campaignSlots"),
        seq: v.number(),
        role: v.string(),
        channel: v.union(
          v.literal("linkedin"),
          v.literal("x"),
          v.literal("youtube"),
          v.literal("instagram"),
          v.literal("tiktok"),
          v.literal("reddit"),
          v.literal("corvo-blog")
        ),
        mediaType: v.string(),
        title: v.optional(v.string()),
        angle: v.optional(v.string()),
        ideaText: v.optional(v.string()),
        excerptCitations: v.optional(v.array(v.string())),
        excerpts: v.array(
          v.object({
            citation: v.string(),
            text: v.string(),
            provenance: v.string(),
          })
        ),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const campaign = await getOwnedCampaign(ctx, args.userId, args.campaignId);

    const shape = await ctx.db
      .query("campaignShapes")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaign._id).eq("status", "accepted")
      )
      .first();
    if (!shape) {
      throw new Error("Accept a complete shape before generating the draft set.");
    }

    const slots = (
      await ctx.db
        .query("campaignSlots")
        .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
        .collect()
    ).sort((a, b) => a.seq - b.seq);

    const slotInputs = [] as (DraftingSlotInput & {
      slotId: Id<"campaignSlots">;
      channel: "linkedin" | "x" | "youtube" | "instagram" | "tiktok" | "reddit" | "corvo-blog";
    })[];
    for (const slot of slots) {
      const idea = slot.ideaId ? await ctx.db.get(slot.ideaId) : undefined;
      const citations = [...new Set(idea?.excerptCitations ?? [])];

      // Grounding set (D-6): resolve only the excerpts the idea itself cites,
      // and only quotable ones — internal-only or unaccepted excerpts are
      // never shipped to a model, matching the suggestion window's filter.
      // Excerpts carry no brandId; the brand lineage runs through their
      // versioned corpus row, so each corpus is checked once.
      const excerpts: DraftingExcerpt[] = [];
      const corpusBrandOk = new Map<string, boolean>();
      for (const citation of citations) {
        const parsed = parseCorpusCitation(citation);
        if (!parsed) continue;
        const corpusId = ctx.db.normalizeId("corpora", parsed.corpusId);
        let brandOk = corpusBrandOk.get(parsed.corpusId);
        if (brandOk === undefined) {
          const corpus = corpusId ? await ctx.db.get(corpusId) : null;
          brandOk = corpus !== null && corpus.brandId === campaign.brandId;
          corpusBrandOk.set(parsed.corpusId, brandOk);
        }
        if (!brandOk || !corpusId) continue;
        const excerpt = await ctx.db
          .query("corpusExcerpts")
          .withIndex("by_corpus_and_seq", (q) =>
            q.eq("corpusId", corpusId).eq("seq", parsed.seq)
          )
          .first();
        if (!excerpt) continue;
        if (excerpt.sensitivity === "internal-only") continue;
        if (excerpt.reviewState !== "accepted") continue;
        excerpts.push({
          citation,
          text: excerpt.text,
          provenance: excerpt.provenance,
        });
      }

      slotInputs.push({
        seq: slot.seq,
        slotId: slot._id,
        role: slot.role,
        channel: slot.channel,
        mediaType: slot.mediaType,
        title: slot.title,
        angle: slot.angle,
        ideaText: idea?.text,
        excerptCitations: citations.length > 0 ? citations : undefined,
        excerpts,
      });
    }

    return {
      brandId: campaign.brandId,
      shapeId: shape._id,
      slots: slotInputs,
    };
  },
});

/**
 * Materialize the composed live draft set. Re-verifies ownership and the
 * one-set-per-shape rule inside the transactional write, so a concurrent
 * generation can never double-materialize.
 */
export const recordLiveDraftSet = internalMutation({
  args: {
    campaignId: v.id("campaigns"),
    userId: v.string(),
    model: v.string(),
    estimatedCostCents: v.number(),
    drafts: v.array(
      v.object({
        seq: v.number(),
        slotId: v.id("campaignSlots"),
        // Mirrors the private v2ChannelId union in schema.ts (convex schema
        // files export only their default; this is the same literal set).
        slotChannel: v.union(
          v.literal("linkedin"),
          v.literal("x"),
          v.literal("youtube"),
          v.literal("instagram"),
          v.literal("tiktok"),
          v.literal("reddit"),
          v.literal("corvo-blog")
        ),
        title: v.string(),
        content: v.string(),
        excerptCitations: v.optional(v.array(v.string())),
      })
    ),
  },
  returns: v.object({
    materializationId: v.id("materializations"),
    draftCount: v.number(),
    brandId: v.string(),
  }),
  handler: async (ctx, args) => {
    const campaign = await getOwnedCampaign(ctx, args.userId, args.campaignId);

    const shape = await ctx.db
      .query("campaignShapes")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaign._id).eq("status", "accepted")
      )
      .first();
    if (!shape) {
      throw new Error("Accept a complete shape before generating the draft set.");
    }

    const existing = await ctx.db
      .query("materializations")
      .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
      .first();
    if (existing) {
      throw new Error(
        "The draft set for this shape is already generated — one set per shape."
      );
    }

    const now = Date.now();
    // mode "live": no mockAcknowledged token exists or applies here — the
    // grounding gate verified the provider credential instead (D-21).
    const materializationId = await ctx.db.insert("materializations", {
      campaignId: campaign._id,
      shapeId: shape._id,
      mode: "live",
      createdAt: now,
    });

    for (const draft of args.drafts) {
      // L8: every draft lands unapproved; approval stays human-gated.
      await ctx.db.insert("v2Posts", {
        userId: args.userId,
        brandId: campaign.brandId,
        channelId: draft.slotChannel,
        platformId: draft.slotChannel,
        title: draft.title,
        content: draft.content,
        status: "draft",
        approvalState: "unapproved",
        timezone: "America/Los_Angeles",
        sourceCampaignId: campaign._id,
        sourceSlotId: draft.slotId,
        sourceExcerptIds: draft.excerptCitations,
        contentFingerprint: `${draft.title.trim()}\n${draft.content.trim()}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    await audit(ctx, {
      userId: args.userId,
      brandId: campaign.brandId,
      action: "campaign.generate_draft_set_live",
      summary: `Generated a ${args.drafts.length}-draft AI set for "${campaign.title}" through the Cortex gateway (${args.model}) — every draft unapproved; the cohesion gate runs next.`,
      metadata: {
        campaignId: String(campaign._id),
        materializationId: String(materializationId),
        draftCount: args.drafts.length,
        mode: "live",
        model: args.model,
        estimatedCostCents: args.estimatedCostCents,
      },
    });

    return {
      materializationId,
      draftCount: args.drafts.length,
      brandId: campaign.brandId,
    };
  },
});

/**
 * User-triggered live generation: composes every slot of the accepted shape
 * through the gateway, then materializes the whole set in one write. Drafts
 * are composed before anything persists — a failed slot refuses the entire
 * run, so a campaign never receives a partial draft set.
 */
// The explicit outcome type breaks the self-referential inference cycle that
// internal.draftGeneration.* calls would otherwise create (answer-engine
// precedent).
type LiveDraftSetOutcome = {
  materializationId: Id<"materializations">;
  draftCount: number;
  cohesionPassed: boolean;
  cohesionRunNumber: number;
};

export const generateLiveDraftSet = action({
  args: { campaignId: v.id("campaigns") },
  returns: v.object({
    materializationId: v.id("materializations"),
    draftCount: v.number(),
    cohesionPassed: v.boolean(),
    cohesionRunNumber: v.number(),
  }),
  handler: async (ctx, args): Promise<LiveDraftSetOutcome> => {
    const userId = await requireUserId(ctx);

    // Grounding gate (D-21), live branch: fail closed without a verified
    // provider, exactly as the mock branch fails closed without an
    // acknowledgment token.
    const liveConfigured = campaignDraftingCredential(process.env) !== null;
    assertGroundingAllowed({
      mode: "live",
      mockAcknowledged: false,
      liveConfigured,
    });

    const { slots } = await ctx.runQuery(
      internal.draftGeneration.loadLiveDraftContext,
      { campaignId: args.campaignId, userId }
    );

    // Budget admission before any dispatch: refuse with a clear message when
    // the estimate exceeds the ceiling — nothing has been written or spent.
    const plan = planDraftGenerationRun({
      draftCount: slots.length,
      limits: campaignDraftingRunLimits(process.env),
    });
    if (!plan.ok) {
      throw new Error(budgetRefusalMessage(plan));
    }

    const composed: {
      seq: number;
      slotId: Id<"campaignSlots">;
      slotChannel: "linkedin" | "x" | "youtube" | "instagram" | "tiktok" | "reddit" | "corvo-blog";
      title: string;
      content: string;
      excerptCitations?: string[];
    }[] = [];
    for (const slot of slots) {
      const draft = await composeSlotDraft({ env: process.env }, slot);
      if (!draft.ok) {
        throw new Error(
          `Live draft generation refused at slot #${slot.seq} (${slot.role}): ${draft.reason}. Nothing was written — no partial draft set exists.`
        );
      }
      composed.push({
        seq: slot.seq,
        slotId: slot.slotId,
        slotChannel: slot.channel,
        title: draft.title,
        content: draft.content,
        excerptCitations: slot.excerptCitations,
      });
    }

    const result = await ctx.runMutation(
      internal.draftGeneration.recordLiveDraftSet,
      {
        campaignId: args.campaignId,
        userId,
        model: campaignDraftingCredential(process.env)?.model ?? "",
        estimatedCostCents: plan.estimatedCostCents,
        drafts: composed,
      }
    );

    // The existing cohesion gate fires on the new set, same as the mock path;
    // identity propagates through runMutation and the gate re-verifies ownership.
    const cohesion = (await ctx.runMutation(api.cohesion.runCohesionGate, {
      campaignId: args.campaignId,
    })) as { runNumber: number; passed: boolean };

    return {
      materializationId: result.materializationId,
      draftCount: result.draftCount,
      cohesionPassed: cohesion.passed,
      cohesionRunNumber: cohesion.runNumber,
    };
  },
});

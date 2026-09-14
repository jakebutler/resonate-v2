import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  audit,
  brandIdValidator,
  getOwnedCampaign,
  requireBrandAccess,
  requireUserId,
} from "./campaignAccess";
import {
  assertGroundingAllowed,
  buildCorpusCitation,
  parseCorpusCitation,
} from "@/lib/campaignGrounding";
import { verifyMockAcknowledgment } from "./mockAck";
import {
  suggestCampaignIdeas,
  type IdeaFlavor,
  type SuggestionExcerptInput,
} from "@/lib/campaignSuggestions";

/**
 * Every campaign↔idea mutation must prove the idea belongs to the caller.
 * Idea IDs are opaque but not secret — without this check any authenticated
 * user can read (and write hints onto) another user's ideas.
 */
async function requireOwnedIdea(
  ctx: QueryCtx | MutationCtx,
  ideaId: string,
  userId: string
): Promise<Doc<"ideas">> {
  const normalized = ctx.db.normalizeId("ideas", ideaId as never);
  if (!normalized) throw new Error("Idea not found");
  const idea = await ctx.db.get(normalized);
  if (!idea || idea.userId !== userId) {
    throw new Error("Idea not found");
  }
  return idea;
}

export const createCampaign = mutation({
  args: {
    brandId: brandIdValidator,
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await requireBrandAccess(ctx, userId, args.brandId);

    const title = args.title.trim();
    if (!title) {
      throw new Error("Campaign title is required.");
    }

    const now = Date.now();
    const campaignId = await ctx.db.insert("campaigns", {
      userId,
      brandId: args.brandId,
      title,
      status: "active",
      corpusIds: [],
      createdAt: now,
      updatedAt: now,
    });

    await audit(ctx, {
      userId,
      brandId: args.brandId,
      action: "campaign.create",
      summary: `Started campaign "${title}" (title-only confirm).`,
      metadata: { campaignId: String(campaignId) },
    });

    return { campaignId: String(campaignId) };
  },
});

export const listCampaigns = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const memberships = await ctx.db
      .query("v2BrandMemberships")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const accessibleBrands = new Set(
      memberships.map((membership) => membership.brandId)
    );

    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return campaigns
      .filter((campaign) => accessibleBrands.has(campaign.brandId))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getCampaign = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaignId = ctx.db.normalizeId("campaigns", args.campaignId);
    if (!campaignId) return null;
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.userId !== userId) return null;
    try {
      await requireBrandAccess(ctx, userId, campaign.brandId);
    } catch {
      return null;
    }
    return campaign;
  },
});
export const attachCorpus = mutation({
  args: {
    campaignId: v.id("campaigns"),
    corpusId: v.id("corpora"),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);
    const corpusId = ctx.db.normalizeId("corpora", args.corpusId);
    if (!corpusId) throw new Error("Corpus not found");
    const corpus = await ctx.db.get(corpusId);
    if (!corpus || corpus.brandId !== campaign.brandId) {
      throw new Error("Corpus not found for this brand");
    }
    if (campaign.corpusIds.some((existing) => existing === corpusId)) {
      return { attached: false, reason: "already attached" };
    }

    await ctx.db.patch(campaign._id, {
      corpusIds: [...campaign.corpusIds, corpusId],
      updatedAt: Date.now(),
    });
    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.attach_corpus",
      summary: `Attached corpus v${corpus.version} to campaign "${campaign.title}".`,
      metadata: { campaignId: String(campaign._id), corpusId: String(corpusId) },
    });
    return { attached: true };
  },
});

export const suggestIdeas = mutation({
  args: {
    campaignId: v.id("campaigns"),
    mockAckToken: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    // Fail-closed grounding (D-21): mock suggestions require a server-issued,
    // unexpired acknowledgment token — never a client-asserted boolean.
    const mockAcknowledged = await verifyMockAcknowledgment(ctx, {
      campaignId: campaign._id,
      userId,
      token: args.mockAckToken,
    });
    assertGroundingAllowed({
      mode: "mock",
      mockAcknowledged,
      liveConfigured: false,
    });

    const now = Date.now();
    const existingJoins = await ctx.db
      .query("campaignIdeas")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const existingIdeaIds = new Set(existingJoins.map((join) => join.ideaId));
    const existingIdeas = await Promise.all(
      [...existingIdeaIds].map((ideaId) => ctx.db.get(ideaId))
    );
    const existingTexts = new Set(
      existingIdeas.filter(Boolean).map((idea) => (idea as { text: string }).text)
    );

    // D-17 window cap: the prompt cannot consume thousands of excerpts, so
    // bound it deterministically — round-robin across attached corpus
    // versions (each in seq order), same result on every reload. The sampled
    // window is recorded in the audit event so suggestions stay explainable.
    const SUGGESTION_EXCERPT_CAP = 60;
    const corpusGroups: SuggestionExcerptInput[][] = [];
    for (const corpusId of campaign.corpusIds) {
      const excerpts = await ctx.db
        .query("corpusExcerpts")
        .withIndex("by_corpus", (q) => q.eq("corpusId", corpusId))
        .collect();
      const group: SuggestionExcerptInput[] = [];
      for (const excerpt of excerpts.sort((a, b) => a.seq - b.seq)) {
        // D-17: internal-only excerpts are never quoted; only excerpts whose
        // review state is accepted are quotable at all.
        if (excerpt.sensitivity === "internal-only") continue;
        if (excerpt.reviewState !== "accepted") continue;
        group.push({
          seq: excerpt.seq,
          text: excerpt.text,
          provenance: excerpt.provenance,
          citation: buildCorpusCitation({
            brandId: campaign.brandId,
            corpusId: String(corpusId),
            seq: excerpt.seq,
          }),
        });
      }
      corpusGroups.push(group);
    }
    const excerptInputs = corpusGroups.flat();
    if (excerptInputs.length === 0) {
      throw new Error(
        "Attach a corpus version before requesting suggested ideas."
      );
    }
    let excerptWindow = excerptInputs;
    if (excerptInputs.length > SUGGESTION_EXCERPT_CAP) {
      const windowed: SuggestionExcerptInput[] = [];
      const maxLength = Math.max(...corpusGroups.map((group) => group.length));
      for (let index = 0; index < maxLength && windowed.length < SUGGESTION_EXCERPT_CAP; index += 1) {
        for (const group of corpusGroups) {
          if (index < group.length && windowed.length < SUGGESTION_EXCERPT_CAP) {
            windowed.push(group[index]);
          }
        }
      }
      excerptWindow = windowed;
    }

    const suggestions = suggestCampaignIdeas(excerptWindow);
    let created = 0;
    for (const suggestion of suggestions) {
      if (existingTexts.has(suggestion.text)) continue;

      const ideaId = await ctx.db.insert("ideas", {
        userId,
        title: suggestion.title,
        text: suggestion.text,
        status: "idea",
        flavor: suggestion.flavor as IdeaFlavor,
        excerptCitations: suggestion.citations,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("campaignIdeas", {
        campaignId: campaign._id,
        ideaId,
        state: "suggested",
        addedAt: now,
      });
      existingTexts.add(suggestion.text);
      created += 1;
    }

    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.suggest_ideas",
      summary: `Generated ${created} suggested idea(s) in acknowledged mock mode for "${campaign.title}".`,
      metadata: {
        campaignId: String(campaign._id),
        mode: "mock",
        created,
        acknowledged: mockAcknowledged,
        excerptWindow: {
          sampled: excerptWindow.length,
          total: excerptInputs.length,
          capped: excerptWindow.length < excerptInputs.length,
          cap: SUGGESTION_EXCERPT_CAP,
        },
      },
    });

    return { created };
  },
});

export const addIdeaToCampaign = mutation({
  args: { campaignId: v.id("campaigns"), ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);
    const idea = await requireOwnedIdea(ctx, args.ideaId, userId);

    const existing = await ctx.db
      .query("campaignIdeas")
      .withIndex("by_campaign_and_idea", (q) =>
        q.eq("campaignId", campaign._id).eq("ideaId", args.ideaId)
      )
      .first();

    const now = Date.now();
    if (existing) {
      if (existing.state === "member") {
        return { added: false, reason: "already in working set" };
      }
      await ctx.db.patch(existing._id, { state: "member" });
    } else {
      await ctx.db.insert("campaignIdeas", {
        campaignId: campaign._id,
        ideaId: args.ideaId,
        state: "member",
        addedAt: now,
      });
    }

    const hints = (idea.campaignHints ?? []).filter(
      (hint) => hint.campaignId !== campaign._id
    );
    await ctx.db.patch(args.ideaId, {
      campaignHints: [
        ...hints,
        { campaignId: campaign._id, campaignTitle: campaign.title },
      ],
      updatedAt: now,
    });

    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.add_idea",
      summary: `Added an idea to the working set of "${campaign.title}".`,
      metadata: {
        campaignId: String(campaign._id),
        ideaId: String(args.ideaId),
      },
    });
    return { added: true };
  },
});

export const removeIdeaFromCampaign = mutation({
  args: { campaignId: v.id("campaigns"), ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);
    await requireOwnedIdea(ctx, args.ideaId, userId);

    const join = await ctx.db
      .query("campaignIdeas")
      .withIndex("by_campaign_and_idea", (q) =>
        q.eq("campaignId", campaign._id).eq("ideaId", args.ideaId)
      )
      .first();
    if (!join || join.state !== "member") {
      return { removed: false, reason: "not in working set" };
    }

    await ctx.db.patch(join._id, { state: "suggested" });

    // D-7 one-way membership: removing from the working set detaches the idea
    // from any shape slot, and slot linking never removes working-set membership.
    const shapes = await ctx.db
      .query("campaignShapes")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    let detachedSlots = 0;
    for (const shape of shapes) {
      const slots = await ctx.db
        .query("campaignSlots")
        .withIndex("by_shape", (q) => q.eq("shapeId", shape._id))
        .collect();
      for (const slot of slots) {
        if (slot.ideaId === args.ideaId) {
          await ctx.db.patch(slot._id, { ideaId: undefined });
          detachedSlots += 1;
        }
      }
    }

    const idea = await ctx.db.get(args.ideaId);
    if (idea?.campaignHints) {
      await ctx.db.patch(args.ideaId, {
        campaignHints: idea.campaignHints.filter(
          (hint) => hint.campaignId !== campaign._id
        ),
        updatedAt: Date.now(),
      });
    }

    await audit(ctx, {
      userId,
      brandId: campaign.brandId,
      action: "campaign.remove_idea",
      summary: `Removed an idea from the working set of "${campaign.title}"${detachedSlots > 0 ? ` and detached ${detachedSlots} slot(s)` : ""}.`,
      metadata: {
        campaignId: String(campaign._id),
        ideaId: String(args.ideaId),
        detachedSlots,
      },
    });
    return { removed: true, detachedSlots };
  },
});

export const rejectIdea = mutation({
  args: { campaignId: v.id("campaigns"), ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);
    await requireOwnedIdea(ctx, args.ideaId, userId);

    const join = await ctx.db
      .query("campaignIdeas")
      .withIndex("by_campaign_and_idea", (q) =>
        q.eq("campaignId", campaign._id).eq("ideaId", args.ideaId)
      )
      .first();
    if (join?.state === "member") {
      throw new Error(
        "Remove the idea from the working set before marking it not useful."
      );
    }

    const now = Date.now();
    if (join) {
      await ctx.db.patch(join._id, { state: "rejected" });
    } else {
      await ctx.db.insert("campaignIdeas", {
        campaignId: campaign._id,
        ideaId: args.ideaId,
        state: "rejected",
        addedAt: now,
      });
    }
    return { rejected: true };
  },
});

export const undoIdeaRejection = mutation({
  args: { campaignId: v.id("campaigns"), ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);
    await requireOwnedIdea(ctx, args.ideaId, userId);

    const join = await ctx.db
      .query("campaignIdeas")
      .withIndex("by_campaign_and_idea", (q) =>
        q.eq("campaignId", campaign._id).eq("ideaId", args.ideaId)
      )
      .first();
    if (!join || join.state !== "rejected") {
      return { undone: false, reason: "not rejected" };
    }
    await ctx.db.patch(join._id, { state: "suggested" });
    return { undone: true };
  },
});

export const searchSessionIdeas = query({
  args: { campaignId: v.id("campaigns"), search: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);

    const term = args.search.trim().toLowerCase();
    const ideaRows = await ctx.db
      .query("ideas")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .collect();
    const matches = ideaRows
      .filter((idea) => idea.status !== "archived")
      .filter(
        (idea) =>
          !term ||
          idea.text.toLowerCase().includes(term) ||
          (idea.title ?? "").toLowerCase().includes(term)
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20);

    const joins = await ctx.db
      .query("campaignIdeas")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const joinByIdea = new Map(joins.map((join) => [join.ideaId, join]));

    return matches.map((idea) => ({
      idea,
      state: joinByIdea.get(idea._id)?.state ?? null,
    }));
  },
});

export const getCampaignSession = query({
  args: { campaignId: v.id("campaigns") },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const campaign = await getOwnedCampaign(ctx, userId, args.campaignId);
    if (!campaign) return null;

    const brief = await ctx.db
      .query("campaignBriefs")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .first();

    const corporaWithCounts = [];
    const citedExcerptKeys = new Set<string>();
    for (const corpusId of campaign.corpusIds) {
      const corpus = await ctx.db.get(corpusId);
      if (!corpus) continue;
      // Bounded sample instead of full rows: an immutable corpus version can
      // hold thousands of excerpts, and shipping every `text` to the browser
      // fails cliff-style once a brand crosses the response-size limit. The
      // sample is read server-side only; the count is capped, not shipped.
      const excerptSample = await ctx.db
        .query("corpusExcerpts")
        .withIndex("by_corpus", (q) => q.eq("corpusId", corpusId))
        .take(51);
      corporaWithCounts.push({ corpus, excerptCount: excerptSample.length });
    }

    const joins = await ctx.db
      .query("campaignIdeas")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .collect();
    const hydrated = await Promise.all(
      joins.map(async (join) => ({
        join,
        idea: await ctx.db.get(join.ideaId),
      }))
    );
    const withIdeas = hydrated.filter((entry) => entry.idea !== null);

    // Resolve just the excerpts that ideas actually cite so citation chips
    // work without shipping entire corpora.
    for (const entry of withIdeas) {
      for (const citation of entry.idea?.excerptCitations ?? []) {
        const parsed = parseCorpusCitation(citation);
        if (parsed) citedExcerptKeys.add(`${parsed.corpusId}:${parsed.seq}`);
      }
    }
    const citedExcerpts: {
      _id: string;
      corpusId: string;
      seq: number;
      text: string;
      provenance: string;
    }[] = [];
    for (const key of citedExcerptKeys) {
      const separator = key.lastIndexOf(":");
      const corpusId = key.slice(0, separator);
      const seq = Number(key.slice(separator + 1));
      const normalizedCorpusId = ctx.db.normalizeId("corpora", corpusId);
      if (!normalizedCorpusId || !Number.isInteger(seq)) continue;
      const excerpt = await ctx.db
        .query("corpusExcerpts")
        .withIndex("by_corpus_and_seq", (q) =>
          q.eq("corpusId", normalizedCorpusId).eq("seq", seq)
        )
        .first();
      if (excerpt) {
        citedExcerpts.push({
          _id: excerpt._id,
          corpusId: corpusId,
          seq: excerpt.seq,
          text: excerpt.text,
          provenance: excerpt.provenance,
        });
      }
    }

    const shape = await ctx.db
      .query("campaignShapes")
      .withIndex("by_campaign_and_status", (q) =>
        q.eq("campaignId", campaign._id).eq("status", "accepted")
      )
      .first();

    return {
      campaign,
      brief: brief ?? null,
      corpora: corporaWithCounts,
      citedExcerpts,
      suggested: withIdeas.filter((entry) => entry.join.state === "suggested"),
      workingSet: withIdeas.filter((entry) => entry.join.state === "member"),
      rejected: withIdeas.filter((entry) => entry.join.state === "rejected"),
      acceptedShape: shape ?? null,
    };
  },
});


import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const v2BrandId = v.union(
  v.literal("personal"),
  v.literal("corvo"),
  v.literal("lower-db"),
  v.literal("freshproof")
);

const v2ChannelId = v.union(
  v.literal("linkedin"),
  v.literal("x"),
  v.literal("youtube"),
  v.literal("instagram"),
  v.literal("tiktok"),
  v.literal("reddit"),
  v.literal("corvo-blog")
);

const v2ProviderId = v.union(
  v.literal("mock"),
  v.literal("buffer"),
  v.literal("zernio"),
  v.literal("github-pr"),
  v.literal("postiz-oauth")
);

const v2ApprovalState = v.union(
  v.literal("unapproved"),
  v.literal("approved"),
  v.literal("changes-requested")
);

const v2PostStatus = v.union(
  v.literal("draft"),
  v.literal("approved"),
  v.literal("scheduled"),
  v.literal("submitted"),
  v.literal("published"),
  v.literal("needs-review"),
  v.literal("failed"),
  v.literal("unavailable"),
  v.literal("pr-created")
);

const v2ProviderStateStatus = v.union(
  v.literal("not-submitted"),
  v.literal("submitted"),
  v.literal("published"),
  v.literal("needs-review"),
  v.literal("failed"),
  v.literal("unavailable"),
  v.literal("cancel-intent-recorded")
);

const v2AttemptStatus = v.union(
  v.literal("pending"),
  v.literal("success"),
  v.literal("retryable-failure"),
  v.literal("permanent-failure"),
  v.literal("ambiguous"),
  v.literal("unavailable")
);

const v2ResearchDepth = v.union(
  v.literal("light"),
  v.literal("standard"),
  v.literal("rigorous")
);

const v2ResearchRiskLevel = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

const v2SourceReviewStatus = v.union(
  v.literal("unvetted"),
  v.literal("accepted"),
  v.literal("rejected"),
  v.literal("flagged")
);

const v2ClaimReviewStatus = v.union(
  v.literal("unreviewed"),
  v.literal("accepted"),
  v.literal("needs-revision"),
  v.literal("unsupported"),
  v.literal("too-risky"),
  v.literal("out-of-scope")
);

const v2ClaimMapStatus = v.union(
  v.literal("building"),
  v.literal("review-ready"),
  v.literal("reviewed")
);

const v2LinkedInPlatformSettings = v.object({
  cta: v.optional(v.string()),
  hashtags: v.optional(v.array(v.string())),
  linkPreview: v.optional(v.boolean()),
});

const v2RedditPlatformSettings = v.object({
  subreddit: v.optional(v.string()),
  flair: v.optional(v.string()),
  nsfw: v.optional(v.boolean()),
  spoiler: v.optional(v.boolean()),
  sensitivity: v.optional(v.string()),
});

const v2CorvoBlogPlatformSettings = v.object({
  canonicalUrl: v.optional(v.string()),
  ogImage: v.optional(v.string()),
  statusFlag: v.optional(v.string()),
  categoryOverride: v.optional(v.string()),
});

const v2PlatformSettings = v.union(
  v2LinkedInPlatformSettings,
  v2RedditPlatformSettings,
  v2CorvoBlogPlatformSettings
);

const corpusOrigin = v.union(
  v.literal("upload"),
  v.literal("cli"),
  v.literal("paste")
);

const corpusDocumentKind = v.union(
  v.literal("md"),
  v.literal("txt"),
  v.literal("json"),
  v.literal("csv"),
  v.literal("pdf")
);

const excerptSensitivity = v.union(
  v.literal("unreviewed"),
  v.literal("internal-only"),
  v.literal("public-safe")
);

const excerptReviewState = v.union(
  v.literal("accepted"),
  v.literal("flagged")
);

const campaignPreset = v.union(
  v.literal("seed"),
  v.literal("standard"),
  v.literal("deep")
);

const slotRole = v.union(
  v.literal("pillar"),
  v.literal("hook"),
  v.literal("satellite"),
  v.literal("cta"),
  v.literal("recap")
);

const slotMediaType = v.union(
  v.literal("post"),
  v.literal("article"),
  v.literal("essay"),
  v.literal("script")
);

const ideaFlavor = v.union(
  v.literal("opinion"),
  v.literal("insight"),
  v.literal("thought")
);

export default defineSchema({
  v2Brands: defineTable({
    brandId: v2BrandId,
    name: v.string(),
    description: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_brand_id", ["brandId"]),

  v2BrandMemberships: defineTable({
    userId: v.string(),
    brandId: v2BrandId,
    role: v.union(v.literal("owner"), v.literal("editor"), v.literal("viewer")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_brand", ["userId", "brandId"]),

  v2Channels: defineTable({
    brandId: v2BrandId,
    channelId: v2ChannelId,
    platformId: v2ChannelId,
    label: v.string(),
    providerId: v.optional(v2ProviderId),
    routable: v.boolean(),
    socialAccountLabel: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_brand_and_channel", ["brandId", "channelId"])
    .index("by_provider", ["providerId"]),

  v2Posts: defineTable({
    userId: v.string(),
    brandId: v2BrandId,
    channelId: v2ChannelId,
    platformId: v2ChannelId,
    title: v.string(),
    content: v.string(),
    status: v2PostStatus,
    approvalState: v2ApprovalState,
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    timezone: v.string(),
    sourceIdeaId: v.optional(v.string()),
    sourceResearchBriefId: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    branchName: v.optional(v.string()),
    blogExcerpt: v.optional(v.string()),
    blogAuthor: v.optional(v.string()),
    blogCategory: v.optional(v.string()),
    blogTags: v.optional(v.array(v.string())),
    blogSlug: v.optional(v.string()),
    heroImageUrl: v.optional(v.string()),
    heroImageStorageId: v.optional(v.id("_storage")),
    blogPrNumber: v.optional(v.number()),
    blogPrStatus: v.optional(
      v.union(
        v.literal("open"),
        v.literal("merged"),
        v.literal("closed"),
        v.literal("draft")
      )
    ),
    blogPrUpdatedAt: v.optional(v.number()),
    variantReviewStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("rejected")
      )
    ),
    sourceCampaignId: v.optional(v.id("campaigns")),
    sourceSlotId: v.optional(v.id("campaignSlots")),
    sourceExcerptIds: v.optional(v.array(v.string())),
    contentFingerprint: v.string(),
    platformSettings: v.optional(v2PlatformSettings),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_brand_and_status", ["brandId", "status"])
    .index("by_channel", ["channelId"])
    .index("by_scheduled_date", ["scheduledDate"]),

  v2PublishingIntents: defineTable({
    postId: v.id("v2Posts"),
    userId: v.string(),
    brandId: v2BrandId,
    channelId: v2ChannelId,
    platformId: v2ChannelId,
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    timezone: v.string(),
    approvalState: v2ApprovalState,
    sourceIdeaId: v.optional(v.string()),
    sourceResearchBriefId: v.optional(v.string()),
    contentFingerprint: v.string(),
    /** In-flight Buffer submit claim; patched on the intent doc so concurrent claims serialize. */
    activeBufferClaimKey: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_schedule", ["scheduledDate"]),

  v2ProviderStates: defineTable({
    postId: v.id("v2Posts"),
    intentId: v.id("v2PublishingIntents"),
    providerId: v.optional(v2ProviderId),
    status: v2ProviderStateStatus,
    providerPostId: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    lastAttemptId: v.optional(v.id("v2PublishAttempts")),
    lastResponseSummary: v.optional(v.string()),
    simulated: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_intent", ["intentId"])
    .index("by_status", ["status"]),

  v2PublishAttempts: defineTable({
    postId: v.id("v2Posts"),
    intentId: v.id("v2PublishingIntents"),
    userId: v.string(),
    providerId: v2ProviderId,
    status: v2AttemptStatus,
    idempotencyKey: v.string(),
    retryCount: v.number(),
    submissionSnapshot: v.object({
      postId: v.string(),
      brandId: v2BrandId,
      channelId: v2ChannelId,
      title: v.string(),
      content: v.string(),
      scheduledDate: v.optional(v.string()),
      scheduledTime: v.optional(v.string()),
      timezone: v.string(),
    }),
    sanitizedResponse: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_intent", ["intentId"])
    .index("by_idempotency_key", ["idempotencyKey"]),

  v2AuditEvents: defineTable({
    userId: v.string(),
    brandId: v2BrandId,
    postId: v.optional(v.id("v2Posts")),
    intentId: v.optional(v.id("v2PublishingIntents")),
    action: v.string(),
    summary: v.string(),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_post", ["postId"])
    .index("by_brand", ["brandId"])
    .index("by_user", ["userId"]),

  v2ResearchBriefs: defineTable({
    userId: v.string(),
    brandId: v2BrandId,
    topic: v.string(),
    audience: v.string(),
    thesis: v.string(),
    depth: v2ResearchDepth,
    riskLevel: v2ResearchRiskLevel,
    targetOutputs: v.array(v.string()),
    status: v.union(
      v.literal("drafting"),
      v.literal("source-discovery"),
      v.literal("source-review"),
      v.literal("outline-ready")
    ),
    provider: v.string(),
    warning: v.optional(v.string()),
    localBriefId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_status", ["status"]),

  v2ResearchSources: defineTable({
    researchBriefId: v.id("v2ResearchBriefs"),
    userId: v.string(),
    brandId: v2BrandId,
    sourceId: v.string(),
    title: v.string(),
    url: v.string(),
    domain: v.optional(v.string()),
    evidenceLabel: v.string(),
    relevanceScore: v.optional(v.number()),
    publishedYear: v.optional(v.number()),
    useCase: v.optional(v.string()),
    addedBy: v.optional(v.string()),
    status: v2SourceReviewStatus,
    reviewerNotes: v.optional(v.string()),
    raw: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brief", ["researchBriefId"])
    .index("by_brief_and_source", ["researchBriefId", "sourceId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  v2ClaimMaps: defineTable({
    userId: v.string(),
    brandId: v2BrandId,
    researchBriefId: v.optional(v.id("v2ResearchBriefs")),
    localClaimMapId: v.optional(v.string()),
    topic: v.string(),
    thesis: v.string(),
    status: v2ClaimMapStatus,
    provider: v.string(),
    warning: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_research_brief", ["researchBriefId"]),

  v2Claims: defineTable({
    claimMapId: v.id("v2ClaimMaps"),
    userId: v.string(),
    brandId: v2BrandId,
    claimId: v.string(),
    text: v.string(),
    sourceIds: v.array(v.string()),
    evidenceLabel: v.string(),
    confidence: v.string(),
    caveats: v.optional(v.string()),
    reviewerNotes: v.optional(v.string()),
    status: v2ClaimReviewStatus,
    raw: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_claim_map", ["claimMapId"])
    .index("by_claim_map_and_claim", ["claimMapId", "claimId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  v2EditorialOutlines: defineTable({
    userId: v.string(),
    brandId: v2BrandId,
    claimMapId: v.optional(v.id("v2ClaimMaps")),
    localOutlineId: v.optional(v.string()),
    localClaimMapId: v.optional(v.string()),
    thesis: v.string(),
    sections: v.array(
      v.object({
        heading: v.string(),
        notes: v.string(),
        claimIds: v.array(v.string()),
        evidenceLabels: v.array(v.string()),
      })
    ),
    takeawayTable: v.array(
      v.object({
        finding: v.string(),
        evidenceLabel: v.string(),
        source: v.string(),
      })
    ),
    citationPlan: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("approved"),
      v.literal("generating-draft")
    ),
    provider: v.string(),
    warning: v.optional(v.string()),
    raw: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_claim_map", ["claimMapId"]),

  v2LongFormDrafts: defineTable({
    userId: v.string(),
    brandId: v2BrandId,
    outlineId: v.optional(v.id("v2EditorialOutlines")),
    localOutlineId: v.optional(v.string()),
    claimMapId: v.optional(v.id("v2ClaimMaps")),
    localClaimMapId: v.optional(v.string()),
    markdown: v.string(),
    provider: v.string(),
    warning: v.optional(v.string()),
    acceptedClaimIds: v.array(v.string()),
    raw: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"])
    .index("by_outline", ["outlineId"])
    .index("by_claim_map", ["claimMapId"]),

  capturedIdeas: defineTable({
    userId: v.string(),
    brandId: v.optional(v2BrandId),
    status: v.union(
      v.literal("inbox"),
      v.literal("reviewing"),
      v.literal("ready"),
      v.literal("used"),
      v.literal("archived")
    ),
    tags: v.array(v.string()),
    sourceUrl: v.optional(v.string()),
    normalizedSourceUrl: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    sourceDomain: v.optional(v.string()),
    latestEntryPreview: v.string(),
    lastCapturedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_status", ["userId", "status"])
    .index("by_user_and_source", ["userId", "normalizedSourceUrl"]),

  capturedIdeaEntries: defineTable({
    ideaId: v.id("capturedIdeas"),
    userId: v.string(),
    content: v.string(),
    captureChannel: v.union(
      v.literal("web"),
      v.literal("extension"),
      v.literal("ios_share")
    ),
    createdAt: v.number(),
  })
    .index("by_idea", ["ideaId"])
    .index("by_user", ["userId"]),

  capturedIdeaPostLinks: defineTable({
    ideaId: v.id("capturedIdeas"),
    postId: v.id("posts"),
    userId: v.string(),
    createdAt: v.number(),
  })
    .index("by_idea", ["ideaId"])
    .index("by_post", ["postId"])
    .index("by_user", ["userId"]),

  v2MigrationRecords: defineTable({
    userId: v.string(),
    legacyTable: v.string(),
    legacyId: v.string(),
    targetTable: v.string(),
    targetId: v.string(),
    createdAt: v.number(),
  })
    .index("by_legacy", ["legacyTable", "legacyId"])
    .index("by_user", ["userId"]),

  capturedIdeaV2PostLinks: defineTable({
    ideaId: v.id("capturedIdeas"),
    postId: v.id("v2Posts"),
    userId: v.string(),
    brandId: v2BrandId,
    channelId: v2ChannelId,
    createdAt: v.number(),
  })
    .index("by_idea", ["ideaId"])
    .index("by_post", ["postId"])
    .index("by_user", ["userId"])
    .index("by_brand", ["brandId"]),

  posts: defineTable({
    type: v.union(v.literal("blog"), v.literal("linkedin")),
    title: v.optional(v.string()),
    content: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("published")
    ),
    scheduledDate: v.optional(v.string()),
    scheduledTime: v.optional(v.string()),
    fileIds: v.optional(v.array(v.id("_storage"))),
    linkedBlogPostId: v.optional(v.id("posts")),
    externalUrl: v.optional(v.string()),
    isRepost: v.optional(v.boolean()),
    githubPrUrl: v.optional(v.string()),
    publishedAt: v.optional(v.number()),
    // Full-screen editor fields (all optional for backward compatibility)
    heroImageId: v.optional(v.id("_storage")),
    tags: v.optional(v.array(v.string())),
    seoDescription: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    excerpt: v.optional(v.string()),
    author: v.optional(v.string()),
    category: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    coverImageAlt: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_status", ["status"])
    .index("by_scheduled_date", ["scheduledDate"])
    .index("by_external_url", ["externalUrl"]),

  settings: defineTable({
    blogEnabled: v.boolean(),
    blogFrequency: v.string(),
    linkedinEnabled: v.boolean(),
    linkedinFrequency: v.string(),
  }),

  ideas: defineTable({
    userId: v.string(),
    title: v.optional(v.string()),
    text: v.string(),
    status: v.union(
      v.literal("backlog"),
      v.literal("idea"),
      v.literal("research"),
      v.literal("archived")
    ),
    flavor: v.optional(ideaFlavor),
    excerptCitations: v.optional(v.array(v.string())),
    campaignHints: v.optional(
      v.array(
        v.object({
          campaignId: v.id("campaigns"),
          campaignTitle: v.string(),
        })
      )
    ),
    researchObjective: v.optional(v.string()),
    researchNotes: v.optional(v.string()),
    researchModes: v.optional(
      v.array(
        v.union(
          v.literal("current-news"),
          v.literal("trends"),
          v.literal("literature-review"),
          v.literal("academic"),
          v.literal("competitive"),
          v.literal("visual")
        )
      )
    ),
    researchSources: v.optional(
      v.array(
        v.union(
          v.literal("blogs"),
          v.literal("news"),
          v.literal("x"),
          v.literal("arxiv"),
          v.literal("academic-publications"),
          v.literal("reddit"),
          v.literal("dribbble")
        )
      )
    ),
    researchStatus: v.optional(
      v.union(v.literal("idle"), v.literal("queued"), v.literal("completed"))
    ),
    references: v.optional(
      v.array(
        v.object({
          url: v.string(),
          title: v.optional(v.string()),
          kind: v.optional(v.string()),
          addedBy: v.union(
            v.literal("user"),
            v.literal("extractor"),
            v.literal("agent")
          ),
        })
      )
    ),
    lastResearchRunAt: v.optional(v.number()),
    lastGateStage: v.optional(v.string()),
    lastGateReady: v.optional(v.boolean()),
    lastGateSummary: v.optional(v.string()),
    lastGateIssues: v.optional(v.array(v.string())),
    lastGateCheckedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_updated_at", ["updatedAt"])
    .index("by_user_id", ["userId"])
    .index("by_user_id_and_status", ["userId", "status"])
    .index("by_user_id_and_updated_at", ["userId", "updatedAt"]),

  workflowDrafts: defineTable({
    userId: v.string(),
    ideaId: v.id("ideas"),
    postId: v.id("posts"),
    type: v.union(v.literal("blog"), v.literal("linkedin")),
    stage: v.union(
      v.literal("outline"),
      v.literal("copyedit"),
      v.literal("seo"),
      v.literal("final"),
      v.literal("published")
    ),
    title: v.optional(v.string()),
    stageNotes: v.optional(v.string()),
    lastAgentStage: v.optional(v.string()),
    lastAgentSummary: v.optional(v.string()),
    lastAgentRunAt: v.optional(v.number()),
    lastGateStage: v.optional(v.string()),
    lastGateReady: v.optional(v.boolean()),
    lastGateSummary: v.optional(v.string()),
    lastGateIssues: v.optional(v.array(v.string())),
    lastGateCheckedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_stage", ["stage"])
    .index("by_idea_id", ["ideaId"])
    .index("by_post_id", ["postId"])
    .index("by_user_id", ["userId"])
    .index("by_user_id_and_stage", ["userId", "stage"])
    .index("by_user_id_and_idea_id", ["userId", "ideaId"])
    .index("by_user_id_and_post_id", ["userId", "postId"]),

  corpora: defineTable({
    brandId: v2BrandId,
    origin: corpusOrigin,
    version: v.number(),
    status: v.union(v.literal("active")),
    createdAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_brand_and_version", ["brandId", "version"]),

  corpusDocuments: defineTable({
    corpusId: v.id("corpora"),
    name: v.string(),
    kind: corpusDocumentKind,
    meta: v.optional(v.any()),
  }).index("by_corpus", ["corpusId"]),

  corpusExcerpts: defineTable({
    corpusId: v.id("corpora"),
    documentId: v.id("corpusDocuments"),
    seq: v.number(),
    text: v.string(),
    provenance: v.string(),
    sensitivity: excerptSensitivity,
    labels: v.optional(v.array(v.string())),
    reviewState: excerptReviewState,
  })
    .index("by_corpus", ["corpusId"])
    .index("by_corpus_and_document", ["corpusId", "documentId"])
    .index("by_corpus_and_seq", ["corpusId", "seq"]),

  campaigns: defineTable({
    userId: v.string(),
    brandId: v2BrandId,
    title: v.string(),
    status: v.union(v.literal("active"), v.literal("completed")),
    corpusIds: v.array(v.id("corpora")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_brand", ["brandId"])
    .index("by_user", ["userId"]),

  campaignBriefs: defineTable({
    campaignId: v.id("campaigns"),
    goal: v.optional(v.string()),
    audience: v.optional(v.string()),
    window: v.optional(v.string()),
    cta: v.optional(v.string()),
    metric: v.optional(v.string()),
    constraints: v.optional(v.array(v.string())),
  }).index("by_campaign", ["campaignId"]),

  campaignIdeas: defineTable({
    campaignId: v.id("campaigns"),
    ideaId: v.id("ideas"),
    primary: v.boolean(),
    state: v.union(
      v.literal("suggested"),
      v.literal("member"),
      v.literal("rejected")
    ),
    addedAt: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_idea", ["ideaId"])
    .index("by_campaign_and_idea", ["campaignId", "ideaId"]),

  campaignShapes: defineTable({
    campaignId: v.id("campaigns"),
    preset: campaignPreset,
    status: v.union(v.literal("proposed"), v.literal("accepted")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_campaign_and_status", ["campaignId", "status"]),

  campaignSlots: defineTable({
    shapeId: v.id("campaignShapes"),
    seq: v.number(),
    channel: v2ChannelId,
    mediaType: slotMediaType,
    role: slotRole,
    title: v.optional(v.string()),
    angle: v.optional(v.string()),
    ideaId: v.optional(v.id("ideas")),
  })
    .index("by_shape", ["shapeId"])
    .index("by_shape_and_seq", ["shapeId", "seq"]),

  materializations: defineTable({
    campaignId: v.id("campaigns"),
    shapeId: v.id("campaignShapes"),
    mode: v.union(v.literal("mock"), v.literal("live")),
    mockAcknowledged: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_campaign", ["campaignId"])
    .index("by_shape", ["shapeId"]),

  cohesionRuns: defineTable({
    materializationId: v.id("materializations"),
    checks: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        passed: v.boolean(),
        blocking: v.boolean(),
      })
    ),
    autoFixLog: v.array(
      v.object({
        checkId: v.string(),
        note: v.string(),
        fixedAt: v.number(),
      })
    ),
    passed: v.boolean(),
    createdAt: v.number(),
  }).index("by_materialization", ["materializationId"]),
});

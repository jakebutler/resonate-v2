export type BrandId = "personal" | "corvo" | "lower-db" | "freshproof";

export type ChannelId =
  | "linkedin"
  | "x"
  | "youtube"
  | "instagram"
  | "tiktok"
  | "reddit"
  | "corvo-blog";

export type IdeaStatus = "inbox" | "reviewing" | "ready" | "used" | "archived";

export type PlatformId = ChannelId;

export type ProviderId = "mock" | "buffer" | "zernio" | "github-pr" | "postiz-oauth";

export type ApprovalState = "unapproved" | "approved" | "changes-requested";

export type LinkedInPlatformSettings = { cta?: string; hashtags?: string[]; linkPreview?: boolean; };
export type RedditPlatformSettings = { subreddit?: string; flair?: string; nsfw?: boolean; spoiler?: boolean; sensitivity?: string; };
export type CorvoBlogPlatformSettings = { canonicalUrl?: string; ogImage?: string; statusFlag?: string; categoryOverride?: string; };
export type PlatformSettings = LinkedInPlatformSettings | RedditPlatformSettings | CorvoBlogPlatformSettings;

export type PostStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "submitted"
  | "published"
  | "needs-review"
  | "failed"
  | "unavailable"
  | "pr-created";

export type ProviderStateStatus =
  | "not-submitted"
  | "submitted"
  | "published"
  | "needs-review"
  | "failed"
  | "unavailable"
  | "cancel-intent-recorded";

export type ProviderAttemptStatus =
  | "success"
  | "retryable-failure"
  | "permanent-failure"
  | "ambiguous"
  | "unavailable";

export type IdeaEntry = {
  id: string;
  content: string;
  createdAt: string;
};

export type Idea = {
  id: string;
  brandId: BrandId;
  title: string;
  sourceUrl?: string;
  normalizedSourceUrl?: string;
  tags: string[];
  status: IdeaStatus;
  entries: IdeaEntry[];
  linkedPostIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type Post = {
  id: string;
  brandId: BrandId;
  channelId: ChannelId;
  ideaId?: string;
  title: string;
  content: string;
  status: PostStatus;
  scheduledDate?: string;
  scheduledTime?: string;
  timezone?: string;
  approvalState?: ApprovalState;
  providerState?: ProviderState;
  publishAttempts?: PublishAttempt[];
  prUrl?: string;
  branchName?: string;
  platformSettings?: PlatformSettings;
  createdAt: string;
  updatedAt: string;
};

export type VoicePack = {
  id: string;
  brandId: BrandId;
  name: string;
  markdown: string;
  isDefault: boolean;
  updatedAt: string;
};

export type WorkspaceState = {
  ideas: Idea[];
  posts: Post[];
  voicePacks: VoicePack[];
};

export type Brand = {
  id: BrandId;
  name: string;
  description: string;
  targetChannels: ChannelId[];
  validatedChannels: ChannelId[];
};

export type Channel = {
  id: ChannelId;
  brandId: BrandId;
  platformId: PlatformId;
  label: string;
  providerId: ProviderId | null;
  routable: boolean;
  socialAccountLabel?: string;
};

export type PublishingIntent = {
  id: string;
  postId: string;
  brandId: BrandId;
  channelId: ChannelId;
  platformId: PlatformId;
  scheduledDate?: string;
  scheduledTime?: string;
  timezone: string;
  approvalState: ApprovalState;
  sourceIdeaId?: string;
  sourceResearchBriefId?: string;
  contentFingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type ProviderState = {
  providerId: ProviderId | null;
  status: ProviderStateStatus;
  providerPostId?: string;
  prUrl?: string;
  lastAttemptId?: string;
  lastResponseSummary?: string;
  updatedAt: string;
};

export type PublishAttempt = {
  id: string;
  intentId: string;
  providerId: ProviderId;
  status: ProviderAttemptStatus;
  attemptedAt: string;
  idempotencyKey: string;
  submissionSnapshot: {
    postId: string;
    brandId: BrandId;
    channelId: ChannelId;
    title: string;
    content: string;
    scheduledDate?: string;
    scheduledTime?: string;
    timezone: string;
  };
  sanitizedResponse: Record<string, unknown>;
  retryCount: number;
};

export const BRANDS: Brand[] = [
  {
    id: "personal",
    name: "Personal",
    description: "Personal publishing workspace.",
    targetChannels: ["linkedin"],
    validatedChannels: [],
  },
  {
    id: "corvo",
    name: "Corvo Labs",
    description: "AI consulting, product strategy, and applied workflow writing.",
    targetChannels: ["linkedin", "corvo-blog", "x"],
    validatedChannels: ["corvo-blog", "youtube"],
  },
  {
    id: "lower-db",
    name: "the lower dB",
    description: "GLP-1 intelligence desk and patient-facing research content.",
    targetChannels: ["linkedin", "reddit", "instagram", "tiktok", "youtube", "x"],
    validatedChannels: [],
  },
  {
    id: "freshproof",
    name: "FreshProof",
    description: "Claim validation, evidence policy, and content QA.",
    targetChannels: ["linkedin", "reddit", "youtube", "x"],
    validatedChannels: [],
  },
];

export const CHANNEL_LABELS: Record<ChannelId, string> = {
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  reddit: "Reddit",
  "corvo-blog": "Corvo Labs Blog",
};

export const PLATFORMS: Array<{ id: PlatformId; label: string }> = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "reddit", label: "Reddit" },
  { id: "corvo-blog", label: "Corvo Blog" },
  { id: "x", label: "X" },
  { id: "youtube", label: "YouTube" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
];

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  scheduled: "Scheduled",
  submitted: "Submitted",
  published: "Published",
  "needs-review": "Needs Review",
  failed: "Failed",
  unavailable: "Unavailable",
  "pr-created": "PR Created",
};

export const CHANNELS: Channel[] = BRANDS.flatMap((brand) => {
  const channelIds = Array.from(
    new Set([...brand.targetChannels, ...brand.validatedChannels])
  );

  return channelIds.map((channelId) => {
    const providerId: ProviderId | null =
      channelId === "linkedin"
        ? "buffer"
        : channelId === "reddit"
          ? "zernio"
          : channelId === "corvo-blog"
            ? "github-pr"
            : null;

    return {
      id: channelId,
      brandId: brand.id,
      platformId: channelId,
      label: CHANNEL_LABELS[channelId],
      providerId,
      routable: providerId !== null,
      socialAccountLabel:
        channelId === "corvo-blog" ? "jakebutler/corvolabs-dot-com" : brand.name,
    };
  });
});

export const CORVO_PLACEHOLDER_VOICE_PACK = `# Corvo Labs Voice Pack

## Core stance

Corvo Labs writes like an operator explaining what actually worked. The voice is practical, precise, and allergic to empty hype. It should sound like someone who has built the workflow, hit the edge cases, and can explain the tradeoffs without making the reader feel small.

## Use

- Clear thesis up front.
- Concrete implementation details.
- Measured confidence instead of certainty theater.
- Short paragraphs with useful headings.
- Examples from AI workflows, healthcare operations, product development, evals, and human-in-the-loop systems.
- Phrases like "what actually moved the needle", "the useful split", "the real design work", and "measurement first" when they naturally fit.

## Avoid

- Generic AI booster language.
- Overpromising automation.
- Saying "seamless", "revolutionary", or "game-changing".
- Fake case studies, invented metrics, or unsupported claims.
- Treating prompts as the whole system when architecture, artifacts, review, and observability matter.

## Structure preferences

- Start with the practical problem.
- Explain the architecture or workflow split.
- Show why the naive approach breaks.
- Name the review or measurement loop.
- End with what the reader can copy or adapt.

## Platform notes

- Blog: high-signal, structured, candid about constraints.
- LinkedIn: tighter, more conversational, one core lesson.
- YouTube: script-like, explicit setup, visual beats, and concrete takeaway.
`;

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  ideas: [
    {
      id: "idea-corvo-golden-sets",
      brandId: "corvo",
      title: "Golden sets and evals for trustworthy claim validation",
      sourceUrl: "https://freshproof.io",
      normalizedSourceUrl: "https://freshproof.io",
      tags: ["evals", "claim validation", "FreshProof"],
      status: "ready",
      entries: [
        {
          id: "entry-corvo-golden-sets",
          content:
            "Write a Corvo Labs post about FreshProof-style claim validation: why golden sets matter, how evals expose brittle policy assumptions, and why review artifacts need claim-level traceability.",
          createdAt: new Date("2026-06-05T00:00:00.000Z").toISOString(),
        },
      ],
      linkedPostIds: [],
      createdAt: new Date("2026-06-05T00:00:00.000Z").toISOString(),
      updatedAt: new Date("2026-06-05T00:00:00.000Z").toISOString(),
    },
  ],
  posts: [],
  voicePacks: [
    {
      id: "voice-corvo-placeholder",
      brandId: "corvo",
      name: "Corvo Labs Placeholder Voice",
      markdown: CORVO_PLACEHOLDER_VOICE_PACK,
      isDefault: true,
      updatedAt: new Date("2026-06-05T00:00:00.000Z").toISOString(),
    },
  ],
};

export function normalizeIdeaSourceUrl(input?: string): string | undefined {
  if (!input?.trim()) return undefined;
  try {
    const url = new URL(input.trim());
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    const normalized = url.toString();
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  } catch {
    return input.trim();
  }
}

export function buildIdeaSeedText(idea: Idea): string {
  const entries = idea.entries
    .map((entry, index) => `Note ${index + 1}: ${entry.content}`)
    .join("\n\n");
  return [
    `Idea: ${idea.title}`,
    idea.sourceUrl ? `Source: ${idea.sourceUrl}` : "",
    idea.tags.length ? `Tags: ${idea.tags.join(", ")}` : "",
    entries,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type ClarifyingAnswer = {
  question: string;
  answer: string;
};

export function buildClarifyingQuestions(params: {
  idea: Idea;
  brand: Brand;
  channels: ChannelId[];
}): string[] {
  const seedText = buildIdeaSeedText(params.idea);
  const questions: string[] = [];

  if (seedText.length < 220) {
    questions.push("What is the central point this draft must make?");
  }

  if (!params.idea.sourceUrl) {
    questions.push("Is there a source, example, or prior post this draft should reference?");
  }

  if (params.channels.includes("reddit")) {
    questions.push("Which subreddit or reader context should shape the Reddit version?");
  }

  if (params.channels.includes("corvo-blog")) {
    questions.push("What concrete operator takeaway should the Corvo Blog version leave with the reader?");
  }

  if (!params.idea.tags.length && params.brand.id !== "personal") {
    questions.push(`Which ${params.brand.name} topic or audience should this be framed for?`);
  }

  return questions.slice(0, 3);
}

export function buildClarifyingContext(answers: ClarifyingAnswer[]): string {
  const lines = answers
    .map((item) => ({
      question: item.question.trim(),
      answer: item.answer.trim(),
    }))
    .filter((item) => item.question && item.answer)
    .map((item, index) => `Q${index + 1}: ${item.question}\nA${index + 1}: ${item.answer}`);

  return lines.join("\n\n");
}

export function buildCorvoBlogDraft(params: {
  idea: Idea;
  voicePackMarkdown: string;
  generatedDraft?: string;
  clarifyingContext?: string;
}): string {
  const seed = [buildIdeaSeedText(params.idea), params.clarifyingContext]
    .filter(Boolean)
    .join("\n\nClarifying context:\n");
  if (params.generatedDraft?.trim()) return params.generatedDraft.trim();

  return [
    "## The Evaluation Problem Hiding Inside Claim Validation",
    "",
    "Claim validation systems do not fail only because the model is weak. They fail because the team cannot see which claims were tested, which evidence was accepted, and which policy assumptions were quietly doing the work.",
    "",
    "Golden sets are the antidote to that fuzziness. A good golden set is not a vanity benchmark. It is a compact record of the claims the system must handle, the evidence it should trust, the edge cases it should reject, and the reviewer decisions that define acceptable behavior.",
    "",
    "For FreshProof-style validation, the useful split is simple:",
    "",
    "- extract claims without deciding whether they are true",
    "- evaluate evidence at the claim level",
    "- preserve reviewer-visible reasons for every pass, block, and uncertainty",
    "- run evals against the exact artifacts humans will inspect",
    "",
    "That last point matters. If the eval only checks the final label, it misses the actual failure mode. A claim can land on the right status for the wrong reason. Another can be blocked correctly but with evidence that would never survive editorial review. The workflow needs to expose both.",
    "",
    "The practical path is to treat evals as product infrastructure. The golden set becomes a standing contract. Every policy change, model change, and source-routing change has to prove it improves the system without hiding new regressions.",
    "",
    "That is slower than asking an LLM to judge everything in one pass. It is also the difference between a demo and a validation system you can keep improving.",
    "",
    "## Source Material",
    "",
    "```text",
    seed,
    "```",
    "",
    "## Voice Pack Used",
    "",
    "```text",
    params.voicePackMarkdown.slice(0, 1200),
    "```",
  ].join("\n");
}

export type VariantStatus = "pending" | "accepted" | "rejected";

export type DraftVariant = {
  id: string;
  ideaId: string;
  channelId: ChannelId;
  content: string;
  provider: string;
  status: VariantStatus;
  /** Set when status transitions to "accepted" */
  postId?: string;
};

export function buildLinkedInDraft(params: {
  idea: Idea;
  voicePackMarkdown: string;
  generatedDraft?: string;
  clarifyingContext?: string;
}): string {
  if (params.generatedDraft?.trim()) return params.generatedDraft.trim();

  const entry = params.idea.entries.at(-1)?.content ?? "";
  return [
    `${params.idea.title}`,
    "",
    entry.slice(0, 280),
    params.clarifyingContext ? `Context: ${params.clarifyingContext}` : "",
    "",
    "This is a placeholder LinkedIn draft. Configure PIONEER_API_KEY to generate with PioneerAI.",
    "",
    `Tags: ${params.idea.tags.join(" ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildGenericChannelDraft(params: {
  idea: Idea;
  channelId: ChannelId;
  voicePackMarkdown: string;
  generatedDraft?: string;
  clarifyingContext?: string;
}): string {
  if (params.generatedDraft?.trim()) return params.generatedDraft.trim();

  const label = CHANNEL_LABELS[params.channelId];
  const entry = params.idea.entries.at(-1)?.content ?? "";
  return [
    `[${label} draft] ${params.idea.title}`,
    "",
    entry.slice(0, 500),
    params.clarifyingContext ? `Context: ${params.clarifyingContext}` : "",
    "",
    `This is a placeholder ${label} draft. Configure PIONEER_API_KEY to generate with PioneerAI.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildFallbackDraft(params: {
  idea: Idea;
  channelId: ChannelId;
  voicePackMarkdown: string;
  generatedDraft?: string;
  clarifyingContext?: string;
}): string {
  switch (params.channelId) {
    case "corvo-blog":
      return buildCorvoBlogDraft({
        idea: params.idea,
        voicePackMarkdown: params.voicePackMarkdown,
        generatedDraft: params.generatedDraft,
        clarifyingContext: params.clarifyingContext,
      });
    case "linkedin":
      return buildLinkedInDraft({
        idea: params.idea,
        voicePackMarkdown: params.voicePackMarkdown,
        generatedDraft: params.generatedDraft,
        clarifyingContext: params.clarifyingContext,
      });
    default:
      return buildGenericChannelDraft({
        idea: params.idea,
        channelId: params.channelId,
        voicePackMarkdown: params.voicePackMarkdown,
        generatedDraft: params.generatedDraft,
        clarifyingContext: params.clarifyingContext,
      });
  }
}

/** Severity classification for inbox/draft-management gap analysis (issue #51). */
export type GapSeverity = "blocker" | "v1.1" | "later" | "acceptable";

/**
 * Filter the workspace post list for the drafts view.
 * When allBrands is true, all brands are shown together (cross-brand view).
 * An optional statusFilter narrows to one status.
 */
export function filterPostsForView(
  posts: Post[],
  activeBrandId: BrandId,
  allBrands: boolean,
  statusFilter?: Post["status"]
): Post[] {
  let result = allBrands ? posts : posts.filter((p) => p.brandId === activeBrandId);
  if (statusFilter) result = result.filter((p) => p.status === statusFilter);
  return result;
}

export function findChannel(
  brandId: BrandId,
  channelId: ChannelId
): Channel | undefined {
  return CHANNELS.find(
    (channel) => channel.brandId === brandId && channel.id === channelId
  );
}

export function getBrowserTimezone(fallback = "America/Los_Angeles"): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
  } catch {
    return fallback;
  }
}

export function fingerprintPostContent(post: Pick<Post, "title" | "content">): string {
  return `${post.title.trim()}\n${post.content.trim()}`;
}

export function createPublishingIntent(
  post: Post,
  options: {
    scheduledDate?: string;
    scheduledTime?: string;
    timezone?: string;
    approvalState?: ApprovalState;
    researchBriefId?: string;
  } = {}
): PublishingIntent {
  const channel = findChannel(post.brandId, post.channelId);
  const now = new Date().toISOString();
  return {
    id: makeId("intent"),
    postId: post.id,
    brandId: post.brandId,
    channelId: post.channelId,
    platformId: channel?.platformId ?? post.channelId,
    scheduledDate: options.scheduledDate ?? post.scheduledDate,
    scheduledTime: options.scheduledTime ?? post.scheduledTime,
    timezone: options.timezone ?? post.timezone ?? "America/Los_Angeles",
    approvalState: options.approvalState ?? post.approvalState ?? "unapproved",
    sourceIdeaId: post.ideaId,
    sourceResearchBriefId: options.researchBriefId,
    contentFingerprint: fingerprintPostContent(post),
    createdAt: now,
    updatedAt: now,
  };
}

export function applyContentChange(
  post: Post,
  changes: Pick<Partial<Post>, "title" | "content">
): Post {
  const next = {
    ...post,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  const contentChanged =
    (changes.title !== undefined && changes.title !== post.title) ||
    (changes.content !== undefined && changes.content !== post.content);

  return contentChanged
    ? { ...next, approvalState: "unapproved", status: "draft" }
    : next;
}

export function reschedulePost(
  post: Post,
  schedule: { scheduledDate: string; scheduledTime?: string; timezone?: string }
): Post {
  return {
    ...post,
    scheduledDate: schedule.scheduledDate,
    scheduledTime: schedule.scheduledTime ?? post.scheduledTime,
    timezone: schedule.timezone ?? post.timezone ?? "America/Los_Angeles",
    status: post.approvalState === "approved" ? "scheduled" : post.status,
    updatedAt: new Date().toISOString(),
  };
}

export function isEligibleForProviderSubmission(params: {
  post: Post;
  intent: PublishingIntent;
  channel?: Channel;
}): { eligible: boolean; reason?: string } {
  const channel =
    params.channel ?? findChannel(params.intent.brandId, params.intent.channelId);
  if (!channel?.routable || !channel.providerId) {
    return { eligible: false, reason: "Channel is not routable." };
  }
  if (params.intent.approvalState !== "approved") {
    return { eligible: false, reason: "Post is not approved." };
  }
  if (!params.intent.scheduledDate) {
    return { eligible: false, reason: "Scheduled date is required." };
  }
  if (params.intent.contentFingerprint !== fingerprintPostContent(params.post)) {
    return { eligible: false, reason: "Content changed after approval." };
  }
  return { eligible: true };
}

function sanitizeProviderResponse(response: Record<string, unknown>) {
  const blocked = /token|secret|key|authorization|cookie/i;
  return Object.fromEntries(
    Object.entries(response).map(([key, value]) => [
      key,
      blocked.test(key) ? "[redacted]" : value,
    ])
  );
}

export type MockProviderMode =
  | "success"
  | "retryable-failure"
  | "permanent-failure"
  | "ambiguous"
  | "published"
  | "unavailable";

export function submitWithMockProvider(params: {
  post: Post;
  intent: PublishingIntent;
  mode?: MockProviderMode;
  previousAttempts?: PublishAttempt[];
  retry?: boolean;
}): {
  post: Post;
  attempt?: PublishAttempt;
  providerState: ProviderState;
  skippedReason?: string;
} {
  const channel = findChannel(params.intent.brandId, params.intent.channelId);
  const eligibility = isEligibleForProviderSubmission({
    post: params.post,
    intent: params.intent,
    channel,
  });
  const now = new Date().toISOString();

  if (!eligibility.eligible) {
    return {
      post: params.post,
      providerState: {
        providerId: "mock",
        status: "not-submitted",
        lastResponseSummary: eligibility.reason,
        updatedAt: now,
      },
      skippedReason: eligibility.reason,
    };
  }

  const baseIdempotencyKey = `${params.intent.id}:${params.intent.contentFingerprint}`;
  const duplicate = params.previousAttempts?.find(
    (attempt) => attempt.idempotencyKey === baseIdempotencyKey
  );
  const latestAttempt = [...(params.previousAttempts ?? [])].sort((a, b) =>
    b.attemptedAt.localeCompare(a.attemptedAt)
  )[0];
  if (duplicate) {
    const retryable =
      params.retry &&
      (latestAttempt?.status === "retryable-failure" ||
        latestAttempt?.status === "ambiguous");
    if (!retryable) {
      return {
        post: params.post,
        providerState: {
          providerId: "mock",
          status: "submitted",
          lastAttemptId: duplicate.id,
          lastResponseSummary: params.retry
            ? "Previous attempt is not retryable."
            : "Duplicate submission prevented.",
          updatedAt: now,
        },
        skippedReason: params.retry
          ? "Previous attempt is not retryable."
          : "Duplicate submission prevented.",
      };
    }
  }

  if (params.retry && !duplicate) {
    return {
      post: params.post,
      providerState: {
        providerId: "mock",
        status: "not-submitted",
        lastResponseSummary: "No previous attempt exists to retry.",
        updatedAt: now,
      },
      skippedReason: "No previous attempt exists to retry.",
    };
  }

  const mode = params.mode ?? "success";
  const retryCount = params.previousAttempts?.length ?? 0;
  const idempotencyKey = params.retry
    ? `${baseIdempotencyKey}:retry:${retryCount}`
    : baseIdempotencyKey;
  const status: ProviderAttemptStatus =
    mode === "published"
      ? "success"
      : mode === "success"
        ? "success"
        : mode;

  const attempt: PublishAttempt = {
    id: makeId("attempt"),
    intentId: params.intent.id,
    providerId: "mock",
    status,
    attemptedAt: now,
    idempotencyKey,
    submissionSnapshot: {
      postId: params.post.id,
      brandId: params.post.brandId,
      channelId: params.post.channelId,
      title: params.post.title,
      content: params.post.content,
      scheduledDate: params.intent.scheduledDate,
      scheduledTime: params.intent.scheduledTime,
      timezone: params.intent.timezone,
    },
    sanitizedResponse: sanitizeProviderResponse({
      mode,
      providerPostId: `mock-${params.post.id}`,
      accessToken: "should-not-persist",
    }),
    retryCount,
  };

  const stateStatus: ProviderStateStatus =
    mode === "published"
      ? "published"
      : mode === "success"
        ? "submitted"
        : mode === "ambiguous"
          ? "needs-review"
          : mode === "unavailable"
            ? "unavailable"
            : "failed";

  const providerState: ProviderState = {
    providerId: "mock",
    status: stateStatus,
    providerPostId: stateStatus === "submitted" || stateStatus === "published"
      ? `mock-${params.post.id}`
      : undefined,
    lastAttemptId: attempt.id,
    lastResponseSummary:
      mode === "ambiguous"
        ? "Mock provider returned an ambiguous outcome."
        : `Mock provider result: ${mode}.`,
    updatedAt: now,
  };

  return {
    post: {
      ...params.post,
      status:
        stateStatus === "published"
          ? "published"
          : stateStatus === "needs-review"
            ? "needs-review"
            : stateStatus === "unavailable"
              ? "unavailable"
              : stateStatus === "failed"
                ? "failed"
                : "submitted",
      providerState,
      publishAttempts: [...(params.previousAttempts ?? []), attempt],
      updatedAt: now,
    },
    attempt,
    providerState,
  };
}

// ─── Research / Editorial Pipeline Types (issue #52) ────────────────────────

export type EvidenceLabel =
  | "rct-meta-analysis"   // Randomized controlled trial or meta-analysis
  | "mechanism"           // Mechanistic or basic-science evidence
  | "expert-practice"     // Expert opinion or established clinical/field practice
  | "practice-principle"  // Documented field or clinical practice principle
  | "primary-source"      // Direct primary source (trial data, regulatory filing, etc.)
  | "weaker-support";     // Anecdote, opinion piece, or low-quality evidence

export const EVIDENCE_LABELS: EvidenceLabel[] = [
  "rct-meta-analysis",
  "mechanism",
  "expert-practice",
  "practice-principle",
  "primary-source",
  "weaker-support",
];

export const EVIDENCE_LABEL_DESCRIPTIONS: Record<EvidenceLabel, string> = {
  "rct-meta-analysis":
    "Randomized controlled trial or published meta-analysis. Highest confidence for causal claims.",
  mechanism:
    "Mechanistic or basic-science evidence explaining biological/physiological pathways.",
  "expert-practice":
    "Expert opinion, consensus statement, or established professional practice.",
  "practice-principle":
    "Documented field or clinical practice principle derived from accumulated experience.",
  "primary-source":
    "Direct primary source: original trial data, regulatory filing, official dataset, or primary document.",
  "weaker-support":
    "Anecdote, single case report, opinion piece, or low-quality observational evidence. Use to illustrate, not to prove.",
};

export type SourceQualityRating = "strong" | "moderate" | "weak";

/**
 * Classify a source's overall quality rating from its evidence label and relevance score.
 * This is a deterministic rubric — human review is still required before any source is accepted.
 */
export function classifySourceQuality(
  evidenceLabel: EvidenceLabel,
  relevanceScore: 1 | 2 | 3 | 4 | 5
): SourceQualityRating {
  if (relevanceScore <= 1 || evidenceLabel === "weaker-support") return "weak";
  if (
    evidenceLabel === "rct-meta-analysis" ||
    (evidenceLabel === "primary-source" && relevanceScore >= 4)
  )
    return "strong";
  if (
    evidenceLabel === "mechanism" ||
    evidenceLabel === "expert-practice" ||
    evidenceLabel === "practice-principle" ||
    evidenceLabel === "primary-source"
  )
    return "moderate";
  return "weak";
}

export type SourceStatus = "unvetted" | "accepted" | "flagged" | "rejected";

export type SourceRecord = {
  id: string;
  url: string;
  title: string;
  domain: string;
  authors?: string[];
  publishedYear?: number;
  evidenceLabel: EvidenceLabel;
  qualityRating: SourceQualityRating;
  relevanceScore: 1 | 2 | 3 | 4 | 5;
  conflicts?: string;
  limitations?: string;
  useCase: string;
  addedBy: "user" | "agent";
  status: SourceStatus;
  reviewerNotes?: string;
};

type MakeSourceRecordInput = {
  url: string;
  title: string;
  evidenceLabel: EvidenceLabel;
  relevanceScore: 1 | 2 | 3 | 4 | 5;
  useCase: string;
  authors?: string[];
  publishedYear?: number;
  conflicts?: string;
  limitations?: string;
  addedBy?: "user" | "agent";
  reviewerNotes?: string;
  domain?: string;
};

export function makeSourceRecord(input: MakeSourceRecordInput): SourceRecord {
  let domain = input.domain ?? "";
  if (!domain) {
    try {
      domain = new URL(input.url).hostname;
    } catch {
      domain = input.url;
    }
  }
  return {
    id: makeId("src"),
    url: input.url,
    title: input.title,
    domain,
    authors: input.authors,
    publishedYear: input.publishedYear,
    evidenceLabel: input.evidenceLabel,
    qualityRating: classifySourceQuality(input.evidenceLabel, input.relevanceScore),
    relevanceScore: input.relevanceScore,
    conflicts: input.conflicts,
    limitations: input.limitations,
    useCase: input.useCase,
    addedBy: input.addedBy ?? "agent",
    status: "unvetted",
    reviewerNotes: input.reviewerNotes,
  };
}

export type ResearchDepth = "light" | "standard" | "rigorous";
export type ResearchRiskLevel = "low" | "medium" | "high";
export type ResearchStatus =
  | "drafting"
  | "source-discovery"
  | "source-review"
  | "outline-ready";

export type ResearchBrief = {
  id: string;
  brandId: BrandId;
  topic: string;
  audience: string;
  thesis: string;
  depth: ResearchDepth;
  riskLevel: ResearchRiskLevel;
  targetOutputs: string[];
  sources: SourceRecord[];
  status: ResearchStatus;
  createdAt: string;
  updatedAt: string;
};

type MakeResearchBriefInput = Omit<ResearchBrief, "id" | "sources" | "status" | "createdAt" | "updatedAt">;

export function makeResearchBrief(input: MakeResearchBriefInput): ResearchBrief {
  const now = new Date().toISOString();
  return {
    id: makeId("brief"),
    ...input,
    sources: [],
    status: "drafting",
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Claim Map Types (issue #53) ────────────────────────────────────────────

export type ClaimStatus =
  | "unreviewed"
  | "accepted"
  | "needs-revision"
  | "unsupported"
  | "too-risky"
  | "out-of-scope";

export const CLAIM_STATUSES: ClaimStatus[] = [
  "unreviewed",
  "accepted",
  "needs-revision",
  "unsupported",
  "too-risky",
  "out-of-scope",
];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  unreviewed: "Unreviewed",
  accepted: "Accepted",
  "needs-revision": "Needs Revision",
  unsupported: "Unsupported",
  "too-risky": "Too Risky",
  "out-of-scope": "Out of Scope",
};

export type ClaimConfidence = "high" | "medium" | "low";

export type Claim = {
  id: string;
  text: string;
  sourceIds: string[];
  evidenceLabel: EvidenceLabel;
  confidence: ClaimConfidence;
  caveats?: string;
  reviewerNotes?: string;
  status: ClaimStatus;
};

export type ClaimMapStatus = "building" | "review-ready" | "reviewed";

export type ClaimMap = {
  id: string;
  brandId: BrandId;
  topic: string;
  thesis: string;
  claims: Claim[];
  status: ClaimMapStatus;
  createdAt: string;
  updatedAt: string;
};

type MakeClaimInput = {
  text: string;
  sourceIds: string[];
  evidenceLabel: EvidenceLabel;
  confidence: ClaimConfidence;
  caveats?: string;
  reviewerNotes?: string;
  status?: ClaimStatus;
};

export function makeClaim(input: MakeClaimInput): Claim {
  return {
    id: makeId("claim"),
    status: input.status ?? "unreviewed",
    text: input.text,
    sourceIds: input.sourceIds,
    evidenceLabel: input.evidenceLabel,
    confidence: input.confidence,
    caveats: input.caveats,
    reviewerNotes: input.reviewerNotes,
  };
}

type MakeClaimMapInput = {
  brandId: BrandId;
  topic: string;
  thesis: string;
};

export function makeClaimMap(input: MakeClaimMapInput): ClaimMap {
  const now = new Date().toISOString();
  return {
    id: makeId("cmap"),
    brandId: input.brandId,
    topic: input.topic,
    thesis: input.thesis,
    claims: [],
    status: "building",
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Editorial Outline + Long-Form Draft Types (issue #54) ──────────────────

export type OutlineStatus = "draft" | "approved" | "generating-draft";

export type OutlineSection = {
  heading: string;
  notes: string;
  claimIds: string[];
  evidenceLabels: EvidenceLabel[];
};

export type TakeawayRow = {
  finding: string;
  evidenceLabel: EvidenceLabel;
  source: string;
};

export type EditorialOutline = {
  id: string;
  claimMapId: string;
  brandId: BrandId;
  thesis: string;
  sections: OutlineSection[];
  takeawayTable: TakeawayRow[];
  citationPlan: string;
  status: OutlineStatus;
  createdAt: string;
  updatedAt: string;
};

export function makeOutlineSection(input: OutlineSection): OutlineSection {
  return { ...input };
}

export function makeTakeawayRow(input: TakeawayRow): TakeawayRow {
  return { ...input };
}

type MakeEditorialOutlineInput = Omit<EditorialOutline, "id" | "status" | "createdAt" | "updatedAt">;

export function makeEditorialOutline(input: MakeEditorialOutlineInput): EditorialOutline {
  const now = new Date().toISOString();
  return {
    id: makeId("outline"),
    ...input,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Seed research brief for FreshProof spike (issue #52) ───────────────────

export const FRESHPROOF_SEED_BRIEF: Omit<ResearchBrief, "id" | "createdAt" | "updatedAt"> = {
  brandId: "freshproof",
  topic: "GLP-1 drug discontinuation and patient weight regain",
  audience:
    "Healthcare providers managing patients on GLP-1 receptor agonists and informed patients considering discontinuation",
  thesis:
    "Weight regain after GLP-1 discontinuation is predictable, substantial, and manageable — but only with structured tapering, lifestyle continuity, and realistic patient expectations.",
  depth: "rigorous",
  riskLevel: "high",
  targetOutputs: ["long-form blog post", "linkedin post", "reddit post"],
  sources: [],
  status: "drafting",
};

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

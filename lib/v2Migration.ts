import type { BrandId, ChannelId, PostStatus } from "@/lib/domain";

type LegacyPostType = "blog" | "linkedin";
type LegacyPostStatus = "draft" | "scheduled" | "published";

export type LegacyPostExport = {
  _id?: string;
  type: LegacyPostType;
  title?: string;
  content: string;
  status: LegacyPostStatus;
  scheduledDate?: string;
  scheduledTime?: string;
  externalUrl?: string;
  githubPrUrl?: string;
  publishedAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type LegacySettingsExport = {
  blogEnabled?: boolean;
  blogFrequency?: string;
  linkedinEnabled?: boolean;
  linkedinFrequency?: string;
};

export type LegacyCapturedIdeaExport = {
  _id?: string;
  userId?: string;
  status?: string;
  tags?: string[];
  sourceUrl?: string;
  sourceTitle?: string;
  latestEntryPreview?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type LegacyCapturedIdeaEntryExport = {
  _id?: string;
  ideaId?: string;
  content: string;
  captureChannel?: string;
  createdAt?: number;
};

export type LegacyCapturedIdeaPostLinkExport = {
  _id?: string;
  ideaId?: string;
  postId?: string;
  userId?: string;
  createdAt?: number;
};

export type LegacyWorkflowIdeaExport = {
  _id?: string;
  userId?: string;
  title?: string;
  text: string;
  status?: "backlog" | "idea" | "research" | "archived" | string;
  researchObjective?: string;
  researchNotes?: string;
  references?: Array<{
    url: string;
    title?: string;
    kind?: string;
    addedBy?: string;
  }>;
  createdAt?: number;
  updatedAt?: number;
};

export type LegacyWorkflowDraftExport = {
  _id?: string;
  ideaId?: string;
  postId?: string;
  type?: LegacyPostType;
  stage?: string;
  title?: string;
  stageNotes?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type LegacyConvexExport = {
  posts?: LegacyPostExport[];
  capturedIdeas?: LegacyCapturedIdeaExport[];
  capturedIdeaEntries?: LegacyCapturedIdeaEntryExport[];
  capturedIdeaPostLinks?: LegacyCapturedIdeaPostLinkExport[];
  ideas?: LegacyWorkflowIdeaExport[];
  workflowDrafts?: LegacyWorkflowDraftExport[];
  settings?: LegacySettingsExport[];
};

export type V2MigrationPostCandidate = {
  legacyPostId?: string;
  brandId: BrandId;
  channelId: ChannelId;
  title: string;
  content: string;
  status: PostStatus;
  approvalState: "unapproved" | "approved";
  scheduledDate?: string;
  scheduledTime?: string;
  timezone: string;
  externalUrl?: string;
  prUrl?: string;
  providerState: "none" | "external-url" | "github-pr" | "ambiguous";
  sourceLegacyCapturedIdeaId?: string;
  sourceLegacyWorkflowIdeaId?: string;
  sourceLegacyWorkflowDraftId?: string;
  editableInSingleComposer: boolean;
  sourceLegacyTable: "posts";
};

export type V2MigrationIdeaCandidate = {
  legacyIdeaId?: string;
  brandId: BrandId;
  title?: string;
  text: string;
  tags: string[];
  sourceUrl?: string;
  status: "inbox" | "reviewing" | "ready" | "used" | "archived";
  entryCount: number;
  linkedLegacyPostIds: string[];
  sourceLegacyWorkflowIdeaId?: string;
  sourceLegacyTable: "capturedIdeas";
};

export type V2MigrationDryRunPlan = {
  generatedAt: string;
  mode: "dry-run";
  summary: {
    rawRecords: number;
    archivedPosts: number;
    archivedIdeas: number;
    archivedIdeaEntries: number;
    archivedIdeaPostLinks: number;
    archivedWorkflowIdeas: number;
    archivedWorkflowDrafts: number;
    archivedSettings: number;
    v2PostCandidates: number;
    v2IdeaCandidates: number;
    imported: number;
    skipped: number;
    ambiguous: number;
    failed: number;
    warnings: number;
  };
  archive: {
    posts: LegacyPostExport[];
    capturedIdeas: LegacyCapturedIdeaExport[];
    capturedIdeaEntries: LegacyCapturedIdeaEntryExport[];
    capturedIdeaPostLinks: LegacyCapturedIdeaPostLinkExport[];
    ideas: LegacyWorkflowIdeaExport[];
    workflowDrafts: LegacyWorkflowDraftExport[];
    settings: LegacySettingsExport[];
  };
  v2Candidates: {
    posts: V2MigrationPostCandidate[];
    ideas: V2MigrationIdeaCandidate[];
  };
  records: {
    imported: string[];
    skipped: string[];
    ambiguous: string[];
    failed: string[];
  };
  warnings: string[];
};

export function buildV2MigrationDryRunPlan(
  input: LegacyConvexExport,
  options: { defaultBrandId?: BrandId; timezone?: string; now?: string } = {}
): V2MigrationDryRunPlan {
  const defaultBrandId = options.defaultBrandId ?? "corvo";
  const timezone = options.timezone ?? "America/Los_Angeles";
  const posts = Array.isArray(input.posts) ? input.posts : [];
  const capturedIdeas = Array.isArray(input.capturedIdeas) ? input.capturedIdeas : [];
  const capturedIdeaEntries = Array.isArray(input.capturedIdeaEntries)
    ? input.capturedIdeaEntries
    : [];
  const capturedIdeaPostLinks = Array.isArray(input.capturedIdeaPostLinks)
    ? input.capturedIdeaPostLinks
    : [];
  const workflowIdeas = Array.isArray(input.ideas) ? input.ideas : [];
  const workflowDrafts = Array.isArray(input.workflowDrafts) ? input.workflowDrafts : [];
  const settings = Array.isArray(input.settings) ? input.settings : [];
  const warnings: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  const capturedLinksByPostId = capturedIdeaPostLinks.reduce<Record<string, LegacyCapturedIdeaPostLinkExport[]>>(
    (acc, link) => {
      if (!link.postId || !link.ideaId) {
        warnings.push("Skipped captured idea post link without postId or ideaId.");
        skipped.push(`capturedIdeaPostLinks:${link._id ?? "(missing id)"}`);
        return acc;
      }
      acc[link.postId] = [...(acc[link.postId] ?? []), link];
      return acc;
    },
    {}
  );
  const workflowDraftByPostId = workflowDrafts.reduce<Record<string, LegacyWorkflowDraftExport>>(
    (acc, draft) => {
      if (draft.postId) acc[draft.postId] = draft;
      return acc;
    },
    {}
  );

  const v2PostCandidates = posts.flatMap((post) => {
    try {
      return [
        mapLegacyPost(post, defaultBrandId, timezone, {
          capturedLinks: capturedLinksByPostId[post._id ?? ""] ?? [],
          workflowDraft: workflowDraftByPostId[post._id ?? ""],
        }),
      ];
    } catch (error) {
      warnings.push(
        `Skipped post ${post._id ?? "(missing id)"}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      skipped.push(`posts:${post._id ?? "(missing id)"}`);
      return [];
    }
  });

  const entriesByIdeaId = capturedIdeaEntries.reduce<Record<string, LegacyCapturedIdeaEntryExport[]>>(
    (acc, entry) => {
      if (!entry.ideaId) {
        warnings.push("Skipped captured idea entry without ideaId.");
        skipped.push(`capturedIdeaEntries:${entry._id ?? "(missing id)"}`);
        return acc;
      }
      acc[entry.ideaId] = [...(acc[entry.ideaId] ?? []), entry];
      return acc;
    },
    {}
  );
  const v2IdeaCandidates = capturedIdeas.flatMap((idea) => {
    try {
      return [
        mapCapturedIdea(
          idea,
          entriesByIdeaId[idea._id ?? ""] ?? [],
          capturedIdeaPostLinks.filter((link) => link.ideaId === idea._id),
          defaultBrandId
        ),
      ];
    } catch (error) {
      warnings.push(
        `Skipped captured idea ${idea._id ?? "(missing id)"}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      skipped.push(`capturedIdeas:${idea._id ?? "(missing id)"}`);
      return [];
    }
  });
  const v2MergedWorkflowIdeaCandidates = workflowIdeas.flatMap((idea) => {
    try {
      return [
        mergeWorkflowIdeaIntoCapturedCandidate(
          idea,
          workflowDrafts.filter((draft) => draft.ideaId === idea._id),
          defaultBrandId
        ),
      ];
    } catch (error) {
      warnings.push(
        `Skipped workflow idea ${idea._id ?? "(missing id)"}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      skipped.push(`ideas:${idea._id ?? "(missing id)"}`);
      return [];
    }
  });
  const allIdeaCandidates = [...v2IdeaCandidates, ...v2MergedWorkflowIdeaCandidates];
  const ambiguous = v2PostCandidates
    .filter((post) => post.providerState === "ambiguous")
    .map((post) => `posts:${post.legacyPostId ?? "(missing id)"}`);
  const imported = [
    ...v2PostCandidates.map((post) => `posts:${post.legacyPostId ?? "(missing id)"}`),
    ...allIdeaCandidates.map(
      (idea) =>
        `capturedIdeas:${idea.sourceLegacyWorkflowIdeaId ?? idea.legacyIdeaId ?? "(missing id)"}`
    ),
  ];

  return {
    generatedAt: options.now ?? new Date().toISOString(),
    mode: "dry-run",
    summary: {
      rawRecords:
        posts.length +
        capturedIdeas.length +
        capturedIdeaEntries.length +
        capturedIdeaPostLinks.length +
        workflowIdeas.length +
        workflowDrafts.length +
        settings.length,
      archivedPosts: posts.length,
      archivedIdeas: capturedIdeas.length,
      archivedIdeaEntries: capturedIdeaEntries.length,
      archivedIdeaPostLinks: capturedIdeaPostLinks.length,
      archivedWorkflowIdeas: workflowIdeas.length,
      archivedWorkflowDrafts: workflowDrafts.length,
      archivedSettings: settings.length,
      v2PostCandidates: v2PostCandidates.length,
      v2IdeaCandidates: allIdeaCandidates.length,
      imported: imported.length,
      skipped: skipped.length,
      ambiguous: ambiguous.length,
      failed: failed.length,
      warnings: warnings.length,
    },
    archive: {
      posts,
      capturedIdeas,
      capturedIdeaEntries,
      capturedIdeaPostLinks,
      ideas: workflowIdeas,
      workflowDrafts,
      settings,
    },
    v2Candidates: {
      posts: v2PostCandidates,
      ideas: allIdeaCandidates,
    },
    records: {
      imported,
      skipped,
      ambiguous,
      failed,
    },
    warnings,
  };
}

function mapLegacyPost(
  post: LegacyPostExport,
  brandId: BrandId,
  timezone: string,
  links: {
    capturedLinks: LegacyCapturedIdeaPostLinkExport[];
    workflowDraft?: LegacyWorkflowDraftExport;
  }
): V2MigrationPostCandidate {
  if (post.type !== "blog" && post.type !== "linkedin") {
    throw new Error("unsupported post type");
  }
  if (!post.content?.trim()) {
    throw new Error("missing content");
  }

  const channelId: ChannelId = post.type === "blog" ? "corvo-blog" : "linkedin";
  return {
    legacyPostId: post._id,
    brandId,
    channelId,
    title: post.title?.trim() || fallbackTitle(post),
    content: post.content.trim(),
    status: mapLegacyStatus(post.status),
    approvalState: post.status === "published" ? "approved" : "unapproved",
    scheduledDate: post.scheduledDate,
    scheduledTime: post.scheduledTime,
    timezone,
    externalUrl: post.externalUrl,
    prUrl: post.githubPrUrl,
    providerState: providerStateForPost(post),
    sourceLegacyCapturedIdeaId: links.capturedLinks[0]?.ideaId,
    sourceLegacyWorkflowIdeaId: links.workflowDraft?.ideaId,
    sourceLegacyWorkflowDraftId: links.workflowDraft?._id,
    editableInSingleComposer: true,
    sourceLegacyTable: "posts",
  };
}

function mapCapturedIdea(
  idea: LegacyCapturedIdeaExport,
  entries: LegacyCapturedIdeaEntryExport[],
  postLinks: LegacyCapturedIdeaPostLinkExport[],
  brandId: BrandId
): V2MigrationIdeaCandidate {
  const text = entries
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
    .map((entry) => entry.content.trim())
    .filter(Boolean)
    .join("\n\n");
  const fallback = idea.latestEntryPreview?.trim();

  if (!text && !fallback) {
    throw new Error("missing idea text");
  }

  return {
    legacyIdeaId: idea._id,
    brandId,
    title: idea.sourceTitle?.trim() || undefined,
    text: text || fallback || "",
    tags: Array.isArray(idea.tags) ? idea.tags.filter(Boolean) : [],
    sourceUrl: idea.sourceUrl,
    status: mapIdeaStatus(idea.status),
    entryCount: entries.length,
    linkedLegacyPostIds: postLinks.map((link) => link.postId).filter(Boolean) as string[],
    sourceLegacyTable: "capturedIdeas",
  };
}

function mergeWorkflowIdeaIntoCapturedCandidate(
  idea: LegacyWorkflowIdeaExport,
  drafts: LegacyWorkflowDraftExport[],
  brandId: BrandId
): V2MigrationIdeaCandidate {
  const body = [idea.text, idea.researchObjective, idea.researchNotes]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!body) {
    throw new Error("missing workflow idea text");
  }

  return {
    legacyIdeaId: idea._id,
    brandId,
    title: idea.title?.trim() || undefined,
    text: body,
    tags: [],
    sourceUrl: idea.references?.find((reference) => reference.url)?.url,
    status: mapWorkflowIdeaStatus(idea.status),
    entryCount: 1,
    linkedLegacyPostIds: drafts.map((draft) => draft.postId).filter(Boolean) as string[],
    sourceLegacyWorkflowIdeaId: idea._id,
    sourceLegacyTable: "capturedIdeas",
  };
}

function mapLegacyStatus(status: LegacyPostStatus): PostStatus {
  if (status === "published") return "published";
  if (status === "scheduled") return "scheduled";
  return "draft";
}

function mapIdeaStatus(status: string | undefined): V2MigrationIdeaCandidate["status"] {
  if (
    status === "inbox" ||
    status === "reviewing" ||
    status === "ready" ||
    status === "used" ||
    status === "archived"
  ) {
    return status;
  }
  return "inbox";
}

function mapWorkflowIdeaStatus(status: string | undefined): V2MigrationIdeaCandidate["status"] {
  if (status === "archived") return "archived";
  if (status === "research") return "ready";
  if (status === "idea") return "reviewing";
  return "inbox";
}

function providerStateForPost(post: LegacyPostExport): V2MigrationPostCandidate["providerState"] {
  if (post.githubPrUrl) return "github-pr";
  if (post.externalUrl) return "external-url";
  if (post.status === "published") return "ambiguous";
  return "none";
}

function fallbackTitle(post: LegacyPostExport): string {
  if (post.type === "blog") return "Untitled blog import";
  return post.content.trim().slice(0, 80);
}

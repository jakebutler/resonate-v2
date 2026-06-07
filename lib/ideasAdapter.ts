import type { Id } from "@/convex/_generated/dataModel";
import type {
  BrandId,
  ChannelId,
  DraftVariant,
  Idea,
  IdeaStatus,
  Post,
  PostStatus,
} from "@/lib/domain";

export type CapturedIdeaSummary = {
  _id: Id<"capturedIdeas">;
  brandId?: BrandId;
  sourceTitle?: string;
  latestEntryPreview: string;
  sourceUrl?: string;
  normalizedSourceUrl?: string;
  tags: string[];
  status: string;
  lastCapturedAt: number;
  updatedAt: number;
};

export function capturedIdeaTitle(idea: {
  sourceTitle?: string;
  latestEntryPreview: string;
}) {
  return idea.sourceTitle?.trim() || idea.latestEntryPreview;
}

export function ideaDetailToIdea(
  detail: {
    _id: Id<"capturedIdeas">;
    brandId?: BrandId;
    sourceTitle?: string;
    sourceUrl?: string;
    normalizedSourceUrl?: string;
    tags: string[];
    status: string;
    latestEntryPreview: string;
    createdAt: number;
    updatedAt: number;
    entries: Array<{ _id: Id<"capturedIdeaEntries">; content: string; createdAt: number }>;
    postLinks: Array<{ post: { _id: Id<"v2Posts"> } }>;
  },
  fallbackBrandId: BrandId
): Idea {
  return {
    id: String(detail._id),
    brandId: detail.brandId ?? fallbackBrandId,
    title: capturedIdeaTitle(detail),
    sourceUrl: detail.sourceUrl,
    normalizedSourceUrl: detail.normalizedSourceUrl,
    tags: detail.tags,
    status: detail.status as IdeaStatus,
    entries: detail.entries.map((entry) => ({
      id: String(entry._id),
      content: entry.content,
      createdAt: new Date(entry.createdAt).toISOString(),
    })),
    linkedPostIds: detail.postLinks.map((link) => String(link.post._id)),
    createdAt: new Date(detail.createdAt).toISOString(),
    updatedAt: new Date(detail.updatedAt).toISOString(),
  };
}

export function convexPostToPost(post: {
  _id: Id<"v2Posts">;
  brandId: BrandId;
  channelId: ChannelId;
  sourceIdeaId?: string;
  title: string;
  content: string;
  status: PostStatus;
  scheduledDate?: string;
  scheduledTime?: string;
  timezone?: string;
  approvalState?: Post["approvalState"];
  prUrl?: string;
  branchName?: string;
  createdAt: number;
  updatedAt: number;
}): Post {
  return {
    id: String(post._id),
    brandId: post.brandId,
    channelId: post.channelId,
    ideaId: post.sourceIdeaId,
    title: post.title,
    content: post.content,
    status: post.status,
    scheduledDate: post.scheduledDate,
    scheduledTime: post.scheduledTime,
    timezone: post.timezone,
    approvalState: post.approvalState,
    prUrl: post.prUrl,
    branchName: post.branchName,
    createdAt: new Date(post.createdAt).toISOString(),
    updatedAt: new Date(post.updatedAt).toISOString(),
  };
}

export function variantsFromIdeaDetail(
  detail: {
    postLinks: Array<{
      post: {
        _id: Id<"v2Posts">;
        channelId: ChannelId;
        content: string;
        variantReviewStatus?: "pending" | "accepted" | "rejected";
      };
    }>;
  } | null | undefined,
  ideaId: Id<"capturedIdeas">
): DraftVariant[] {
  if (!detail) return [];

  return detail.postLinks
    .filter((item) => item.post.variantReviewStatus)
    .map((item) => ({
      id: String(item.post._id),
      ideaId: String(ideaId),
      channelId: item.post.channelId,
      content: item.post.content,
      provider: "convex",
      status:
        item.post.variantReviewStatus === "accepted"
          ? "accepted"
          : item.post.variantReviewStatus === "rejected"
            ? "rejected"
            : "pending",
      postId: String(item.post._id),
    }));
}

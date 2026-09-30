type ReviewedPost = {
  title: string; content: string; linkedinFirstComment?: string;
  blogExcerpt?: string; blogAuthor?: string; blogCategory?: string; blogTags?: string[]; blogSlug?: string;
  heroImageUrl?: string; heroImageStorageId?: string;
};
export const approvalArticleSignature = (post: ReviewedPost) => JSON.stringify({ title: post.title, content: post.content, linkedinFirstComment: post.linkedinFirstComment ?? "" });
export const publicationMetadataSignature = (post: ReviewedPost) => JSON.stringify({ excerpt: post.blogExcerpt ?? "", author: post.blogAuthor ?? "", category: post.blogCategory ?? "", tags: post.blogTags ?? [], slug: post.blogSlug ?? "", heroUrl: post.heroImageUrl ?? "", heroStorageId: post.heroImageStorageId ?? "" });

type ScheduledPublication = { scheduledDate?: string; scheduledTime?: string; timezone?: string };
/** Legacy date/metadata edits cannot erase an already recorded publication identity. */
export function publicationTransitionRequired(post: { status: string; prUrl?: string; branchName?: string; blogPrStatus?: string; blogExportClaimKey?: string }) {
  return ["pr-created", "submitted", "published", "unavailable"].includes(post.status) || Boolean(post.prUrl || post.branchName || post.blogPrStatus || post.blogExportClaimKey);
}
/** Dispatch consistency is separate from editorial approval, which survives date-only changes. */
export function resolvePublicationSchedule(post: ScheduledPublication, intent: ScheduledPublication, fallbackDate: string) {
  const scheduledTime = intent.scheduledTime ?? post.scheduledTime;
  return {
    scheduledDate: intent.scheduledDate ?? post.scheduledDate ?? fallbackDate,
    ...(scheduledTime === undefined ? {} : { scheduledTime }),
    timezone: intent.timezone ?? post.timezone ?? "UTC",
  };
}

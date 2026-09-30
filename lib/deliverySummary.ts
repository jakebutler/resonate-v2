import {
  articleArtifactVersion,
  publicationEvidenceHold,
  type ArticlePublicationEvidence,
} from "./articleContracts";
import {
  blogEditorialFingerprint,
  type BlogEditorialPost,
} from "./blogContract";
export function verifiedArticleReceipt(
  post: BlogEditorialPost & { blogArtifact?: unknown },
  evidence?: ArticlePublicationEvidence | null,
  now = Date.now(),
) {
  return !publicationEvidenceHold(evidence, blogEditorialFingerprint(post), articleArtifactVersion(post.blogArtifact), now);
}
export function deliverySummary(
  items: {
    post: BlogEditorialPost & { blogArtifact?: unknown; status: string };
    articlePublication?: { evidence: ArticlePublicationEvidence } | null;
    providerState?: {
      status?: string;
      simulated?: boolean;
      providerPostId?: string;
    } | null;
  }[],
  now = Date.now(),
) {
  const result = {
    submitted: 0,
    queued: 0,
    published: 0,
    needsReview: 0,
    notSubmitted: 0,
    simulated: 0,
  };
  for (const item of items) {
    const state = item.providerState;
    if (state?.simulated || state?.providerPostId?.startsWith("mock-")) {
      result.simulated++;
      continue;
    }
    if (item.post.channelId === "corvo-blog") {
      if (
        verifiedArticleReceipt(item.post, item.articlePublication?.evidence, now)
      ) {
        result.published++;
        continue;
      }
      if (item.post.status === "published") {
        result.submitted++;
        continue;
      }
    }
    if (state?.status === "published" && state.providerPostId)
      result.published++;
    else if (
      ["queued", "publishing"].includes(state?.status ?? "") &&
      state?.providerPostId
    )
      result.queued++;
    else if (
      ["submitted", "queued", "publishing", "published"].includes(
        state?.status ?? "",
      )
    )
      result.submitted++;
    else if (state?.status === "needs-review") result.needsReview++;
    else if (state?.status === "not-submitted") result.notSubmitted++;
  }
  return result;
}

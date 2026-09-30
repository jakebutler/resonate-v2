import { socialReleaseVersion } from "./socialPayload";
import { scheduleToUtcIso } from "./schedules";
export const ARTICLE_EVIDENCE_MAX_AGE_MS = 15 * 60 * 1000;
export type CompanionLink = {
  articlePostId: string;
  placement: "body" | "first-comment";
  canonicalUrl?: string;
  resolvedPlacement?: "body" | "first-comment";
};
export type ArticlePublicationEvidence = {
  checkedAt: number;
  editorialVersion: string;
  artifactVersion: string;
  prState: "open" | "draft" | "merged" | "closed" | "unknown";
  headSha?: string;
  mergeSha?: string;
  deploymentId?: number;
  deploymentSha?: string;
  deploymentState: string;
  deploymentContainsArticle?: boolean;
  environment?: string;
  articleBlobSha?: string;
  availability: "verified" | "unverified" | "blocked";
  canonicalUrl?: string;
  expectedHash?: string;
  observedHash?: string;
  reason?: string;
};
export function exactScheduleHold(
  post: { scheduledDate?: string; scheduledTime?: string; timezone: string },
  now = Date.now(),
) {
  if (!post.scheduledDate || !post.scheduledTime)
    return "Save an exact local date and time.";
  try {
    if (
      Date.parse(
        scheduleToUtcIso({
          scheduledDate: post.scheduledDate,
          scheduledTime: post.scheduledTime,
          timezone: post.timezone,
        }),
      ) <= now
    )
      return "Scheduled time has passed; explicitly review a new date.";
  } catch {
    return "Invalid calendar date, IANA timezone or DST local time.";
  }
  return null;
}
export function proposeArticleLink(
  post: {
    content: string;
    linkedinFirstComment?: string;
    companionLink?: CompanionLink;
  },
  url: string,
  placement: CompanionLink["placement"],
) {
  let content = post.content;
  let firstComment = post.linkedinFirstComment ?? "";
  const old = post.companionLink;
  if (
    old &&
    (old.resolvedPlacement ?? old.placement) !== placement &&
    old.canonicalUrl
  ) {
    if ((old.resolvedPlacement ?? old.placement) === "body")
      content = content.split(old.canonicalUrl).join("{{articleUrl}}");
    else
      firstComment = firstComment
        .split(old.canonicalUrl)
        .join("{{articleUrl}}");
  }
  function resolve(text: string) {
    if (text.includes("{{articleUrl}}"))
      return text.split("{{articleUrl}}").join(url);
    if (old?.canonicalUrl && text.includes(old.canonicalUrl))
      return text.split(old.canonicalUrl).join(url);
    return text.includes(url) ? text : `${text}${text ? "\n\n" : ""}${url}`;
  }
  if (placement === "body") {
    content = resolve(content);
    if (
      firstComment.trim() === "{{articleUrl}}" ||
      firstComment.trim() === old?.canonicalUrl ||
      firstComment.trim() === url
    )
      firstComment = "";
    else if ((old?.resolvedPlacement ?? old?.placement) === "first-comment")
      firstComment = firstComment.split("{{articleUrl}}").join("");
  } else {
    firstComment = resolve(firstComment);
    if (content.trim() === "{{articleUrl}}") content = "";
    else if ((old?.resolvedPlacement ?? old?.placement) === "body")
      content = content.split("{{articleUrl}}").join("");
  }
  return { content, linkedinFirstComment: firstComment || undefined };
}
export function companionReviewVersion(
  post: Parameters<typeof socialReleaseVersion>[0] & {
    companionLink?: CompanionLink;
  },
) {
  return JSON.stringify([
    socialReleaseVersion(post),
    post.companionLink ?? null,
  ]);
}
export function publicationEvidenceHold(
  e: ArticlePublicationEvidence | null | undefined,
  editorialVersion: string,
  artifactVersion: string,
  now = Date.now(),
) {
  if (!e) return "Article publication has not been verified.";
  if (
    e.editorialVersion !== editorialVersion ||
    e.artifactVersion !== artifactVersion
  )
    return "Article version changed; verify the current article.";
  if (
    now - e.checkedAt > ARTICLE_EVIDENCE_MAX_AGE_MS ||
    e.checkedAt > now + 60000
  )
    return "Article publication evidence is stale; check it again.";
  if (e.prState !== "merged") return `Article PR is ${e.prState}.`;
  if (
    e.deploymentState !== "success" ||
    !e.mergeSha ||
    e.deploymentContainsArticle !== true ||
    !e.deploymentSha ||
    !e.articleBlobSha
  )
    return e.reason ?? "Exact Production deployment is unverified.";
  if (e.availability !== "verified")
    return e.reason ?? "Canonical article availability is unverified.";
  return null;
}

export function hasCanonicalLink(text: string, url: string) {
  return (text.match(/https:\/\/[^\s<>()"']+/g) ?? []).some(
    (token) => token.replace(/[.,;!?]+$/, "") === url,
  );
}

export function articleArtifactVersion(artifact: unknown) {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .filter(([, v]) => v !== undefined)
          .map(([key, v]) => [key, canonical(v)]),
      );
    return value;
  }
  return JSON.stringify(canonical(artifact ?? null));
}

import { it, expect } from "vitest";
import { deliverySummary } from "../deliverySummary";
import { blogEditorialFingerprint } from "../blogContract";
import { articleArtifactVersion } from "../articleContracts";
it("counts verified articles and provider IDs separately from merged-only, legacy and simulated receipts", () => {
  const article = {
    title: "Exact article",
    content: "42% copy",
    channelId: "corvo-blog",
    status: "published",
    blogArtifact: { canonicalUrl: "https://example.com/fixture" },
  };
  const evidence = {
    checkedAt: Date.now(),
    editorialVersion: blogEditorialFingerprint(article),
    artifactVersion: articleArtifactVersion(article.blogArtifact),
    prState: "merged" as const,
    mergeSha: "merge",
    deploymentSha: "merge",
    articleBlobSha: "blob",
    deploymentState: "success",
    deploymentContainsArticle: true,
    availability: "verified" as const,
  };
  const social = {
    title: "Social",
    content: "Exact social",
    channelId: "linkedin",
    status: "scheduled",
  };
  expect(
    deliverySummary([
      {
        post: article,
        articlePublication: { evidence },
        providerState: { status: "submitted" },
      },
      {
        post: article,
        articlePublication: {
          evidence: { ...evidence, availability: "unverified" },
        },
      },
      {
        post: social,
        providerState: { status: "queued", providerPostId: "external-fixture" },
      },
      {
        post: social,
        providerState: { status: "published", providerPostId: "external-live" },
      },
      {
        post: social,
        providerState: {
          status: "queued",
          providerPostId: "mock-fixture",
          simulated: true,
        },
      },
      { post: social, providerState: { status: "published" } },
    ]),
  ).toEqual({
    published: 2,
    queued: 1,
    submitted: 2,
    simulated: 1,
    needsReview: 0,
    notSubmitted: 0,
  });
});

it("requires all exact publication facts and ages out stale evidence", () => {
  const post = {
    title: "Article",
    content: "Saved copy",
    channelId: "corvo-blog",
    status: "published",
    blogArtifact: { canonicalUrl: "https://example.com/fixture" },
  };
  const evidence = {
    checkedAt: 1000000,
    editorialVersion: blogEditorialFingerprint(post),
    artifactVersion: articleArtifactVersion(post.blogArtifact),
    prState: "merged" as const,
    mergeSha: "merge",
    deploymentSha: "merge",
    articleBlobSha: "blob",
    deploymentState: "success",
    deploymentContainsArticle: true,
    availability: "verified" as const,
  };
  expect(
    deliverySummary([{ post, articlePublication: { evidence } }], 1000000)
      .published,
  ).toBe(1);
  for (const changes of [
    { checkedAt: 0 },
    { mergeSha: undefined },
    { deploymentSha: undefined },
    { articleBlobSha: undefined },
    { deploymentState: "pending" },
  ])
    expect(
      deliverySummary(
        [
          {
            post,
            articlePublication: { evidence: { ...evidence, ...changes } },
          },
        ],
        1000000,
      ).published,
    ).toBe(0);
});

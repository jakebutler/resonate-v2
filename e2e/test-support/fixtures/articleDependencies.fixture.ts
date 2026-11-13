import { registerSyncFixture, type SyncFixture } from "./registry";

export type ArticleDependenciesFixture = {
  /** Every mutation and action udfPath, in wire order. */
  calls: string[];
  /** Marks the fixture post as past its scheduled time (drives the hold). */
  expire: () => void;
};

registerSyncFixture<ArticleDependenciesFixture>(
  "article-dependencies",
  () => {
    const calls: string[] = [];
    let live = false;
    let resolved = false;
    let expired = false;
    const url = "https://corvolabs.com/blog/2030-03-09-fixture";
    const article = {
      _id: "fixture-article",
      userId: "fixture-editor",
      brandId: "corvo",
      channelId: "corvo-blog",
      title: "Prepared parent article",
      content: "Expected article copy.",
      blogPublicationIntent: "published",
      scheduledDate: "2030-03-09",
      scheduledTime: "09:00",
      timezone: "America/Los_Angeles",
      prUrl: "https://github.com/fixture/site/pull/7",
      blogArtifact: { canonicalUrl: url },
      blogPrStatus: "merged",
    };
    function post() {
      return {
        _id: "fixture-companion",
        userId: "fixture-editor",
        brandId: "corvo",
        channelId: "linkedin",
        platformId: "linkedin",
        title: "Forward drip companion",
        content: resolved
          ? `Exact 42% copy.\n${url}`
          : "Exact 42% copy.\n{{articleUrl}}",
        status: "scheduled",
        approvalState: resolved ? "unapproved" : "approved",
        scheduledDate: expired ? "2000-01-01" : "2030-10-07",
        scheduledTime: "09:00",
        timezone: "America/Los_Angeles",
        createdAt: 1,
        updatedAt: 1,
        companionLink: {
          articlePostId: article._id,
          placement: "body",
          ...(resolved ? { canonicalUrl: url, resolvedPlacement: "body" } : {}),
        },
      };
    }
    return {
      fixture: { calls, expire: () => (expired = true) },
      handlers: {
        value: (path) => {
          if (path === "publishing:listBrands")
            return [{ brandId: "corvo", name: "Corvo Labs" }];
          if (path === "publishing:getPostById") return post();
          if (path === "publishing:listCalendarItems")
            return [
              {
                post: post(),
                intent: {
                  _id: "fixture-intent",
                  scheduledDate: post().scheduledDate,
                  scheduledTime: "09:00",
                  timezone: "America/Los_Angeles",
                },
                providerState: { status: "not-submitted" },
                attemptCount: 0,
              },
            ];
          if (path === "publishing:bufferLiveSubmissionEnabled")
            return { enabled: false };
          if (path === "series:list") return [];
          if (path === "articleDependencies:candidates")
            return { posts: [article], partial: false };
          if (path === "articleDependencies:details")
            return {
              post: post(),
              article,
              receipt: {
                evidence: {
                  checkedAt: Date.now(),
                  prState: "merged",
                  headSha: "fixture-head",
                  mergeSha: "fixture-merge",
                  deploymentState: live ? "success" : "pending",
                  deploymentSha: "fixture-merge",
                  environment: "Production",
                  availability: live ? "verified" : "unverified",
                },
              },
              hold: expired
                ? "Scheduled time has passed; explicitly review a new date."
                : live
                  ? null
                  : "Production deployment is pending.",
              proposal: { content: `Exact 42% copy.\n${url}` },
              version: "fixture-reviewed-version",
            };
          return null;
        },
        mutation: (path) => {
          calls.push(path);
          if (path === "articleDependencies:applyLink") resolved = true;
          return null;
        },
        action: (path) => {
          calls.push(path);
          if (path === "articlePublication:refresh") live = true;
          return { recorded: true };
        },
      },
    } satisfies SyncFixture<ArticleDependenciesFixture>;
  },
);

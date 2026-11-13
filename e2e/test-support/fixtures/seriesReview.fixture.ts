import { registerSyncFixture, type SyncFixture } from "./registry";

export type SeriesReviewFixture = {
  /** Every mutation udfPath, in wire order. */
  calls: string[];
};

registerSyncFixture<SeriesReviewFixture>("series-review", () => {
  const calls: string[] = [];
  let selected: string[] = [];
  let revision = 0;
  let packetIds: string[] = [];
  let approved = false;
  let edited = false;
  const posts = Array.from({ length: 3 }, (_, n) => ({
    _id: `post-${n}`,
    userId: "fixture-editor",
    brandId: "corvo",
    channelId: n === 0 ? "corvo-blog" : "linkedin",
    platformId: n === 0 ? "corvo-blog" : "linkedin",
    title: `Exact review ${n}`,
    content:
      n === 1 && edited
        ? "Corrected material copy 43%"
        : `Complete immutable 42% copy ${n}.\nNumber 1234 and https://example.com/source`,
    timezone: "America/Los_Angeles",
    scheduledDate: "2030-10-07",
    scheduledTime: "09:00",
    approvalState: "unapproved",
    status: "draft",
    blogPublicationIntent: "draft",
    coverImageAlt: "Fixture hero alt",
    createdAt: 1,
    updatedAt: 1,
  }));
  function current(n: number) {
    return {
      ...posts[n],
      content:
        n === 1 && edited ? "Corrected material copy 43%" : posts[n].content,
      approvalState:
        approved && n > 0 && !(n === 1 && edited) ? "approved" : "unapproved",
    };
  }
  return {
    fixture: { calls },
    handlers: {
      value: (path) => {
        if (path === "series:list")
          return [
            {
              _id: "series-fixture",
              title: "Exact three-post series",
              brandId: "corvo",
              revision: 1,
            },
          ];
        if (path === "series:get")
          return {
            _id: "series-fixture",
            title: "Exact three-post series",
            brandId: "corvo",
            revision: 1,
          };
        if (path === "series:entries")
          return {
            page: [
              {
                _id: "entry-fixture",
                sequence: 1,
                articlePostId: "post-0",
                companionPostIds: ["post-1", "post-2"],
                posts: posts.map((_, n) => ({
                  post: current(n),
                  providerState: { status: "not-submitted" },
                })),
              },
            ],
            isDone: true,
            continueCursor: "",
          };
        if (path === "series:picker")
          return { page: [], isDone: true, continueCursor: "" };
        if (path === "seriesReview:selection")
          return { _id: "selection-fixture", postIds: selected, revision };
        if (path === "seriesReview:packet")
          return packetIds.length
            ? {
                packet: {
                  _id: "packet-fixture",
                  createdAt: 1,
                  selectionRevision: packetIds.length === 3 ? 3 : revision,
                  status: approved ? "approved" : "reviewed",
                },
                stale: selected.join() !== packetIds.join() || edited,
                rows: packetIds.map((id) => {
                  const n = Number(id.slice(-1));
                  const p = current(n);
                  return {
                    _id: `row-${n}`,
                    postId: id,
                    snapshot: {
                      post: p,
                      finalContent: posts[n].content,
                      destination: n
                        ? {
                            displayName: "Corvo Labs Page",
                            handle: "corvo-labs-us",
                            accountType: "page",
                            channelId: "fixture-page",
                            organizationId: "fixture-org",
                            firstComment: {
                              value: "unsupported",
                              source: "operator-confirmed",
                            },
                          }
                        : null,
                      dueAt: "2030-10-07T16:00:00Z",
                      holds: n
                        ? ["Article publication unverified; no release authority."]
                        : [],
                      approvalError: null,
                      warnings: ["Unvetted source warning remains visible."],
                      citations: ["source-passage-42"],
                      sourceResearchBriefId: "brief-fixture",
                    },
                    staleReason:
                      n === 1 && edited
                        ? "Content or editorial metadata changed."
                        : null,
                    heroUrl: null,
                    ...(approved && n > 0
                      ? { actor: "fixture-editor", approvedAt: 1 }
                      : {}),
                  };
                }),
              }
            : null;
        if (path === "publishing:listBrands")
          return [{ brandId: "corvo", name: "Corvo Labs" }];
        if (path === "publishing:getPostById") return current(1);
        if (path === "publishing:listCalendarItems")
          return posts.map((_, n) => ({
            post: current(n),
            intent: {
              _id: `intent-${n}`,
              scheduledDate: "2030-10-07",
              scheduledTime: "09:00",
              timezone: "America/Los_Angeles",
            },
            providerState: { status: "not-submitted" },
            attemptCount: 0,
          }));
        if (path === "publishing:bufferLiveSubmissionEnabled")
          return { enabled: false };
        return null;
      },
      mutation: (path, args) => {
        calls.push(path);
        let result: unknown = null;
        if (path === "seriesReview:select") {
          selected = (args as { postIds: string[] }).postIds;
          revision++;
          result = "selection-fixture";
        }
        if (path === "seriesReview:prepare") {
          packetIds = [...selected];
          result = "packet-fixture";
        }
        if (path === "seriesReview:approve") {
          approved = true;
          result = { approved: true };
        }
        if (path === "publishing:updateContent") edited = true;
        return result;
      },
    },
  } satisfies SyncFixture<SeriesReviewFixture>;
});

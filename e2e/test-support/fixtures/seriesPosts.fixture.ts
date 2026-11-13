import { registerSyncFixture, type SyncFixture } from "./registry";

export type SeriesPostsFixture = {
  /** Every mutation udfPath, in wire order. */
  calls: string[];
  /** The 45 fixture posts — the spec asserts they are never mutated. */
  posts: unknown[];
};

registerSyncFixture<SeriesPostsFixture>("series-15-30", () => {
  const calls: string[] = [];
  const posts = Array.from(
    { length: 45 },
    (_, n) => ({
      _id: `post-${n}`,
      _creationTime: n,
      userId: "fixture-editor",
      brandId: "corvo",
      channelId: n % 3 === 0 ? "corvo-blog" : "linkedin",
      platformId: n % 3 === 0 ? "corvo-blog" : "linkedin",
      title: `Prepared ${n % 3 === 0 ? "article" : "companion"} ${n + 1}`,
      content: `Preserved copy ${n}`,
      approvalState: n % 3 === 1 ? "approved" : "unapproved",
      status: n % 3 === 1 ? "submitted" : "draft",
      timezone: "America/Los_Angeles",
      scheduledDate: "2026-10-07",
      scheduledTime: "09:00",
      createdAt: 1,
      updatedAt: 1,
      contentFingerprint: "fixture",
    }),
  );
  let entries = Array.from({ length: 15 }, (_, n) => ({
    _id: `entry-${n}`,
    seriesId: "series-fixture",
    key: `key-${n}`,
    sequence: n + 1,
    articlePostId: posts[n * 3]._id,
    companionPostIds: [posts[n * 3 + 1]._id, posts[n * 3 + 2]._id],
    posts: posts.slice(n * 3, n * 3 + 3).map((post) => ({
      post,
      providerState: {
        status: post.status === "submitted" ? "submitted" : "not-submitted",
      },
    })),
  }));
  return {
    fixture: { calls, posts },
    handlers: {
      value: (path) => {
        if (path === "series:list")
          return [
            {
              _id: "series-fixture",
              title: "Prepared 15/30 series",
              brandId: "corvo",
              revision: 1,
            },
          ];
        if (path === "series:get")
          return {
            _id: "series-fixture",
            title: "Prepared 15/30 series",
            brandId: "corvo",
            revision: 1,
          };
        if (path === "series:entries")
          return { page: entries, isDone: true, continueCursor: "" };
        if (path === "series:picker")
          return { page: [], isDone: true, continueCursor: "" };
        if (path === "publishing:listBrands")
          return [{ brandId: "corvo", name: "Corvo Labs" }];
        if (path === "publishing:listCalendarItems")
          return entries
            .flatMap((e) => e.posts)
            .map((x) => ({
              ...x,
              intent: {
                scheduledDate: x.post.scheduledDate,
                scheduledTime: x.post.scheduledTime,
                timezone: x.post.timezone,
              },
              attemptCount: 0,
            }));
        if (path === "publishing:bufferLiveSubmissionEnabled")
          return { enabled: false };
        return null;
      },
      mutation: (path, args) => {
        calls.push(path);
        const a = args as { entryId?: string; direction?: string };
        if (path === "series:move") {
          const index = entries.findIndex((e) => e._id === a.entryId);
          const neighbor = index + (a.direction === "up" ? -1 : 1);
          if (neighbor >= 0 && neighbor < entries.length)
            [entries[index], entries[neighbor]] = [
              entries[neighbor],
              entries[index],
            ];
        }
        if (path === "series:detach")
          entries = entries.filter((e) => e._id !== a.entryId);
        return null;
      },
    },
  } satisfies SyncFixture<SeriesPostsFixture>;
});

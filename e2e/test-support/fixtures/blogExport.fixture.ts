import sharp from "sharp";
import { registerSyncFixture, type SyncFixture } from "./registry";

type Query = {
  queryId: number;
  udfPath: string;
  args: Record<string, unknown>[];
  type: string;
};
export type WireMessage = {
  type: string;
  requestId: number;
  udfPath: string;
  args: Record<string, unknown>[];
  newVersion: number;
  modifications: Query[];
};

export type BlogExportFixture = {
  /** Every mutation message, in wire order. */
  mutations: WireMessage[];
  /** POST bodies received on the mocked blog-export REST route. */
  exports: unknown[];
};

registerSyncFixture<BlogExportFixture>("blog-export", async (page) => {
  const hero = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: "#15616d" },
  })
    .webp()
    .toBuffer();
  await page.route("**/fixture-hero.webp", (route) =>
    route.fulfill({ body: hero, contentType: "image/webp" }),
  );
  const fixturePost = {
    _id: "fixture-blog",
    _creationTime: 1,
    userId: "fixture-editor",
    brandId: "corvo",
    channelId: "corvo-blog",
    platformId: "corvo-blog",
    title: "Prepared fixture article",
    content: "Approved fixture prose.\n\n## Evidence\n\nOne reviewed claim.",
    status: "scheduled",
    approvalState: "unapproved",
    scheduledDate: "2026-10-07",
    scheduledTime: "09:00",
    timezone: "America/Los_Angeles",
    blogExcerpt: "Reviewed fixture excerpt",
    blogAuthor: "Fixture Editor",
    blogCategory: "strategy",
    blogTags: ["fixture"],
    blogSlug: "fixture-article",
    blogPublicationIntent: "draft",
    coverImageAlt: "Reviewed fixture hero",
    heroImageStorageId: "fixture-original",
    heroImageUrl: "",
    preparedHero: {
      sourceStorageId: "fixture-original",
      storageId: "fixture-prepared",
      width: 1600,
      height: 900,
      mimeType: "image/webp",
      byteLength: 12000,
      sha256: "sanitized-fixture-hash",
      crop: "centre",
    },
    contentFingerprint: "fixture",
    createdAt: 1,
    updatedAt: 1,
  };
  let post = { ...fixturePost };
  const mutations: WireMessage[] = [];
  const exports: Record<string, unknown>[] = [];
  await page.route("**/api/publish*", async (route) => {
    if (route.request().method() === "POST") {
      exports.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          prUrl: "https://github.com/fixture/site/pull/1",
          branchName: "fixture/article",
          sanitizedResponse: { number: 1, state: "open" },
        },
      });
    } else
      await route.fulfill({
        json: {
          repository: "fixture/site",
          filePath: "content/blog/2026-10-07-fixture-article.mdx",
        },
      });
  });
  return {
    fixture: { mutations, exports },
    handlers: {
      value: (path) => {
        switch (path) {
          case "publishing:listBrands":
            return [{ brandId: "corvo", name: "Corvo Labs" }];
          case "publishing:getPostById":
            return post;
          case "publishing:listCalendarItems":
            return [
              {
                post,
                intent: {
                  _id: "fixture-intent",
                  scheduledDate: post.scheduledDate,
                  scheduledTime: post.scheduledTime,
                  timezone: post.timezone,
                },
                providerState: { status: "not-submitted" },
                attempts: [],
                auditEvents: [],
                attemptCount: 0,
              },
            ];
          case "publishing:bufferLiveSubmissionEnabled":
            return { enabled: false };
          case "publishing:getPostAuditTrail":
            return { attempts: [], auditEvents: [] };
          case "v2Storage:getFileUrl":
            return "/fixture-hero.webp";
          default:
            return null;
        }
      },
      mutation: (path, args) => {
        mutations.push({
          type: "Mutation",
          requestId: -1,
          udfPath: path,
          args: [args],
          newVersion: -1,
          modifications: [],
        });
        if (path === "publishing:updateBlogMetadata")
          post = {
            ...post,
            ...(args.metadata as object),
            approvalState: "unapproved",
            updatedAt: post.updatedAt + 1,
          };
        if (path === "publishing:updateContent")
          post = {
            ...post,
            title: (args.title as string) ?? post.title,
            content: (args.content as string) ?? post.content,
            approvalState: "unapproved",
            updatedAt: post.updatedAt + 1,
          };
        if (path === "publishing:setApproval")
          post = { ...post, approvalState: "approved", updatedAt: post.updatedAt + 1 };
        return null;
      },
    },
  } satisfies SyncFixture<BlogExportFixture>;
});

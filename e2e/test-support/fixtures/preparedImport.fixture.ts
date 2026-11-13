import sharp from "sharp";
import { registerSyncFixture, type SyncFixture } from "./registry";

export type PreparedImportFixture = {
  /** Every action udfPath, in wire order. */
  actions: string[];
  /** The review packet the fixture serves once an entry is reviewed. */
  review: {
    items: { content: string }[];
  };
};

registerSyncFixture<PreparedImportFixture>("prepared-import", async () => {
  const hero = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: "#849f92" },
  })
    .png()
    .toBuffer();
  const awaitHeroPreview = (await sharp(hero).webp().toBuffer()).toString(
    "base64",
  );
  const review = {
    _id: "fixture-review",
    entryKey: "entry-1",
    sourceHash: "fixture-source-hash",
    actions: ["create", "create"],
    hero: {
      width: 1600,
      height: 900,
      mimeType: "image/webp",
      byteLength: 12000,
      crop: "centre",
      sha256: "fixture-hero-hash",
    },
    items: [
      {
        title: "Prepared fixture article",
        contentFile: "article.md",
        heroFile: "hero.png",
        coverImageAlt: "Reviewed fixture alt",
        publicationIntent: "draft",
        excerpt: "Exact excerpt",
        author: "Fixture Editor",
        category: "Evidence",
        tags: ["Review"],
        slug: "prepared-fixture",
        scheduledDate: "2030-10-07",
        scheduledTime: "09:00",
        timezone: "America/Los_Angeles",
        content: "Exact prepared prose with 42%.\n",
        dueAt: "2030-10-07T16:00:00Z",
      },
      {
        key: "launch",
        channelId: "linkedin",
        title: "Prepared companion",
        contentFile: "social.md",
        scheduledDate: "2030-10-07",
        scheduledTime: "11:00",
        timezone: "America/Los_Angeles",
        content: "Exact companion with source link.",
        dueAt: "2030-10-07T18:00:00Z",
      },
    ],
  };
  const actions: string[] = [];
  let reviewed = false;
  return {
    fixture: { actions, review },
    handlers: {
      value: (path) => {
        if (path === "series:list") return [];
        if (path === "preparedImports:selectedReviews")
          return reviewed ? [review] : [];
        return null;
      },
      action: (path) => {
        actions.push(path);
        let result: unknown = null;
        if (path === "preparedImportActions:reviewEntry") {
          reviewed = true;
          result = {
            reviewId: "fixture-review",
            previewBase64: awaitHeroPreview,
          };
        }
        if (path === "preparedImportActions:commitEntry")
          result = {
            _id: "fixture-receipt",
            entryKey: "entry-1",
            seriesId: "fixture-series",
            postIds: ["fixture-blog", "fixture-social"],
          };
        return result;
      },
    },
  } satisfies SyncFixture<PreparedImportFixture>;
});

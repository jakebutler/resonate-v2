import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
import {
  parsePreparedManifest,
  resolvePreparedEntry,
  type PreparedManifest,
  type UploadedPackageFile,
} from "../../lib/preparedPackage";
const modules = import.meta.glob("../**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "editor" });
  await user.mutation(api.publishing.seedMvpWorkspace, {});
  const bytes = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: "#859b95" },
  })
    .png()
    .toBuffer();
  const manifest: PreparedManifest = {
    schemaVersion: 1,
    packageKey: "fixture-series",
    brandId: "corvo",
    title: "Sanitized series",
    entries: Array.from({ length: 15 }, (_, n) => ({
      key: `entry-${n}`,
      article: {
        title: `Article ${n}`,
        contentFile: `article-${n}.md`,
        heroFile: `hero-${n}.png`,
        coverImageAlt: "Exact reviewed alt",
        publicationIntent: "published",
        excerpt: "Exact excerpt",
        author: "Fixture Editor",
        category: "Editorial",
        tags: ["Evidence"],
        slug: `article-${n}`,
        scheduledDate: "2030-10-07",
        scheduledTime: "09:00",
        timezone: "America/Los_Angeles",
      },
      companions: Array.from({ length: 2 }, (_, c) => ({
        key: `companion-${c}`,
        channelId: "linkedin",
        title: `Companion ${n}-${c}`,
        contentFile: `social-${n}-${c}.md`,
        scheduledDate: c ? "2030-10-10" : "2030-10-07",
        scheduledTime: "11:00",
        timezone: "America/Los_Angeles",
      })),
    })),
  };
  function files(n: number): UploadedPackageFile[] {
    return [
      {
        path: `article-${n}.md`,
        data: `## Exact article ${n}\n\n42% is a sanitized fixture claim.\n`,
        kind: "text",
      },
      { path: `hero-${n}.png`, data: bytes.toString("base64"), kind: "base64" },
      ...Array.from({ length: 2 }, (_, c) => ({
        path: `social-${n}-${c}.md`,
        data: `Exact companion ${n}-${c}\nhttps://example.test/source`,
        kind: "text" as const,
      })),
    ];
  }
  return { t, user, manifest, files, bytes };
}
async function review(
  user: ReturnType<typeof convexTest>,
  args: import("convex/server").FunctionArgs<
    typeof api.preparedImportActions.reviewEntry
  >,
) {
  return (await user.action(api.preparedImportActions.reviewEntry, args))
    .reviewId;
}
describe("prepared package imports", () => {
  it("dry-runs 15/30 with zero posts/assets, resumes five committed entries, and replays without duplicates or approval", async () => {
    const { t, user, manifest, files, bytes } = await fixture();
    const before = await t.run(async (ctx) => ({
      posts: (await ctx.db.query("v2Posts").collect()).length,
      assets: (await ctx.db.system.query("_storage").collect()).length,
    }));
    const reviews = [];
    for (let n = 0; n < 15; n++)
      reviews.push(
        await review(user, {
          manifest: JSON.stringify(manifest),
          entryKey: `entry-${n}`,
          files: files(n),
        }),
      );
    expect(
      await t.run(async (ctx) => ({
        posts: (await ctx.db.query("v2Posts").collect()).length,
        assets: (await ctx.db.system.query("_storage").collect()).length,
      })),
    ).toEqual(before);
    const receipts = [];
    for (let n = 0; n < 5; n++)
      receipts.push(
        await user.action(api.preparedImportActions.commitEntry, {
          reviewId: reviews[n],
          heroBase64: bytes.toString("base64"),
        }),
      );
    for (let n = 0; n < 15; n++) {
      const reviewId = await review(user, {
        manifest: JSON.stringify(manifest),
        entryKey: `entry-${n}`,
        files: files(n),
      });
      expect(reviewId).toBe(reviews[n]);
      const receipt = await user.action(api.preparedImportActions.commitEntry, {
        reviewId,
        heroBase64: bytes.toString("base64"),
      });
      if (n < 5) expect(receipt).toEqual(receipts[n]);
    }
    const rows = await t.run(async (ctx) => ({
      posts: await ctx.db.query("v2Posts").collect(),
      intents: await ctx.db.query("v2PublishingIntents").collect(),
      states: await ctx.db.query("v2ProviderStates").collect(),
      entries: await ctx.db.query("seriesEntries").collect(),
      links: await ctx.db.query("seriesPostLinks").collect(),
      assets: await ctx.db.system.query("_storage").collect(),
      attempts: await ctx.db.query("v2PublishAttempts").collect(),
    }));
    expect(rows.posts).toHaveLength(before.posts + 45);
    expect(rows.entries).toHaveLength(15);
    expect(rows.links).toHaveLength(45);
    expect(rows.assets).toHaveLength(2);
    expect(rows.attempts).toHaveLength(0);
    expect(rows.posts.every((p) => p.approvalState === "unapproved")).toBe(
      true,
    );
    expect(rows.intents).toHaveLength(rows.posts.length);
    expect(rows.states).toHaveLength(rows.posts.length);
    expect(rows.posts.find((p) => p.title === "Article 3")!.content).toBe(
      files(3)[0].data,
    );
  }, 60000);
  it.each(["approved", "submitted", "published"] as const)(
    "rejects changed sources and preserves an existing %s attachment byte for byte",
    async (status) => {
      const { t, user, manifest, files, bytes } = await fixture();
      const args = {
        manifest: JSON.stringify(manifest),
        entryKey: "entry-0",
        files: files(0),
      };
      const id = await review(user, args);
      const receipt = await user.action(api.preparedImportActions.commitEntry, {
        reviewId: id,
        heroBase64: bytes.toString("base64"),
      });
      const postId = receipt!.postIds[0];
      await user.mutation(api.publishing.setApproval, {
        postId,
        approvalState: "approved",
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(postId, {
          status,
          prUrl: "https://github.com/fixture/site/pull/7",
        });
        const state = (await ctx.db
          .query("v2ProviderStates")
          .withIndex("by_post", (q) => q.eq("postId", postId))
          .first())!;
        await ctx.db.patch(state._id, {
          status: status === "approved" ? "not-submitted" : status,
          providerPostId:
            status === "approved" ? undefined : "fixture-external-receipt",
          lastReceipt: { source: "sanitized fixture" },
        });
      });
      const original = await t.run((ctx) => ctx.db.get(postId));
      const changed = files(0);
      changed[0].data += "Changed number 99%.";
      const changedId = await review(user, {
        ...args,
        files: changed,
      });
      await expect(
        user.action(api.preparedImportActions.commitEntry, {
          reviewId: changedId,
          heroBase64: bytes.toString("base64"),
        }),
      ).rejects.toThrow(/conflict/);
      expect(await t.run((ctx) => ctx.db.get(postId))).toEqual(original);
      const attach = {
        ...manifest,
        packageKey: "attach-series",
        entries: [
          {
            ...manifest.entries[0],
            article: { ...manifest.entries[0].article, existingPostId: postId },
            companions: [],
          },
        ],
      };
      const attachId = await review(user, {
        manifest: JSON.stringify(attach),
        entryKey: "entry-0",
        files: files(0).slice(0, 2),
      });
      await user.action(api.preparedImportActions.commitEntry, {
        reviewId: attachId,
      });
      expect(await t.run((ctx) => ctx.db.get(postId))).toEqual(original);
      const foreign = t.withIdentity({ subject: "foreign" });
      await expect(
        foreign.action(api.preparedImportActions.commitEntry, {
          reviewId: attachId,
        }),
      ).rejects.toThrow(/not found/);
    },
    30000,
  );
  it("rejects traversal, archives, duplicate keys, invalid dates/zones and missing files before materialization", async () => {
    const { t, manifest, files } = await fixture();
    for (const path of [
      "../secret.md",
      "/etc/file.md",
      "article.zip",
      "folder\\file.md",
    ]) {
      const invalid = structuredClone(manifest);
      invalid.entries[0].article.contentFile = path;
      expect(() => parsePreparedManifest(JSON.stringify(invalid))).toThrow();
    }
    const duplicate = structuredClone(manifest);
    duplicate.entries[1].key = duplicate.entries[0].key;
    expect(() => parsePreparedManifest(JSON.stringify(duplicate))).toThrow(
      /duplicate/,
    );
    for (const change of [
      { scheduledDate: "2030-02-30" },
      { timezone: "PST" },
    ]) {
      const invalid = structuredClone(manifest);
      Object.assign(invalid.entries[0].article, change);
      expect(() => parsePreparedManifest(JSON.stringify(invalid))).toThrow(
        /schedule/,
      );
    }
    expect(() =>
      resolvePreparedEntry(manifest, "entry-0", files(0).slice(1)),
    ).toThrow(/missing Markdown/);
    expect(
      await t.run((ctx) => ctx.db.query("preparedImportReceipts").collect()),
    ).toHaveLength(0);
  });
  it("retains an interrupted asset claim and never creates duplicate bytes on retry", async () => {
    const { t, user, manifest, files, bytes } = await fixture();
    const reviewId = await review(user, {
      manifest: JSON.stringify(manifest),
      entryKey: "entry-0",
      files: files(0),
    });
    const { internal } = await import("../_generated/api");
    await t.mutation(internal.preparedImports.claimAsset, {
      userId: "editor",
      reviewId,
    });
    await expect(
      user.action(api.preparedImportActions.commitEntry, {
        reviewId,
        heroBase64: bytes.toString("base64"),
      }),
    ).rejects.toThrow(/unresolved/);
    expect(
      await t.run((ctx) => ctx.db.system.query("_storage").collect()),
    ).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("preparedImportAssets").collect()),
    ).toHaveLength(1);
  });
});

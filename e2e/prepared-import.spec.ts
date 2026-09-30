import { test, expect } from "@playwright/test";
import sharp from "sharp";
test("prepared upload corrects an error, reviews exact source, commits unapproved drafts and opens canonical links", async ({
  page,
}) => {
  const hero = await sharp({
    create: { width: 1600, height: 900, channels: 3, background: "#849f92" },
  })
    .png()
    .toBuffer();
  const awaitHeroPreview = (await sharp(hero).webp().toBuffer()).toString(
    "base64",
  );
  const article = {
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
  };
  const companion = {
    key: "launch",
    channelId: "linkedin",
    title: "Prepared companion",
    contentFile: "social.md",
    scheduledDate: "2030-10-07",
    scheduledTime: "11:00",
    timezone: "America/Los_Angeles",
  };
  const manifest = {
    schemaVersion: 1,
    packageKey: "browser-fixture",
    brandId: "corvo",
    title: "Prepared browser fixture",
    entries: [{ key: "entry-1", article, companions: [companion] }],
  };
  let reviewed = false;
  const actions: string[] = [];
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
        ...article,
        content: "Exact prepared prose with 42%.\n",
        dueAt: "2030-10-07T16:00:00Z",
      },
      {
        ...companion,
        content: "Exact companion with source link.",
        dueAt: "2030-10-07T18:00:00Z",
      },
    ],
  };
  await page.routeWebSocket(/\/api\/.*\/sync/, (socket) => {
    const qs = new Map<number, { queryId: number; udfPath: string }>();
    let version = { querySet: 0, identity: 0, ts: "AAAAAAAAAAA=" };
    let tick = 0;
    function val(path: string) {
      if (path === "series:list") return [];
      if (path === "preparedImports:selectedReviews")
        return reviewed ? [review] : [];
      return null;
    }
    function send(querySet = version.querySet) {
      const ts = Buffer.alloc(8);
      ts.writeBigUInt64LE(BigInt(++tick));
      const endVersion = { ...version, querySet, ts: ts.toString("base64") };
      socket.send(
        JSON.stringify({
          type: "Transition",
          startVersion: version,
          endVersion,
          modifications: [...qs.values()].map((q) => ({
            type: "QueryUpdated",
            queryId: q.queryId,
            value: val(q.udfPath),
            journal: null,
            logLines: [],
          })),
        }),
      );
      version = endVersion;
    }
    socket.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "Authenticate") {
        const startVersion = version;
        version = { ...version, identity: version.identity + 1 };
        socket.send(
          JSON.stringify({
            type: "Transition",
            startVersion,
            endVersion: version,
            modifications: [],
          }),
        );
      }
      if (m.type === "ModifyQuerySet") {
        for (const q of m.modifications) {
          if (q.type === "Add") qs.set(q.queryId, q);
          else qs.delete(q.queryId);
        }
        send(m.newVersion);
      }
      if (m.type === "Action") {
        actions.push(m.udfPath);
        let result: unknown = null;
        if (m.udfPath === "preparedImportActions:reviewEntry") {
          reviewed = true;
          result = {
            reviewId: "fixture-review",
            previewBase64: awaitHeroPreview,
          };
        }
        if (m.udfPath === "preparedImportActions:commitEntry")
          result = {
            _id: "fixture-receipt",
            entryKey: "entry-1",
            seriesId: "fixture-series",
            postIds: ["fixture-blog", "fixture-social"],
          };
        socket.send(
          JSON.stringify({
            type: "ActionResponse",
            requestId: m.requestId,
            success: true,
            result,
            logLines: [],
          }),
        );
        send();
      }
    });
  });
  await page.goto("/series");
  const section = page.getByLabel("Prepared package import");
  const upload = [
    {
      name: "article.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(review.items[0].content),
    },
    {
      name: "social.md",
      mimeType: "text/markdown",
      buffer: Buffer.from(review.items[1].content),
    },
    { name: "hero.png", mimeType: "image/png", buffer: hero },
  ];
  await section
    .getByLabel("Prepared files", { exact: true })
    .setInputFiles(upload);
  await section
    .getByRole("textbox", { name: "Manifest JSON", exact: true })
    .fill(
      JSON.stringify({
        ...manifest,
        entries: [
          { ...manifest.entries[0], article: { ...article, timezone: "PST" } },
        ],
      }),
    );
  await section.getByRole("button", { name: "Dry-run package" }).click();
  await expect(section.getByRole("status")).toContainText("schedule");
  expect(actions).toEqual([]);
  await section
    .getByRole("textbox", { name: "Manifest JSON", exact: true })
    .fill(JSON.stringify(manifest));
  await section.getByRole("button", { name: "Dry-run package" }).click();
  await expect(section.getByText("entry-1 — create / create")).toBeVisible();
  await section.getByText("Prepared fixture article — create").click();
  await expect(
    section.getByText("Exact prepared prose with 42%."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/prepared-package-review.png",
    fullPage: true,
  });
  await section
    .getByRole("button", {
      name: "Commit reviewed entries as unapproved drafts",
    })
    .click();
  await expect(
    section.getByRole("link", { name: "Open canonical article composer" }),
  ).toHaveAttribute("href", "/?postId=fixture-blog");
  await expect(
    section.getByRole("link", { name: "Open imported series" }),
  ).toHaveAttribute("href", "/series?seriesId=fixture-series");
  await expect(section.getByRole("status")).toContainText(
    "Every new post is unapproved",
  );
  expect(actions).toEqual([
    "preparedImportActions:reviewEntry",
    "preparedImportActions:commitEntry",
  ]);
});

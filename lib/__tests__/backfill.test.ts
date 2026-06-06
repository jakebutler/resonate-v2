import { describe, expect, it } from "vitest";
import { dedupeImportedPosts, normalizeImportedPost } from "@/lib/backfill";

describe("normalizeImportedPost", () => {
  it("maps a published blog seed into a Convex-ready post", () => {
    expect(
      normalizeImportedPost({
        type: "blog",
        title: "The Context Problem",
        content: "  Full blog body  ",
        externalUrl: "https://www.corvolabs.com/blog/the-context-problem-kv-cache-manus-openai",
        publishedDate: "2026-03-09",
      })
    ).toEqual({
      type: "blog",
      title: "The Context Problem",
      content: "Full blog body",
      status: "published",
      scheduledDate: "2026-03-09",
      externalUrl: "https://www.corvolabs.com/blog/the-context-problem-kv-cache-manus-openai",
      publishedAt: Date.parse("2026-03-09T00:00:00.000Z"),
    });
  });

  it("keeps linkedin titles optional while still normalizing the publish fields", () => {
    expect(
      normalizeImportedPost({
        type: "linkedin",
        content: "\nLaunching something new today.\n",
        externalUrl: "https://www.linkedin.com/posts/example-post",
        publishedDate: "2026-02-10",
      })
    ).toEqual({
      type: "linkedin",
      content: "Launching something new today.",
      status: "published",
      scheduledDate: "2026-02-10",
      externalUrl: "https://www.linkedin.com/posts/example-post",
      publishedAt: Date.parse("2026-02-10T00:00:00.000Z"),
    });
  });
});

describe("dedupeImportedPosts", () => {
  it("dedupes by canonical source url and keeps the last version", () => {
    expect(
      dedupeImportedPosts([
        {
          type: "linkedin",
          content: "Old text",
          externalUrl: "https://www.linkedin.com/posts/example-post",
          publishedDate: "2026-02-10",
        },
        {
          type: "linkedin",
          content: "Updated text",
          externalUrl: "https://www.linkedin.com/posts/example-post?trk=public_post",
          publishedDate: "2026-02-10",
        },
        {
          type: "blog",
          title: "Different post",
          content: "Body",
          externalUrl: "https://www.corvolabs.com/blog/different-post",
          publishedDate: "2026-03-09",
        },
      ])
    ).toEqual([
      {
        type: "linkedin",
        content: "Updated text",
        externalUrl: "https://www.linkedin.com/posts/example-post",
        publishedDate: "2026-02-10",
      },
      {
        type: "blog",
        title: "Different post",
        content: "Body",
        externalUrl: "https://www.corvolabs.com/blog/different-post",
        publishedDate: "2026-03-09",
      },
    ]);
  });
});

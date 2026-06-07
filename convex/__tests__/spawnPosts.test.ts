import { describe, expect, it } from "vitest";
import { spawnPostsHandler } from "../ideas";
import { createMockMutationCtx } from "./helpers/mockMutationCtx";

const USER_ID = "user_test";
const IDEA_ID = "capturedIdeas:1";
const BRAND_ID = "corvo";

describe("spawnPosts behavior", () => {
  it("creates one v2 post and link per requested channel", async () => {
    const { ctx, tableDocs } = createMockMutationCtx({
      userId: USER_ID,
      seed: {
        capturedIdeas: [
          {
            _id: IDEA_ID,
            userId: USER_ID,
            brandId: BRAND_ID,
            status: "ready",
            tags: ["spawn"],
            sourceTitle: "Multi-channel idea",
            latestEntryPreview: "Seed note for spawning.",
            lastCapturedAt: 1,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        capturedIdeaEntries: [
          {
            _id: "capturedIdeaEntries:1",
            ideaId: IDEA_ID,
            userId: USER_ID,
            content: "First captured note.",
            captureChannel: "web",
            createdAt: 1,
          },
          {
            _id: "capturedIdeaEntries:2",
            ideaId: IDEA_ID,
            userId: USER_ID,
            content: "Second captured note.",
            captureChannel: "web",
            createdAt: 2,
          },
        ],
        v2BrandMemberships: [
          {
            _id: "v2BrandMemberships:1",
            userId: USER_ID,
            brandId: BRAND_ID,
            role: "owner",
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        v2Channels: [
          {
            _id: "v2Channels:1",
            brandId: BRAND_ID,
            channelId: "linkedin",
            platformId: "linkedin",
            label: "LinkedIn",
            routable: true,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            _id: "v2Channels:2",
            brandId: BRAND_ID,
            channelId: "reddit",
            platformId: "reddit",
            label: "Reddit",
            routable: true,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            _id: "v2Channels:3",
            brandId: BRAND_ID,
            channelId: "corvo-blog",
            platformId: "corvo-blog",
            label: "Corvo Blog",
            routable: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    });

    const created = await spawnPostsHandler(ctx, {
      ideaId: IDEA_ID,
      brandId: BRAND_ID,
      channelIds: ["linkedin", "reddit", "corvo-blog"],
    });

    expect(created).toHaveLength(3);
    expect(tableDocs("v2Posts")).toHaveLength(3);
    expect(tableDocs("capturedIdeaV2PostLinks")).toHaveLength(3);
    expect(tableDocs("v2PublishingIntents")).toHaveLength(3);
    expect(tableDocs("v2ProviderStates")).toHaveLength(3);
    expect(tableDocs("v2AuditEvents")).toHaveLength(3);

    const posts = tableDocs("v2Posts");
    const links = tableDocs("capturedIdeaV2PostLinks");
    const channelIds = posts.map((post) => post.channelId).sort();
    expect(channelIds).toEqual(["corvo-blog", "linkedin", "reddit"]);

    for (const link of links) {
      expect(link.ideaId).toBe(IDEA_ID);
      expect(link.userId).toBe(USER_ID);
      expect(link.brandId).toBe(BRAND_ID);
      expect(posts.some((post) => post._id === link.postId && post.channelId === link.channelId)).toBe(
        true
      );
    }

    const idea = tableDocs("capturedIdeas")[0];
    expect(idea.status).toBe("used");
    expect(idea.brandId).toBe(BRAND_ID);
  });
});

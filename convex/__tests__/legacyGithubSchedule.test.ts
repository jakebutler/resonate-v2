import { it, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.unstubAllGlobals());
it.each([false, true])(
  "retains a legacy callback as Needs Review unless a newer schedule superseded it (%s)",
  async (superseded) => {
    const t = convexTest(schema, modules);
    const user = t.withIdentity({ subject: "editor" });
    await user.mutation(api.publishing.seedMvpWorkspace, {});
    const { postId, intentId } = await user.mutation(
      api.publishing.createPostWithIntent,
      {
        brandId: "corvo",
        channelId: "corvo-blog",
        title: "Fixture",
        content: "Exact copy",
        scheduledDate: "2030-10-07",
        scheduledTime: "09:00",
        timezone: "UTC",
      },
    );
    await t.run(async (ctx) => {
      await ctx.db.patch(postId, {
        prUrl: "https://github.com/fixture/site/pull/7",
        branchName: "fixture",
        ...(superseded ? { scheduledDate: "2030-10-08" } : {}),
      });
      const state = await ctx.db
        .query("v2ProviderStates")
        .withIndex("by_intent", (q) => q.eq("intentId", intentId))
        .first();
      await ctx.db.patch(state!._id, {
        providerId: "github-pr",
        status: "submitted",
      });
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await t.action(internal.githubPrSync.syncFrontmatterAfterReschedule, {
      postId,
      intentId,
      userId: "editor",
      brandId: "corvo",
      prUrl: "https://github.com/fixture/site/pull/7",
      branchName: "fixture",
      scheduledDate: "2030-10-07",
      scheduledTime: "09:00",
      timezone: "UTC",
    });
    expect(fetch).not.toHaveBeenCalled();
    const post = await t.run((ctx) => ctx.db.get(postId));
    expect(post!.status === "needs-review").toBe(!superseded);
    expect(post!.content).toBe("Exact copy");
  },
);

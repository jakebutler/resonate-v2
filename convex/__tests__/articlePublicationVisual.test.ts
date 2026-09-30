// @vitest-environment node
// Synthetic artifact and read-only provider double; no network or qualification evidence.
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import schema from "../schema";
import { blogEditorialFingerprint } from "../../lib/blogContract";
import { articleArtifactVersion } from "../../lib/articleContracts";

const transport = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("../../lib/articlePublication", async original => ({ ...await original<typeof import("../../lib/articlePublication")>(), readArticlePublication: transport.read }));
const modules = import.meta.glob("../**/*.ts");
const api = anyApi;
async function fixture() {
  const t = convexTest(schema, modules), user = t.withIdentity({ subject: "fixture-owner" });
  const postId = await t.run(async ctx => {
    await ctx.db.insert("v2BrandMemberships", { userId: "fixture-owner", brandId: "corvo", role: "owner", createdAt: 1, updatedAt: 1 });
    const sourceStorageId = await ctx.storage.store(new Blob(["unprepared legacy source"], { type: "image/png" }));
    const id = await ctx.db.insert("v2Posts", { userId: "fixture-owner", brandId: "corvo", channelId: "corvo-blog", platformId: "corvo-blog", title: "Fictional bound export", content: "Exact fictional copy.", status: "pr-created", approvalState: "approved", timezone: "UTC", prUrl: "https://github.com/fictional-owner/fictional-repo/pull/1", branchName: "blog/fictional", contentFingerprint: "synthetic", heroImageStorageId: sourceStorageId, coverImageAlt: "Legacy alt", createdAt: 1, updatedAt: 1 });
    const post = (await ctx.db.get(id))!;
    await ctx.db.patch(id, { blogArtifact: { repository: "fictional-owner/fictional-repo", prNumber: 1, branchName: "blog/fictional", mdxPath: "apps/blog/blog/2026-10-01-fictional.mdx", heroPath: "apps/blog/public/images/blog/2026-10-01-fictional/hero.webp", canonicalUrl: "https://fictional.invalid/blog/fictional", editorialFingerprint: blogEditorialFingerprint(post), heroSha256: "a".repeat(64), coverImageAlt: "Exact approved visual alt" } });
    return id;
  });
  transport.read.mockReset();
  transport.read.mockImplementation(async params => ({ evidence: { checkedAt: Date.now(), editorialVersion: params.editorialVersion, artifactVersion: articleArtifactVersion(params.artifact), prState: "unknown", deploymentState: "unknown", availability: "blocked", reason: "SPECULATIVE no live publication" } }));
  return { t, user, postId };
}
describe("bound visual publication read adapter", () => {
  it("uses only current bound visual hero hash and manual alt without requiring a legacy crop", async () => {
    const f = await fixture();
    expect(await f.user.action(api.articlePublication.refresh, { postId: f.postId })).toMatchObject({ recorded: true });
    expect(transport.read).toHaveBeenCalledTimes(1);
    expect(transport.read.mock.calls[0][0]).toMatchObject({ heroSha256: "a".repeat(64), coverImageAlt: "Exact approved visual alt" });
  });
  it("blocks stale artifact editorial identity before any provider read or publication receipt write", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.postId, { content: "Changed exact copy." }));
    expect(await f.user.action(api.articlePublication.refresh, { postId: f.postId })).toMatchObject({ recorded: false, reason: expect.stringContaining("editorial version changed") });
    expect(transport.read).not.toHaveBeenCalled();
    expect(await f.t.run(ctx => ctx.db.query("articlePublications").first())).toBeNull();
  });
});

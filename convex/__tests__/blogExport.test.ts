import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api, internal } from "../_generated/api";
import { blogEditorialFingerprint } from "../../lib/blogContract";
const modules=import.meta.glob("../**/*.ts");
async function setup() {
  const t=convexTest(schema,modules);const user=t.withIdentity({subject:"editor"});
  await user.mutation(api.publishing.seedMvpWorkspace,{});
  const {postId,intentId}=await user.mutation(api.publishing.createPostWithIntent,{brandId:"corvo",channelId:"corvo-blog",title:"Article",content:"Exact copy.",scheduledDate:"2026-10-07",scheduledTime:"09:00",timezone:"America/Los_Angeles"});
  const source=await t.run(ctx=>ctx.storage.store(new Blob(["original"])));
  const derivative=await t.run(ctx=>ctx.storage.store(new Blob(["derivative"])));
  await user.mutation(api.publishing.updateBlogMetadata,{postId,metadata:{blogPublicationIntent:"published",coverImageAlt:"  Manual alt.  ",blogExcerpt:"Reviewed excerpt",blogAuthor:"Editor",blogCategory:"strategy",blogTags:["test"],blogSlug:"article",heroImageStorageId:source}});
  await t.mutation(internal.publishing.recordPreparedHero,{postId,userId:"editor",hero:{sourceStorageId:source,storageId:derivative,width:1600,height:900,mimeType:"image/webp",byteLength:100,sha256:"fixture",crop:"centre"}});
  return {t,user,postId,intentId};
}
describe("saved blog editorial approval", () => {
  it("persists exact metadata and preserves editorial approval for scheduling only", async () => {
    const {t,user,postId,intentId}=await setup();
    await user.mutation(api.publishing.setApproval,{postId,approvalState:"approved"});
    const approved=await t.run(ctx=>ctx.db.get(postId));
    expect(approved?.contentFingerprint).toBe(blogEditorialFingerprint(approved!));
    expect(approved?.coverImageAlt).toBe("  Manual alt.  ");
    await user.mutation(api.publishing.reschedule,{postId,scheduledDate:"2026-10-08",scheduledTime:"10:00"});
    expect(await t.run(ctx=>ctx.db.get(postId))).toMatchObject({approvalState:"approved",contentFingerprint:approved!.contentFingerprint});
    expect(await t.run(ctx=>ctx.db.get(intentId))).toMatchObject({approvalState:"approved",contentFingerprint:approved!.contentFingerprint});
    await user.mutation(api.publishing.updateBlogMetadata,{postId,metadata:{coverImageAlt:"Different alt"}});
    expect(await t.run(ctx=>ctx.db.get(postId))).toMatchObject({approvalState:"unapproved"});
  });
  it.each(["blogExcerpt","blogAuthor","blogCategory","blogSlug","coverImageAlt","blogPublicationIntent"])("clears approval for %s", async field => {
    const {t,user,postId}=await setup();await user.mutation(api.publishing.setApproval,{postId,approvalState:"approved"});
    await user.mutation(api.publishing.updateBlogMetadata,{postId,metadata:{[field]:field==="blogPublicationIntent"?"draft":"changed"}});
    expect(await t.run(ctx=>ctx.db.get(postId))).toMatchObject({approvalState:"unapproved"});
  });
  it("does not invent an approval for legacy missing intent/alt/prepared heroes", async () => {
    const {t,user,postId}=await setup();await t.run(ctx=>ctx.db.patch(postId,{blogPublicationIntent:undefined}));
    await expect(user.mutation(api.publishing.setApproval,{postId,approvalState:"approved"})).rejects.toThrow(/publication intent/);
    expect(await t.run(ctx=>ctx.db.get(postId))).toMatchObject({approvalState:"unapproved"});
  });
  it("pins an export against concurrent edits and rejects a stale schedule", async () => {
    const {t,user,postId}=await setup();await user.mutation(api.publishing.setApproval,{postId,approvalState:"approved"});
    const post=(await t.run(ctx=>ctx.db.get(postId)))!;
    const request={postId,fingerprint:post.contentFingerprint,schedule:JSON.stringify([post.scheduledDate,post.scheduledTime,post.timezone]),key:"reviewed-export"};
    await expect(user.mutation(api.publishing.claimBlogExport,{...request,schedule:"stale"})).rejects.toThrow(/changed/);
    await user.mutation(api.publishing.claimBlogExport,request);
    await expect(user.mutation(api.publishing.updateContent,{postId,content:"New copy"})).rejects.toThrow(/pending/);
    await expect(user.mutation(api.publishing.reschedule,{postId,scheduledDate:"2026-10-09"})).rejects.toThrow(/pending/);
    await user.mutation(api.publishing.recordGithubPr,{postId,result:{prUrl:"https://github.com/jakebutler/corvo-labs-dot-com/pull/123",branchName:"resonate/article",exportClaimKey:request.key,artifact:{repository:"jakebutler/corvo-labs-dot-com",prNumber:123,branchName:"resonate/article",mdxPath:"content/2026-10-07-article.mdx",canonicalUrl:"https://corvolabs.com/blog/2026-10-07-article"},sanitizedResponse:{}}});
    expect(await t.run(ctx=>ctx.db.get(postId))).toMatchObject({blogArtifact:{prNumber:123},approvalState:"approved"});
    expect((await t.run(ctx=>ctx.db.get(postId)))!.blogExportClaimKey).toBeUndefined();
  });
});

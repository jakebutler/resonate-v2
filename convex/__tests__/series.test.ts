import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../schema";
import { api } from "../_generated/api";
const modules=import.meta.glob("../**/*.ts");
async function fixture(){const t=convexTest(schema,modules);const user=t.withIdentity({subject:"editor"});await user.mutation(api.publishing.seedMvpWorkspace,{});const seriesId=await user.mutation(api.series.create,{brandId:"corvo",title:"Prepared series"});return {t,user,seriesId};}
async function make(user:ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,channelId:"corvo-blog"|"linkedin",n:number,brandId:"corvo"|"lower-db"="corvo") {return (await user.mutation(api.publishing.createPostWithIntent,{brandId,channelId,title:`${channelId} ${n}`,content:`Exact original ${n}`,scheduledDate:"2026-10-07",scheduledTime:"09:00",timezone:"America/Los_Angeles"})).postId;}
describe("existing-post series",()=>{
  it("adopts 15 articles and 30 companions, reloads, moves and detaches without editing any post",async()=>{
    const {t,user,seriesId}=await fixture();const originals=[];const entries=[];
    for(let i=0;i<15;i++){const article=await make(user,"corvo-blog",i);const one=await make(user,"linkedin",i*2);const two=await make(user,"linkedin",i*2+1);await t.run(ctx=>ctx.db.patch(one,{approvalState:"approved",status:i%2?"published":"submitted"}));for(const id of [article,one,two])originals.push(await t.run(ctx=>ctx.db.get(id)));entries.push(await user.mutation(api.series.attach,{seriesId,key:`entry-${i}`,articlePostId:article,companionPostIds:[one,two]}));}
    const result=await user.query(api.series.entries,{seriesId,paginationOpts:{numItems:25,cursor:null}});expect(result.isDone).toBe(true);expect(result.page).toHaveLength(15);expect(result.page.flatMap(e=>e.posts)).toHaveLength(45);
    await user.mutation(api.series.move,{seriesId,entryId:entries[1],direction:"up"});const reordered=await user.query(api.series.entries,{seriesId,paginationOpts:{numItems:25,cursor:null}});expect(reordered.page[0]._id).toBe(entries[1]);
    const companion=result.page[0].companionPostIds[0];await user.mutation(api.series.detach,{seriesId,entryId:entries[0],postId:companion});await user.mutation(api.series.detach,{seriesId,entryId:entries[1]});
    for(const post of originals)expect(await t.run(ctx=>ctx.db.get(post!._id))).toEqual(post);
    const calendar=await user.query(api.publishing.listCalendarItems,{seriesId});expect(calendar).toHaveLength(41);expect(calendar.some(x=>x.post._id===companion)).toBe(false);
  });
  it("rejects cross-user, cross-brand, repeated membership and cycles atomically",async()=>{
    const {t,user,seriesId}=await fixture();const article=await make(user,"corvo-blog",0);const social=await make(user,"linkedin",0);const foreign=await make(user,"linkedin",1,"lower-db");const other=t.withIdentity({subject:"other"});await other.mutation(api.publishing.seedMvpWorkspace,{});const theirs=await make(other,"linkedin",2);
    await expect(user.mutation(api.series.attach,{seriesId,key:"cycle",articlePostId:article,companionPostIds:[article]})).rejects.toThrow(/cycle/);
    await expect(user.mutation(api.series.attach,{seriesId,key:"brand",articlePostId:article,companionPostIds:[foreign]})).rejects.toThrow(/mismatch/);
    await expect(user.mutation(api.series.attach,{seriesId,key:"owner",articlePostId:article,companionPostIds:[theirs]})).rejects.toThrow(/mismatch/);
    await expect(user.mutation(api.series.attach,{seriesId,key:"channel",articlePostId:social,companionPostIds:[]})).rejects.toThrow(/blog/);
    await user.mutation(api.series.attach,{seriesId,key:"valid",articlePostId:article,companionPostIds:[social]});
    await expect(user.mutation(api.series.attach,{seriesId,key:"duplicate",articlePostId:article,companionPostIds:[]})).rejects.toThrow(/Duplicate/);
    await expect(other.query(api.series.get,{seriesId})).rejects.toThrow(/not found/);
    const rows=await t.run(ctx=>ctx.db.query("seriesEntries").collect());expect(rows).toHaveLength(1);
  });
});

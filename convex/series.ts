import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, brandIdValidator, requireBrandAccess, requireUserId } from "./campaignAccess";

export async function ownedSeries(ctx: QueryCtx | MutationCtx, userId: string, seriesId: Id<"postSeries">, edit = false) {
  const series = await ctx.db.get(seriesId);
  if (!series || series.userId !== userId) throw new Error("Series not found");
  const membership = await requireBrandAccess(ctx, userId, series.brandId);
  if (edit && membership.role === "viewer") throw new Error("Series editing requires an editor");
  return series;
}
export async function seriesPost(ctx: QueryCtx | MutationCtx, userId: string, brandId: string, postId: Id<"v2Posts">) {
  const post = await ctx.db.get(postId);
  if (!post || post.userId !== userId || post.brandId !== brandId) throw new Error("Post ownership or brand mismatch");
  await requireBrandAccess(ctx, userId, post.brandId);
  return post;
}
export async function attachEntry(ctx: MutationCtx, userId: string, seriesId: Id<"postSeries">, key: string, articlePostId: Id<"v2Posts">, companionPostIds: Id<"v2Posts">[]) {
  const series = await ownedSeries(ctx, userId, seriesId, true);
  if (!key.trim() || key.length > 160 || companionPostIds.length > 100) throw new Error("Invalid entry key or companion count");
  const ids = [articlePostId, ...companionPostIds];
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate membership or cycle");
  const existing = await ctx.db.query("seriesEntries").withIndex("by_series_and_key", q => q.eq("seriesId", seriesId).eq("key", key)).first();
  if (existing) throw new Error("Entry key already exists");
  for (const id of ids) {
    const post = await seriesPost(ctx, userId, series.brandId, id);
    if ((id === articlePostId) !== (post.channelId === "corvo-blog")) throw new Error("Article must be a blog; companions must use social channels");
    if (await ctx.db.query("seriesPostLinks").withIndex("by_series_and_post", q => q.eq("seriesId", seriesId).eq("postId", id)).first()) throw new Error("Duplicate series membership");
  }
  const last = await ctx.db.query("seriesEntries").withIndex("by_series_and_sequence", q => q.eq("seriesId", seriesId)).order("desc").first();
  const entryId = await ctx.db.insert("seriesEntries", {seriesId, key, sequence:(last?.sequence ?? 0) + 1, articlePostId, companionPostIds});
  for (const postId of ids) await ctx.db.insert("seriesPostLinks", {seriesId, entryId, postId});
  await ctx.db.patch(seriesId, {revision:series.revision + 1, updatedAt:Date.now()});
  await audit(ctx, {userId,brandId:series.brandId,action:"series.attach",summary:"Linked existing posts without editing publication records.",metadata:{seriesId,entryId,postIds:ids}});
  return entryId;
}
export const create = mutation({args:{brandId:brandIdValidator,title:v.string()},returns:v.id("postSeries"),handler:async(ctx,args)=>{
  const userId = await requireUserId(ctx);const membership=await requireBrandAccess(ctx,userId,args.brandId);
  if(membership.role === "viewer" || !args.title.trim() || args.title.length > 300) throw new Error("Valid title and editor access required");
  const now=Date.now();return await ctx.db.insert("postSeries",{...args,title:args.title.trim(),userId,revision:0,createdAt:now,updatedAt:now});
}});
export const list = query({args:{brandId:v.optional(brandIdValidator)},returns:v.any(),handler:async(ctx,args)=>{
  const userId=await requireUserId(ctx);
  const rows=args.brandId ? await ctx.db.query("postSeries").withIndex("by_user_and_brand",q=>q.eq("userId",userId).eq("brandId",args.brandId!)).take(200) : await ctx.db.query("postSeries").withIndex("by_user",q=>q.eq("userId",userId)).take(200);
  const visible=[];for(const row of rows){try{await requireBrandAccess(ctx,userId,row.brandId);visible.push(row);}catch{/* revoked brands are omitted */}}
  return visible;
}});
export const get = query({args:{seriesId:v.id("postSeries")},returns:v.any(),handler:async(ctx,args)=>ownedSeries(ctx,await requireUserId(ctx),args.seriesId)});
export const entries = query({args:{seriesId:v.id("postSeries"),paginationOpts:paginationOptsValidator},returns:v.any(),handler:async(ctx,args)=>{
  const userId=await requireUserId(ctx);const series=await ownedSeries(ctx,userId,args.seriesId);
  const result=await ctx.db.query("seriesEntries").withIndex("by_series_and_sequence",q=>q.eq("seriesId",args.seriesId)).paginate({...args.paginationOpts,numItems:Math.min(args.paginationOpts.numItems,50)});
  const page=[];for(const entry of result.page){const posts=[];for(const id of [entry.articlePostId,...entry.companionPostIds]){const post=await seriesPost(ctx,userId,series.brandId,id);const state=await ctx.db.query("v2ProviderStates").withIndex("by_post",q=>q.eq("postId",id)).order("desc").first();posts.push({post,providerState:state});}page.push({...entry,posts});}
  return {...result,page};
}});
export const picker = query({args:{seriesId:v.id("postSeries"),paginationOpts:paginationOptsValidator},returns:v.any(),handler:async(ctx,args)=>{
  const userId=await requireUserId(ctx);const series=await ownedSeries(ctx,userId,args.seriesId);
  const result=await ctx.db.query("v2Posts").withIndex("by_user",q=>q.eq("userId",userId)).order("desc").paginate({...args.paginationOpts,numItems:Math.min(args.paginationOpts.numItems,100)});
  const page=[];for(const post of result.page){if(post.brandId!==series.brandId)continue;const linked=await ctx.db.query("seriesPostLinks").withIndex("by_series_and_post",q=>q.eq("seriesId",args.seriesId).eq("postId",post._id)).first();if(!linked)page.push(post);}
  return {...result,page};
}});
export const attach = mutation({args:{seriesId:v.id("postSeries"),key:v.string(),articlePostId:v.id("v2Posts"),companionPostIds:v.array(v.id("v2Posts"))},returns:v.id("seriesEntries"),handler:async(ctx,args)=>attachEntry(ctx,await requireUserId(ctx),args.seriesId,args.key,args.articlePostId,args.companionPostIds)});
export const detach = mutation({args:{seriesId:v.id("postSeries"),entryId:v.id("seriesEntries"),postId:v.optional(v.id("v2Posts"))},returns:v.null(),handler:async(ctx,args)=>{
  const userId=await requireUserId(ctx);const series=await ownedSeries(ctx,userId,args.seriesId,true);const entry=await ctx.db.get(args.entryId);
  if(!entry || entry.seriesId!==series._id)throw new Error("Entry not found");
  const ids=args.postId ? [args.postId] : [entry.articlePostId,...entry.companionPostIds];
  if(args.postId===entry.articlePostId)throw new Error("Detach the article entry with its links");
  for(const id of ids){const link=await ctx.db.query("seriesPostLinks").withIndex("by_series_and_post",q=>q.eq("seriesId",series._id).eq("postId",id)).first();if(!link || link.entryId!==entry._id)throw new Error("Link not found");await ctx.db.delete(link._id);}
  if(args.postId)await ctx.db.patch(entry._id,{companionPostIds:entry.companionPostIds.filter(id=>id!==args.postId)});else await ctx.db.delete(entry._id);
  await ctx.db.patch(series._id,{revision:series.revision+1,updatedAt:Date.now()});
  await audit(ctx,{userId,brandId:series.brandId,action:"series.detach",summary:"Detached grouping links; original posts and receipts retained.",metadata:args});return null;
}});
export const move = mutation({args:{seriesId:v.id("postSeries"),entryId:v.id("seriesEntries"),direction:v.union(v.literal("up"),v.literal("down"))},returns:v.null(),handler:async(ctx,args)=>{
  const userId=await requireUserId(ctx);const series=await ownedSeries(ctx,userId,args.seriesId,true);const entry=await ctx.db.get(args.entryId);if(!entry || entry.seriesId!==series._id)throw new Error("Entry not found");
  const neighbor=args.direction==="up" ? await ctx.db.query("seriesEntries").withIndex("by_series_and_sequence",q=>q.eq("seriesId",series._id).lt("sequence",entry.sequence)).order("desc").first() : await ctx.db.query("seriesEntries").withIndex("by_series_and_sequence",q=>q.eq("seriesId",series._id).gt("sequence",entry.sequence)).first();
  if(neighbor){await ctx.db.patch(entry._id,{sequence:neighbor.sequence});await ctx.db.patch(neighbor._id,{sequence:entry.sequence});await ctx.db.patch(series._id,{revision:series.revision+1,updatedAt:Date.now()});}return null;
}});
export const addCompanions = mutation({args:{seriesId:v.id("postSeries"),entryId:v.id("seriesEntries"),postIds:v.array(v.id("v2Posts"))},returns:v.null(),handler:async(ctx,args)=>{
  const userId=await requireUserId(ctx);const series=await ownedSeries(ctx,userId,args.seriesId,true);const entry=await ctx.db.get(args.entryId);
  if(!entry||entry.seriesId!==series._id||!args.postIds.length||entry.companionPostIds.length+args.postIds.length>100||new Set(args.postIds).size!==args.postIds.length)throw new Error("Invalid companion selection");
  for(const postId of args.postIds){const post=await seriesPost(ctx,userId,series.brandId,postId);if(post.channelId==="corvo-blog"||await ctx.db.query("seriesPostLinks").withIndex("by_series_and_post",q=>q.eq("seriesId",series._id).eq("postId",postId)).first())throw new Error("Duplicate membership or invalid companion channel");await ctx.db.insert("seriesPostLinks",{seriesId:series._id,entryId:entry._id,postId});}
  await ctx.db.patch(entry._id,{companionPostIds:[...entry.companionPostIds,...args.postIds]});await ctx.db.patch(series._id,{revision:series.revision+1,updatedAt:Date.now()});await audit(ctx,{userId,brandId:series.brandId,action:"series.attach_companions",summary:"Linked existing companions without editing payloads.",metadata:args});return null;
}});

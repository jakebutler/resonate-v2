import {reconcileAllocation} from "./queueDispatch";
import { linkedInPayload } from "../lib/socialPayload";
import {v} from "convex/values";
import {internalMutation,internalQuery,type MutationCtx,query} from "./_generated/server";
import type {Doc,Id} from "./_generated/dataModel";
import {audit,requireBrandAccess,requireUserId} from "./campaignAccess";
import {ACTIVE_BUFFER_STATES,mayApplyDelivery} from "../lib/bufferContracts";
import {sanitizeProviderResponse} from "../lib/sanitize";
export async function applyRefresh(ctx:MutationCtx,args:{providerStateId:Id<"v2ProviderStates">;postId:Id<"v2Posts">;providerStateStatus:Doc<"v2ProviderStates">["status"];providerPostId?:string;reason?:string;sanitizedResponse?:unknown;checkedAt?:number;expectedAttemptId?:Id<"v2PublishAttempts">;ok?:boolean}){
 const state=await ctx.db.get(args.providerStateId);const post=await ctx.db.get(args.postId);const checkedAt=args.checkedAt??Date.now();
 if(!state||!post||state.postId!==post._id||state.simulated===true||state.providerId!=="buffer"||args.expectedAttemptId&&args.expectedAttemptId!==state.lastAttemptId||args.providerPostId&&args.providerPostId!==state.providerPostId||(state.lastCheckedAt??0)>checkedAt)return {updated:false};
 const receipt=sanitizeProviderResponse((args.sanitizedResponse??{}) as Record<string,unknown>);const updated=typeof receipt.providerUpdatedAt==="string"?Date.parse(receipt.providerUpdatedAt):undefined;
 if(updated&&state.providerUpdatedAt&&updated<state.providerUpdatedAt){await ctx.db.patch(state._id,{lastCheckedAt:checkedAt});return {updated:false};}
 if(args.ok===false){await ctx.db.patch(state._id,{lastCheckedAt:checkedAt,lastReadError:"Provider status could not be verified; delivery receipt retained.",updatedAt:Date.now()});await audit(ctx,{userId:post.userId,brandId:post.brandId,postId:post._id,action:"provider.status_read_failed",summary:"Provider lookup failed; no terminal delivery state inferred.",metadata:{receipt,checkedAt}});return {updated:false};}
 if(!mayApplyDelivery(state.status,args.providerStateStatus)){await ctx.db.patch(state._id,{lastCheckedAt:checkedAt});return {updated:false};}
 const publishedUrl=typeof receipt.publishedUrl==="string"&&/^https:\/\/(www\.)?linkedin\.com\//.test(receipt.publishedUrl)?receipt.publishedUrl:undefined;
 await ctx.db.patch(state._id,{status:args.providerStateStatus,lastCheckedAt:checkedAt,providerUpdatedAt:updated&&Number.isFinite(updated)?updated:state.providerUpdatedAt,dueAt:typeof receipt.dueAt==="string"?receipt.dueAt:state.dueAt,publishedAt:typeof receipt.publishedAt==="string"?receipt.publishedAt:state.publishedAt,publishedUrl:publishedUrl??state.publishedUrl,lastReceipt:receipt,lastReadError:undefined,lastResponseSummary:args.reason??`Verified Buffer ${args.providerStateStatus}`,updatedAt:Date.now()});
 const attempt=state.lastAttemptId?await ctx.db.get(state.lastAttemptId):null;
 if(attempt && ["queued","publishing","published","cancelled","removed","failed"].includes(args.providerStateStatus)){
  const terminal=["published","cancelled","removed","failed"].includes(args.providerStateStatus);
  const claim=await reconcileAllocation(ctx,attempt._id,terminal?"released":"confirmed",state.providerPostId);
  if(["pending","ambiguous"].includes(attempt.status)){await ctx.db.patch(attempt._id,{status:args.providerStateStatus==="failed"?"permanent-failure":"success",providerPostId:state.providerPostId,observedDeliveryStatus:args.providerStateStatus,updatedAt:Date.now()});const intent=await ctx.db.get(attempt.intentId);if(intent?.activeBufferClaimKey===attempt.idempotencyKey)await ctx.db.patch(intent._id,{activeBufferClaimKey:undefined});}
  if(claim?.reviewRowId)await ctx.db.patch(claim.reviewRowId,{status:["queued","publishing","published"].includes(args.providerStateStatus)?"queued":"held",providerPostId:state.providerPostId,deliveryStatus:args.providerStateStatus,reason:terminal?`Verified ${args.providerStateStatus}; no replay of this accepted post.`:undefined,updatedAt:Date.now()});
 }
 const currentVersionMatches=!attempt || attempt.submissionSnapshot.title===post.title&&attempt.submissionSnapshot.content===linkedInPayload(post.content,post.platformSettings)&&(attempt.submissionSnapshot.firstComment??"")===(post.linkedinFirstComment?.trim()??"");
 const status=!currentVersionMatches?"needs-review":args.providerStateStatus==="not-submitted"?post.status:args.providerStateStatus==="cancel-intent-recorded"?"needs-review":args.providerStateStatus;
 await ctx.db.patch(post._id,{status,updatedAt:Date.now()});await audit(ctx,{userId:post.userId,brandId:post.brandId,postId:post._id,action:"provider.status_refresh",summary:`Verified Buffer ${args.providerStateStatus}; editorial approval retained.`,metadata:{receipt,checkedAt,attemptId:state.lastAttemptId}});return {updated:true};
}
export const oldestActive=internalQuery({args:{limit:v.number()},returns:v.any(),handler:async(ctx,args)=>{
 const limit=Math.min(50,Math.max(1,args.limit));const rows=[];
 for(const status of ACTIVE_BUFFER_STATES){const page=await ctx.db.query("v2ProviderStates").withIndex("by_status_and_last_checked",q=>q.eq("status",status)).take(limit);rows.push(...page.filter(s=>s.providerId==="buffer"&&s.simulated!==true&&s.providerPostId&&!s.providerPostId.startsWith("mock-")));}
 return rows.sort((a,b)=>(a.lastCheckedAt??0)-(b.lastCheckedAt??0)||a._creationTime-b._creationTime).slice(0,limit);
}});
export const control=internalQuery({args:{},returns:v.any(),handler:async(ctx)=>ctx.db.query("bufferPollControl").withIndex("by_key",q=>q.eq("key","buffer")).first()});
export const claimPoll=internalMutation({args:{},returns:v.boolean(),handler:async(ctx)=>{
 const row=await ctx.db.query("bufferPollControl").withIndex("by_key",q=>q.eq("key","buffer")).first();const now=Date.now();if((row?.backoffUntil??0)>now||(row?.claimedUntil??0)>now)return false;if(row)await ctx.db.patch(row._id,{claimedUntil:now+600000});else await ctx.db.insert("bufferPollControl",{key:"buffer",claimedUntil:now+600000});return true;
}});
export const finishPoll=internalMutation({args:{backoffUntil:v.optional(v.number())},returns:v.null(),handler:async(ctx,args)=>{const row=await ctx.db.query("bufferPollControl").withIndex("by_key",q=>q.eq("key","buffer")).first();if(row)await ctx.db.patch(row._id,{claimedUntil:undefined,backoffUntil:Math.max(row.backoffUntil??0,args.backoffUntil??0)});return null;}});
export const refreshContext=internalQuery({args:{postId:v.id("v2Posts"),userId:v.string()},returns:v.any(),handler:async(ctx,args)=>{
 const post=await ctx.db.get(args.postId);if(!post||post.userId!==args.userId)throw new Error("Post not found");await requireBrandAccess(ctx,args.userId,post.brandId);const state=await ctx.db.query("v2ProviderStates").withIndex("by_post",q=>q.eq("postId",post._id)).order("desc").first();if(!state||state.providerId!=="buffer"||state.simulated===true||!state.providerPostId||state.providerPostId.startsWith("mock-"))throw new Error("No live Buffer receipt to refresh");return state;
}});
export const history=query({args:{postId:v.id("v2Posts")},returns:v.any(),handler:async(ctx,args)=>{
 const userId=await requireUserId(ctx);const post=await ctx.db.get(args.postId);if(!post||post.userId!==userId)throw new Error("Post not found");await requireBrandAccess(ctx,userId,post.brandId);const state=await ctx.db.query("v2ProviderStates").withIndex("by_post",q=>q.eq("postId",post._id)).order("desc").first();const attempt=state?.lastAttemptId?await ctx.db.get(state.lastAttemptId):null;return {state,attempt:attempt?.postId===post._id?attempt:null,receipts:await ctx.db.query("v2AuditEvents").withIndex("by_post",q=>q.eq("postId",post._id)).order("desc").take(50)};
}});
export const reconcileLegacyCancellation=internalMutation({args:{providerStateId:v.id("v2ProviderStates")},returns:v.boolean(),handler:async(ctx,args)=>{
 const state=await ctx.db.get(args.providerStateId);if(!state||state.status!=="cancel-intent-recorded"||state.providerId!=="buffer"||state.simulated===true)return false;const post=await ctx.db.get(state.postId);if(!post)return false;
 const events=await ctx.db.query("v2AuditEvents").withIndex("by_post",q=>q.eq("postId",post._id)).order("desc").take(50);
 const proof=events.find(e=>["provider.buffer_cancel","provider.buffer_unpublish"].includes(e.action)&&e.metadata?.providerPostId===state.providerPostId&&e.metadata?.sanitizedResponse?.providerId==="buffer");const next=proof?(proof.action==="provider.buffer_unpublish"?"removed":"cancelled"):"needs-review";
 await ctx.db.patch(state._id,{status:next,lastCheckedAt:Date.now(),lastResponseSummary:proof?"Confirmed from the recorded Buffer deletion receipt.":"Legacy cancel intent lacks a definitive matching deletion receipt; review required."});await ctx.db.patch(post._id,{status:next});await audit(ctx,{userId:post.userId,brandId:post.brandId,postId:post._id,action:"provider.legacy_cancel_reconciled",summary:proof?"Reconciled recorded deletion proof; no provider write.":"No deletion proof; cancellation remains unverified.",metadata:{evidenceEventId:proof?._id}});return Boolean(proof);
}});
export const recordBackoff=internalMutation({args:{backoffUntil:v.number()},returns:v.null(),handler:async(ctx,args)=>{const row=await ctx.db.query("bufferPollControl").withIndex("by_key",q=>q.eq("key","buffer")).first();if(row)await ctx.db.patch(row._id,{backoffUntil:Math.max(row.backoffUntil??0,args.backoffUntil)});else await ctx.db.insert("bufferPollControl",{key:"buffer",backoffUntil:args.backoffUntil});return null;}});

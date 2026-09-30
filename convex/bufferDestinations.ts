import { socialReleaseVersion, postScheduleVersion } from "../lib/socialPayload";
import {v} from "convex/values";
import {query,mutation,internalQuery,internalMutation,type QueryCtx,type MutationCtx} from "./_generated/server";
import {audit,brandIdValidator,requireBrandAccess,requireUserId} from "./campaignAccess";
import {destinationValidator,capabilityValidator} from "./bufferValidators";
import {destinationHold,destinationIdentity} from "../lib/bufferContracts";
import type {Doc} from "./_generated/dataModel";
import {fingerprintPostContent} from "../lib/domain";
export const releaseVersion=socialReleaseVersion;
export const scheduleVersion=postScheduleVersion;
export async function readDestination(ctx:QueryCtx|MutationCtx,userId:string,brandId:Doc<"v2Posts">["brandId"]){return await ctx.db.query("bufferDestinations").withIndex("by_user_and_brand",q=>q.eq("userId",userId).eq("brandId",brandId)).first();}
export async function destinationSubmissionHold(ctx:QueryCtx|MutationCtx,post:Doc<"v2Posts">){
 const row=await readDestination(ctx,post.userId,post.brandId);const d=row?.destination;const hold=destinationHold(d,Boolean(post.linkedinFirstComment?.trim()));if(hold)return hold;
 if(!post.destinationReview||post.destinationReview.identity!==destinationIdentity(d!)||post.destinationReview.fingerprint!==releaseVersion(post)||post.destinationReview.schedule!==scheduleVersion(post))return "Review the current destination, final payload and schedule before queueing.";
 return null;
}
export const get=query({args:{brandId:brandIdValidator},returns:v.any(),handler:async(ctx,args)=>{const userId=await requireUserId(ctx);await requireBrandAccess(ctx,userId,args.brandId);return readDestination(ctx,userId,args.brandId);}});
export const authorized=internalQuery({args:{brandId:brandIdValidator,userId:v.string()},returns:v.any(),handler:async(ctx,args)=>{await requireBrandAccess(ctx,args.userId,args.brandId);return readDestination(ctx,args.userId,args.brandId);}});
export const record=internalMutation({args:{brandId:brandIdValidator,userId:v.string(),destination:v.optional(destinationValidator),error:v.optional(v.string())},returns:v.null(),handler:async(ctx,args)=>{
 await requireBrandAccess(ctx,args.userId,args.brandId);const old=await readDestination(ctx,args.userId,args.brandId);let destination=args.destination;
 if(destination&&old?.destination&&destinationIdentity(destination)===destinationIdentity(old.destination))destination={...destination,firstComment:old.destination.firstComment};
 const patch={destination,error:args.error,updatedAt:Date.now()};if(old)await ctx.db.patch(old._id,patch);else await ctx.db.insert("bufferDestinations",{userId:args.userId,brandId:args.brandId,...patch});return null;
}});
export const confirmFirstComment=mutation({args:{brandId:brandIdValidator,channelId:v.string(),value:capabilityValidator.fields.value,evidence:v.string()},returns:v.null(),handler:async(ctx,args)=>{
 const userId=await requireUserId(ctx);const access=await requireBrandAccess(ctx,userId,args.brandId);const row=await readDestination(ctx,userId,args.brandId);
 if(access.role==="viewer"||!row?.destination||row.destination.channelId!==args.channelId||!args.evidence.trim()||args.evidence.length>500)throw new Error("Confirm the displayed account and provide plan evidence.");
 const capability={value:args.value,source:"operator-confirmed" as const,checkedAt:Date.now(),evidence:args.evidence.trim()};await ctx.db.patch(row._id,{destination:{...row.destination,firstComment:capability},updatedAt:Date.now()});await audit(ctx,{userId,brandId:args.brandId,action:"buffer.capability_confirmed",summary:"Operator confirmed first-comment entitlement for the displayed channel.",metadata:{channelId:args.channelId,capability}});return null;
}});
export const pin=mutation({args:{postId:v.id("v2Posts"),expectedVersion:v.string(),identity:v.string()},returns:v.null(),handler:async(ctx,args)=>{
 const userId=await requireUserId(ctx);const post=await ctx.db.get(args.postId);if(!post||post.userId!==userId||post.channelId!=="linkedin")throw new Error("Post not found");const access=await requireBrandAccess(ctx,userId,post.brandId);if(access.role==="viewer")throw new Error("Editor access required");
 const row=await readDestination(ctx,userId,post.brandId);const hold=destinationHold(row?.destination,Boolean(post.linkedinFirstComment?.trim()));if(hold)throw new Error(hold);
 if(args.expectedVersion!==releaseVersion(post)||args.identity!==destinationIdentity(row!.destination!))throw new Error("Destination or copy changed; review again.");
 await ctx.db.patch(post._id,{destinationReview:{identity:args.identity,fingerprint:args.expectedVersion,schedule:scheduleVersion(post),checkedAt:Date.now(),actor:userId}});await audit(ctx,{userId,brandId:post.brandId,postId:post._id,action:"buffer.destination_review",summary:"Reviewed exact destination, final payload and schedule; this action sends nothing.",metadata:{identity:args.identity,schedule:scheduleVersion(post)}});return null;
}});
export const bodyLinkAlternative=mutation({args:{postId:v.id("v2Posts"),expectedVersion:v.string()},returns:v.null(),handler:async(ctx,args)=>{
 const userId=await requireUserId(ctx);const post=await ctx.db.get(args.postId);if(!post||post.userId!==userId||post.channelId!=="linkedin")throw new Error("Post not found");const access=await requireBrandAccess(ctx,userId,post.brandId);if(access.role==="viewer")throw new Error("Editor access required");
 if(releaseVersion(post)!==args.expectedVersion||!post.linkedinFirstComment?.trim())throw new Error("Copy changed; review the alternative again.");const content=`${post.content}\n\n${post.linkedinFirstComment}`;const fingerprint=fingerprintPostContent({title:post.title,content});await ctx.db.patch(post._id,{content,linkedinFirstComment:undefined,companionLink:post.companionLink?{...post.companionLink,placement:"body",resolvedPlacement:"body"}:undefined,approvalState:"unapproved",status:"draft",contentFingerprint:fingerprint,destinationReview:undefined,updatedAt:Date.now()});const intents=await ctx.db.query("v2PublishingIntents").withIndex("by_post_and_updated_at",q=>q.eq("postId",post._id)).order("desc").first();if(intents)await ctx.db.patch(intents._id,{approvalState:"unapproved",contentFingerprint:fingerprint,updatedAt:Date.now()});await audit(ctx,{userId,brandId:post.brandId,postId:post._id,action:"post.body_link_alternative",summary:"Explicitly moved the reviewed comment into body copy; editorial reapproval required."});return null;
}});

import {seedCapacity} from "../../test-support/queueCapacityFixture";
import {describe,it,expect,afterEach,vi} from "vitest";
import {convexTest} from "convex-test";
import schema from "../schema";
import {api,internal} from "../_generated/api";
import {socialReleaseVersion} from "../../lib/socialPayload";
import {destinationIdentity} from "../../lib/bufferContracts";
const modules=import.meta.glob("../**/*.ts");
async function fixture(){const t=convexTest(schema,modules);const user=t.withIdentity({subject:"editor"});await user.mutation(api.publishing.seedMvpWorkspace,{});const {postId,intentId}=await user.mutation(api.publishing.createPostWithIntent,{brandId:"corvo",channelId:"linkedin",title:"Fixture",content:"Exact original copy",scheduledDate:"2030-10-07",scheduledTime:"09:00",timezone:"America/Los_Angeles"});const destination={channelId:"fixture-page",organizationId:"fixture-org",displayName:"Fixture Company",handle:"corvo-labs-us",accountType:"page",disconnected:false,locked:false,queuePaused:false,flagsVerified:true,checkedAt:Date.now(),firstComment:{value:"unknown" as const,source:"unknown" as const,checkedAt:Date.now(),evidence:"Unknown fixture plan"}};await t.mutation(internal.bufferDestinations.record,{userId:"editor",brandId:"corvo",destination});await seedCapacity(t,"editor","corvo",destination);return {t,user,postId,intentId,destination};}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe("reviewed Buffer foundations",()=>{
 it("pins exact destination/payload/schedule and rejects drift; body fallback needs reapproval",async()=>{const {t,user,postId,destination}=await fixture();await user.mutation(api.publishing.setApproval,{postId,approvalState:"approved"});expect(await t.query(internal.publishing.getBufferSubmissionContext,{postId,userId:"editor"})).toMatchObject({eligible:false,reason:expect.stringContaining("Review")});let post=(await t.run(ctx=>ctx.db.get(postId)))!;await user.mutation(api.bufferDestinations.pin,{postId,expectedVersion:socialReleaseVersion(post),identity:destinationIdentity(destination)});expect(await t.query(internal.publishing.getBufferSubmissionContext,{postId,userId:"editor"})).toMatchObject({eligible:true});await user.mutation(api.publishing.reschedule,{postId,scheduledDate:"2030-10-08",scheduledTime:"09:00"});expect(await t.query(internal.publishing.getBufferSubmissionContext,{postId,userId:"editor"})).toMatchObject({eligible:false});expect((await t.run(ctx=>ctx.db.get(postId)))!.approvalState).toBe("approved");await user.mutation(api.publishing.updateContent,{postId,linkedinFirstComment:"https://corvolabs.com/blog/fixture"});post=(await t.run(ctx=>ctx.db.get(postId)))!;await user.mutation(api.publishing.setApproval,{postId,approvalState:"approved"});await expect(user.mutation(api.bufferDestinations.pin,{postId,expectedVersion:socialReleaseVersion(post),identity:destinationIdentity(destination)})).rejects.toThrow(/unknown/);await user.mutation(api.bufferDestinations.bodyLinkAlternative,{postId,expectedVersion:socialReleaseVersion(post)});expect(await t.run(ctx=>ctx.db.get(postId))).toMatchObject({content:"Exact original copy\n\nhttps://corvolabs.com/blog/fixture",approvalState:"unapproved"});});
 it("retains verified terminal receipts, approval, and attempts on stale/error/missing responses",async()=>{const {t,postId,intentId}=await fixture();await t.run(ctx=>ctx.db.patch(postId,{approvalState:"approved"}));const stateId=await t.run(ctx=>ctx.db.insert("v2ProviderStates",{postId,intentId,providerId:"buffer",status:"queued",providerPostId:"external-post",createdAt:1,updatedAt:1}));const base={providerStateId:stateId,postId,providerPostId:"external-post",ok:true,sanitizedResponse:{}};await t.mutation(internal.publishing.recordBufferStatusRefresh,{...base,providerStateStatus:"publishing",checkedAt:100});await t.mutation(internal.publishing.recordBufferStatusRefresh,{...base,providerStateStatus:"queued",checkedAt:101});expect((await t.run(ctx=>ctx.db.get(stateId)))!.status).toBe("publishing");await t.mutation(internal.publishing.recordBufferStatusRefresh,{...base,providerStateStatus:"published",checkedAt:102,sanitizedResponse:{publishedAt:"2030-10-07T16:00:00Z",publishedUrl:"https://www.linkedin.com/posts/fixture"}});await t.mutation(internal.publishing.recordBufferStatusRefresh,{...base,providerStateStatus:"unavailable",checkedAt:103,ok:false});await t.mutation(internal.publishing.recordBufferStatusRefresh,{...base,providerStateStatus:"queued",checkedAt:104});expect(await t.run(ctx=>ctx.db.get(stateId))).toMatchObject({status:"published",publishedUrl:"https://www.linkedin.com/posts/fixture"});expect((await t.run(ctx=>ctx.db.get(postId)))!.approvalState).toBe("approved");});
 it("requires matching deletion proof and represents removal after publication separately",async()=>{const {t,postId,intentId}=await fixture();const stateId=await t.run(async ctx=>{const state=(await ctx.db.query("v2ProviderStates").withIndex("by_intent",q=>q.eq("intentId",intentId)).first())!;await ctx.db.patch(state._id,{providerId:"buffer",status:"queued",providerPostId:"external-post"});return state._id;});const args={postId,intentId,userId:"editor",brandId:"corvo" as const,intentType:"cancel" as const,providerPostId:"external-post",providerStateStatus:"cancelled" as const,ok:true};await t.mutation(internal.publishing.recordBufferCancelResult,{...args,sanitizedResponse:{}});expect((await t.run(ctx=>ctx.db.get(stateId)))!.status).toBe("cancel-requested");await t.mutation(internal.publishing.recordBufferCancelResult,{...args,sanitizedResponse:{deletionConfirmed:true}});expect((await t.run(ctx=>ctx.db.get(postId)))!.status).toBe("cancelled");await t.run(ctx=>ctx.db.patch(stateId,{status:"published",publishedAt:"2030-10-07T16:00Z"}));await t.mutation(internal.publishing.recordBufferCancelResult,{...args,intentType:"unpublish",sanitizedResponse:{deletionConfirmed:true}});expect((await t.run(ctx=>ctx.db.get(stateId)))!.status).toBe("removed");});
 it("fairly rotates beyond fifty active rows without a second polling job",async()=>{const {t,postId,intentId}=await fixture();const ids=[];for(let n=0;n<75;n++)ids.push(await t.run(ctx=>ctx.db.insert("v2ProviderStates",{postId,intentId,providerId:"buffer",status:"queued",providerPostId:`external-${n}`,createdAt:n,updatedAt:n})));const observed=new Set<string>();for(let run=0;run<2;run++){const rows=await t.query(internal.bufferDelivery.oldestActive,{limit:50});for(const row of rows){observed.add(row._id);await t.mutation(internal.publishing.recordBufferStatusRefresh,{providerStateId:row._id,postId,providerStateStatus:"queued",providerPostId:row.providerPostId,ok:true,checkedAt:10000+run});}}expect(observed.size).toBe(75);expect(ids.every(id=>observed.has(id))).toBe(true);});
 it("stops the existing cron on rate exhaustion and persists Retry-After",async()=>{const {t,postId,intentId}=await fixture();vi.stubEnv("BUFFER_LIVE_SUBMISSION","approved");vi.stubEnv("LIVE_PROVIDER_VALIDATION_APPROVED","approved");vi.stubEnv("BUFFER_API_KEY","fixture-secret");for(let n=0;n<8;n++)await t.run(ctx=>ctx.db.insert("v2ProviderStates",{postId,intentId,providerId:"buffer",status:"queued",providerPostId:`external-${n}`,createdAt:n,updatedAt:n}));const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({errors:[{message:"Rate limited"}]}),{status:429,headers:{"Retry-After":"3600"}}));vi.stubGlobal("fetch",fetch);expect(await t.action(internal.bufferLive.refreshSubmittedStatuses,{})).toEqual({refreshed:0});expect(fetch).toHaveBeenCalledTimes(1);await t.action(internal.bufferLive.refreshSubmittedStatuses,{});expect(fetch).toHaveBeenCalledTimes(1);const control=await t.query(internal.bufferDelivery.control,{});expect(control?.backoffUntil).toBeGreaterThan(Date.now());});
});
describe("legacy cancellation receipts",()=>{
 it.each([true,false])("reconciles only a matching historical deletion receipt (%s)",async(proof)=>{const {t,postId,intentId}=await fixture();const stateId=await t.run(async ctx=>{const state=(await ctx.db.query("v2ProviderStates").withIndex("by_intent",q=>q.eq("intentId",intentId)).first())!;await ctx.db.patch(state._id,{providerId:"buffer",status:"cancel-intent-recorded",providerPostId:"external-legacy",simulated:false});if(proof)await ctx.db.insert("v2AuditEvents",{userId:"editor",brandId:"corvo",postId,intentId,action:"provider.buffer_cancel",summary:"Buffer cancel/delete recorded.",metadata:{providerPostId:"external-legacy",sanitizedResponse:{providerId:"buffer",intentType:"cancel"}},createdAt:1});return state._id;});await t.mutation(internal.bufferDelivery.reconcileLegacyCancellation,{providerStateId:stateId});expect((await t.run(ctx=>ctx.db.get(stateId)))!.status).toBe(proof?"cancelled":"needs-review");});
});

it("selects live Buffer receipts before bounding a mixed-provider cohort", async () => {
  const { t, postId, intentId } = await fixture();
  for (let n = 0; n < 10; n++)
    await t.run((ctx) =>
      ctx.db.insert("v2ProviderStates", {
        postId,
        intentId,
        providerId: "mock",
        status: "queued",
        providerPostId: `mock-${n}`,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
  const id = await t.run((ctx) =>
    ctx.db.insert("v2ProviderStates", {
      postId,
      intentId,
      providerId: "buffer",
      status: "queued",
      providerPostId: "live-fixture",
      createdAt: 2,
      updatedAt: 2,
    }),
  );
  expect(
    (await t.query(internal.bufferDelivery.oldestActive, { limit: 1 })).map(
      (s) => s._id,
    ),
  ).toEqual([id]);
});
it.each([true, false])(
  "releases a legacy cancellation allocation only with matching deletion proof (%s)",
  async (proof) => {
    const { t, user, postId, intentId, destination } = await fixture();
    await user.mutation(api.publishing.setApproval, {
      postId,
      approvalState: "approved",
    });
    const post = (await t.run((ctx) => ctx.db.get(postId)))!;
    await user.mutation(api.bufferDestinations.pin, {
      postId,
      expectedVersion: socialReleaseVersion(post),
      identity: destinationIdentity(destination),
    });
    const claim = await t.mutation(internal.publishing.claimBufferSubmission, {
      postId,
      userId: "editor",
    });
    if (!claim.eligible) throw new Error("Fixture held");
    const stateId = await t.run(async (ctx) => {
      const state = (await ctx.db
        .query("v2ProviderStates")
        .withIndex("by_intent", (q) => q.eq("intentId", intentId))
        .first())!;
      await ctx.db.patch(state._id, {
        providerId: "buffer",
        status: "cancel-intent-recorded",
        providerPostId: "external-legacy",
        lastAttemptId: claim.attemptId,
      });
      if (proof)
        await ctx.db.insert("v2AuditEvents", {
          userId: "editor",
          brandId: "corvo",
          postId,
          intentId,
          action: "provider.buffer_cancel",
          summary: "Confirmed matching deletion",
          metadata: {
            providerPostId: "external-legacy",
            sanitizedResponse: {
              providerId: "buffer",
              deletionConfirmed: true,
            },
          },
          createdAt: 1,
        });
      return state._id;
    });
    await t.mutation(internal.bufferDelivery.reconcileLegacyCancellation, {
      providerStateId: stateId,
    });
    expect(
      (await t.run((ctx) => ctx.db.query("queueDispatchClaims").collect()))[0]
        .status,
    ).toBe(proof ? "released" : "active");
  },
);

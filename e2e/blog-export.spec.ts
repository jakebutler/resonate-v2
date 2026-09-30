import sharp from "sharp";
import { test, expect, type Page } from "@playwright/test";

type Query = {queryId:number;udfPath:string;args:Record<string,unknown>[];type:string};
type WireMessage = {type:string;requestId:number;udfPath:string;args:Record<string,unknown>[];newVersion:number;modifications:Query[]};
const fixturePost = {
  _id:"fixture-blog",_creationTime:1,userId:"fixture-editor",brandId:"corvo",channelId:"corvo-blog",platformId:"corvo-blog",
  title:"Prepared fixture article",content:"Approved fixture prose.\n\n## Evidence\n\nOne reviewed claim.",
  status:"scheduled",approvalState:"unapproved",scheduledDate:"2026-10-07",scheduledTime:"09:00",timezone:"America/Los_Angeles",
  blogExcerpt:"Reviewed fixture excerpt",blogAuthor:"Fixture Editor",blogCategory:"strategy",blogTags:["fixture"],blogSlug:"fixture-article",
  blogPublicationIntent:"draft",coverImageAlt:"Reviewed fixture hero",heroImageStorageId:"fixture-original",heroImageUrl:"",
  preparedHero:{sourceStorageId:"fixture-original",storageId:"fixture-prepared",width:1600,height:900,mimeType:"image/webp",byteLength:12000,sha256:"sanitized-fixture-hash",crop:"centre"},
  contentFingerprint:"fixture",createdAt:1,updatedAt:1,
};
async function mockBlogWorkspace(page:Page) {
  const hero=await sharp({create:{width:1600,height:900,channels:3,background:"#15616d"}}).webp().toBuffer();
  await page.route("**/fixture-hero.webp", route => route.fulfill({body:hero,contentType:"image/webp"}));
  let post={...fixturePost};const mutations:WireMessage[]=[];const exports:Record<string,unknown>[]=[];
  await page.route("**/api/publish*",async route => {
    if(route.request().method()==="POST") {exports.push(route.request().postDataJSON());await route.fulfill({json:{prUrl:"https://github.com/fixture/site/pull/1",branchName:"fixture/article",sanitizedResponse:{number:1,state:"open"}}});}
    else await route.fulfill({json:{repository:"fixture/site",filePath:"content/blog/2026-10-07-fixture-article.mdx"}});
  });
  await page.routeWebSocket(/\/api\/.*\/sync/,socket=>{
    const queries=new Map<number,Query>();let version={querySet:0,ts:"AAAAAAAAAAA=",identity:0};let clock=0;
    function value(path:string) {
      switch(path) {
        case "publishing:listBrands":return [{brandId:"corvo",name:"Corvo Labs"}];
        case "publishing:getPostById":return post;
        case "publishing:listCalendarItems":return [{post,intent:{_id:"fixture-intent",scheduledDate:post.scheduledDate,scheduledTime:post.scheduledTime,timezone:post.timezone},providerState:{status:"not-submitted"},attempts:[],auditEvents:[],attemptCount:0}];
        case "publishing:bufferLiveSubmissionEnabled":return {enabled:false};
        case "publishing:getPostAuditTrail":return {attempts:[],auditEvents:[]};
        case "v2Storage:getFileUrl":return "/fixture-hero.webp";
        default:return null;
      }
    }
    function transition(querySet=version.querySet) {
      const encoded=Buffer.alloc(8);encoded.writeBigUInt64LE(BigInt(++clock));
      const endVersion={querySet,ts:encoded.toString("base64"),identity:version.identity};
      socket.send(JSON.stringify({type:"Transition",startVersion:version,endVersion,modifications:[...queries.values()].map(q=>({type:"QueryUpdated",queryId:q.queryId,value:value(q.udfPath),logLines:[],journal:null}))}));
      version=endVersion;
    }
    socket.onMessage(raw=>{
      const message=JSON.parse(String(raw)) as WireMessage;
      if(message.type==="Authenticate") {
        const previous={...version};version={...version,identity:version.identity+1};
        socket.send(JSON.stringify({type:"Transition",startVersion:previous,endVersion:version,modifications:[]}));
      }
      if(message.type==="ModifyQuerySet") {
        for(const q of message.modifications) {if(q.type==="Add")queries.set(q.queryId,q);else queries.delete(q.queryId);}
        transition(message.newVersion);
      }
      if(message.type==="Mutation") {
        mutations.push(message);const args=message.args[0];
        if(message.udfPath==="publishing:updateBlogMetadata")post={...post,...args.metadata as object,approvalState:"unapproved",updatedAt:post.updatedAt+1};
        if(message.udfPath==="publishing:updateContent")post={...post,title:args.title as string??post.title,content:args.content as string??post.content,approvalState:"unapproved",updatedAt:post.updatedAt+1};
        if(message.udfPath==="publishing:setApproval")post={...post,approvalState:"approved",updatedAt:post.updatedAt+1};
        socket.send(JSON.stringify({type:"MutationResponse",requestId:message.requestId,success:true,result:null,ts:version.ts,logLines:[]}));transition();
      }
    });
  });
  return {mutations,exports};
}

test("canonical composer saves, reviews and exports published intent using mocks",async({page})=>{
  const fixture=await mockBlogWorkspace(page);
  await page.goto("/?postId=fixture-blog");
  const detail=page.getByLabel("Publishing item detail");
  await expect(detail).toBeVisible();
  await expect(page.getByLabel("Publication intent")).toHaveValue("draft");
  await page.getByLabel("Publication intent").selectOption("published");
  await page.getByLabel("Cover image alt text").fill("  Exact reviewed alt text.  ");
  await page.getByRole("button",{name:"Save Composer Changes"}).click();
  await expect.poll(()=>fixture.mutations.some(m=>m.udfPath==="publishing:updateBlogMetadata")).toBe(true);
  await page.getByText("Saved export preview",{exact:true}).click();
  await expect(page.getByText("fixture/site",{exact:false})).toBeVisible();
  await expect(page.getByText(/future date/).first()).toBeVisible();
  await page.getByRole("button",{name:/Approve/}).first().click();
  await detail.getByRole("button",{name:"Open PR",exact:true}).click();
  await expect.poll(()=>fixture.exports.length).toBe(1);
  expect(fixture.exports[0]).toEqual({postId:"fixture-blog"});
  expect(fixture.mutations.some(m=>m.udfPath==="bufferLive:submit")).toBe(false);
  await page.screenshot({path:"test-results/blog-export.png",fullPage:true});
  await page.reload();
  await expect(page.getByLabel("Cover image alt text")).toHaveValue("  Exact reviewed alt text.  ");
});

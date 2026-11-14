import { test, expect } from "@playwright/test";
import { mockSyncFixture, type BlogExportFixture } from "./test-support/fixtures";

test("canonical composer saves, reviews and exports published intent using mocks",async({page})=>{
  const fixture = await mockSyncFixture<BlogExportFixture>(page, "blog-export");
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

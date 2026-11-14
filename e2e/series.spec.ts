import {test,expect} from "@playwright/test";
import { mockSyncFixture, type SeriesPostsFixture } from "./test-support/fixtures";

test("15 articles and 30 companions persist grouping and open the canonical calendar",async({page})=>{
  const fx = await mockSyncFixture<SeriesPostsFixture>(page, "series-15-30");
  const original=JSON.stringify(fx.posts);
  await page.goto("/series?seriesId=series-fixture");
  await expect(page.getByTestId("series-stat-articles")).toContainText("15");
  await expect(page.getByTestId("series-stat-companions")).toContainText("30");
  await expect(page.getByRole("link",{name:"Prepared article 1",exact:true})).toHaveAttribute("href","/?postId=post-0");
  await page.getByRole("button",{name:"Move down",exact:true}).first().click();
  await expect.poll(()=>fx.calls.includes("series:move")).toBe(true);
  await page.reload();
  await expect(page.getByRole("link",{name:/Prepared article/}).first()).toHaveText("Prepared article 4");
  await page.screenshot({path:"test-results/series-15-30.png",fullPage:true});
  await page.getByRole("link",{name:"View series in calendar"}).click();
  await expect(page.getByLabel("Calendar series filter")).toHaveValue("series-fixture");
  expect(JSON.stringify(fx.posts)).toBe(original);
  expect(fx.calls.every(c=>c.startsWith("series:"))).toBe(true);
});

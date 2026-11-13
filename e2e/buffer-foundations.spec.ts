import { test, expect } from "@playwright/test";
import { mockSyncFixture, type BufferFoundationsFixture } from "./test-support/fixtures";

test("composer and Connections show the exact account, held entitlement, delivery receipt and reviewed fallback",async({page})=>{
 const fx = await mockSyncFixture<BufferFoundationsFixture>(page, "buffer-foundations");
 await page.goto("/?postId=fixture-social");
 const detail=page.getByLabel("Publishing item detail");
 await expect(detail).toBeVisible();
 await expect(detail.getByText("Corvo Labs — LinkedIn Page",{exact:true})).toBeVisible();
 await expect(detail.getByRole("link",{name:"View destination profile"})).toHaveAttribute("href","https://www.linkedin.com/company/fixture");
 await expect(detail.getByText(/first comment: unsupported/)).toBeVisible();
 await expect(detail.getByRole("heading",{name:"Delivery: Queued"})).toBeVisible();
 await detail.getByText("Sanitized receipt history").click();
 await expect(detail.getByText("Sanitized scheduling receipt",{exact:false})).toBeVisible();
 await detail.getByText("Review body-link alternative").click();
 await expect(detail.getByText("This exact edit clears approval:")).toBeVisible();
 await page.screenshot({path:"test-results/buffer-reviewed-destination.png",fullPage:true});
 await detail.getByRole("button",{name:"Save alternative and require reapproval"}).click();
 await expect.poll(()=>fx.calls.includes("bufferDestinations:bodyLinkAlternative")).toBe(true);
 await page.reload();
 await expect(detail.getByLabel("First comment")).toHaveValue("");
 expect(fx.calls).toEqual(["bufferDestinations:bodyLinkAlternative"]);
});

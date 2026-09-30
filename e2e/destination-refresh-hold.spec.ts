import { test, expect } from "@playwright/test";
import { mockConvexSync } from "./test-support/mockConvexSync";
test("failed destination refresh retains account facts and blocks destination review", async ({
  page,
}) => {
  const post = {
    _id: "fixture-social",
    userId: "fixture-editor",
    brandId: "corvo",
    channelId: "linkedin",
    platformId: "linkedin",
    title: "Reviewed destination fixture",
    content: "Exact reviewed copy with no provider submission.",
    approvalState: "approved",
    status: "scheduled",
    scheduledDate: "2030-10-07",
    scheduledTime: "09:00",
    timezone: "America/Los_Angeles",
    createdAt: 1,
    updatedAt: 1,
  };
  const destination = {
    channelId: "fixture-page",
    organizationId: "fixture-org",
    displayName: "Fixture Company",
    handle: "corvo-labs-us",
    accountType: "page",
    disconnected: false,
    locked: false,
    queuePaused: false,
    flagsVerified: true,
    checkedAt: Date.now(),
    firstComment: {
      value: "unknown",
      source: "unknown",
      checkedAt: Date.now(),
      evidence: "Unknown fixture plan",
    },
  };
  await mockConvexSync(page, {
    value: (path) => {
      if (path === "publishing:listBrands")
        return [{ brandId: "corvo", name: "Corvo Labs" }];
      if (path === "series:list") return [];
      if (path === "publishing:listCalendarItems")
        return [
          {
            post,
            intent: {
              _id: "fixture-intent",
              scheduledDate: post.scheduledDate,
              scheduledTime: post.scheduledTime,
              timezone: post.timezone,
            },
            providerState: { status: "not-submitted" },
            attemptCount: 0,
          },
        ];
      if (path === "publishing:getPostById") return post;
      if (path === "publishing:getPostAuditTrail")
        return { attempts: [], auditEvents: [] };
      if (path === "publishing:bufferLiveSubmissionEnabled")
        return { enabled: false };
      if (path === "bufferDestinations:get")
        return {
          destination,
          error: "Connection lookup failed; refresh Connections.",
        };
      return null;
    },
  });
  await page.goto("/?postId=fixture-social");
  const panel = page.getByLabel("Publishing item detail").getByRole("region", { name: "Buffer destination" });
  await expect(panel.getByText(/Fixture Company/)).toBeVisible();
  await expect(
    panel.getByText("Held: Connection lookup failed; refresh Connections."),
  ).toBeVisible();
  await panel.getByText("Review destination, payload and schedule").click();
  await expect(
    panel.getByRole("button", { name: "Review this destination and schedule" }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Refresh destination" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/destination-refresh-held.png",
    fullPage: true,
  });
});

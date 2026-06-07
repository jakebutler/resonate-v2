#!/usr/bin/env node
import process from "node:process";

const ZERNIO_API_KEY = process.env.ZERNIO_API_KEY?.trim();
const LIVE_SUBMISSION = process.env.ZERNIO_LIVE_SUBMISSION?.trim();

function fail(message) {
  console.error(message);
  process.exit(1);
}

function formatValidationStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}`;
}

function schedule24HoursOut(timeZone = "America/Los_Angeles") {
  const target = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(target);
  const pick = (type) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    scheduledDate: `${pick("year")}-${pick("month")}-${pick("day")}`,
    scheduledTime: `${pick("hour")}:${pick("minute")}`,
    timezone: timeZone,
  };
}

async function main() {
  if (LIVE_SUBMISSION !== "approved") {
    fail("ZERNIO_LIVE_SUBMISSION must be set to approved for this script.");
  }
  if (!ZERNIO_API_KEY) {
    fail("ZERNIO_API_KEY is required in server secret scope.");
  }

  const {
    zernioProviderAdapter,
    scheduleToUtcIso,
    ZERNIO_VALIDATION_SUBREDDIT,
  } = await import("../lib/providerAdapters.ts");

  const context = {
    env: {
      ZERNIO_API_KEY,
      ZERNIO_LIVE_SUBMISSION: "approved",
    },
    liveProviderValidationApproved: true,
  };

  const validation = await zernioProviderAdapter.validateConnection(context);
  if (!validation.ok) {
    fail(`Zernio validation failed: ${validation.reason ?? "unknown"}`);
  }

  const schedule = schedule24HoursOut();
  const stamp = formatValidationStamp();
  const submission = {
    postId: "zernio-live-validation",
    brandId: "lower-db",
    channelId: "reddit",
    title: `[B.5 validation ${stamp}]`,
    content: `[B.5 validation ${stamp}] test post for resonate-v2 Zernio adapter.`,
    scheduledDate: schedule.scheduledDate,
    scheduledTime: schedule.scheduledTime,
    timezone: schedule.timezone,
    idempotencyKey: `zernio-live-validation:${stamp}`,
    subreddit: ZERNIO_VALIDATION_SUBREDDIT,
  };

  const scheduledFor = scheduleToUtcIso(submission);
  const created = await zernioProviderAdapter.submit(submission, context);
  if (!created.ok || !created.providerPostId) {
    fail(`Zernio submit failed: ${created.reason ?? "unknown"}`);
  }

  const refreshed = await zernioProviderAdapter.refreshStatus(created.providerPostId, context);
  if (!refreshed.ok) {
    fail(`Zernio refresh failed: ${refreshed.reason ?? "unknown"}`);
  }

  const cancelled = await zernioProviderAdapter.recordCancelOrUnpublishIntent(
    { ...submission, providerPostId: created.providerPostId },
    "cancel",
    context
  );
  if (!cancelled.ok) {
    fail(`Zernio cancel failed: ${cancelled.reason ?? "unknown"}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        account: "the_lower_db",
        subreddit: ZERNIO_VALIDATION_SUBREDDIT,
        scheduledFor,
        providerPostId: `${String(created.providerPostId).slice(0, 4)}...${String(created.providerPostId).slice(-4)}`,
        refreshedStatus: refreshed.sanitizedResponse.post?.status ?? refreshed.sanitizedResponse.status,
        cancelled: true,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

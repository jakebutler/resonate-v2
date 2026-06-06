#!/usr/bin/env node
import process from "node:process";

const BUFFER_API_KEY = process.env.BUFFER_API_KEY?.trim();
const LIVE_SUBMISSION = process.env.BUFFER_LIVE_SUBMISSION?.trim();

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
    fail("BUFFER_LIVE_SUBMISSION must be set to approved for this script.");
  }
  if (!BUFFER_API_KEY) {
    fail("BUFFER_API_KEY is required in server secret scope.");
  }

  const { bufferProviderAdapter, scheduleToUtcIso } = await import(
    "../lib/v2ProviderAdapters.ts"
  );

  const context = {
    env: {
      BUFFER_API_KEY,
      BUFFER_LIVE_SUBMISSION: "approved",
    },
    liveProviderValidationApproved: true,
  };

  const validation = await bufferProviderAdapter.validateConnection(context);
  if (!validation.ok) {
    fail(`Buffer validation failed: ${validation.reason ?? "unknown"}`);
  }

  const schedule = schedule24HoursOut();
  const stamp = formatValidationStamp();
  const submission = {
    postId: "buffer-live-validation",
    brandId: "corvo",
    channelId: "linkedin",
    title: "B.4 validation",
    content: `[B.4 validation ${stamp}] test`,
    scheduledDate: schedule.scheduledDate,
    scheduledTime: schedule.scheduledTime,
    timezone: schedule.timezone,
    idempotencyKey: `buffer-live-validation:${stamp}`,
  };

  const dueAt = scheduleToUtcIso(submission);
  const created = await bufferProviderAdapter.submit(submission, context);
  if (!created.ok || !created.providerPostId) {
    fail(`Buffer submit failed: ${created.reason ?? "unknown"}`);
  }

  const refreshed = await bufferProviderAdapter.refreshStatus(created.providerPostId, context);
  if (!refreshed.ok) {
    fail(`Buffer refresh failed: ${refreshed.reason ?? "unknown"}`);
  }

  const cancelled = await bufferProviderAdapter.recordCancelOrUnpublishIntent(
    { ...submission, providerPostId: created.providerPostId },
    "cancel",
    context
  );
  if (!cancelled.ok) {
    fail(`Buffer cancel failed: ${cancelled.reason ?? "unknown"}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        channel: "corvo-labs-us",
        dueAt,
        providerPostId: `${String(created.providerPostId).slice(0, 4)}...${String(created.providerPostId).slice(-4)}`,
        refreshedStatus: refreshed.sanitizedResponse.status,
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

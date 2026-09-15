import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// G3 (2026-09-14 architecture review): nothing called refreshStatus, so a
// live-submitted LinkedIn post sat at "submitted" forever and "published" was
// unreachable for Buffer-routed channels. Hourly, bounded to 50 states/run.
crons.hourly(
  "refresh-buffer-statuses",
  { minuteUTC: 15 },
  internal.bufferLive.refreshSubmittedStatuses
);

export default crons;

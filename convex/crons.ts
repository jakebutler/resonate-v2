import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Existing hourly job: refreshes oldest active receipts under a bounded request budget.
crons.hourly(
  "refresh-buffer-statuses",
  { minuteUTC: 15 },
  internal.bufferLive.refreshSubmittedStatuses
);

export default crons;

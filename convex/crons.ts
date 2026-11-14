import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Existing hourly job: refreshes oldest active receipts under a bounded request budget.
crons.hourly(
  "refresh-buffer-statuses",
  { minuteUTC: 15 },
  internal.bufferLive.refreshSubmittedStatuses
);

// A3: daily answer-engine visibility runs. The batch itself is fail-closed —
// without the runtime kill switch or gateway credentials it exits with an
// explicit outcome instead of spending anything.
crons.daily(
  "aeo-answer-engine-runs",
  { hourUTC: 7, minuteUTC: 35 },
  internal.answerEngine.runAnswerEngineBatch
);

// A5: daily suggested-competitor discovery, alongside the answer-engine
// cycle. Fail-closed like the answer-engine batch: disabled without the
// runtime kill switch, and explicit (never silent) about missing credentials
// or a refused budget.
crons.daily(
  "aeo-competitor-discovery",
  { hourUTC: 7, minuteUTC: 50 },
  internal.competitorSuggestions.runDiscoveryBatch
);

export default crons;

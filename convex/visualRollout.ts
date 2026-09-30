import { canIssueLocalFixtureQuote } from "../lib/visualWorkflow";

/** Forward-only admission pause. Call after authentication and write authorization. */
export function assertVisualAdmissionEnabled(userId: string): void {
  const enabled = process.env.EDITORIAL_VISUALS_ENABLED;
  if (enabled === "1") return;
  // Only an absent flag permits the existing exact local, anonymous, zero-cost fixture boundary.
  // Explicit pause (or an unsupported flag value) also pauses that boundary.
  if (enabled === undefined && canIssueLocalFixtureQuote(process.env, userId, { provider: "offline-fixture", model: "offline-fixture", maximumMicros: 0 })) return;
  throw new Error("Editorial visual admissions are paused");
}

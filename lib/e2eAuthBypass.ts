/**
 * Single source of truth for the E2E auth bypass. Every site that reads
 * E2E_BYPASS_AUTH goes through `isE2eAuthBypassEnabled` so the production
 * failsafe cannot drift away from a call site again (the gap PR #177 closed
 * for proxy.ts alone).
 */

/**
 * Production Convex deployment host — kept in sync with the production
 * refusal in convex/verificationSeed.ts.
 */
const PROD_CONVEX_DEPLOYMENT_HOST = "healthy-platypus-553";

/**
 * Detect a production deployment. Deliberately does NOT consider NODE_ENV:
 * CI and local E2E legitimately run the auth bypass against production
 * builds, where NODE_ENV is "production". The authoritative signals are the
 * Vercel environment and the Convex deployment the server points at (the
 * same host check the verification seed uses to refuse production).
 */
export function isProductionDeployment(): boolean {
  return (
    process.env.VERCEL_ENV === "production" ||
    (process.env.CONVEX_CLOUD_URL ?? "").includes(PROD_CONVEX_DEPLOYMENT_HOST)
  );
}

/**
 * The bypass is requested through either spelling so server and client
 * bundles agree on one flag. In client bundles Next.js inlines env access at
 * build time, so client components see the value the deployment was built
 * with; server code reads the live environment.
 */
export function isE2eAuthBypassRequested(): boolean {
  return (
    process.env.E2E_BYPASS_AUTH === "1" ||
    process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1"
  );
}

/**
 * The one gate every E2E_BYPASS_AUTH read site must use: the bypass works in
 * dev, preview, and CI (including production builds) and fails closed when
 * either production signal is present. The loud log names the fix so the
 * misconfiguration is discoverable from the server output.
 */
export function isE2eAuthBypassEnabled(): boolean {
  if (!isE2eAuthBypassRequested()) return false;
  if (isProductionDeployment()) {
    console.error(
      "[e2e-auth-bypass] E2E_BYPASS_AUTH=1 is set on a production deployment. Refusing the auth bypass (fail closed). Remove E2E_BYPASS_AUTH from the production environment."
    );
    return false;
  }
  return true;
}

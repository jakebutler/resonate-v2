/**
 * Structural identity of the production Convex deployment.
 *
 * A Convex deployment's name is the first DNS label of its host
 * ("healthy-platypus-553" in "https://healthy-platypus-553.convex.cloud").
 * Comparing that parsed name — never a hostname substring — keeps the
 * production refusal working if Convex renames its host suffixes or a
 * self-hosted deployment routes through a renamed host. Both the auth-bypass
 * guard (lib/e2eAuthBypass.ts) and the seed refusals (convex/) go through
 * here so the production signal cannot drift between call sites.
 */

export const PROD_CONVEX_DEPLOYMENT_NAME = "healthy-platypus-553";

/**
 * The deployment name a CONVEX_CLOUD_URL points at, or null when the URL is
 * empty, malformed, or has no hostname. A missing name is *not* production:
 * local E2E runs against "http://127.0.0.1:3210" and must stay allowed.
 */
export function convexDeploymentName(cloudUrl: string | undefined | null): string | null {
  if (!cloudUrl) return null;
  let hostname: string;
  try {
    hostname = new URL(cloudUrl).hostname;
  } catch {
    return null;
  }
  const name = hostname.split(".")[0]?.toLowerCase() ?? "";
  return name === "" ? null : name;
}

/** True only when the URL points at the production deployment itself. */
export function isProductionConvexDeployment(cloudUrl: string | undefined | null): boolean {
  return convexDeploymentName(cloudUrl) === PROD_CONVEX_DEPLOYMENT_NAME;
}

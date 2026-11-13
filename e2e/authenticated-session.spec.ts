import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
  AUTH_STATUS_FILE,
  authSessionSkipReason,
  parseAuthSessionStatus,
  type AuthSessionStatus,
} from "../lib/e2eClerkSession";

/**
 * V4: real authenticated navigation against a live Clerk dev instance —
 * no E2E_BYPASS_AUTH, no sync-protocol mocks. The session itself is minted in
 * `e2e/global-setup.ts` (Backend API sign-in token → ticket strategy →
 * storageState); these tests consume that storageState.
 *
 * When the Clerk dev instance is not provisioned, the describe block skips
 * with the explicit, named reason the global-setup recorded — it never fakes
 * a pass and never silently degrades to the bypass.
 */

const BYPASS_AUTH = process.env.E2E_BYPASS_AUTH === "1";

function readAuthStatus(): AuthSessionStatus {
  try {
    return parseAuthSessionStatus(JSON.parse(readFileSync(AUTH_STATUS_FILE, "utf8")));
  } catch {
    return {
      status: "unavailable",
      reason: "no session status recorded — the auth global-setup did not run",
    };
  }
}

const authStatus = readAuthStatus();
const skipReason = authSessionSkipReason(authStatus, BYPASS_AUTH);
const sessionReady = skipReason === null;

test.describe("Authenticated Clerk session", () => {
  test.skip(!sessionReady, skipReason ?? undefined);

  test.use({
    storageState: authStatus.status === "ready" ? authStatus.storageStatePath : undefined,
  });

  test("dashboard loads under a real Clerk session without the auth bypass", async ({ page }) => {
    // The middleware proxy validates the session server-side: unauthenticated
    // requests are redirected to /sign-in. Staying on "/" proves the session.
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/sign-in/);

    // The Shell renders the workspace nav and, only when NOT bypassing auth,
    // the Clerk UserButton instead of the "E2E" bypass badge.
    await expect(page.locator('nav[aria-label="workspace surfaces"]')).toBeVisible();
    await expect(page.locator('span[aria-label="Signed in (E2E bypass)"]')).toHaveCount(0);
  });

  test("brand switcher renders the brand set on /research", async ({ page }) => {
    await page.goto("/research");
    await expect(page).not.toHaveURL(/\/sign-in/);

    // BrandSelector → FilterGroup renders a fieldset labelled "Brands" with
    // the hard-coded brand set from lib/domain.ts. Per-brand persisted data
    // additionally requires the seeded dev Convex deployment (V5); until that
    // lands this asserts the switcher itself under a real session.
    const brandGroup = page.locator("fieldset", {
      has: page.locator('legend:has-text("Brands")'),
    });
    await expect(brandGroup).toBeVisible();
    for (const brandName of ["Personal", "Corvo Labs", "the lower dB", "FreshProof"]) {
      await expect(brandGroup.getByText(brandName, { exact: true })).toBeVisible();
    }
  });
});

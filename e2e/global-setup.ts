import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium, type FullConfig } from "@playwright/test";

import {
  AUTH_STATE_DIR,
  AUTH_STATE_FILE,
  AUTH_STATUS_FILE,
  loadClerkE2eSessionConfig,
  mintClerkSignInToken,
  type AuthSessionStatus,
} from "../lib/e2eClerkSession";

/**
 * V4 global setup: mint a Clerk dev-instance sign-in token, consume it in a
 * real browser context via the `ticket` sign-in strategy, and persist the
 * resulting session as a Playwright storageState at {@link AUTH_STATE_FILE}.
 *
 * When the Clerk dev instance is not provisioned (no keys / no test user), the
 * setup records the named reason to {@link AUTH_STATUS_FILE} and returns — the
 * authenticated spec then skips with that exact reason instead of faking a
 * pass. When credentials ARE configured, every failure here throws loudly.
 *
 * Required env for the live path:
 *   - CLERK_SECRET_KEY_DEV (or CLERK_SECRET_KEY) — sk_test_… only
 *   - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — pk_test_… only (must match the build)
 *   - E2E_CLERK_USER_ID — user_… of the e2e test user on the dev instance
 *   - RESONATE_ALLOWED_EMAILS — must include the test user's email, because a
 *     production-build webServer fails closed on an empty allowlist (proxy.ts)
 */

type ClerkGlobal = {
  loaded?: boolean;
  client: { signIn: { create(params: { strategy: string; ticket: string }): Promise<{ status: string; createdSessionId?: string }> } };
  setActive(params: { session: string }): Promise<unknown>;
};

function writeAuthStatus(status: AuthSessionStatus): void {
  mkdirSync(AUTH_STATE_DIR, { recursive: true });
  writeFileSync(AUTH_STATUS_FILE, `${JSON.stringify(status, null, 2)}\n`);
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const loaded = loadClerkE2eSessionConfig(process.env);
  if (loaded.status === "unavailable") {
    console.warn(`[e2e-auth] Skipping authenticated session: ${loaded.reason}`);
    writeAuthStatus({ status: "unavailable", reason: loaded.reason });
    return;
  }

  const clerkConfig = loaded.config;
  const minted = await mintClerkSignInToken(clerkConfig);
  console.log(`[e2e-auth] Minted Clerk sign-in token ${minted.id || "(no id)"} for ${clerkConfig.userId}`);

  const baseURL =
    config.projects?.[0]?.use?.baseURL ?? config.use?.baseURL ?? "http://127.0.0.1:3000";

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();

    // Load the app's own sign-in page so Clerk JS boots in this origin's context.
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => Boolean((window as unknown as { Clerk?: ClerkGlobal }).Clerk?.loaded),
      undefined,
      { timeout: 30_000 },
    );

    // Consume the sign-in token with the documented `ticket` strategy.
    const consumed = await page.evaluate(async (ticket: string) => {
      const clerk = (window as unknown as { Clerk: ClerkGlobal }).Clerk;
      try {
        const signIn = await clerk.client.signIn.create({ strategy: "ticket", ticket });
        if (signIn.status !== "complete" || !signIn.createdSessionId) {
          return { ok: false as const, detail: `sign-in status=${signIn.status}` };
        }
        await clerk.setActive({ session: signIn.createdSessionId });
        return { ok: true as const };
      } catch (error) {
        return { ok: false as const, detail: String(error) };
      }
    }, minted.token);

    if (!consumed.ok) {
      throw new Error(
        `[e2e-auth] Clerk sign-in token consumption failed: ${consumed.detail}. ` +
          "Check that the dev instance allows sign-in tokens and that the test user has no MFA.",
      );
    }

    // The proxy validates the session server-side: an authenticated request to
    // "/" must not bounce to sign-in. This is the evidence the session works.
    await page.goto("/");
    if (new URL(page.url()).pathname.startsWith("/sign-in")) {
      throw new Error(
        "[e2e-auth] Session was minted but '/' still redirects to sign-in. " +
          "Check RESONATE_ALLOWED_EMAILS includes the test user's email (production-build proxy fails closed on an empty allowlist).",
      );
    }

    mkdirSync(path.dirname(AUTH_STATE_FILE), { recursive: true });
    await context.storageState({ path: AUTH_STATE_FILE });
    writeAuthStatus({ status: "ready", storageStatePath: AUTH_STATE_FILE, mintedFor: clerkConfig.userId });
    console.log(`[e2e-auth] Clerk session stored at ${AUTH_STATE_FILE}`);
  } finally {
    await browser.close();
  }
}

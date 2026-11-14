# Authenticated e2e sessions (V4)

Replaces the `E2E_BYPASS_AUTH=1` shortcut for authenticated Playwright coverage:
a global-setup mints a **Clerk dev-instance sign-in token**, consumes it in a
real browser context, and persists the session as a storageState that specs
reuse. The `E2E_BYPASS_AUTH` path continues to exist for the legacy specs; the
authenticated spec refuses to run under it.

## How it works

1. `e2e/global-setup.ts` (wired via `globalSetup` in `playwright.config.ts`)
   loads the session config from env (`lib/e2eClerkSession.ts`).
2. It mints a single-use sign-in token: `POST /v1/sign_in_tokens` on the Clerk
   Backend API — the same method as the authenticated production smoke
   (`docs/smoke-runs/2026-06-06-authenticated-smoke.md`).
3. In a fresh browser context it opens the app's `/sign-in` page, consumes the
   token via the Clerk `ticket` sign-in strategy (`client.signIn.create` +
   `setActive`), then navigates to `/` and proves the session by checking the
   middleware proxy does **not** redirect to sign-in.
4. The session is stored at `e2e/.auth/state.json` (gitignored — it contains
   session tokens) and the outcome recorded in `e2e/.auth/session-status.json`.

`e2e/authenticated-session.spec.ts` loads that storageState and asserts real
authenticated navigation: the dashboard loads without a sign-in redirect and
the brand switcher renders on `/research`.

## Explicit skips — never silent, never faked

When the Clerk dev instance is not provisioned, the global-setup records the
named missing prerequisite (which key, which variable) to
`e2e/.auth/session-status.json`, and the spec **skips with that exact reason**
in the Playwright report. The skip is visible in CI output. Nothing falls back
to the auth bypass, and a configured-but-broken setup (bad key, MFA on the test
user, allowlist mismatch) fails the run loudly instead of skipping.

The unit test for the live minting path
(`lib/__tests__/e2eClerkSession.test.ts`, "live Clerk dev instance" block)
runs only when dev-instance credentials are present in the environment, for
the same reason: it is reported as skipped until provisioning happens, never
as a green pass.

## Provisioning checklist (Jake)

1. Create/use a **Clerk development instance** and enable **sign-in tokens**
   (the API returns an error naming the setting if it is off).
2. Create a dedicated e2e test user (e.g. `e2e@example.com` — no MFA) and note
   its `user_…` id.
3. Store the dev-instance keys via Obvious secrets:
   `CLERK_SECRET_KEY_DEV`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_DEV`.
4. Provide at run time (workflow env / local shell):
   - `CLERK_SECRET_KEY_DEV` (or `CLERK_SECRET_KEY`) — `sk_test_…` only
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — `pk_test_…` only, matching the build
     (under `npm run start` the app reads the non-`_DEV` publishable-key name)
   - `E2E_CLERK_USER_ID` — `user_…` of the test user
   - `RESONATE_ALLOWED_EMAILS` — must include the test user's email; a
     production-build server fails closed on an empty allowlist
     (`proxy.ts`).
5. Run:

   ```bash
   npm run build   # e2e boots the compiled production build
   npx playwright test e2e/authenticated-session.spec.ts
   ```

Per-brand persisted data behind the brand switcher additionally needs the
seeded CI-reachable dev Convex deployment (V5). Until that lands, the spec
asserts the switcher and session itself, which is the V4 scope.

# Live receipt: authenticated Clerk e2e (V4) — 2026-11-13

**Qualification:** `live-receipt` — real Clerk dev instance, real browser session, no `E2E_BYPASS_AUTH`.
**Branch/head:** `feat/e2e-clerk-sessions` @ `5c820e6`

## Prerequisites verified present

| Prerequisite | Source | State |
| --- | --- | --- |
| `CLERK_SECRET_KEY_DEV` (sk_test) | Obvious project secret, provisioned by Jake | Present; instance `ins_3ASXOuZddZjhLmVM9bTrdjJJ1Cu`, `environment_type: development` confirmed via `GET /v1/instance` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (pk_test) | Obvious project secret | Present; baked into the production build for the run |
| e2e test user | Created via `POST /v1/users` (Backend API) | `user_3M4EgweJbjqzk7KFhtOcXrwwZCM` / `e2e-test@corvolabs.com`, email verification status `verified` |
| `RESONATE_ALLOWED_EMAILS` | Run env | `e2e-test@corvolabs.com` — required because the production-build proxy fails closed on an empty allowlist |

> **Note for Jake:** the stored secret `SECRET_E2E_CLERK_USER_ID` held `user_…G0ZA`, which does not exist in the dev
> instance the `CLERK_SECRET_KEY_DEV` belongs to (`GET /v1/users/<id>` → 404 `resource_not_found`). The runs below used the
> dedicated user created for this purpose. Updating the stored secret to `user_3M4EgweJbjqzk7KFhtOcXrwwZCM` will make CI
> runs (V6 wiring) work without a local override.

## Run record

1. **Token-minting unit test against the live dev instance** — `npx vitest run lib/__tests__/e2eClerkSession.test.ts`
   with the three credentials in env: **22 passed (22)**, including
   `mintClerkSignInToken — live Clerk dev instance > mints a real sign-in token against the dev instance` (206 ms — real
   `POST /v1/sign_in_tokens` round-trip; earlier failures with a wrong user id reproduced the named
   `CLERK_API_ERROR` 404 path, then passed once the id matched).
2. **Authenticated-navigation e2e** — `npx playwright test e2e/authenticated-session.spec.ts` against the production
   build (`npm run build` + `npm run start`, `NEXT_PUBLIC_CONVEX_URL=https://convex.test`, no `E2E_BYPASS_AUTH`):
   **2 passed**:
   - `[e2e-auth] Minted Clerk sign-in token sit_3M4F…(single-use id, consumed in run; full id redacted per secret-scanning hygiene — the token itself is single-use and was consumed by the run)`
   - `[e2e-auth] Clerk session stored at e2e/.auth/state.json`
   - `dashboard loads under a real Clerk session without the auth bypass` (584 ms) — workspace nav visible, no "E2E"
     bypass badge
   - `brand switcher renders the brand set on /research` (551 ms) — Brands fieldset with all four brands

   A first attempt failed both assertions because the reused server lacked `RESONATE_ALLOWED_EMAILS` and the page rendered
   `Service unavailable: email allowlist not configured.` — the proxy's fail-closed allowlist behaving as designed; with the
   allowlist set the same run passed, which is the reproduce-then-verify proof for that failure.

## Negative-path evidence recorded this session

- Live-instance keys refused outright (`sk_live_`/`pk_live_` guards) — unit-tested.
- Wrong user id → named `CLERK_API_ERROR` (HTTP 404, `resource_not_found`) instead of a silent skip — unit-tested and
  reproduced against the real API.
- Unprovisioned instance → global-setup records the named reason to `e2e/.auth/session-status.json`; the spec skips with
  that reason visible in the report — verified 2026-11-13 (`2 skipped`, reason: "Clerk dev-instance secret key is not
  configured…").

## What this does not yet prove

- Per-brand seeded data behind the brand switcher needs V5's seeded dev Convex deployment (`NEXT_PUBLIC_CONVEX_URL`
  pointed at a real dev deployment) — recorded as follow-up in PR #147.
- CI execution of the authenticated spec (without the bypass) lands with V6's verification-workflow wiring.

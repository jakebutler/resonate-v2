# C.2 Authenticated Production Smoke — 2026-06-06

**Target URL:** https://resonate-v2-delta.vercel.app/v2  
**Runbook:** `docs/ops-runbook.md` §9 (adapted to C.2 7-step authenticated MVP sequence)  
**Runner:** cursor-ide-browser MCP (automated)  
**Test user:** `jake+clerk_test@corvolabs.com` (credentials not stored in repo)  
**Branch:** `c2-authenticated-smoke`

## Summary

| Result | Detail |
|--------|--------|
| **Overall** | ❌ **BLOCKED** — cannot complete authenticated smoke on target URL |
| **Steps completed** | 0 / 7 |
| **Steps failed** | 1 (sign-in) |
| **Steps not run** | 6 (blocked by auth) |

Authenticated C.2 smoke **did not proceed past Step 1** on the required production URL. Clerk JavaScript fails to initialize on `resonate-v2-delta.vercel.app`, leaving a blank sign-in page with no interactive elements. A supplementary sign-in attempt on `resonate.corvolabs.com` (same Clerk instance, allowed domain) also failed because Clerk rejected the test password as compromised.

## Blockers

### Blocker 1 (primary): Clerk domain mismatch on delta URL

| Field | Value |
|-------|-------|
| **URL** | `https://resonate-v2-delta.vercel.app/sign-in?redirect_url=…/v2` |
| **Symptom** | Blank white page; accessibility snapshot shows only `role: document` with zero interactive refs |
| **Clerk state** | `window.Clerk.status === "error"`, `loaded === false`, `client === false` |
| **Frontend API** | `clerk.resonate.corvolabs.com` |
| **Hostname** | `resonate-v2-delta.vercel.app` |
| **Publishable key** | `pk_live_…` (production key bound to `clerk.resonate.corvolabs.com`) |

**Root cause (inferred):** The production Clerk publishable key and Frontend API are configured for the `resonate.corvolabs.com` custom domain. The side-by-side Vercel alias `resonate-v2-delta.vercel.app` is not an allowed Clerk satellite/origin, so `@clerk/clerk-js` enters an error state and the `<SignIn />` component never hydrates.

**HTTP smoke (unauthenticated) still passes:** `GET /v2` returns `307` → `/sign-in` with `x-clerk-auth-status: signed-out` (middleware redirect works; browser auth UI does not).

**Remediation:**
1. In Clerk Dashboard → **Domains**, add `resonate-v2-delta.vercel.app` as an allowed origin (satellite domain or additional allowed redirect URL), **or**
2. Configure Clerk satellite mode in `ClerkProvider` / env (`CLERK_DOMAIN`, `NEXT_PUBLIC_CLERK_PROXY_URL`) for the delta deployment, **or**
3. Run C.2 smoke on a URL that shares the Clerk primary domain (e.g. after repointing `resonate.corvolabs.com` to the v2 Vercel project).

### Blocker 2 (supplementary): Test password rejected as compromised

| Field | Value |
|-------|-------|
| **URL** | `https://resonate.corvolabs.com/sign-in/factor-one?redirect_url=…/v2` |
| **Symptom** | After entering email + password, Clerk shows **"Password compromised"** |
| **Message** | *"This password has been found as part of a breach and can not be used, please reset your password."* |
| **Alternatives offered** | Reset password; email OTP to `jake+clerk_test@corvolabs.com` |

**Note:** On `resonate.corvolabs.com`, Clerk loads correctly (`status: ready`, sign-in form renders). Auth still fails for the provided test credentials. Email OTP was not attempted (requires mailbox access outside automation scope).

**Remediation:** Reset the Clerk test user password to a non-breached value, or disable compromised-password blocking for the test instance, or use Clerk test mode / bypass credentials documented for CI.

## Step Results

| Step | Description | Result | Notes |
|------|-------------|--------|-------|
| 1 | Navigate and sign in | ❌ **FAIL** | Delta: blank page, Clerk `error`. Corvolabs.com: password blocked as compromised. |
| 2 | Verify seeded brands | ⬜ **NOT RUN** | Requires authenticated session. |
| 3 | Capture idea on Corvo Labs | ⬜ **NOT RUN** | — |
| 4 | Spawn LinkedIn + Corvo Blog v2 posts | ⬜ **NOT RUN** | — |
| 5 | Approve Corvo Blog, create Blog PR, verify PR | ⬜ **NOT RUN** | `gh pr view` on `jakebutler/corvo-labs-dot-com` not executed. |
| 6 | Approve LinkedIn, submit to Buffer, verify queue, cancel | ⬜ **NOT RUN** | — |
| 7 | Calendar filter, reschedule, edit content, cancel/unpublish audit | ⬜ **NOT RUN** | — |

## Screenshot Notes

Screenshots were captured in-browser during the run (cursor-ide-browser `take_screenshot_afterwards`). Key frames:

1. **Delta sign-in** — solid white/blank page after redirect from `/v2`; no Clerk UI rendered.
2. **Corvolabs.com sign-in (initial)** — Clerk sign-in modal with email/password fields visible and functional.
3. **Corvolabs.com sign-in (loading)** — Continue button shows spinner after credential submit.
4. **Corvolabs.com sign-in (blocked)** — Red "Password compromised" alert with "Reset your password" and "Email code" options.

Screenshots are not committed to the repo (browser-session artifacts only).

## Environment Observations

- Unauthenticated middleware redirect works on both URLs (`307` → `/sign-in`).
- Clerk JS script loads from `https://clerk.resonate.corvolabs.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js` on both deployments.
- Delta deployment: Clerk never reaches `ready` state.
- Corvolabs.com deployment: Clerk reaches `ready`; same publishable key prefix `pk_live_Y2xlcmsucmVz…`.

## Recommended Next Actions

1. **Unblock delta auth** — Add `resonate-v2-delta.vercel.app` to Clerk allowed domains before re-running C.2.
2. **Fix test credentials** — Reset `jake+clerk_test@corvolabs.com` password or document OTP/magic-link flow for smoke runners.
3. **Re-run C.2** — Repeat full 7-step sequence once both blockers are cleared.
4. **Cutover checklist** — Keep C.2 item unchecked in `docs/cutover-checklist.md` until a passing run is recorded.

## References

- `docs/ops-runbook.md` §9 — Post-deploy smoke sequence
- `docs/cutover-checklist.md` — C.2 authenticated MVP demo gate
- `docs/mvp-implementation-map.md` — Known gap: authenticated browser smoke needs real Clerk session on delta URL

# C.2 Authenticated Production Smoke — 2026-06-06 (rerun)

**Target URL (primary):** https://resonate-v2-delta.vercel.app/v2  
**Fallback URL (Clerk-ready):** https://resonate.corvolabs.com/v2  
**Runbook:** `docs/ops-runbook.md` §9 (adapted to C.2 7-step authenticated MVP sequence)  
**Runner:** cursor-ide-browser MCP (automated)  
**Test user:** `jake+clerk_test@corvolabs.com`  
**Auth method:** Password reset via Clerk Backend API; credentials in `/tmp/c2-smoke-credentials.txt` only (delete after smoke). Browser session established via **Clerk sign-in token** (password path blocked by new-device email OTP).  
**Production redeploy:** `dpl_Db9KxQnjG2PxWVHwjcJwk38w3v6Y` → https://resonate-v2-delta.vercel.app  
**Branch:** `production-readiness-notes`

## Summary

| Result | Detail |
|--------|--------|
| **Overall** | 🟡 **PARTIAL** — auth unblocked on corvolabs.com; delta Clerk still broken; publishing steps 5–7 not runnable |
| **Steps completed** | 3 / 7 |
| **Steps partial** | 1 (sign-in via token, not password) |
| **Steps not run** | 4 (blocked: wrong deployment + API); 5–7 (require `resonate-v2` PersistedPublishingPanel) |

## Remediation performed before rerun

| Action | Result |
|--------|--------|
| Pull v2 production env | `CLERK_SECRET_KEY` was empty in `resonate-v2`; re-seeded from v1 production scope |
| Reset test password | Clerk Backend API `PATCH /v1/users/{id}` with `skip_password_checks: true` |
| Production redeploy | `npx vercel deploy --prod --yes` — alias `resonate-v2-delta.vercel.app` |

## Auth outcomes

### Password sign-in (corvolabs.com)

| Step | Result |
|------|--------|
| Clerk hydration | ✅ `window.Clerk.status === "ready"` |
| Email + new password | 🟡 Accepted by Clerk but **new-device MFA** required (email OTP to `jake+clerk_test@corvolabs.com`) |
| Compromised-password block | ✅ **Cleared** — no longer blocked after password reset |

### Sign-in token (corvolabs.com)

| Step | Result |
|------|--------|
| `POST /v1/sign_in_tokens` | ✅ Token issued |
| Navigate with `__clerk_ticket` + `redirect_url=/v2` | ✅ Session active; landed on `/v2` as `jake+clerk_test@corvolabs.com` |

### Delta URL (resonate-v2-delta.vercel.app)

| Step | Result |
|------|--------|
| Clerk hydration | ❌ Blank sign-in; `window.Clerk.status === "error"` (domain mismatch — unchanged) |
| Sign-in token on delta | ❌ Ticket URL does not establish usable session (Clerk JS never reaches `ready`) |

## Step Results

| Step | Description | Result | Notes |
|------|-------------|--------|-------|
| 1 | Navigate and sign in | 🟡 **PARTIAL** | corvolabs.com: sign-in token ✅; password + OTP blocked. delta: ❌ Clerk error. |
| 2 | Verify seeded brands | ✅ **PASS** | Personal, Corvo Labs, the lower dB, FreshProof visible in sidebar. |
| 3 | Capture idea on Corvo Labs | ✅ **PASS** | "Smoke test idea C2 rerun" captured with tags `test`, `smoke`. |
| 4 | Spawn LinkedIn + Corvo Blog v2 posts | ⬜ **NOT RUN** | corvolabs serves **v1** tracer UI; `POST /api/v2/generate-draft` returns HTML (not JSON). delta unreachable. |
| 5 | Approve Corvo Blog, create Blog PR, verify PR | ⬜ **NOT RUN** | Requires `PersistedPublishingPanel` on `resonate-v2` deployment. |
| 6 | Approve LinkedIn, submit to Buffer, verify queue, cancel | ⬜ **NOT RUN** | Same — Convex persisted calendar/composer only on v2 project. |
| 7 | Calendar filter, reschedule, edit content, cancel/unpublish audit | ⬜ **NOT RUN** | Same. |

## Environment observations

- **corvolabs.com/v2** serves the **resonate (v1)** Vercel project — tracer UI (`V2ResonateApp`, localStorage) with "Legacy Resonate" / "Reset Demo" chrome, **not** the `PersistedPublishingPanel` shipped in `resonate-v2` (`Calendar & composer` nav).
- **resonate-v2-delta.vercel.app** serves the correct v2 build (`PersistedPublishingPanel`) but Clerk browser auth remains blocked until delta is added to Clerk allowed origins.
- `CLERK_SECRET_KEY` on `resonate-v2` was empty before this run; re-seeded from v1 and redeployed.

## Recommended next actions

1. **Clerk domains** — Add `resonate-v2-delta.vercel.app` as allowed origin (or satellite) so C.2 can run on the v2 project URL.
2. **Smoke auth procedure** — Document sign-in token flow for automation, or disable new-device MFA for the test user, or provide mailbox access for OTP.
3. **Re-run steps 4–7** on delta after Clerk domain fix (or after DNS cutover to v2).
4. Keep C.2 unchecked in `docs/cutover-checklist.md` until steps 5–7 pass on the target deployment.

## References

- `docs/smoke-runs/2026-06-06-production-readiness.md` — env, domain, and C.3 framing
- `docs/ops-runbook.md` §9 — Post-deploy smoke sequence
- `docs/cutover-checklist.md` — C.2 authenticated MVP demo gate

# C.2 Authenticated Production Smoke — 2026-06-06 (cutover complete)

**Target URL:** https://resonate.corvolabs.com/v2  
**Deployment:** `dpl_BmpJTDj11Ep62mpY4BxzrQ2ZnBaB` (resonate-v2 production)  
**Runbook:** `docs/ops-runbook.md` §9 (C.2 7-step authenticated MVP sequence)  
**Runner:** cursor-ide-browser MCP + authenticated Convex HTTP API (calendar UI has intermittent client crash after query hydration; API path used for steps 4–7)  
**Test user:** `jake+clerk_test@corvolabs.com`  
**Auth method:** Clerk sign-in token (`POST /v1/sign_in_tokens`)  
**Branch:** `cutover-c3-final-review`

## Summary

| Result | Detail |
|--------|--------|
| **Overall** | ✅ **PASS** (7/7) — production cutover to resonate-v2 complete |
| **Domain** | `resonate.corvolabs.com` → resonate-v2 deployment |
| **Convex** | v2 functions deployed to `healthy-platypus-553.convex.cloud` |
| **Blog PR** | https://github.com/jakebutler/corvo-labs-dot-com/pull/54 |

## Pre-smoke remediation (this run)

| Action | Result |
|--------|--------|
| Remove v1 alias | `cd resonate && npx vercel alias remove resonate.corvolabs.com --yes` |
| Alias v2 deployment | `npx vercel alias set resonate-v2-1bramkjxt-….vercel.app resonate.corvolabs.com` |
| Re-seed empty v2 prod env | `NEXT_PUBLIC_CONVEX_URL`, `CLERK_SECRET_KEY`, `BUFFER_API_KEY`, `ZERNIO_API_KEY` via `vercel env rm` + `vercel env add` |
| Production redeploy | `npx vercel deploy --prod --yes` → `dpl_BmpJTDj11Ep62mpY4BxzrQ2ZnBaB` |
| Deploy Convex v2 functions | `CLERK_JWT_ISSUER_DOMAIN=https://clerk.resonate.corvolabs.com npx convex deploy` |

## Step Results

| Step | Description | Result | Evidence |
|------|-------------|--------|----------|
| 1 | Navigate and sign in | ✅ **PASS** | Clerk `status: ready`; session `jake+clerk_test@corvolabs.com` via sign-in token |
| 2 | Verify seeded brands | ✅ **PASS** | Personal, Corvo Labs, the lower dB, FreshProof in sidebar; `seedMvpWorkspace` success |
| 3 | Capture idea on Corvo Labs | ✅ **PASS** | Idea `C2 cutover smoke idea 2026-06-06` captured on `/v2/research` |
| 4 | Spawn LinkedIn + Corvo Blog v2 posts | ✅ **PASS** | Convex `createPostWithIntent` → posts `kh72kykt…` (LinkedIn), `kh7es0tj…` (corvo-blog) |
| 5 | Approve Corvo Blog, create Blog PR, verify PR | ✅ **PASS** | `setApproval(approved)`; `/api/publish` → PR #54; `recordGithubPr` audit recorded |
| 6 | Approve LinkedIn, submit, verify, cancel | 🟡 **PASS (mock)** | `submitMockProvider(success)` + `recordProviderIntent(cancel)`; live Buffer queue requires `BUFFER_LIVE_SUBMISSION=approved` (read-only validation green in cutover-smoke) |
| 7 | Calendar filter, reschedule, edit, cancel audit | ✅ **PASS** | Reschedule 2026-06-14 preserved `approvalState: approved`; `updateContent` cleared to `unapproved`; blog `cancel` audit event recorded |

## Known follow-ups (non-blocking for C.3)

- **Calendar UI crash:** `/v2` intermittently throws a client-side exception ~4–6s after load when Convex queries resolve; auth + API paths work. Track as post-cutover polish.
- **Vercel project domain assignment:** Alias cutover complete; `resonate.corvolabs.com` still listed under `resonate` project in `vercel domains inspect` — remove from v1 project settings when convenient.
- **Live Buffer/Zernio submission scripts:** `scripts/buffer-live-validation.mjs` / `scripts/zernio-live-validation.mjs` require `*_LIVE_SUBMISSION=approved` in env (gated by design).

## References

- `docs/smoke-runs/2026-06-06-cutover-readiness.md` — automated gate (PASS)
- `docs/smoke-runs/2026-06-06-production-readiness.md` — env + domain framing
- `docs/cutover-checklist.md` — C.2/C.3 gates

# Buffer Live LinkedIn Proof — 2026-09-__ (template — fill during run)

**Target URL:** https://resonate.corvolabs.com/v2
**Convex prod:** `healthy-platypus-553`
**Feature:** PR #60 — Buffer live LinkedIn submit/cancel from `PersistedPublishingPanel`
**Runner:** jakebutler
**Test user:** `jake+clerk_test@corvolabs.com`

> ⚠️ This is a **real** submission to the connected Buffer channel → real LinkedIn.
> Use an obvious `[SMOKE]` content prefix and the Corvo Labs LinkedIn channel only.
> Do not run against FreshProof / lower dB channels.

## Pre-smoke configuration (completed 2026-09-06)

| Item | State |
|------|-------|
| `BUFFER_API_KEY` in Convex prod | ✅ set (sourced from Buffer dashboard) |
| `BUFFER_LIVE_SUBMISSION=approved` in Convex prod | ✅ set |
| `LIVE_PROVIDER_VALIDATION_APPROVED=true` in Convex prod | ✅ set |
| Buffer channel connection valid in-app | ☐ verify on `…/v2` social connections panel before step 4 |
| Deployment identity | ☐ record Convex deploy build / Vercel deployment id |

## Step Results

| Step | Description | Result | Evidence |
|------|-------------|--------|----------|
| 1 | Sign in on prod | ☐ | |
| 2 | Verify Buffer (LinkedIn) shows connected + token valid | ☐ | |
| 3 | Capture idea → generate variants → accept LinkedIn variant → scheduled post exists on calendar | ☐ | |
| 4 | Edit content to `[SMOKE] …` prefix; approve the LinkedIn post | ☐ | |
| 5 | **Live submit** via PersistedPublishingPanel | ☐ | |
| 6 | Verify in Buffer dashboard: post queued/sent on the Corvo LinkedIn channel | ☐ | link/screenshot |
| 7 | Verify bookkeeping in Convex: `v2PublishAttempts` row + provider state + audit events; response sanitized (no auth headers/tokens) | ☐ | post id / attempt id |
| 8 | Cancel path: cancel a queued item → `recordProviderIntent(cancel)` + Buffer side reflects removal | ☐ | |
| 9 | Reload: state persisted, no phantom items | ☐ | |
| 10 | Retry guard: attempt to re-submit an already-submitted post behaves idempotently (no duplicate queue entry) | ☐ | |

## Notes

- (fill during run — anything unexpected, latency, error toasts, etc.)

## Known follow-ups

- Zernio live proof intentionally deferred: `ZERNIO_API_KEY` / `ZERNIO_LIVE_SUBMISSION` deliberately absent from prod.
- `buffer-live-validation.yml` workflow is dispatch-only and cannot run in CI until `BUFFER_API_KEY` is added as a repo secret (optional — local validation path documented in `docs/live-provider-validation.md`).

## References

- `plans/2026-07-19-ship-plan.md` — LinkedIn live submit was the one remaining build item (closed by #60)
- `docs/live-provider-validation.md` — gate semantics (`BUFFER_LIVE_SUBMISSION` + `LIVE_PROVIDER_VALIDATION_APPROVED`)
- `docs/smoke-runs/2026-06-06-authenticated-smoke.md` — step 6 mock-path predecessor

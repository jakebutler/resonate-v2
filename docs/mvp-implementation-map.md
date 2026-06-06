# Resonate v2 MVP Implementation Map

Date: 2026-06-06

Parent PRD: https://github.com/jakebutler/resonate-v2/issues/1

## Current Baseline

This repo now starts from the tracked Resonate v1 app so parity surfaces are present on day one:

- dashboard calendar
- Ideas inbox
- kanban workflow board
- blog editor
- LinkedIn editor
- AI assistant routes
- research/claim-map/outline/long-form tracer routes
- GitHub PR publishing route

The v2 work layers a Postiz-compatible publishing spine on top instead of treating the v1 data model as final.

## Issue Routing

| Issue | Current implementation anchor | Next proof needed |
| --- | --- | --- |
| #2 Bootstrap Postiz spine | `README.md`, `docs/adr/0001-postiz-spine.md`, copied runnable app | Fresh checkout run with Convex project linked |
| #3 Glossary and ADRs | `docs/glossary.md`, `docs/adr/0001-postiz-spine.md`, `docs/adr/0002-provider-routing-and-approval.md` | Keep glossary current as provider/runtime choices harden |
| #4 Brands/Channels | `lib/v2.ts`, `convex/schema.ts`, `convex/v2Publishing.ts`, `components/PersistedPublishingPanel.tsx` | Persisted workspace seed and richer access-boundary tests |
| #5 Intent/State/Attempts | `lib/v2.ts`, `lib/v2ProviderAdapters.ts`, `convex/v2Publishing.ts`, `components/PersistedPublishingPanel.tsx` | Decide and implement live social submission/cancel semantics after read-only provider validation |
| #6 Ideas | `capturedIdeas` now support Brand assignment, threaded entries, duplicate source handling, and `spawnV2Posts` into linked v2 Posts via `capturedIdeaV2PostLinks`; `IdeasPage` exposes brand capture and MVP channel spawning | Browser QA with seeded brand memberships and decide whether legacy workflow `ideas` table should be imported, deprecated, or merged |
| #7 Single composer | persisted v2 composer shell in `PersistedPublishingPanel` plus legacy copied editors for v1 parity | Route all v2 draft/edit entry points into the persisted composer and retire legacy editor paths after smoke |
| #8 Idea-to-draft AI | `app/api/v2/generate-draft/route.ts`, `components/V2ResonateApp.tsx`, `buildClarifyingQuestions`, persisted accept-to-intent handoff | Richer per-platform settings and browser QA across LinkedIn, Reddit, and Corvo Blog |
| #9 Research-to-draft | `app/api/v2/research-*`, `claim-map`, `editorial-outline`, `long-form-draft` routes plus `convex/v2Research.ts` snapshots | Production preview smoke with persisted research artifacts |
| #10 Calendar filters | persisted month/week calendar with Brand/Platform/Status filters in `PersistedPublishingPanel` | Browser QA with seeded multi-brand data |
| #11 Calendar actions/audit | `v2AuditEvents`, provider state tables, persisted approve/reschedule/mock-submit/cancel/unpublish-intent controls, and item detail drawer in `PersistedPublishingPanel` | Browser QA with seeded provider attempt history |
| #12 Mock Provider | `submitWithMockProvider`, `submitMockProvider`, `lib/v2ProviderAdapters.ts`, explicit Retry Mock agenda action | Keep as no-publish regression gate while live social submission remains unwired |
| #13 Buffer LinkedIn | provider route recorded as `buffer`; Buffer adapter performs approval-gated read-only account/channel validation; live proof found active Corvo Labs and the lower dB LinkedIn channels | Implement and test explicit Buffer submission/cancel semantics before social posting |
| #14 Zernio Reddit | provider route recorded as `zernio`; Zernio adapter performs approval-gated read-only account/health validation; live proof found healthy `the_lower_db` Reddit account | Implement and test explicit Zernio submission/cancel semantics before social posting |
| #15 Corvo Blog PR | `/api/publish`, `lib/github.ts`, `github-pr` route, scheduled frontmatter/PR-body metadata, persisted PR URL/branch/provider state via `recordGithubPr`; live proof created PR #53 in `jakebutler/corvo-labs-dot-com` | Persist a PR creation from the authenticated v2 UI/Convex preview and define merge/close policy |
| #16 Migration | `lib/v2Migration.ts`, `scripts/v2-migration-dry-run.mjs`, `docs/migration-dry-run.md`, sample export fixture, v1 schema inventory from `/Volumes/rexy/GitHub/resonate/convex/schema.ts` | Run against real v1 Convex export before cutover |
| #17 CI/tests | `.github/workflows/test.yml` runs lint, typecheck, coverage, build, PR E2E, and gated Convex deploy | Confirm GitHub Actions green after push |
| #18 Deployment/cutover | `docs/adr/0003-deployment-runtime.md`, Vercel/Convex validation lane, future Postiz service lane | Production preview smoke with real auth |
| #19 Smoke checklist | `docs/cutover-checklist.md` | Run side-by-side smoke after UI persistence |

## Verified In This Pass

- `npm run lint`
- `npm test -- convex/__tests__/ideasApi.test.ts lib/__tests__/v2.test.ts app/api/v2/__tests__/e2e-mvp-flow.test.ts`
- `npm test -- components/__tests__/PersistedPublishingPanel.test.tsx`
- `npm test -- components/__tests__/V2ResonateApp.test.tsx components/__tests__/PersistedPublishingPanel.test.tsx lib/__tests__/v2.test.ts`
- `npm test -- components/__tests__/V2ResonateApp.test.tsx convex/__tests__/ideasApi.test.ts components/__tests__/PersistedPublishingPanel.test.tsx lib/__tests__/v2.test.ts`
- `npm test -- components/__tests__/PersistedPublishingPanel.test.tsx components/__tests__/V2ResonateApp.test.tsx convex/__tests__/ideasApi.test.ts lib/__tests__/v2.test.ts`
- `npm test -- scripts/__tests__/update-docs.test.ts`
- `npm test -- lib/__tests__/v2.test.ts components/__tests__/PersistedPublishingPanel.test.tsx`
- inspected `.github/workflows/test.yml`
- `node scripts/v2-migration-dry-run.mjs --input tests/fixtures/resonate-v1-export.sample.json --out /tmp/resonate-v1-migration-dry-run.sample.json`
- `npm test -- lib/__tests__/v2Migration.test.ts`
- `npm test -- components/__tests__/V2ResonateApp.test.tsx`
- `npm test -- components/__tests__/V2ResonateApp.test.tsx convex/__tests__/ideasApi.test.ts`
- `npm test -- components/__tests__/PersistedPublishingPanel.test.tsx`
- `npm test -- lib/__tests__/v2ProviderAdapters.test.ts`
- `npm test -- components/__tests__/IdeasPage.test.tsx`
- `npm test -- lib/__tests__/v2.test.ts app/api/v2/generate-draft/__tests__/route.test.ts components/__tests__/V2ResonateApp.test.tsx`
- `npm run typecheck`
- `npm run test:ci`
- `npm run build`
- `gh repo view jakebutler/corvo-labs-dot-com --json nameWithOwner,url,defaultBranchRef --jq '{nameWithOwner,url,defaultBranch: .defaultBranchRef.name}'`
- `npm test -- lib/__tests__/github.test.ts app/api/publish/__tests__/route.test.ts`
- `npm test -- components/__tests__/PersistedPublishingPanel.test.tsx`
- `npm test -- lib/__tests__/v2ProviderAdapters.test.ts convex/__tests__/ideasApi.test.ts`
- Approved live Buffer validation: authenticated against `https://api.buffer.com`, found active LinkedIn channels for Corvo Labs and the lower dB.
- Approved live Zernio validation: authenticated against `https://zernio.com/api/v1`, found active and healthy Reddit account `the_lower_db`.
- Approved live Corvo Blog validation: created and verified https://github.com/jakebutler/corvo-labs-dot-com/pull/53 through `/api/publish`.
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:ci`
- Browser smoke: `E2E_BYPASS_AUTH=1 npm run dev` then `http://localhost:3000/v2` renders the v2 app, persisted MVP panel, filters, and `+ Blog PR` control without the Clerk production-key overlay.

## Known Gaps

- Live read-only provider validation has been approved and completed for Buffer and Zernio. Live social submission through those providers remains intentionally unwired until request payloads, cancellation/unpublish behavior, idempotency, and status refresh semantics are implemented and tested.
- Local browser smoke with `E2E_BYPASS_AUTH=1` now skips Clerk provider hydration even when `.env.local` contains production-domain Clerk keys. Persisted Convex calendar data may still stay in loading/setup state without a Convex identity or seeded local deployment; use focused component tests or a properly authenticated preview for full persisted-data smoke.
- Ideas now have a v2 path from brand-assigned capture to linked LinkedIn, Reddit, and Corvo Blog draft creation. The legacy v1 draft buttons remain available for parity; the remaining #6 decision is how to handle the older workflow `ideas` table during migration/cutover.
- Idea-to-draft generation now has a deterministic clarifying-question preflight for thin Ideas and channel-specific missing context. Answers are sent to the server-side draft route and folded into local fallback/Pioneer prompts; accepted variants still create scheduled-but-unapproved persisted publishing intents.
- `lib/v2ProviderAdapters.ts` now defines the provider adapter contract for validate, submit, cancel/unpublish intent, status refresh, sanitization, and retry classification. Buffer and Zernio adapters can run approved, read-only live account/channel validation and sanitize provider IDs; live HTTP submission remains intentionally unwired until submission/cancel endpoint behavior is explicitly implemented.
- `gh repo view` confirms the accessible Corvo Blog repository is `jakebutler/corvo-labs-dot-com` with default branch `main`; the earlier `jakebutler/corvolabs-dot-com` spelling does not resolve from this environment.
- Corvo Blog PR creation now writes scheduled date, optional time, timezone, and schedule trigger into MDX frontmatter and the PR body, returns only sanitized PR metadata to the UI, and records PR URL, branch, provider state, sanitized attempt, and audit event on persisted v2 items. Approved live validation created and verified PR #53 in `jakebutler/corvo-labs-dot-com`.
- Accepted generated variants now create persisted scheduled-but-unapproved `v2Posts` and Publishing Intents when the Convex workspace is seeded. The persisted panel now renders month/week calendar views, multi-select Brand/Platform/Status filters, provider state chips, and approval-gated Mock Provider actions in the visible-range agenda.
- The persisted v2 item detail now includes one composer shell for LinkedIn, Reddit, Corvo Blog, and planning channels. Composer content/title changes call `updateContent` and clear approval for re-review, while date/time-only edits call `reschedule` and preserve approval.
- Source discovery, claim-map generation, editorial outlines, and long-form draft generation now snapshot research artifacts through Convex when the v2 workspace is seeded. Source and claim review actions attempt to sync reviewer status/notes back to Convex while preserving the local tracer if persistence is unavailable.
- Calendar agenda actions now include cancel/unpublish intent recording, and item detail exposes approval/reschedule/submit/Create PR handoff actions, source Idea/research pointers, provider state, sanitized provider attempts, idempotency keys, retry state, and audit events. Cancel/unpublish actions update provider state to `cancel-intent-recorded`, add audit events, and block additional Mock Provider submission without calling live provider adapters.
- `docs/glossary.md` now provides the stable v2 terms for Postiz-compatible spine, Brand/Channel/Platform, Publishing Intent, Provider State, Mock Provider, research artifacts, provider routing, and explicit live-provider approval.
- Mock Provider retry now requires an explicit human-triggered retry action. Duplicate submissions remain blocked, retryable/ambiguous attempts can be retried with a retry-scoped idempotency key, and permanent failures remain blocked from retry.
- CI is present in `.github/workflows/test.yml`: PR/push verification runs lint, typecheck, coverage, build, and PR E2E; production Convex deploy is gated behind verification and Convex-path changes.
- `docs/adr/0003-deployment-runtime.md` selects Vercel + Convex as the MVP validation lane and a separate container-capable Postiz service lane for later direct OAuth/provider scheduling.
- `docs/live-provider-validation.md` records the sanitized Buffer, Zernio, and Corvo Blog PR proof from the first approved live validation pass.
- Migration dry-run tooling now accepts v1 Convex export JSON, preserves raw `posts`, `capturedIdeas`, `capturedIdeaEntries`, `capturedIdeaPostLinks`, workflow `ideas`, `workflowDrafts`, and `settings` rows in an archive block, and emits v2 post/idea candidates without writing to Convex. It preserves captured/workflow Idea lineage onto post candidates and flags ambiguous published rows without public URL or PR/provider trace.

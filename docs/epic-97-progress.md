# Epic 97 implementation

Baseline: main b8b6e44, checked September 30, 2026. Issue bodies and comments for #97–#108 were read; there were no child comments or product decisions blocking the starting slices.

## Track A: complete blog PR exports (#98, #99, #103)

New blog drafts start with draft publication intent. The canonical composer saves manual cover alt text and publication intent, prepares a reviewed crop from the saved original upload, and shows the saved export metadata and destination. Approval includes the exact prose, editorial metadata, platform settings, hero source and derivative receipt. Date-only edits preserve editorial approval. Legacy posts remain readable; missing intent, alt, or prepared hero requires explicit review before a new export.

The derivative is a separate Convex storage object. It decodes as 1600×900 WebP, is strictly under 150,000 bytes, and has a SHA-256 receipt. Encoding is bounded at fixed dimensions. Original uploads are preserved. New exports accept uploaded assets only; legacy external URLs remain readable. No external image URL is fetched and no image/alt generation is called.

Open PR accepts only the authorized post ID. The server validates the saved approved fingerprint and schedule, then pins that version while exporting. An uncertain export retains its pin: re-run Open PR for the same version to reconcile remote bytes and the existing PR. Do not clear a pin or change copy until the external result is resolved. Both files enter one Git tree/commit/ref update. Existing remote files must match byte for byte; different or partial contents fail closed without overwriting. PR creation follows the complete commit. Prepared-source/crop replays reuse the existing derivative.

New and recovered article receipts include repository, branch, PR number, MDX path, hero path and canonical URL. Rescheduling edits only the bound MDX frontmatter and managed PR schedule summary. The filename and URL remain stable. Each update is a child of the observed GitHub head and uses a non-forced ref update; concurrent edits fail closed. Legacy recovery uses complete bounded PR file pagination plus one matching slug and title, with an audit event. No directory-first discovery remains. A pending sync prevents a second schedule edit, and stale callbacks/receipts are ignored.

## Verification status

- Implemented locally: Track A.
- Automated regression: 88 files / 743 tests and coverage gates passed (76.85% lines). Additional bounded noisy-image and stale-callback hardening has focused test coverage. Typecheck and Next build passed. The repository typecheck excludes tests; a standalone test-inclusive tsc reports legacy fixture typing errors and is not its gate.
- Mocked browser: canonical root composer save, saved preview, fixture approval, mocked Open PR, and reload passed. Providers and Convex WebSocket results are intercepted; this is not signed-in production verification or live delivery.
- Code review: self-review using the Convex reviewer checklist; human PR review pending.
- Merge: not authorized or performed.
- Production/Convex deployment: not authorized or performed; native Convex push verification is deliberately deferred. Sharp is declared as a Node external package per official Convex bundling guidance.
- Live delivery: no production post approvals, article publication, social sends, purchases, paid AI requests or lower-db pipelines.

## Remaining dependency order

1. B1 #100 and C1/C3 #101/#102.
2. C2 #104.
3. B2/B4 #105/#106.
4. B3 #107.
5. C4 #108.

Keep #49/#51 parked. New series links must retain post IDs, schedules, copy, source links, approvals and receipts. Editorial approval and explicit queue release review remain separate.

## Series adoption (#100)

Implemented in a stacked branch after #109: durable brand-scoped grouping links, paginated entries/post picker, attach/detach/reorder, progress counts, calendar filtering and canonical composer links. No post or publishing record is rewritten. Duplicate membership/cycles and cross-user/brand IDs are rejected. Linked posts must be detached before deletion. New groups and controls require editor access.

Verification: 15-article/30-companion Convex fixture preserves original post rows byte for byte across adoption, reorder and detachment; ownership/brand/channel rejection and calendar filtering pass. Existing composer tests (30) and Next build pass. Mocked Playwright verifies all 45 linked rows, reorder/reload and calendar navigation; the rendered full-page screenshot was inspected. Human review, merge, deployment and real delivery remain pending.

## Automatic preview deployment correction

GitHub's installed Vercel integration automatically built previews for PR #109 and #124. No deployment command or production deployment was issued, but the earlier statement that no deployment occurred was too broad. Human production deployment approval remains absent. The new branch-scoped vercel.json rule disables automatic previews for codex/epic-97-* branches before further pushes; other branches keep their existing configuration. Hosted #109 lint/test/build and E2E checks are green; #124 targets a stacked branch and the repository workflow does not run for that base. Human reviews remain pending.

## Buffer destination and delivery foundations (#101 / #102)

Sanitized, authorized snapshots identify stable channel/organization IDs, page/profile type, handle, safe LinkedIn URL and connection flags. First-comment capability remains supported/unsupported/unknown with provenance and timestamp. Explicit account-plan confirmation and a full-copy body-link alternative are available; the latter clears approval. Single submits require reviewed destination/payload/schedule identity and re-resolve before createPost. Mapping changes, unusable flags, stale evidence and required unverified comments hold dispatch.

Scheduled/sending/sent/draft responses normalize to Queued/Publishing/Published/Provider draft. Deletion requires a matching definitive receipt; removal after publication is tracked separately as removal from Buffer. Legacy cancellation reconciliation uses matching historical receipt evidence and leaves missing proof in Needs Review. Missing reads never invent cancellation. Terminal/out-of-order checks retain approval and old receipts. Manual status/history UI and existing hourly polling use persisted backoff and oldest-checked fairness; the default six-request polling budget avoids consuming the documented free daily quota with fifty calls per hour. No second cron or automatic retry is added. Published/provider receipt history cannot be deleted as an ordinary draft.

Verification: full regression 91 files / 770 tests and coverage gates passed (76.69% lines); 45 focused destination/lifecycle/legacy receipt tests pass. Repository typecheck and lint (0 errors) pass. Next build and mocked Playwright canonical account/queued receipt/history/fallback/reload passed; screenshot inspected. Final full gates follow before the stacked PR. No real Buffer reads/writes or draft approvals were used for these tests.

## Capacity planning foundations (#104)

The Queue surface shows exact destination identity, organization-wide fully paginated provider counts (including external/manual posts), separately confirmed channel/organization/daily constraints, observed API quota windows, freshness and explicit unknown states. Incomplete, stale or oversized observations hold the plan. Active/uncertain unreflected claims and local reservations consume capacity once. Specific linked posts can reserve/release local planning slots, with ownership checks and audit history. Confirmed provider receipts consume reservations; a reflected provider row is counted once. Saved dry runs persist eligible/held rows and reasons without dispatch or schedule changes. Strict IANA calendar conversion rejects invalid/ambiguous DST times; offsets preserve local calendar time.

Verification: full regression 93 files / 789 tests and coverage gates passed; focused capacity/pagination/DST/ownership/receipt fixtures passed. Typecheck, lint and Next build pass. Mocked browser shows eight backlog candidates/two reservations, saved holds/reload, explicit stale state, canonical composer links and zero provider mutations; rendered screenshot inspected. Linked article publication holds integrate in #106; explicit queue execution follows #108. This PR scaffolds its claim ledger without introducing a dispatch path. Human PR review, merge, production/Convex deployment and live delivery remain pending.

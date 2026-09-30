# Epic 97 implementation

Baseline: main b8b6e44, checked September 30, 2026. Issue bodies and comments for #97–#108 were read; there were no child comments or product decisions blocking the starting slices.

## Track A: complete blog PR exports (#98, #99, #103)

New blog drafts start with draft publication intent. The canonical composer saves manual cover alt text and publication intent, prepares a reviewed crop from the saved original upload, and shows the saved export metadata and destination. Approval includes the exact prose, editorial metadata, platform settings, hero source and derivative receipt. Date-only edits preserve editorial approval. Legacy posts remain readable; missing intent, alt, or prepared hero requires explicit review before a new export.

The derivative is a separate Convex storage object. It decodes as 1600×900 WebP, is strictly under 150,000 bytes, and has a SHA-256 receipt. Encoding is bounded at fixed dimensions. Original uploads are preserved. New exports accept uploaded assets only; legacy external URLs remain readable. No external image URL is fetched and no image/alt generation is called.

Open PR accepts only the authorized post ID. The server validates the saved approved fingerprint and schedule, then pins that version while exporting. An uncertain export retains its pin: re-run Open PR for the same version to reconcile remote bytes and the existing PR. Do not clear a pin or change copy until the external result is resolved. Both files enter one Git tree/commit/ref update. Existing remote files must match byte for byte; different or partial contents fail closed without overwriting. PR creation follows the complete commit. Prepared-source/crop replays reuse the existing derivative.

New and recovered article receipts include repository, branch, PR number, MDX path, hero path and canonical URL. Rescheduling edits only the bound MDX frontmatter and managed PR schedule summary. The filename and URL remain stable. Each update is a child of the observed GitHub head and uses a non-forced ref update; concurrent edits fail closed. Legacy recovery uses complete bounded PR file pagination plus one matching slug and title, with an audit event. No directory-first discovery remains. A pending sync prevents a second schedule edit, and stale callbacks/receipts are ignored.

## Final status

All eleven child issues are implemented in dependency order across eight stacked draft PRs. The final slice is on `codex/epic-97-reviewed-queue`, based on `codex/epic-97-batch-approval`; the epic lists the exact PRs. Checked epic items mean implementation and sanitized fixture verification. They do not mean merged, deployed or delivered.

Final verification results are recorded below after the queue-execution section. The repository's typecheck excludes tests; a separate test-inclusive tsc reports pre-existing fixture typing errors and is not its gate. Human PR review is pending. Production/Convex deployment and native Convex push verification remain deferred by Jake's explicit boundary. Sharp is declared as a Node external package per official Convex bundling guidance.

Delivered order: A1/A2/A3 → B1 → C1/C3 foundations → C2 foundations → B2 → B4/C2 completion → B3/C1 completion → C4. Keep #49/#51 parked. #61 was not restarted. New series links retain existing post IDs, schedules, copy, source links, approvals and receipts. Editorial approval and explicit queue release review remain separate.

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

## Prepared package import (#105)

A documented version 1 manifest plus uploaded Markdown/still images enters through Series → Import prepared package. The server validates metadata, schedules/IANA/DST, stable keys, paths, uploads and ownership before commit. Dry-run stores durable exact-source review rows and returns an in-memory hero preview/receipt without posts, assets, approvals, PRs or provider/AI mutations. Each explicit commit uses the shared canonical post creation helper and atomic entry transaction, then links those same unapproved posts into one series. Original heroes and prepared derivatives are stored separately, with source/crop deduplication and stable source SHA-256/entry receipts.

Matching existingPostId attachments preserve old state, approval and receipts. Changed committed input conflicts, including unapproved originals; no overwrite path exists. Completed entries recover idempotently after interruption and identical replay is a no-op. Unknown interrupted asset claims hold for receipt reconciliation rather than duplicate upload; caught failures clean up orphan bytes. Package/per-entry/aggregate review bounds keep reads/writes and Node arguments bounded.

Verification: the sanitized 15/30 fixture dry-runs with zero new posts/assets, resumes after five entry commits, replays without duplicates, preserves exact claims/links, and leaves every new item unapproved with normal intents/provider records. Invalid path/archive/date/timezone/key/missing-file and unauthorized ID tests pass. Existing approved/submitted/published attachments and unresolved asset claims are covered. Repository typecheck/lint/Next build and mocked Playwright upload → correction → hero/exact source review → commit → canonical links pass; rendered screenshot inspected. Human review, merge, production/Convex deployment and live delivery remain pending.

Import final gates: 94 test files / 795 tests and coverage thresholds passed (75.09% lines). Hosted stacked PR checks are not a replacement for these local checks; the main-target CI workflow remains unchanged.

## Article dependencies and publication evidence (#106 / #104 completion)

Companions store an explicitly chosen parent and body/first-comment placement. The canonical composer previews the full proposal and saved URL from the article artifact. Material body/comment edits clear approval; metadata-only linking preserves copy and receipts. Independent drip dates stay saved until an explicit date edit; optional IANA calendar-day previews reject invalid/ambiguous DST times. Both single dispatch context and transactional claim enforce parent/link/publication freshness and exact future time. Queue dry-run uses the same dependency hold.

Read-only publication checks keep PR/head/merge, Production deployment, and canonical article content separate. A merged PR cannot set Published. The latest successful Production deployment must contain the exact merged artifact: the merge SHA itself, or a GitHub-confirmed descendant preserving its blob. Known saved frontmatter and prepared hero bytes must match. Legacy source images without prepared receipts retain their existing bytes; this check does not assert their original-image provenance or exhaustive page rendering. The narrowly configured canonical HTTPS target uses bounded DNS, pinned public IP/TLS reads, redirects and HTML/Markdown inspection, with useful unknown/blocked states. Evidence is version-bound, time-bound, deduplicated and ignores stale callbacks. Series progress separates verified article/social receipts from legacy/simulated labels.

Verification: 96 files / 821 tests and coverage gates passed (74.58% lines), then 61 focused checks passed after final guard/composer synchronization changes. Typecheck, lint (0 errors), Next build and mocked browser dependency/proposal/DST/independent-date/expired-time flow pass. Earlier blog/import/account/queue browser regressions also passed; the final series/dependency screenshot was inspected. No real publication reads, provider writes, deployment or production approvals occurred in these checks. Human PR review, merge, production/Convex deployment and live qualification remain pending.

## Selected immutable editorial review (#107 / #101 completion)

Series selection is an owned, revisioned Convex record, capped at 50 exact IDs. Explicit Prepare stores full immutable per-row snapshots, editorial versions, local/UTC schedules, prepared heroes/manual alt/export intent, resolved account/first-comment entitlement, parent URL/placement/evidence and persistent source/citation warnings. Existing root composer links are the only edit path. Selection survives navigation/reload; a selection, series membership, editorial, date, account or readiness change marks the packet stale.

Approve selected uses one bounded atomic server mutation. It validates every row and editor/brand/ownership/membership before any approval write. A stale/inaccessible row returns useful errors and zero approvals; successful rows retain displayed IDs/versions with actor/time receipts, while unselected posts and delivery receipts remain untouched. Approval shares existing per-post metadata validation. Date-only changes keep approval but require refreshed review. Editorial approval requests no PR/provider call and grants no queue release. Existing delivered status is preserved when recording approval.

Verification: 97 files / 830 tests, coverage gates (74.15% lines), typecheck, lint (0 errors) and Next build passed. Nine new Convex tests cover exactly selected rows, six stale/inaccessible/selection cases, source/hero/export review, foreign/viewer denial, date-only approval preservation, delivery receipts and replay. Mocked keyboard/browser selects three, removes one, reloads selection, explicitly approves two, edits one in the canonical composer and verifies only that item loses approval; zero dispatch. The rendered packet screenshot was inspected. Human PR review, merge, production/Convex deployment and live delivery remain pending.

## Explicit reviewed queue release (#108)

Queue → Review eligible posts stores only the selected 1–20 exact post IDs, immutable full payloads and SHA-256 hashes, local/UTC dates, account identity/entitlement, article receipt, capacity observation, constraints and the complete retained reservation set. Selection alone, preparation, editorial approval, page load, polling and new capacity never submit a post. Only the separately confirmed Queue selected action enters the existing live-gated Buffer pipeline.

Single and batch actions share one submission context, per-intent attempt claim and provider adapter. Before createPost, an atomic organization/destination allocation is stored and the adapter revalidates the approved version, exact future date, account, parent receipt and fresh packet after account discovery. Concurrent users/channels share organization capacity; a known claim in a different organization does not contaminate the current plan. Unselected launch reservations retain their slots. Confirmed daily ceilings require dated queue/claim/reservation evidence.

A definitive queue-full rejection stops the batch, releases only that rejected allocation and invalidates the capacity observation. Fresh evidence plus a new explicit review/action can retry a definitive retryable rejection; accepted rows are skipped. A prior failed-attempt receipt is part of the new immutable review. No automatic retry or date change occurs. Any pending/ambiguous post-wide attempt blocks a resend even if its copy or intent changes. Known IDs survive receipt-persistence interruption and can reconcile through the existing read-only status mechanism. An unknown ambiguous ID retains its uncertain claim for operator reconciliation; it cannot be cleared by selecting the post again.

Rows retain queued/held/failed/needs-review results, immutable account/time/payload facts, attempts, known provider IDs and a useful next step. Existing polling updates actual delivery status and releases capacity on matching terminal receipts. Mock IDs/provider drafts never count as real queued posts. Calendar and series counts distinguish verified article evidence, known queued/published social receipts, legacy labels and simulations.

Verification includes 25 queue-release tests: eight backlog posts/two reservations, exact dates and payloads, external queue-full then explicitly reviewed replan, all review drift cases, concurrent single/batch and shared/independent organization claims, retained uncertain calls, accepted response followed by receipt persistence failure, partial execution/interruption, selected reservation consumption, daily ceilings, live gates and simulated/provider-draft responses. The mixed-result browser flow performs full review → explicit action → durable queued/uncertain/held receipts → new selection for remaining rows. No real Buffer request or existing production approval is used.

## Final integration verification

- `npm run test:ci`: 99 files / 856 tests, all coverage thresholds passed (73.74% lines).
- `npm run typecheck`, `npm run lint` and sanitized `npm run build`: passed; lint has 0 errors and 12 existing warnings.
- Complete production-build Chromium suite: 16 tests passed, covering all eight new workflow specs plus existing dashboard/campaign/setup surfaces. The queue fixture was then refreshed with its required constraint timestamp and passed again with a rendered-date assertion. The final mixed-receipt screenshot was inspected.
- Final focused dispatch/planning/publishing/adapter run: 75 tests passed, including queue-full recovery only after a fresh explicit review.
- Schema/API generation was local only; no Convex server push, production credentials or remote fixture deployment was used.
- Convex authorization, bounded reads/writes, immutable review facts, concurrent allocation, accepted/uncertain receipt preservation and fail-closed adapter paths were self-reviewed. No independent or human PR approval is claimed.
- Main was re-fetched at `b8b6e44baab1d728f6a2267e043acc64b03bec66`; the original checkout and unrelated managed worktrees were preserved. All issue/comment/dependency reads remain current; no new comments or blocking product choices appeared.

## Review and authorized rollout boundary

Review and merge the PRs in stack order after maintainer authorization, retargeting each surviving base as necessary. The main-target workflow does not run on stacked bases, so the final local test/build/browser receipt covers their integration; rerun hosted checks when retargeting to main. No merge was performed. No production or Convex deployment was performed. Automatic Vercel previews for the first two PRs are documented above; later implementation branches suppress them.

After a separately authorized deployment, inspect the configured destination and actual plan/queue evidence before preparing a release. Verify each linked article's exact Production artifact and canonical availability with the read-only controls. Existing approved copy, dates, assets and historical receipts remain preserved; any required material edit needs its own editorial review. Live qualification requires Jake's scoped approval for a disposable future post and verified cancellation. Application deployment is not approval to publish an article or queue a content batch. No plan purchase, paid generation, lower-db pipeline or production article/social submission occurred during implementation.

There are no outstanding product decisions blocking implementation. Human PR review, merge authorization, deployment authorization, signed-in production verification and any scoped live-delivery qualification remain separate pending steps.


## Authorized integrated rollout (September 30, 2026)

Jake reviewed the workflow screenshot and explicitly authorized merge and deployment. He requires another review before live content writes. The release will merge the complete approved stack through #130 into main, retaining all implementation commits and PR history, so production receives the complete feature set in one release. Original checkout and unrelated worktrees remain untouched. No editorial approval, article export/publication, social submit/cancel or paid provider call is part of this rollout.

Hosted integration E2E passed all 16 tests. Four article-publication unit tests initially inherited CI's placeholder repository settings; the fixture now pins its sanitized repository/path/origin/environment. The full suite with CI repository overrides passes: 99 files / 856 tests and coverage thresholds (73.74% lines). Native Convex dry-run now passes production schema validation, bundling (including external Sharp), API generation and required function TypeScript checks with zero deleted indexes. The missing Convex TypeScript config was added with the existing alias mapping; production CI now requires this native typecheck instead of silently skipping it.

Production was grounded at main b8b6e44 and the matching Vercel Production deployment. Normal signed-in browser access works. Existing delivery gates were already approved; this approval does not authorize any new content write. Existing read-only receipt polling remains in place. Article evidence checks require the app's existing GitHub credential and destination configuration in Convex; that deployment configuration will be verified separately from content delivery.

Merge, frontend/backend deployment and post-deployment screenshot/read-only verification remain pending until their actual receipts are recorded in the epic. Live delivery qualification remains held for Jake's next review.

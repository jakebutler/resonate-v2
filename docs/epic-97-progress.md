# Epic 97 progress

Current checkpoint: September 30, 2026. [Epic #97](https://github.com/jakebutler/resonate-v2/issues/97) covers children #98–#108. Issue acceptance criteria govern the implementation; illustrative code was adapted to the existing canonical composer and Convex records.

## Delivery status

- Implementation: all eleven children shipped through integrated [PR #130](https://github.com/jakebutler/resonate-v2/pull/130), main `df9b9f08575cdef71a4081920a15ebfb6139daa5`. Original PRs #109 and #124–#129 are also merged through that ancestry.
- Verification: the initial release passed 856 unit tests with coverage, 16 mocked Chromium workflows, native Convex schema/bundling/type checks, and signed-in production Calendar, Series and Queue screenshots. Existing 55 posts, 31 attempts and 55 provider states retained their immutable facts.
- PR review: the initial automated reviewer posted 30 findings before merge. They were missed during the initial rollout. [Issue #132](https://github.com/jakebutler/resonate-v2/issues/132) tracks the follow-up; [the disposition table](epic-97-review-followups.md) records code changes and regression evidence. PR #133 addresses those findings plus all 18 comments from its own first review. Final exact-head checks and review readback remain in progress.
- Merge: Jake explicitly approved merge and deployment after inspecting the screenshot. This authorization remains in effect for the remaining fixes. The follow-up branch has not yet merged.
- Deployment: initial frontend deployment `dpl_EekUTbDxDqxewdzTk7dSa5AYPd9V` is READY for that exact main SHA at `https://resonate.corvolabs.com/`. Convex Production `healthy-platypus-553` deployed successfully. Follow-up deployment remains pending.
- Live delivery: Jake requires another review before live content writes. `BUFFER_LIVE_SUBMISSION=blocked` was verified after resuming. It also pauses the existing receipt poll. Existing remote schedules remain untouched. No draft approval, article export/publication, social create/cancel, paid generation, plan purchase or lower-db pipeline was performed.

## Complete blog exports (#98, #99, #103)

The canonical composer preserves approved prose and explicitly saves publication intent, metadata and manual cover alt. Hero preparation creates a separate reviewed 1600×900 WebP under 150,000 bytes with a SHA-256 receipt; original uploads remain intact. Approval covers exact editorial and image facts, while date-only edits preserve approval. New exports accept only an authorized canonical post ID. Deterministic MDX and actual hero-byte validation precede the durable export claim. Both files enter one Git commit before PR creation; uncertain results retain their claim for read-back reconciliation. Recovered branches must contain only the exact reviewed MDX and hero changes.

Artifacts bind repository, branch, PR number, MDX path, hero path and canonical URL. Schedule sync uses only that MDX and non-forced Git updates, preserving URL and filename. Legacy recovery is bounded and unambiguous. Legacy callbacks lacking a bound artifact now produce a durable Needs Review status rather than silently dropping an old job. The secret-only synthetic ops publishing smoke is retired with HTTP 410: approved article export belongs in the composer.

## Series workspace (#100, #105, #107, #106 article dependencies)

Series grouping links existing posts without rewriting copies, approvals, assets, schedules or receipts. Ownership, brand, membership and edit access are enforced. Prepared Corvo packages dry-run exact article/companion files and reviewed heroes, then commit only explicitly reviewed unapproved entries with durable replay receipts. Unsupported blog brands fail during dry run. Uploaded blobs survive uncertain asset-receipt persistence.

Selected approval reviews full saved versions and validates every selected row before any approval mutation. Linked companions use explicit parent and canonical-link placement; first comments require LinkedIn, and copy changes require reapproval. Exact IANA schedules handle invalid dates and DST holds. Provider-accepted or uncertain dispatches reject local-only schedule changes; a matching confirmed cancellation/removal permits date planning while the submission no-replay guard remains. Series URLs derive the owned series brand and normalize repeated values before sending IDs to Convex. An unavailable calendar series holds its query until an accessible series filter is selected explicitly.

Publication evidence separates PR merge, Production deployment containing the exact artifact, and canonical article availability. Every artifact must be in the bound PR changed-file list. Read results are pinned to PR URL, branch and artifact as well as editorial content. Bounded DNS/TLS/content reads retain useful holds; Markdown hard breaks match rendered word boundaries. Counts require complete current publication evidence and refresh freshness locally without provider calls.

## Queue capacity and delivery (#101, #102, #104, #108)

Authorized destination receipts identify exact account/channel/organization and connection flags. First-comment entitlement has explicit supported/unsupported/unknown provenance. A transient refresh error retains old facts while holding dispatch. Preparing a queue packet does not silently pin an unreviewed destination.

Capacity counts complete organization provider queues, unknown constraints, API windows, active/uncertain claims and local reservations. Confirmed provider rows, claims and reservations consume each slot once. Observation IDs and organization/channel facts must match. Consumed reservation receipts cannot be released as unused planning slots.

Single and selected batch submits use existing provider submission and polling mechanisms. Exact future schedules and reviewed immutable versions are checked before claim and again before create. A local request-budget exhaustion is definitively pre-dispatch and releases its allocation for a newly reviewed retry; network/persistence ambiguity retains durable no-replay guards. A suspicious Buffer ID cannot hide an ambiguous attempt by resembling a mock ID. Recovery advances only interrupted executing rows; explicit editorial holds remain through later status refreshes. Definitive legacy cancellation receipts release matching allocations. Polling selects Buffer rows through a provider/status/time index and excludes simulated or mock-like receipts before bounding the cohort. Rate-limit backoff always advances into the future on HTTP 429.

## Review before live writes

Follow-up tests, screenshots, PR comments, merge and deployment receipts will be recorded separately. Then Jake reviews the delivered UI and an exact bounded live qualification proposal. Deployment authorization does not approve any content write, even to a disposable post. Existing unrelated worktrees and root branch remain preserved; #49/#51 stay parked and #61 was not restarted.

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
- Deployment: not authorized or performed; native Convex push verification is deliberately deferred. Sharp is declared as a Node external package per official Convex bundling guidance.
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

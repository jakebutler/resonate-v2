# Project Status

Recorded checkpoint: September 30, 2026. This document describes PR #133 and its release boundary; it is not a live `git status` report. Verify the actual branch, worktree and remote head before resuming.

## Implementation

Epic #97 and issues #98–#108 are implemented on main through #130 (`df9b9f0`). Follow-up PR #133 starts with `54357ee` and addresses all 30 integrated review findings plus its own 18 review findings. The detailed code and regression dispositions are in [epic-97-review-followups.md](epic-97-review-followups.md).

PR #133 preserves explicit editorial holds, binds article/source/capacity evidence, requires destination review, handles confirmed cancellation separately from submission replay, reconciles exact exports after main advances, excludes mock receipts before polling bounds, and makes unavailable series links visible. Its committed change set includes associated mocked tests and browser fixtures; these are PR changes, not unrelated uncommitted work.

## Verification and release

The initial follow-up checkpoint passed 897 unit tests, native Convex dry-run, lint/typecheck/build and 19 browser tests. The final follow-up candidate adds cancellation, renamed-file, advanced-main, failed-connection and unavailable-calendar regressions. Final hosted verification, PR review, merge, deployment and read-only production verification remain pending at this recorded checkpoint; their gate status is tracked separately in [epic-97-progress.md](epic-97-progress.md) and the GitHub epic.

Jake approved merge and deployment. Live content writes still require his next scoped review. Keep `BUFFER_LIVE_SUBMISSION=blocked`; do not approve existing drafts, adopt production content, create/cancel provider fixtures, publish articles or submit existing posts from this software release approval.

## Workspace preservation

Use the registered `codex/epic-97-review-followups` worktree. Preserve the primary `feat/jake-voice-profile` checkout and the editorial-visual and publishing-navigation worktrees. No production content, approvals, images, schedules or immutable receipts are changed by tests or read-only release checks.

## Next pickup

Read the epic and actual PR/CI/deployment state, verify the Buffer gate, and use the hash-only preservation receipts. Existing content activation is a separate review: production has no adopted series or saved capacity evidence, 15 candidate articles need reviewed heroes/alt/artifact bindings, and 20 linked companions remain unapproved. The local activation review lists exact existing mappings without changing copy or schedules.

## Editorial visual generation

PR #131 integrates the current publishing safeguards, approved-image pixel reflection, guarded image-generation/edit dispatch, evidence-bound figures and complete MDX/WebP/SVG assets. The current feature candidate still requires fresh independent integration reviews and exact-SHA CI. Provider qualifications remain pending; no new human aesthetic approval, article publication or schedule is implied. See [editorial visual progress](editorial-visuals/PROGRESS.md) for separate implementation, review, qualification and release evidence.

## Editorial visual review checkpoint — September 30, 15:32 PDT

The frozen `3e69417` backend/text-pixel scope has independent approval. Separate export/UI/reader review requested replay filename-set and current PR-head repairs; the coordinator's repaired helper and callback-aware route fixtures pass 94 affected tests, configured typecheck and scoped lint. A new frozen candidate, independent repair review and exact CI are pending. The previous CI failed the two route test doubles. Credential confirmation, actual provider qualification and verified backend-first release ordering remain pending; no merge, deployment or real publication has occurred.


### Resumed editorial visual repairs (2026-10-01 02:34 UTC)

The isolated author branch contains the confirmed publication, HTML/evidence, provider/budget and composer repairs. The UI slice and corrected backend slice have independent approval; the publication/figure follow-up and final exact-candidate integration remain under review. One invalid PNG test fixture has been replaced with real encoded bytes; this preserves the stronger decoder guard. Fresh CI and actual served composer/reader qualification are still required before release. PR #131 is unmerged; provider qualification, new human image approval and key-creation confirmation remain pending. No provider spend, deployment, article or LinkedIn publishing/scheduling occurred. Preserve the existing upstream publishing history and production routing state.


## Article activation fixes — September 30, 2026

Recorded activation checkpoint, not a live branch report. PR #131 is now merged as `a87c3ee`; its main CI passed and the publishing records remained unchanged before activation. Jake explicitly approved existing article publication/adoption, the exact twenty remaining companion versions and faster dates, Free rolling batches, and one disposable create/cancel qualification followed by delivery only after technical fixes pass. New application merge/deployment remains a separate approval.

The six existing website PRs #74–#79 are merged at their approved heads. Website Production is READY at `8030650`. Existing accepted Buffer posts must retain their IDs, copy and dates and must never be resubmitted. The approved series is `sd7f2nq56e64mcryh246zppqv18fdve3`; do not repeat series setup.

This fix recognizes Vercel's non-transient Production bot deployment only with a matching successful bot status, retains exact merge ancestry/source/hero and canonical copy checks, supports both Node DNS lookup callback forms with one validated address, and makes shared-library changes trigger a Convex deployment in CI. The focused 56 tests, full unit suite with coverage, lint, typecheck, Next.js production build and native Convex dry-run passed. No indexes would be deleted.

Application merge/deployment, server publication qualification and provider create/cancel/submission remain held pending the exact tested software release. Free queue refill remains operator initiated. No plan purchase, paid generation or lower-db pipeline is authorized. Preserve the primary checkout and unrelated worktrees. Earlier checkpoints below remain historical evidence; re-ground live receipts before acting.

Legacy hero compatibility: accept only the exact dated or undated directory derived from the bound article slug; preserve source, hash and inline placement checks. All fifteen live articles passed the complete candidate read-only verifier against website Production `8030650`.

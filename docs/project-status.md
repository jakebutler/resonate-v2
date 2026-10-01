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

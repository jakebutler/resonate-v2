# Project Status

Last updated: 09/30/2026 14:09:31 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

- Updated repository documentation and handoff records.
- Touched the main dashboard surfaces.

## Last Completed Task

- df9b9f0 Merge pull request #130 from jakebutler/codex/epic-97-reviewed-queue

## Recent Commits

- df9b9f0 Merge pull request #130 from jakebutler/codex/epic-97-reviewed-queue
- 9986c17 fix(release): isolate article fixtures and require native Convex checks
- 1b77d73 feat(queue): dispatch exact reviewed batches with durable capacity claims
- 92aad6c feat: approve exact selected series versions atomically
- 9aacca7 feat: verify article publication before companion delivery

## Local Working Tree

- A  app/__tests__/homeSeriesParams.test.tsx
- M  app/api/ops/validate-workflow/__tests__/route.test.ts
- M  app/api/ops/validate-workflow/route.ts
- M  app/api/publish/route.ts
- M  app/page.tsx
- M  components/ArticleDependencyPanel.tsx
- M  components/PersistedPublishingPanel.tsx
- M  components/QueuePlanningPanel.tsx
- M  components/__tests__/PersistedPublishingPanel.test.tsx
- A  components/__tests__/QueuePlanningPanel.test.tsx
- M  convex/__tests__/articleDependencies.test.ts
- M  convex/__tests__/bufferFoundations.test.ts
- A  convex/__tests__/legacyGithubSchedule.test.ts
- M  convex/__tests__/preparedImports.test.ts
- M  convex/__tests__/queuePlanning.test.ts
- M  convex/__tests__/queueRelease.test.ts
- M  convex/articleDependencies.ts
- M  convex/articlePublication.ts
- M  convex/bufferAttempts.ts
- M  convex/bufferDelivery.ts
- M  convex/bufferDestinations.ts
- M  convex/bufferLive.ts
- M  convex/githubPrSync.ts
- M  convex/preparedImportActions.ts
- M  convex/preparedImports.ts
- M  convex/publishing.ts
- M  convex/queueDispatch.ts
- M  convex/queuePlanning.ts
- M  convex/queueRelease.ts
- M  convex/schema.ts
- M  docs/epic-97-progress.md
- A  docs/epic-97-review-followups.md
- M  docs/ops-runbook.md
- A  e2e/series-url-filters.spec.ts
- M  lib/__tests__/articlePublication.test.ts
- M  lib/__tests__/bufferContracts.test.ts
- M  lib/__tests__/deliverySummary.test.ts
- M  lib/__tests__/github.test.ts
- M  lib/__tests__/queueCapacity.test.ts
- M  lib/articleAvailability.ts
- M  lib/articleContracts.ts
- M  lib/articlePublication.ts
- M  lib/bufferContracts.ts
- M  lib/deliverySummary.ts
- M  lib/github.ts
- M  lib/providerAdapters.ts
- M  lib/queueCapacity.ts

## Next Agent Pickup

- Start by checking the living docs against the current code before making assumptions.
- If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.

## Branch

- codex/epic-97-review-followups

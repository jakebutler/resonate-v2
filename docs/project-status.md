# Project Status

Last updated: 09/14/2026 16:57:58 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

- Updated repository documentation and handoff records.

## Last Completed Task

- 1cd642d perf: audit wave D — calendar N+1 removal, corpus pagination, buffer status cron

## Recent Commits

- 1cd642d perf: audit wave D — calendar N+1 removal, corpus pagination, buffer status cron
- d8154dd fix: audit wave C — composer error surfacing, shared toast, UI quick wins
- 4a8839b refactor: audit wave B — consolidate duplicated auth/routing/gate logic, fix campaign-loop correctness bugs
- e064bcd fix: audit wave A — close unauthenticated Convex functions, make lab-import reachable, single-use mock-ack tokens
- 68c66b6 feat: campaign loop remediation pass — should-fix C1-C12 + D-5/D-16 product decisions

## Local Working Tree

- M  .env.local.example
- M  components/PersistedPublishingPanel.tsx
- M  components/__tests__/PersistedPublishingPanel.test.tsx
- M  components/campaigns/ApprovalQueue.tsx
- M  components/campaigns/ReviewPassesPanel.tsx
- M  convex/__tests__/campaignSession.test.ts
- M  convex/_generated/api.d.ts
- M  convex/campaigns.ts
- M  convex/publishing.ts
- M  convex/queue.ts
- M  convex/schema.ts
- A  convex/v2Storage.ts
- M  docs/ops-runbook.md
- M  lib/__tests__/cohesion.test.ts
- M  lib/cohesion.ts
- M  lib/domain.ts
- M  lib/providerAdapters.ts

## Next Agent Pickup

- Start by checking the living docs against the current code before making assumptions.
- If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.

## Branch

- feat/audit-decisions

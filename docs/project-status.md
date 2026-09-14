# Project Status

Last updated: 09/14/2026 16:07:23 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

- Touched the workflow board or editorial workflow logic.
- Touched the captured ideas experience.

## Last Completed Task

- e064bcd fix: audit wave A — close unauthenticated Convex functions, make lab-import reachable, single-use mock-ack tokens

## Recent Commits

- e064bcd fix: audit wave A — close unauthenticated Convex functions, make lab-import reachable, single-use mock-ack tokens
- 68c66b6 feat: campaign loop remediation pass — should-fix C1-C12 + D-5/D-16 product decisions
- 4690c4c docs: campaign loop C1-C8 build record, HITL checklist, prod secrets remediation
- b0d1b3e Merge pull request #87 from jakebutler/feat/c8-lab-journey
- 6577d3a test: disambiguate campaigns heading in E2E

## Local Working Tree

- M  components/campaigns/ExcerptReviewList.tsx
- M  convex/backfill.ts
- M  convex/bufferLive.ts
- M  convex/campaignAccess.ts
- M  convex/cohesion.ts
- M  convex/ideas.ts
- M  convex/posts.ts
- M  convex/publishing.ts
- M  convex/queue.ts
- M  convex/research.ts
- M  convex/v2Migration.ts
- M  convex/workflow.ts
- M  eslint.config.mjs
- A  lib/approvalGate.ts
- M  lib/domain.ts
- A  lib/formatYmd.ts
- A  lib/sanitize.ts

## Next Agent Pickup

- Start by checking the living docs against the current code before making assumptions.
- If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.
- Workflow changes should preserve the distinction between backend stages and the simplified kanban columns.
- Do not conflate the captured ideas inbox with the separate workflow idea system.

## Branch

- fix/audit-consolidation

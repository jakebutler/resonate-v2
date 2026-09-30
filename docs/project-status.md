# Project Status

Last updated: 09/30/2026 13:57 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

- Updated repository documentation and handoff records.

## Current Integration

- Integrating current main df9b9f0 (reviewed series/queue/publishing) into isolated editorial visual branch.
- Repaired candidate will require fresh exact-SHA independent review and CI. No provider calls, merge or deployment completed.
- Image dimensions and HTTP redirect findings are under behavioral repair.

## Last Completed Task

- 6f0de30 fix: preserve all recorded publication identities

## Recent Commits

- 6f0de30 fix: preserve all recorded publication identities
- 8adb3ad fix: retain terminal publication authority after rescheduling
- ca79746 fix: pause visual admissions and preserve publication consistency
- c390c98 docs: record visual contracts and guarded offline rehearsals
- 4f59b60 feat: integrate opt-in visuals into the saved composer

## Local Working Tree

- M  components/EditorialVisualPanel.tsx
- M  components/__tests__/EditorialVisualPanel.test.tsx
- A  convex/__tests__/visualProviderActions.test.ts
- M  convex/__tests__/visualPublication.test.ts
- A  convex/__tests__/visualTextActions.test.ts
- M  convex/_generated/api.d.ts
- M  convex/schema.ts
- A  convex/visualProviderActions.ts
- A  convex/visualProviderConfig.ts
- M  convex/visualPublication.ts
- A  convex/visualTextActions.ts
- A  convex/visualTextConfig.ts
- A  convex/visualTextTables.ts
- M  convex/visualWorkflow.ts
- M  convex/visualWorkflowTables.ts
- M  docs/editorial-visuals/PROGRESS.md
- M  docs/editorial-visuals/providers/contracts.md
- A  docs/editorial-visuals/providers/functional-first-packet.json
- A  docs/editorial-visuals/providers/gpt-image-1-functional-bound.md
- A  lib/__tests__/visualProviderRuntime.test.ts
- M  lib/__tests__/visualProviders.test.ts
- A  lib/__tests__/visualTextRuntime.test.ts
- M  lib/github.ts
- A  lib/visualProviderRuntime.ts
- M  lib/visualProviders.ts
- A  lib/visualTextRuntime.ts

## Next Agent Pickup

- Start by checking the living docs against the current code before making assumptions.
- If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.

## Branch

- feat/editorial-visual-generation

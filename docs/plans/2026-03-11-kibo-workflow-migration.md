# Kibo Workflow Migration

## What changed

- Initialized shadcn in the app and added Kibo registry components for `kanban`, `choicebox`, and `combobox`.
- Rebuilt the workflow board as a horizontal Kanban with 5 user-facing columns:
  - `Ideas`
  - `Research`
  - `Outline`
  - `Review`
  - `Published`
- Kept the 7 backend stages unchanged.
- Grouped `copyedit`, `seo`, and `final` into the single `Review` column in the UI.
- Rebuilt the idea workspace and draft workspace on top of the new dialog shell.
- Replaced the old custom modal, slide-over, button, and toggle behavior with shadcn-backed primitives.

## Why this shape

- The board is now optimized for user review checkpoints instead of exposing every internal pass as its own column.
- The data model still preserves the granular editorial stages, so no Convex schema or workflow-stage migration was required.
- Drag and drop is enabled only where the move is unambiguous:
  - `Idea -> Research`
  - `Outline -> Review`
  - `Final -> Published`
- `Research -> Outline` stays button-driven because one research card can spawn multiple downstream post instances and the user must choose `blog` or `linkedin`.

## Kibo and shadcn mapping

- `components/ui/button.tsx` is now the canonical button primitive.
- `components/ui/Modal.tsx` is now a shadcn dialog wrapper.
- `components/ui/SlideOver.tsx` is now a shadcn sheet wrapper.
- `components/ui/Toggle.tsx` now uses the shared switch primitive.
- `components/WorkflowBoard/WorkflowBoard.tsx` uses the Kibo Kanban component.
- `components/WorkflowBoard/WorkflowIdeaModal.tsx` and `components/WorkflowBoard/WorkflowDraftEditor.tsx` are composed from shadcn primitives rather than bespoke overlays.

## Decisions preserved

- One original idea can still spawn multiple downstream drafts.
- Published cards still age off the board after 7 days.
- Stage-gate checks still happen before progression.
- Specialized stage agents still run through the existing LLM path instead of adding a new persistent Convex agent framework.

## Intentionally not built

- No backend stage rewrite from 7 stages to 5 stages.
- No rich-text editor migration.
- No drag-and-drop support for ambiguous transitions such as spawning a draft from research.
- No calendar or library redesign beyond the shared shell migration.
- No new persistent Convex agent framework.

## Follow-up watchpoints

- The workflow board now depends on Kibo/shadcn primitives, so future UI work should prefer those same primitives instead of adding new bespoke shells.
- If draft ordering inside columns becomes important, the current board remains read-model driven and does not persist manual ordering yet.

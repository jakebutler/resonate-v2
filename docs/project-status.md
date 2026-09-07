# Project Status

Last updated: 09/06/2026 19:05 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture. Main is stable: typecheck clean, 503/503 unit tests, E2E green, prod healthy. Campaign-assistant wayfinder map (#61) is 7/8 sub-issues done (prototypes #66/#67 built; #68 and #69 remain).

## Current Task

Both source-journey prototypes are built and merged (#66 paper path via #71/#72/#73, #67 lab path via #74). Next: Jake reacts to #67, then #68 (shape accept → cohesive placeholders), then the #69 spec rewrite.

## Session Focus

- Built prototype #67 (lab-corpus journey): CLI dry-run ingest per #64, semantic excerpt units, lab-flavored ideas, cross-campaign continuity with #66. Implemented two feedback passes on #66 (custom dropdowns, hover citations, undo, slot redesign, preset retention, goal/audience check, back-nav, publishing-sequence rename, affordance clarity, media-type rendering).

## Last Completed Task

- #74 merged — prototype #67; artifact linked on the issue.

## Recent Commits

- #74 merge: prototype #67 (lab corpus path)
- #73 merge: prototype #66 revision 2 (affordances, proximity, media types)
- #72 merge: prototype #66 revision 1 (15-point feedback pass)
- #71 merge: prototype #66 initial build

## Local Working Tree

- clean

## Next Agent Pickup

- Jake reacts to #67 (`open prototypes/67-lab-corpus-to-shape/index.html`) — prompts: CLI dry-run trust, excerpt-review placement on CLI path, idea-kind parity, cross-campaign legibility.
- Build #68 (shape accept → cohesive placeholders): per-slot placeholder UX, set-level cohesion pass, SEO/humanizer stages as placeholders; lands scheduled-but-unapproved via existing materialize path.
- Then #69: rewrite #45 into the validated spec; settle excerpt granularity (semantic units, split/merge, correction-capture scope), publishing sequence/schedule terminology, goal/audience-at-shape-step, preset-retention behavior, affordance principles. Records live on #61/#66.
- Buffer live proof still pending: run `docs/smoke-runs/2026-09-06-buffer-live-proof.md` (env configured in Convex prod).

## Branch

- main

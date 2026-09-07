# Project Status

Last updated: 09/07/2026 05:30 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture. Main is stable: 503/503 unit tests (flaky Open PR test timeout raised to 15s via #77), E2E green, prod healthy. Wayfinder map (#61): 8/8 sub-issues done — all three prototypes built; only the #69 spec rewrite remains.

## Current Task

Campaign loop fully prototyped (#66 paper, #67 lab, #68 placeholders/calendar). Jake owes reactions on #67/#68; next milestone is the #69 spec rewrite of #45.

## Session Focus

- Built prototype #68 (shape accept → draft set → cohesion/SEO/humanizer passes → calendar handoff). Fixed excerpt label ordering in #66/#67 corpus panels. Raised the flaky Open PR test timeout (#77).

## Last Completed Task

- #77 merged — flaky `PersistedPublishingPanel` per-post Open PR test timeout raised to 15s (two consecutive CI timeouts while passing locally).

## Recent Commits

- #77 merge: flaky test timeout fix
- #76 merge: prototype #68 (shape accept → cohesive placeholders → calendar)
- #75 merge: excerpt metadata redesign (#66 + #67)
- #74 merge: prototype #67 (lab corpus path)

## Local Working Tree

- clean

## Next Agent Pickup

- Jake reacts to #68 (`open prototypes/68-shape-accept-placeholders/index.html`) — prompts: set-generation clarity, cohesion gate blocking power + add-CTA fix, placeholder pass sufficiency, calendar legibility.
- Spec tension to settle in #69: Standard preset has no CTA but the cohesion gate requires exactly one — preset includes CTA, gate warns, or operator closes manually?
- Then #69: rewrite #45 into the validated spec using the full decision record on #61/#66 (excerpt granularity, publishing sequence/schedule, goal-audience at shape step, preset retention, affordance principles, media-type rendering) and retire M0–M8.
- Buffer live proof still pending: run `docs/smoke-runs/2026-09-06-buffer-live-proof.md` (env configured in Convex prod).

## Branch

- main

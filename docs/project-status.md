# Project Status

Last updated: 09/06/2026 12:15 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture. Main is stable: typecheck clean, 503/503 unit tests passing, E2E green in CI, prod (resonate.corvolabs.com) healthy and auth-gated.

## Current Task

Wayfinder campaign-assistant map (#61): fixtures resolved (#65 closed via #70); next is the prototype tickets #66 and #67.

## Session Focus

- Repo stability audit after a long gap: committed loose ends, merged stale docs PR #58 (rebased docs-only onto post-#46 main, dropped superseded layout.tsx change), verified prod + CI, assembled Corvo proof fixtures (#65 → PR #70, merged).

## Last Completed Task

- #70 merged — Corvo proof fixtures (ReAct paper PDF + synthetic lab-notebook corpus under `prototypes/fixtures/corvo/`), resolution record posted on #65.

## Recent Commits

- #70 merge: Corvo proof fixtures
- #58 merge: Marketing Director revised proposal (docs-only, prior/decision record for #61/#69)
- 32e75b4 docs: record 2026-08-06 reviewable parity eval pass (12/12)
- fe2fbab chore: sync generated Convex api with previewSeedData module

## Local Working Tree

- clean

## Next Agent Pickup

- Wayfinder #66 "Prototype: Corvo paper → ideas → shape" and #67 "Prototype: Corvo lab corpus → ideas → shape" are now unblocked; fixtures at `prototypes/fixtures/corvo/` (see its README for paths, sensitivity, and the deliberate `.ipynb` skip case).
- Open map questions still unresolved per #61: prototype hosting (static HTML vs app route), composer chrome in prototypes.
- Jake ops follow-up: confirm Vercel + Convex prod deploy after #60 and flip `BUFFER_LIVE_SUBMISSION=approved` for the live Buffer proof.
- #69 remains the closer: rewrite #45 and settle M0–M8 disposition once prototypes land.

## Branch

- main

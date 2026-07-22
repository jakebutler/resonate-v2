# Project Status

Last updated: 07/21/2026 23:07:00 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture. Production UI fixes (calendar split view, markdown Preview typography) are deployed at `https://resonate.corvolabs.com`.

## Current Task

Operator parity eval steps 5–12 on production. Preview sandbox seed (`ea0a522`) is for dev Convex only.

## Session Focus

- Shipped calendar/markdown UI fixes to production (`64bc205`).
- Added minimal `seedPreviewWorkspace` for localhost/Vercel Preview (`docs/preview-seed.md`).

## Last Completed Task

- ea0a522 feat: add minimal preview sandbox seed for dev Convex

## Recent Commits

- ea0a522 feat: add minimal preview sandbox seed for dev Convex
- 64bc205 fix: improve calendar split view and markdown preview rendering
- 722dddf fix: allow Vercel preview builds without NEXT_PUBLIC_CONVEX_URL
- e8c231a fix: unblock Vercel preview builds and improve calendar editor UX
- 97b26f7 fix: skip calendar Convex queries until auth is ready

## Local Working Tree

- Clean

## Next Agent Pickup

- Record parity eval results for steps 5–12 in `docs/eval/YYYY-MM-DD-parity-run.md`.
- Extend `convex/previewSeedData.ts` only when new preview use cases appear.

## Branch

- fix/publish-gate-and-failclosed

# Project Status

Last updated: 07/21/2026 22:48:16 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

- Touched auth or environment wiring.

## Last Completed Task

- 722dddf fix: allow Vercel preview builds without NEXT_PUBLIC_CONVEX_URL

## Recent Commits

- 722dddf fix: allow Vercel preview builds without NEXT_PUBLIC_CONVEX_URL
- e8c231a fix: unblock Vercel preview builds and improve calendar editor UX
- 97b26f7 fix: skip calendar Convex queries until auth is ready
- d2cd8f7 feat: add sign-out via Clerk UserButton in the workspace header
- be3135f fix: resolve allowlist email via clerkClient, not currentUser

## Local Working Tree

- M  .env.local.example
- M  app/globals.css
- M  app/layout.tsx
- M  components/PersistedPublishingPanel.tsx
- M  components/shell/MarkdownPreview.tsx
- M  next.config.ts
- M  package-lock.json
- M  package.json

## Next Agent Pickup

- Start by checking the living docs against the current code before making assumptions.
- If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.
- Review the in-flight auth/env wiring changes before touching shared layout or Clerk/Convex setup.

## Branch

- fix/publish-gate-and-failclosed

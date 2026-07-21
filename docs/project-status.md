# Project Status

Last updated: 07/20/2026 17:03:17 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

- Touched auth or environment wiring.

## Last Completed Task

- 97b26f7 fix: skip calendar Convex queries until auth is ready

## Recent Commits

- 97b26f7 fix: skip calendar Convex queries until auth is ready
- d2cd8f7 feat: add sign-out via Clerk UserButton in the workspace header
- be3135f fix: resolve allowlist email via clerkClient, not currentUser
- 3bb03fc fix: add log-only rollout mode for the email allowlist
- abce46a fix: enforce email allowlist, gate blog PR publishing on approval

## Local Working Tree

- M  app/layout.tsx
- M  components/PersistedPublishingPanel.tsx
- A  components/shell/MarkdownPreview.tsx
- M  components/shell/VariantReviewPanel.tsx

## Next Agent Pickup

- Start by checking the living docs against the current code before making assumptions.
- If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.
- Review the in-flight auth/env wiring changes before touching shared layout or Clerk/Convex setup.

## Branch

- fix/publish-gate-and-failclosed

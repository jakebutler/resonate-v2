# Project Status

Last updated: 08/06/2026 12:33:41 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

- Updated repository documentation and handoff records.
- Touched auth or environment wiring.

## Last Completed Task

- 67cbbef Merge pull request #48 from jakebutler/fix/button-loading-open-pr

## Recent Commits

- 67cbbef Merge pull request #48 from jakebutler/fix/button-loading-open-pr
- 6ab5354 docs: point project-status at Open PR button loading HEAD
- 8669d69 fix: skip disabled on asChild anchors and sync project status
- da5e35b fix: tighten asChild Button semantics and Open PR loading coverage
- b31ca39 fix: harden Button loading and per-post Open PR in-flight state

## Local Working Tree

- M  .env.local.example
- M  app/api/__tests__/e2e-mvp-flow.test.ts
- M  app/api/claim-map/__tests__/route.test.ts
- M  app/api/long-form-draft/__tests__/route.test.ts
- M  app/api/publish/__tests__/route.test.ts
- M  app/api/publish/route.ts
- M  app/api/research-brief/__tests__/route.test.ts
- M  app/layout.tsx
- M  components/BlogPostEditor/BlogPostEditor.tsx
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/PersistedPublishingPanel.tsx
- M  components/ResearchApp.tsx
- M  components/SocialConnectionsPanel.tsx
- M  components/__tests__/PersistedPublishingPanel.test.tsx
- M  components/shell/Shell.tsx
- M  convex/__tests__/publishing.test.ts
- M  convex/publishing.ts
- M  docs/preview-seed.md
- M  lib/pioneerAiRoute.ts
- M  next.config.ts
- M  proxy.ts

## Next Agent Pickup

- Start by checking the living docs against the current code before making assumptions.
- If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.
- Review the in-flight auth/env wiring changes before touching shared layout or Clerk/Convex setup.

## Branch

- fix/publish-gate-and-failclosed

# Project Status

Last updated: 06/06/2026 02:05:11 PDT

## State

Resonate is a working content operations app with active surfaces for calendar planning, content editing, workflow review, and idea capture.

## Current Task

Maintain the living documentation and preserve a handoff-quality snapshot of the repo state.

## Session Focus

- Updated repository documentation and handoff records.
- Adjusted commit-time automation for documentation refreshes.
- Touched the workflow board or editorial workflow logic.
- Touched the captured ideas experience.
- Touched AI assistant request or prompt plumbing.
- Touched auth or environment wiring.
- Touched the main dashboard surfaces.

## Last Completed Task

- 08eaa05 Initialize local env hygiene

## Recent Commits

- 08eaa05 Initialize local env hygiene
- 17818db Initial commit

## Local Working Tree

- A  .codex/prompts/documentation-subagent.md
- M  .env.local.example
- A  .githooks/pre-commit
- A  .githooks/pre-commit.local.example
- A  .github/workflows/test.yml
- M  .gitignore
- M  README.md
- A  app/__tests__/page.test.tsx
- A  app/api/llm/__tests__/route.test.ts
- A  app/api/llm/route.ts
- A  app/api/publish/__tests__/route.test.ts
- A  app/api/publish/route.ts
- A  app/api/v2/__tests__/e2e-mvp-flow.test.ts
- A  app/api/v2/claim-map/__tests__/route.test.ts
- A  app/api/v2/claim-map/route.ts
- A  app/api/v2/editorial-outline/__tests__/route.test.ts
- A  app/api/v2/editorial-outline/route.ts
- A  app/api/v2/generate-draft/__tests__/route.test.ts
- A  app/api/v2/generate-draft/route.ts
- A  app/api/v2/long-form-draft/__tests__/route.test.ts
- A  app/api/v2/long-form-draft/route.ts
- A  app/api/v2/ops/validate-workflow/__tests__/route.test.ts
- A  app/api/v2/ops/validate-workflow/route.ts
- A  app/api/v2/research-brief/__tests__/route.test.ts
- A  app/api/v2/research-brief/route.ts
- A  app/api/v2/validate-youtube/route.ts
- A  app/editor/[id]/page.tsx
- A  app/favicon.ico
- A  app/globals.css
- A  app/icon.svg
- A  app/ideas/__tests__/page.test.tsx
- A  app/ideas/page.tsx
- A  app/layout.tsx
- A  app/page.tsx
- A  app/setup/page.tsx
- A  app/sign-in/[[...sign-in]]/page.tsx
- A  app/sign-up/[[...sign-up]]/page.tsx
- A  app/v2/page.tsx
- A  components.json
- A  components/AIAssistant/AIAssistant.tsx
- A  components/AIAssistant/__tests__/AIAssistant.test.tsx
- A  components/BlogPostEditor/BlogPostEditor.tsx
- A  components/BlogPostEditor/__tests__/BlogPostEditor.test.tsx
- A  components/Calendar/Calendar.tsx
- A  components/Calendar/__tests__/Calendar.test.tsx
- A  components/ContentLibrary/ContentLibrary.tsx
- A  components/ContentLibrary/__tests__/ContentLibrary.test.tsx
- A  components/ConvexClientProvider.tsx
- A  components/CreatePostModal/CreatePostModal.tsx
- A  components/CreatePostModal/__tests__/CreatePostModal.test.tsx
- A  components/EditorChat/EditorChat.tsx
- A  components/EditorChat/__tests__/EditorChat.test.tsx
- A  components/FullScreenEditor/FullScreenEditor.tsx
- A  components/FullScreenEditor/MetadataBar.tsx
- A  components/FullScreenEditor/ResizeHandle.tsx
- A  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- A  components/FullScreenEditor/__tests__/MetadataBar.test.tsx
- A  components/IdeaDetail/IdeaDetail.tsx
- A  components/IdeaDetail/__tests__/IdeaDetail.test.tsx
- A  components/IdeasPage/IdeasPage.tsx
- A  components/IdeasPage/__tests__/IdeasPage.test.tsx
- A  components/ImageTray/ImageTray.tsx
- A  components/ImageTray/__tests__/ImageTray.test.tsx
- A  components/LinkedInPostEditor/LinkedInPostEditor.tsx
- A  components/LinkedInPostEditor/__tests__/LinkedInPostEditor.test.tsx
- A  components/PersistedPublishingPanel.tsx
- A  components/SetupPage/SetupPage.tsx
- A  components/SetupPage/__tests__/SetupPage.test.tsx
- A  components/TiptapEditor/TiptapEditor.tsx
- A  components/TiptapEditor/Toolbar.tsx
- A  components/TiptapEditor/__tests__/TiptapEditor.test.tsx
- A  components/TiptapEditor/__tests__/Toolbar.test.tsx
- A  components/V2ResonateApp.tsx
- A  components/WorkflowBoard/WorkflowBoard.tsx
- A  components/WorkflowBoard/WorkflowDraftEditor.tsx
- A  components/WorkflowBoard/WorkflowIdeaModal.tsx
- A  components/WorkflowBoard/__tests__/WorkflowBoard.test.tsx
- A  components/WorkflowBoard/__tests__/WorkflowDraftEditor.test.tsx
- A  components/WorkflowBoard/__tests__/WorkflowIdeaModal.test.tsx
- A  components/__tests__/ConvexClientProvider.test.tsx
- A  components/__tests__/IdeasPage.test.tsx
- A  components/__tests__/PersistedPublishingPanel.test.tsx
- A  components/__tests__/V2ResonateApp.test.tsx
- A  components/kibo-ui/choicebox/index.tsx
- A  components/kibo-ui/combobox/index.tsx
- A  components/kibo-ui/kanban/index.tsx
- A  components/ui/Modal.tsx
- A  components/ui/SlideOver.tsx
- A  components/ui/Toggle.tsx
- A  components/ui/__tests__/Button.test.tsx
- A  components/ui/__tests__/FieldAndInputGroup.test.tsx
- A  components/ui/__tests__/Modal.test.tsx
- A  components/ui/__tests__/Primitives.test.tsx
- A  components/ui/__tests__/SlideOver.test.tsx
- A  components/ui/__tests__/Toggle.test.tsx
- A  components/ui/badge.tsx
- A  components/ui/button.tsx
- A  components/ui/card.tsx
- A  components/ui/command.tsx
- A  components/ui/dialog.tsx
- A  components/ui/drawer.tsx
- A  components/ui/dropdown-menu.tsx
- A  components/ui/field.tsx
- A  components/ui/input-group.tsx
- A  components/ui/input.tsx
- A  components/ui/label.tsx
- A  components/ui/popover.tsx
- A  components/ui/radio-group.tsx
- A  components/ui/scroll-area.tsx
- A  components/ui/select.tsx
- A  components/ui/separator.tsx
- A  components/ui/sheet.tsx
- A  components/ui/switch.tsx
- A  components/ui/tabs.tsx
- A  components/ui/textarea.tsx
- A  convex/__tests__/ideasApi.test.ts
- A  convex/_generated/api.d.ts
- A  convex/_generated/api.js
- A  convex/_generated/dataModel.d.ts
- A  convex/_generated/server.d.ts
- A  convex/_generated/server.js
- A  convex/auth.config.ts
- A  convex/backfill.ts
- A  convex/ideas.ts
- A  convex/posts.ts
- A  convex/schema.ts
- A  convex/settings.ts
- A  convex/v2Publishing.ts
- A  convex/v2Research.ts
- A  convex/workflow.ts
- A  docs/adr/0001-postiz-spine.md
- A  docs/adr/0002-provider-routing-and-approval.md
- A  docs/adr/0003-deployment-runtime.md
- A  docs/changelog.md
- A  docs/cutover-checklist.md
- A  docs/glossary.md
- A  docs/live-provider-validation.md
- A  docs/migration-dry-run.md
- A  docs/mvp-implementation-map.md
- A  docs/ops-runbook.md
- A  docs/plans/2026-03-05-ai-assistant-code-review-fixes.md
- A  docs/plans/2026-03-07-inspiration-ideas-design.md
- A  docs/plans/2026-03-07-inspiration-ideas-implementation.md
- A  docs/plans/2026-03-10-content-backfill.md
- A  docs/plans/2026-03-11-kibo-workflow-migration.md
- A  docs/plans/2026-04-09-fullscreen-editor-implementation-plan.md
- A  docs/plans/2026-04-09-ppg-flow-implementation-plan.md
- A  docs/plans/2026-06-05-inbox-draft-management-validation.md
- A  docs/plans/2026-06-05-postiz-brand-workspace-validation.md
- A  docs/plans/2026-06-05-postiz-feasibility-spike.md
- A  docs/plans/2026-06-05-postiz-foundation-runbook.md
- A  docs/plans/2026-06-05-research-editorial-pipeline-spike.md
- A  docs/project-status.md
- A  docs/spec.md
- A  e2e/dashboard.spec.ts
- A  e2e/setup-flow.spec.ts
- A  eslint.config.mjs
- A  lib/__tests__/backfill.test.ts
- A  lib/__tests__/cortex.test.ts
- A  lib/__tests__/github.test.ts
- A  lib/__tests__/ideas.test.ts
- A  lib/__tests__/imageAlt.test.ts
- A  lib/__tests__/imageOptimize.test.ts
- A  lib/__tests__/llmClient.test.ts
- A  lib/__tests__/v2.test.ts
- A  lib/__tests__/v2ClaimMap.test.ts
- A  lib/__tests__/v2Migration.test.ts
- A  lib/__tests__/v2Outline.test.ts
- A  lib/__tests__/v2ProviderAdapters.test.ts
- A  lib/__tests__/v2Research.test.ts
- A  lib/__tests__/workflow.test.ts
- A  lib/__tests__/workflowBoard.test.ts
- A  lib/backfill.ts
- A  lib/cortex.ts
- A  lib/github.ts
- A  lib/ideas.ts
- A  lib/imageAlt.ts
- A  lib/imageOptimize.ts
- A  lib/llmClient.ts
- A  lib/models.ts
- A  lib/utils.ts
- A  lib/v2.ts
- A  lib/v2Migration.ts
- A  lib/v2ProviderAdapters.ts
- A  lib/workflow.ts
- A  lib/workflowBoard.ts
- A  next.config.ts
- A  package-lock.json
- A  package.json
- A  playwright.config.ts
- A  postcss.config.mjs
- A  proxy.ts
- A  public/file.svg
- A  public/globe.svg
- A  public/next.svg
- A  public/vercel.svg
- A  public/window.svg
- A  scripts/__tests__/update-docs.test.ts
- A  scripts/backfill-content.ts
- A  scripts/install-git-hooks.sh
- A  scripts/linkedin-backfill.json
- A  scripts/update-docs.mjs
- A  scripts/v2-migration-dry-run.mjs
- A  tests/fixtures/resonate-v1-export.sample.json
- A  tests/setup.ts
- A  tsconfig.json
- A  tsconfig.typecheck.json
- A  vitest.config.ts

## Next Agent Pickup

- Start by checking the living docs against the current code before making assumptions.
- If the working set includes product changes, keep `docs/spec.md`, `docs/changelog.md`, and `docs/project-status.md` aligned in the same session.
- Review the in-flight auth/env wiring changes before touching shared layout or Clerk/Convex setup.
- Workflow changes should preserve the distinction between backend stages and the simplified kanban columns.
- Do not conflate the captured ideas inbox with the separate workflow idea system.

## Branch

- codex/resonate-v2-mvp-foundation

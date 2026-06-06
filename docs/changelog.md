# Changelog

Append-only session log for repository-level updates. Each documentation refresh should add one new entry at the bottom.

## 03/16/2026 00:42:14 PDT

### Summary

- Refreshed `docs/spec.md` against the current codebase instead of the previous docs snapshot.
- Recorded the active auth/env hardening work and docs-update automation in the handoff docs.
- Preserved append-only changelog behavior while leaving non-doc work untouched.

### Staged Changes

- No staged changes were present during this documentation pass.

### Working Tree Snapshot

-  M app/layout.tsx
-  M convex/auth.config.ts
-  M package.json
- ?? .codex/
- ?? .githooks/
- ?? docs/changelog.md
- ?? docs/project-status.md
- ?? docs/spec.md
- ?? scripts/install-git-hooks.sh
- ?? scripts/update-docs.mjs

### Branch

- main

## 03/16/2026 01:04:35 PDT

### Summary

- Refreshed the living docs against the current codebase and kept `docs/spec.md` high-level.
- Recorded the stricter Clerk and Convex environment requirements now present in the in-flight auth wiring.
- Captured the new docs automation and pre-commit hook work in the handoff docs without touching non-doc files.

### Staged Changes

- A	.codex/prompts/documentation-subagent.md
- A	.githooks/pre-commit
- A	docs/changelog.md
- A	docs/project-status.md
- A	docs/spec.md
- M	package.json
- A	scripts/install-git-hooks.sh
- A	scripts/update-docs.mjs

### Working Tree Snapshot

- A  .codex/prompts/documentation-subagent.md
- A  .githooks/pre-commit
-  M app/layout.tsx
-  M convex/auth.config.ts
- A  docs/changelog.md
- AM docs/project-status.md
- A  docs/spec.md
- M  package.json
- A  scripts/install-git-hooks.sh
- A  scripts/update-docs.mjs

### Branch

- main

## 03/16/2026 01:29:04 PDT

### Summary

- Repaired the production Clerk-to-Convex auth path by aligning the app and Convex auth config with explicit environment-driven values.
- Verified the production app now points at the Convex prod deployment instead of the old shared dev target.
- Ran the historical content backfill against Convex production and confirmed the published Corvo Labs archive is present there.

### Staged Changes

- No staged changes were present when the docs refresh ran.

### Working Tree Snapshot

-  M app/layout.tsx
-  M convex/auth.config.ts

### Branch

- main

## 03/16/2026 01:30:02 PDT

### Summary

- Finalized the production auth recovery by aligning Clerk, Convex, and Vercel around explicit environment-driven config.
- Confirmed the production app now points at the Convex prod deployment and no longer depends on placeholder layout defaults.
- Verified the historical content backfill is present in Convex prod and documented the remaining repo cleanup as a source-control task.

### Staged Changes

- M	app/layout.tsx
- M	convex/auth.config.ts
- M	docs/changelog.md
- M	docs/project-status.md
- M	docs/spec.md

### Working Tree Snapshot

- M  app/layout.tsx
- M  convex/auth.config.ts
- M  docs/changelog.md
- M  docs/project-status.md
- M  docs/spec.md

### Branch

- main

## 04/09/2026 01:03:39 PDT

### Summary

- Refreshed the living docs against the current `feature/fullscreen-editor` working tree and staged changes.
- Kept `docs/spec.md` high-level while documenting the new `/editor/[id]` fullscreen editor, its autosave-first create flow, and the fact that it still coexists with the older modal editors.
- Replaced the project handoff with the current branch state, open risks, and next pickup points for the fullscreen editor work.

### Staged Changes

- A	app/editor/[id]/page.tsx
- A	components/FullScreenEditor/FullScreenEditor.tsx
- A	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- A	components/TiptapEditor/TiptapEditor.tsx
- A	components/TiptapEditor/Toolbar.tsx
- A	docs/plans/2026-04-09-fullscreen-editor-implementation-plan.md
- A	docs/plans/2026-04-09-ppg-flow-implementation-plan.md
- M	package-lock.json
- M	package.json

### Working Tree Snapshot

- A  app/editor/[id]/page.tsx
- A  components/FullScreenEditor/FullScreenEditor.tsx
- A  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- A  components/TiptapEditor/TiptapEditor.tsx
- A  components/TiptapEditor/Toolbar.tsx
- A  docs/plans/2026-04-09-fullscreen-editor-implementation-plan.md
- A  docs/plans/2026-04-09-ppg-flow-implementation-plan.md
-  M docs/project-status.md
- M  package-lock.json
- M  package.json

### Branch

- feature/fullscreen-editor

## 04/09/2026 01:09:56 PDT

### Summary

- Refreshed the living docs for the current `feature/fullscreen-editor` working tree after the new editor copilot sidebar was staged.
- Kept `docs/spec.md` high-level while documenting the fullscreen editor's resizable AI panel, model selection, and the still-unwired text-selection/apply-suggestion path.
- Replaced the handoff doc with the latest pickup guidance centered on wiring editor selection into the sidebar and deciding whether accepted AI output should patch the document.

### Staged Changes

- A	components/EditorChat/EditorChat.tsx
- A	components/EditorChat/__tests__/EditorChat.test.tsx
- M	components/FullScreenEditor/FullScreenEditor.tsx
- A	components/FullScreenEditor/ResizeHandle.tsx
- M	components/TiptapEditor/TiptapEditor.tsx

### Working Tree Snapshot

- A  components/EditorChat/EditorChat.tsx
- A  components/EditorChat/__tests__/EditorChat.test.tsx
- M  components/FullScreenEditor/FullScreenEditor.tsx
- A  components/FullScreenEditor/ResizeHandle.tsx
- M  components/TiptapEditor/TiptapEditor.tsx
- M  docs/project-status.md

### Branch

- feature/fullscreen-editor

## 04/09/2026 01:19:23 PDT

### Summary

- Refreshed the living docs against the current `feature/fullscreen-editor` working tree after the fullscreen editor picked up metadata controls and a PR-based publish path.
- Kept `docs/spec.md` high-level while documenting the new scheduling and SEO metadata, the GitHub PR handoff model, and the non-obvious gaps that are still easy to miss in the current editor flow.
- Replaced the project handoff with the latest pickup guidance centered on aligning publish output, metadata persistence, and the remaining incomplete editor integrations.

### Staged Changes

- M	app/api/publish/route.ts
- M	components/FullScreenEditor/FullScreenEditor.tsx
- A	components/FullScreenEditor/MetadataBar.tsx
- M	components/FullScreenEditor/ResizeHandle.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- A	components/FullScreenEditor/__tests__/MetadataBar.test.tsx
- M	components/TiptapEditor/TiptapEditor.tsx
- M	convex/posts.ts
- M	convex/schema.ts
- M	lib/github.ts
- M	package-lock.json
- M	package.json

### Working Tree Snapshot

- M  app/api/publish/route.ts
- M  components/FullScreenEditor/FullScreenEditor.tsx
- A  components/FullScreenEditor/MetadataBar.tsx
- M  components/FullScreenEditor/ResizeHandle.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- A  components/FullScreenEditor/__tests__/MetadataBar.test.tsx
- MM components/TiptapEditor/TiptapEditor.tsx
- M  convex/posts.ts
- M  convex/schema.ts
- M  docs/project-status.md
- M  lib/github.ts
- M  package-lock.json
- M  package.json

### Branch

- feature/fullscreen-editor

## 04/09/2026 09:00:10 PDT

### Summary

- Refreshed the living docs against the current `feature/fullscreen-editor` state after the fullscreen editor hardening work landed and blog entry points on `/` were routed into `/editor/[id]`.
- Kept `docs/spec.md` high-level while tightening the non-obvious behavior around queued autosave, publish-before-first-save protection, selection-aware AI rewrites, and the PR handoff model.
- Replaced the handoff doc with the latest pickup guidance, explicitly separating committed fullscreen-editor behavior from the two non-doc local changes still present in the working tree.

### Staged Changes

- M	components/EditorChat/EditorChat.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx

### Working Tree Snapshot

- M  components/EditorChat/EditorChat.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
-  M docs/project-status.md

### Branch

- feature/fullscreen-editor

## 04/09/2026 08:55:59 PDT

### Summary

- Refreshed the living docs for the current `feature/fullscreen-editor` working tree after the editor picked up queued autosave, selection-aware rewrite acceptance, dashboard routing into the fullscreen blog editor, and tighter publish/image handling.
- Kept `docs/spec.md` high-level while documenting the new cross-file behavior that is easy to miss: blog actions now route from the dashboard into `/editor/[id]`, publish sends Markdown plus validated metadata, and autosave now serializes overlapping writes instead of racing them.
- Replaced the handoff doc with the latest pickup guidance for the staged fullscreen-editor work without touching non-doc files.

### Staged Changes

- M	app/__tests__/page.test.tsx
- M	app/api/publish/__tests__/route.test.ts
- M	app/api/publish/route.ts
- M	app/page.tsx
- M	components/EditorChat/EditorChat.tsx
- M	components/EditorChat/__tests__/EditorChat.test.tsx
- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/MetadataBar.tsx
- M	components/FullScreenEditor/ResizeHandle.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M	components/TiptapEditor/TiptapEditor.tsx
- M	components/TiptapEditor/Toolbar.tsx
- M	lib/__tests__/imageOptimize.test.ts
- M	lib/imageOptimize.ts

### Working Tree Snapshot

- M  app/__tests__/page.test.tsx
- M  app/api/publish/__tests__/route.test.ts
- M  app/api/publish/route.ts
- M  app/page.tsx
- M  components/EditorChat/EditorChat.tsx
- M  components/EditorChat/__tests__/EditorChat.test.tsx
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/MetadataBar.tsx
- M  components/FullScreenEditor/ResizeHandle.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M  components/TiptapEditor/TiptapEditor.tsx
- M  components/TiptapEditor/Toolbar.tsx
- M  lib/__tests__/imageOptimize.test.ts
- M  lib/imageOptimize.ts

### Branch

- feature/fullscreen-editor

## 04/09/2026 01:47:24 PDT

### Summary

- Refreshed the living docs against the current `feature/fullscreen-editor` working tree after the editor picked up image upload, image tray, hero-image selection, and publish-path adjustments.
- Kept `docs/spec.md` high-level while documenting the split image flow across Tiptap HTML, Convex storage, and GitHub frontmatter, plus the still-easy-to-miss publish status mismatch.
- Replaced the handoff doc with the latest pickup guidance centered on validating the image workflow and finishing the remaining editor-to-publish alignment work.

### Staged Changes

- M	app/api/publish/__tests__/route.test.ts
- M	app/api/publish/route.ts
- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- A	components/ImageTray/ImageTray.tsx
- A	components/ImageTray/__tests__/ImageTray.test.tsx
- M	components/TiptapEditor/TiptapEditor.tsx
- M	components/TiptapEditor/Toolbar.tsx
- M	lib/__tests__/github.test.ts
- A	lib/__tests__/imageOptimize.test.ts
- M	lib/github.ts
- A	lib/imageOptimize.ts
- M	package-lock.json
- M	package.json

### Working Tree Snapshot

- M  app/api/publish/__tests__/route.test.ts
- M  app/api/publish/route.ts
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- A  components/ImageTray/ImageTray.tsx
- A  components/ImageTray/__tests__/ImageTray.test.tsx
- M  components/TiptapEditor/TiptapEditor.tsx
- M  components/TiptapEditor/Toolbar.tsx
- M  docs/project-status.md
- M  lib/__tests__/github.test.ts
- A  lib/__tests__/imageOptimize.test.ts
- M  lib/github.ts
- A  lib/imageOptimize.ts
- M  package-lock.json
- M  package.json

### Branch

- feature/fullscreen-editor

## 04/09/2026 08:42:46 PDT

### Summary

- Refreshed the living docs against the current `feature/fullscreen-editor` working tree after the fullscreen editor picked up real text-selection handoff into the AI sidebar and in-editor suggestion acceptance.
- Kept `docs/spec.md` high-level while documenting the now-wired Ask-AI flow, the still-easy-to-miss overwrite confirmation behavior, and the remaining split between editor UI state and actual ProseMirror selection state.
- Replaced the handoff doc with the latest pickup guidance centered on hardening the selection-rewrite path and validating the current editor changes before the next commit attempt.

### Staged Changes

- M	app/editor/[id]/page.tsx
- M	components/EditorChat/EditorChat.tsx
- M	components/EditorChat/__tests__/EditorChat.test.tsx
- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M	components/TiptapEditor/TiptapEditor.tsx

### Working Tree Snapshot

- M  app/editor/[id]/page.tsx
- M  components/EditorChat/EditorChat.tsx
- M  components/EditorChat/__tests__/EditorChat.test.tsx
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M  components/TiptapEditor/TiptapEditor.tsx

### Branch

- feature/fullscreen-editor

## 04/09/2026 11:11:27 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/09/2026 11:20:48 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	components/TiptapEditor/TiptapEditor.tsx
- A	components/TiptapEditor/__tests__/TiptapEditor.test.tsx

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  components/TiptapEditor/TiptapEditor.tsx
- A  components/TiptapEditor/__tests__/TiptapEditor.test.tsx
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/09/2026 12:20:49 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/MetadataBar.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M	components/FullScreenEditor/__tests__/MetadataBar.test.tsx
- M	components/TiptapEditor/TiptapEditor.tsx
- M	components/TiptapEditor/__tests__/TiptapEditor.test.tsx

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/MetadataBar.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M  components/FullScreenEditor/__tests__/MetadataBar.test.tsx
- M  components/TiptapEditor/TiptapEditor.tsx
- M  components/TiptapEditor/__tests__/TiptapEditor.test.tsx
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/09/2026 13:48:15 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M	components/TiptapEditor/TiptapEditor.tsx
- M	components/TiptapEditor/__tests__/TiptapEditor.test.tsx

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M  components/TiptapEditor/TiptapEditor.tsx
- M  components/TiptapEditor/__tests__/TiptapEditor.test.tsx
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/09/2026 13:59:26 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	components/FullScreenEditor/MetadataBar.tsx
- M	components/FullScreenEditor/__tests__/MetadataBar.test.tsx

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  components/FullScreenEditor/MetadataBar.tsx
- M  components/FullScreenEditor/__tests__/MetadataBar.test.tsx
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/09/2026 14:13:59 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	.github/workflows/test.yml

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  .github/workflows/test.yml
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/09/2026 14:16:32 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	.github/workflows/test.yml

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  .github/workflows/test.yml
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/09/2026 16:17:48 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M	components/TiptapEditor/Toolbar.tsx
- A	components/TiptapEditor/__tests__/Toolbar.test.tsx

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M  components/TiptapEditor/Toolbar.tsx
- A  components/TiptapEditor/__tests__/Toolbar.test.tsx
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/09/2026 16:40:14 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	.github/workflows/test.yml
- M	playwright.config.ts
- M	proxy.ts

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  .github/workflows/test.yml
-  M package-lock.json
-  M package.json
- M  playwright.config.ts
- M  proxy.ts
-  M scripts/update-docs.mjs
- ?? playwright-report/
- ?? test-results/

### Branch

- feature/fullscreen-editor

## 04/09/2026 18:50:46 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	.github/workflows/test.yml

### Working Tree Snapshot

-  M .githooks/pre-commit
- M  .github/workflows/test.yml
-  M package-lock.json
-  M package.json
-  M scripts/update-docs.mjs
- ?? playwright-report/
- ?? test-results/

### Branch

- feature/fullscreen-editor

## 04/09/2026 19:02:21 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	.githooks/pre-commit
- A	.githooks/pre-commit.local.example
- M	.gitignore
- M	package.json
- M	scripts/update-docs.mjs

### Working Tree Snapshot

- M  .githooks/pre-commit
- A  .githooks/pre-commit.local.example
- M  .gitignore
-  M package-lock.json
- M  package.json
- M  scripts/update-docs.mjs

### Branch

- feature/fullscreen-editor

## 04/12/2026 01:10:56 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	.env.local.example
- M	app/api/publish/__tests__/route.test.ts
- M	app/api/publish/route.ts
- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/MetadataBar.tsx
- M	components/FullScreenEditor/__tests__/MetadataBar.test.tsx
- M	convex/posts.ts
- M	convex/schema.ts
- M	lib/__tests__/github.test.ts
- A	lib/__tests__/imageAlt.test.ts
- M	lib/__tests__/imageOptimize.test.ts
- M	lib/github.ts
- A	lib/imageAlt.ts
- M	lib/imageOptimize.ts

### Working Tree Snapshot

- M  .env.local.example
-  M .github/workflows/test.yml
-  M README.md
- M  app/api/publish/__tests__/route.test.ts
- M  app/api/publish/route.ts
- MM components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/MetadataBar.tsx
-  M components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M  components/FullScreenEditor/__tests__/MetadataBar.test.tsx
-  M components/ImageTray/ImageTray.tsx
-  M components/ImageTray/__tests__/ImageTray.test.tsx
-  M components/TiptapEditor/TiptapEditor.tsx
-  M components/TiptapEditor/__tests__/TiptapEditor.test.tsx
- M  convex/posts.ts
- M  convex/schema.ts
- M  lib/__tests__/github.test.ts
- A  lib/__tests__/imageAlt.test.ts
- M  lib/__tests__/imageOptimize.test.ts
- M  lib/github.ts
- A  lib/imageAlt.ts
- M  lib/imageOptimize.ts
-  M package-lock.json
-  M scripts/update-docs.mjs
- ?? scripts/__tests__/

### Branch

- resonate/zai-alt-text-blog-publish

## 04/20/2026 11:27:27 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	lib/__tests__/github.test.ts
- M	lib/__tests__/imageAlt.test.ts
- M	lib/github.ts
- M	lib/imageAlt.ts

### Working Tree Snapshot

-  M .github/workflows/test.yml
-  M README.md
-  M components/FullScreenEditor/FullScreenEditor.tsx
-  M components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
-  M components/ImageTray/ImageTray.tsx
-  M components/ImageTray/__tests__/ImageTray.test.tsx
-  M components/TiptapEditor/TiptapEditor.tsx
-  M components/TiptapEditor/__tests__/TiptapEditor.test.tsx
- M  lib/__tests__/github.test.ts
- M  lib/__tests__/imageAlt.test.ts
- M  lib/github.ts
- M  lib/imageAlt.ts
-  M package-lock.json
-  M scripts/update-docs.mjs
- ?? scripts/__tests__/

### Branch

- resonate/zai-alt-text-blog-publish

## 04/20/2026 11:27:43 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	components/FullScreenEditor/FullScreenEditor.tsx
- M	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- M	components/TiptapEditor/TiptapEditor.tsx
- M	components/TiptapEditor/__tests__/TiptapEditor.test.tsx

### Working Tree Snapshot

-  M .github/workflows/test.yml
-  M README.md
- M  components/FullScreenEditor/FullScreenEditor.tsx
- M  components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
-  M components/ImageTray/ImageTray.tsx
-  M components/ImageTray/__tests__/ImageTray.test.tsx
- M  components/TiptapEditor/TiptapEditor.tsx
- M  components/TiptapEditor/__tests__/TiptapEditor.test.tsx
-  M package-lock.json
-  M scripts/update-docs.mjs
- ?? scripts/__tests__/

### Branch

- resonate/zai-alt-text-blog-publish

## 04/20/2026 11:39:34 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	.github/workflows/test.yml
- M	README.md

### Working Tree Snapshot

- M  .github/workflows/test.yml
- M  README.md
-  M components/ImageTray/ImageTray.tsx
-  M components/ImageTray/__tests__/ImageTray.test.tsx
-  M package-lock.json
-  M scripts/update-docs.mjs
- ?? scripts/__tests__/

### Branch

- resonate/zai-alt-text-blog-publish

## 04/20/2026 11:39:43 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	components/ImageTray/ImageTray.tsx
- M	components/ImageTray/__tests__/ImageTray.test.tsx

### Working Tree Snapshot

- M  components/ImageTray/ImageTray.tsx
- M  components/ImageTray/__tests__/ImageTray.test.tsx
-  M package-lock.json
-  M scripts/update-docs.mjs
- ?? scripts/__tests__/

### Branch

- resonate/zai-alt-text-blog-publish

## 04/20/2026 11:40:10 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- A	scripts/__tests__/update-docs.test.ts
- M	scripts/update-docs.mjs

### Working Tree Snapshot

-  M package-lock.json
- A  scripts/__tests__/update-docs.test.ts
- M  scripts/update-docs.mjs

### Branch

- resonate/zai-alt-text-blog-publish

## 04/20/2026 16:27:46 PDT

### Summary

- Refreshed documentation for the current repository state.

### Staged Changes

- M	lib/__tests__/github.test.ts
- M	lib/github.ts

### Working Tree Snapshot

- M  lib/__tests__/github.test.ts
- M  lib/github.ts

### Branch

- feature/fullscreen-editor

## 06/05/2026 01:09:21 PDT

### Summary

- Touched the captured ideas experience.
- Touched auth or environment wiring.
- Touched the main dashboard surfaces.

### Staged Changes

- M	.env.local.example
- M	app/api/publish/route.ts
- A	app/api/v2/generate-draft/route.ts
- A	app/api/v2/validate-youtube/route.ts
- M	app/ideas/page.tsx
- M	app/layout.tsx
- M	app/page.tsx
- A	app/v2/page.tsx
- M	components/ConvexClientProvider.tsx
- A	components/V2ResonateApp.tsx
- A	lib/__tests__/v2.test.ts
- M	lib/github.ts
- A	lib/v2.ts

### Working Tree Snapshot

- M  .env.local.example
- M  app/api/publish/route.ts
- A  app/api/v2/generate-draft/route.ts
- A  app/api/v2/validate-youtube/route.ts
- M  app/ideas/page.tsx
- M  app/layout.tsx
- M  app/page.tsx
- A  app/v2/page.tsx
- M  components/ConvexClientProvider.tsx
- A  components/V2ResonateApp.tsx
- A  lib/__tests__/v2.test.ts
- M  lib/github.ts
- A  lib/v2.ts
-  M package-lock.json

### Branch

- codex/postiz-v2-mvp

## 06/05/2026 01:13:48 PDT

### Summary

- Refreshed documentation for the current repository state.

### Staged Changes

- A	app/api/v2/generate-draft/__tests__/route.test.ts

### Working Tree Snapshot

- A  app/api/v2/generate-draft/__tests__/route.test.ts
-  M package-lock.json

### Branch

- codex/postiz-v2-mvp

## 06/05/2026 01:16:39 PDT

### Summary

- Refreshed documentation for the current repository state.

### Staged Changes

- M	lib/__tests__/github.test.ts

### Working Tree Snapshot

- M  lib/__tests__/github.test.ts
-  M package-lock.json

### Branch

- codex/postiz-v2-mvp

## 06/05/2026 01:32:03 PDT

### Summary

- Refreshed documentation for the current repository state.

### Staged Changes

- A	app/api/v2/ops/validate-workflow/__tests__/route.test.ts
- A	app/api/v2/ops/validate-workflow/route.ts
- M	proxy.ts

### Working Tree Snapshot

- A  app/api/v2/ops/validate-workflow/__tests__/route.test.ts
- A  app/api/v2/ops/validate-workflow/route.ts
- M  proxy.ts

### Branch

- codex/prod-v2-workflow-validation

## 06/05/2026 02:14:05 PDT

### Summary

- Added the Postiz feasibility spike report for issue #39.
- Recorded successful Postiz dependency installation under Node 22.
- Documented that Docker or a hosted container runtime is still required for vanilla app runtime proof.

### Staged Changes

- A	docs/plans/2026-06-05-postiz-feasibility-spike.md
- M	docs/changelog.md
- M	docs/project-status.md

### Working Tree Snapshot

- A  docs/plans/2026-06-05-postiz-feasibility-spike.md
- M  docs/changelog.md
- M  docs/project-status.md

### Branch

- codex/postiz-feasibility-report

## 06/05/2026 02:36:30 PDT

### Summary

- Completed local vanilla Postiz runtime validation for issue #39 with Colima/QEMU and Docker Compose.
- Verified the Postiz register page, backend health via `can-register`, Temporal startup, local account creation, auth cookie issuance, authenticated redirect, and persisted Corvo Labs placeholder organization.
- Documented the VZ bind-mount failure and the QEMU/external-volume workaround used for this local proof.

### Staged Changes

- M	docs/changelog.md
- M	docs/plans/2026-06-05-postiz-feasibility-spike.md
- M	docs/project-status.md

### Working Tree Snapshot

- M  docs/changelog.md
- M  docs/plans/2026-06-05-postiz-feasibility-spike.md
- M  docs/project-status.md

### Branch

- codex/postiz-feasibility-report

## 06/05/2026 02:45:00 PDT

### Summary

- Added the Postiz rebuild foundation runbook for issue #40.
- Chose a sibling customized Postiz fork/service strategy while keeping this repository as the transition control plane and legacy Resonate app.
- Documented local runtime commands, side-by-side `/v2` deployment routing, environment/secret requirements, upstream sync workflow, customization boundaries, and smoke-test checklist.

### Staged Changes

- A	docs/plans/2026-06-05-postiz-foundation-runbook.md
- M	docs/changelog.md
- M	docs/project-status.md

### Working Tree Snapshot

- A  docs/plans/2026-06-05-postiz-foundation-runbook.md
- M  docs/changelog.md
- M  docs/project-status.md

### Branch

- codex/postiz-foundation-runbook

## 06/05/2026 02:49:00 PDT

### Summary

- Added #41 brand workspace validation notes.
- Created separate local Postiz organizations for Personal, Corvo Labs, the lower dB, and FreshProof through the normal registration API.
- Documented that connected-channel validation remains blocked by placeholder/missing provider credentials, with YouTube recommended as the first real unblocker.

### Staged Changes

- A	docs/plans/2026-06-05-postiz-brand-workspace-validation.md
- M	docs/changelog.md
- M	docs/project-status.md

### Working Tree Snapshot

- A  docs/plans/2026-06-05-postiz-brand-workspace-validation.md
- M  docs/changelog.md
- M  docs/project-status.md

### Branch

- codex/postiz-brand-workspace-validation

## 06/05/2026 02:54:00 PDT

### Summary

- Created the actual custom Postiz fork at `jakebutler/resonate-postiz`.
- Rewired `/Volumes/rexy/GitHub/postiz-app` so `origin` points to the custom fork and `upstream` points to `gitroomhq/postiz-app`.
- Updated the foundation runbook and project status with the concrete fork URL and remote strategy.

### Staged Changes

- M	docs/changelog.md
- M	docs/plans/2026-06-05-postiz-foundation-runbook.md
- M	docs/project-status.md

### Working Tree Snapshot

- M  docs/changelog.md
- M  docs/plans/2026-06-05-postiz-foundation-runbook.md
- M  docs/project-status.md

### Branch

- codex/postiz-fork-created

## 06/05/2026 08:39:11 PDT

### Summary

- Adjusted commit-time automation for documentation refreshes.

### Staged Changes

- M	scripts/install-git-hooks.sh

### Working Tree Snapshot

- M  scripts/install-git-hooks.sh

### Branch

- main

## 06/05/2026 13:08:33 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- M	app/api/v2/generate-draft/__tests__/route.test.ts
- M	app/api/v2/generate-draft/route.ts
- M	components/V2ResonateApp.tsx
- M	lib/__tests__/v2.test.ts
- M	lib/v2.ts

### Working Tree Snapshot

- M  app/api/v2/generate-draft/__tests__/route.test.ts
- M  app/api/v2/generate-draft/route.ts
- M  components/V2ResonateApp.tsx
- M  lib/__tests__/v2.test.ts
- M  lib/v2.ts
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- feat/49-multi-platform-variants

## 06/05/2026 13:22:05 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- M	components/V2ResonateApp.tsx
- A	docs/plans/2026-06-05-inbox-draft-management-validation.md
- M	lib/__tests__/v2.test.ts
- M	lib/v2.ts

### Working Tree Snapshot

- M  components/V2ResonateApp.tsx
- A  docs/plans/2026-06-05-inbox-draft-management-validation.md
- M  lib/__tests__/v2.test.ts
- M  lib/v2.ts
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- feat/51-inbox-draft-validation

## 06/05/2026 13:57:49 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- A	app/api/v2/research-brief/__tests__/route.test.ts
- A	app/api/v2/research-brief/route.ts
- M	components/V2ResonateApp.tsx
- A	docs/plans/2026-06-05-research-editorial-pipeline-spike.md
- A	lib/__tests__/v2Research.test.ts
- M	lib/v2.ts

### Working Tree Snapshot

- A  app/api/v2/research-brief/__tests__/route.test.ts
- A  app/api/v2/research-brief/route.ts
- M  components/V2ResonateApp.tsx
- A  docs/plans/2026-06-05-research-editorial-pipeline-spike.md
- A  lib/__tests__/v2Research.test.ts
- M  lib/v2.ts
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- feat/52-research-editorial-spike

## 06/05/2026 14:13:16 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- A	app/api/v2/claim-map/__tests__/route.test.ts
- A	app/api/v2/claim-map/route.ts
- M	components/V2ResonateApp.tsx
- A	lib/__tests__/v2ClaimMap.test.ts
- M	lib/v2.ts

### Working Tree Snapshot

- A  app/api/v2/claim-map/__tests__/route.test.ts
- A  app/api/v2/claim-map/route.ts
- M  components/V2ResonateApp.tsx
- A  lib/__tests__/v2ClaimMap.test.ts
- M  lib/v2.ts
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- feat/53-claim-map

## 06/05/2026 14:20:10 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- A	app/api/v2/editorial-outline/__tests__/route.test.ts
- A	app/api/v2/editorial-outline/route.ts
- A	app/api/v2/long-form-draft/__tests__/route.test.ts
- A	app/api/v2/long-form-draft/route.ts
- M	components/V2ResonateApp.tsx
- A	lib/__tests__/v2Outline.test.ts
- M	lib/v2.ts

### Working Tree Snapshot

- A  app/api/v2/editorial-outline/__tests__/route.test.ts
- A  app/api/v2/editorial-outline/route.ts
- A  app/api/v2/long-form-draft/__tests__/route.test.ts
- A  app/api/v2/long-form-draft/route.ts
- M  components/V2ResonateApp.tsx
- A  lib/__tests__/v2Outline.test.ts
- M  lib/v2.ts
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- feat/54-outline-draft

## 06/05/2026 14:22:36 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- A	docs/cutover-checklist.md
- A	docs/ops-runbook.md

### Working Tree Snapshot

- A  docs/cutover-checklist.md
- A  docs/ops-runbook.md
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- feat/55-cutover-checklist

## 06/05/2026 14:25:10 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- A	app/api/v2/__tests__/e2e-mvp-flow.test.ts

### Working Tree Snapshot

- A  app/api/v2/__tests__/e2e-mvp-flow.test.ts
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- feat/56-e2e-hardening

## 06/05/2026 16:18:29 PDT

### Summary

- Updated repository documentation and handoff records.
- Touched the captured ideas experience.

### Staged Changes

- M	app/api/v2/claim-map/route.ts
- M	app/api/v2/editorial-outline/__tests__/route.test.ts
- M	app/api/v2/editorial-outline/route.ts
- M	app/api/v2/research-brief/route.ts
- M	app/ideas/__tests__/page.test.tsx
- M	components/IdeaDetail/__tests__/IdeaDetail.test.tsx
- M	components/IdeasPage/__tests__/IdeasPage.test.tsx
- M	components/SetupPage/__tests__/SetupPage.test.tsx
- M	components/V2ResonateApp.tsx
- A	components/__tests__/V2ResonateApp.test.tsx
- M	lib/__tests__/v2Research.test.ts
- M	vitest.config.ts

### Working Tree Snapshot

- M  app/api/v2/claim-map/route.ts
- M  app/api/v2/editorial-outline/__tests__/route.test.ts
- M  app/api/v2/editorial-outline/route.ts
- M  app/api/v2/research-brief/route.ts
- M  app/ideas/__tests__/page.test.tsx
- M  components/IdeaDetail/__tests__/IdeaDetail.test.tsx
- M  components/IdeasPage/__tests__/IdeasPage.test.tsx
- M  components/SetupPage/__tests__/SetupPage.test.tsx
- M  components/V2ResonateApp.tsx
- A  components/__tests__/V2ResonateApp.test.tsx
- M  lib/__tests__/v2Research.test.ts
- M  vitest.config.ts
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- codex/fix-v2-validation-gates

## 06/05/2026 17:53:10 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- M	app/api/v2/editorial-outline/__tests__/route.test.ts
- M	app/api/v2/editorial-outline/route.ts
- M	app/api/v2/research-brief/__tests__/route.test.ts
- M	app/api/v2/research-brief/route.ts
- M	components/V2ResonateApp.tsx
- M	components/__tests__/V2ResonateApp.test.tsx
- M	docs/cutover-checklist.md
- M	docs/ops-runbook.md
- M	docs/plans/2026-06-05-research-editorial-pipeline-spike.md

### Working Tree Snapshot

- M  app/api/v2/editorial-outline/__tests__/route.test.ts
- M  app/api/v2/editorial-outline/route.ts
- M  app/api/v2/research-brief/__tests__/route.test.ts
- M  app/api/v2/research-brief/route.ts
- M  components/V2ResonateApp.tsx
- M  components/__tests__/V2ResonateApp.test.tsx
- M  docs/cutover-checklist.md
- M  docs/ops-runbook.md
- M  docs/plans/2026-06-05-research-editorial-pipeline-spike.md
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- codex/fix-v2-outline-and-source-review

## 06/05/2026 18:14:37 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- M	app/api/v2/editorial-outline/__tests__/route.test.ts
- M	app/api/v2/editorial-outline/route.ts
- M	components/V2ResonateApp.tsx
- M	components/__tests__/V2ResonateApp.test.tsx

### Working Tree Snapshot

- M  app/api/v2/editorial-outline/__tests__/route.test.ts
- M  app/api/v2/editorial-outline/route.ts
- M  components/V2ResonateApp.tsx
- M  components/__tests__/V2ResonateApp.test.tsx
- ?? CONTEXT.md
- ?? docs/adr/

### Branch

- codex/fix-v2-citation-plan-object

## 06/06/2026 02:05:11 PDT

### Summary

- Updated repository documentation and handoff records.
- Adjusted commit-time automation for documentation refreshes.
- Touched the workflow board or editorial workflow logic.
- Touched the captured ideas experience.
- Touched AI assistant request or prompt plumbing.
- Touched auth or environment wiring.
- Touched the main dashboard surfaces.

### Staged Changes

- A	.codex/prompts/documentation-subagent.md
- M	.env.local.example
- A	.githooks/pre-commit
- A	.githooks/pre-commit.local.example
- A	.github/workflows/test.yml
- M	.gitignore
- M	README.md
- A	app/__tests__/page.test.tsx
- A	app/api/llm/__tests__/route.test.ts
- A	app/api/llm/route.ts
- A	app/api/publish/__tests__/route.test.ts
- A	app/api/publish/route.ts
- A	app/api/v2/__tests__/e2e-mvp-flow.test.ts
- A	app/api/v2/claim-map/__tests__/route.test.ts
- A	app/api/v2/claim-map/route.ts
- A	app/api/v2/editorial-outline/__tests__/route.test.ts
- A	app/api/v2/editorial-outline/route.ts
- A	app/api/v2/generate-draft/__tests__/route.test.ts
- A	app/api/v2/generate-draft/route.ts
- A	app/api/v2/long-form-draft/__tests__/route.test.ts
- A	app/api/v2/long-form-draft/route.ts
- A	app/api/v2/ops/validate-workflow/__tests__/route.test.ts
- A	app/api/v2/ops/validate-workflow/route.ts
- A	app/api/v2/research-brief/__tests__/route.test.ts
- A	app/api/v2/research-brief/route.ts
- A	app/api/v2/validate-youtube/route.ts
- A	app/editor/[id]/page.tsx
- A	app/favicon.ico
- A	app/globals.css
- A	app/icon.svg
- A	app/ideas/__tests__/page.test.tsx
- A	app/ideas/page.tsx
- A	app/layout.tsx
- A	app/page.tsx
- A	app/setup/page.tsx
- A	app/sign-in/[[...sign-in]]/page.tsx
- A	app/sign-up/[[...sign-up]]/page.tsx
- A	app/v2/page.tsx
- A	components.json
- A	components/AIAssistant/AIAssistant.tsx
- A	components/AIAssistant/__tests__/AIAssistant.test.tsx
- A	components/BlogPostEditor/BlogPostEditor.tsx
- A	components/BlogPostEditor/__tests__/BlogPostEditor.test.tsx
- A	components/Calendar/Calendar.tsx
- A	components/Calendar/__tests__/Calendar.test.tsx
- A	components/ContentLibrary/ContentLibrary.tsx
- A	components/ContentLibrary/__tests__/ContentLibrary.test.tsx
- A	components/ConvexClientProvider.tsx
- A	components/CreatePostModal/CreatePostModal.tsx
- A	components/CreatePostModal/__tests__/CreatePostModal.test.tsx
- A	components/EditorChat/EditorChat.tsx
- A	components/EditorChat/__tests__/EditorChat.test.tsx
- A	components/FullScreenEditor/FullScreenEditor.tsx
- A	components/FullScreenEditor/MetadataBar.tsx
- A	components/FullScreenEditor/ResizeHandle.tsx
- A	components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx
- A	components/FullScreenEditor/__tests__/MetadataBar.test.tsx
- A	components/IdeaDetail/IdeaDetail.tsx
- A	components/IdeaDetail/__tests__/IdeaDetail.test.tsx
- A	components/IdeasPage/IdeasPage.tsx
- A	components/IdeasPage/__tests__/IdeasPage.test.tsx
- A	components/ImageTray/ImageTray.tsx
- A	components/ImageTray/__tests__/ImageTray.test.tsx
- A	components/LinkedInPostEditor/LinkedInPostEditor.tsx
- A	components/LinkedInPostEditor/__tests__/LinkedInPostEditor.test.tsx
- A	components/PersistedPublishingPanel.tsx
- A	components/SetupPage/SetupPage.tsx
- A	components/SetupPage/__tests__/SetupPage.test.tsx
- A	components/TiptapEditor/TiptapEditor.tsx
- A	components/TiptapEditor/Toolbar.tsx
- A	components/TiptapEditor/__tests__/TiptapEditor.test.tsx
- A	components/TiptapEditor/__tests__/Toolbar.test.tsx
- A	components/V2ResonateApp.tsx
- A	components/WorkflowBoard/WorkflowBoard.tsx
- A	components/WorkflowBoard/WorkflowDraftEditor.tsx
- A	components/WorkflowBoard/WorkflowIdeaModal.tsx
- A	components/WorkflowBoard/__tests__/WorkflowBoard.test.tsx
- A	components/WorkflowBoard/__tests__/WorkflowDraftEditor.test.tsx
- A	components/WorkflowBoard/__tests__/WorkflowIdeaModal.test.tsx
- A	components/__tests__/ConvexClientProvider.test.tsx
- A	components/__tests__/IdeasPage.test.tsx
- A	components/__tests__/PersistedPublishingPanel.test.tsx
- A	components/__tests__/V2ResonateApp.test.tsx
- A	components/kibo-ui/choicebox/index.tsx
- A	components/kibo-ui/combobox/index.tsx
- A	components/kibo-ui/kanban/index.tsx
- A	components/ui/Modal.tsx
- A	components/ui/SlideOver.tsx
- A	components/ui/Toggle.tsx
- A	components/ui/__tests__/Button.test.tsx
- A	components/ui/__tests__/FieldAndInputGroup.test.tsx
- A	components/ui/__tests__/Modal.test.tsx
- A	components/ui/__tests__/Primitives.test.tsx
- A	components/ui/__tests__/SlideOver.test.tsx
- A	components/ui/__tests__/Toggle.test.tsx
- A	components/ui/badge.tsx
- A	components/ui/button.tsx
- A	components/ui/card.tsx
- A	components/ui/command.tsx
- A	components/ui/dialog.tsx
- A	components/ui/drawer.tsx
- A	components/ui/dropdown-menu.tsx
- A	components/ui/field.tsx
- A	components/ui/input-group.tsx
- A	components/ui/input.tsx
- A	components/ui/label.tsx
- A	components/ui/popover.tsx
- A	components/ui/radio-group.tsx
- A	components/ui/scroll-area.tsx
- A	components/ui/select.tsx
- A	components/ui/separator.tsx
- A	components/ui/sheet.tsx
- A	components/ui/switch.tsx
- A	components/ui/tabs.tsx
- A	components/ui/textarea.tsx
- A	convex/__tests__/ideasApi.test.ts
- A	convex/_generated/api.d.ts
- A	convex/_generated/api.js
- A	convex/_generated/dataModel.d.ts
- A	convex/_generated/server.d.ts
- A	convex/_generated/server.js
- A	convex/auth.config.ts
- A	convex/backfill.ts
- A	convex/ideas.ts
- A	convex/posts.ts
- A	convex/schema.ts
- A	convex/settings.ts
- A	convex/v2Publishing.ts
- A	convex/v2Research.ts
- A	convex/workflow.ts
- A	docs/adr/0001-postiz-spine.md
- A	docs/adr/0002-provider-routing-and-approval.md
- A	docs/adr/0003-deployment-runtime.md
- A	docs/changelog.md
- A	docs/cutover-checklist.md
- A	docs/glossary.md
- A	docs/live-provider-validation.md
- A	docs/migration-dry-run.md
- A	docs/mvp-implementation-map.md
- A	docs/ops-runbook.md
- A	docs/plans/2026-03-05-ai-assistant-code-review-fixes.md
- A	docs/plans/2026-03-07-inspiration-ideas-design.md
- A	docs/plans/2026-03-07-inspiration-ideas-implementation.md
- A	docs/plans/2026-03-10-content-backfill.md
- A	docs/plans/2026-03-11-kibo-workflow-migration.md
- A	docs/plans/2026-04-09-fullscreen-editor-implementation-plan.md
- A	docs/plans/2026-04-09-ppg-flow-implementation-plan.md
- A	docs/plans/2026-06-05-inbox-draft-management-validation.md
- A	docs/plans/2026-06-05-postiz-brand-workspace-validation.md
- A	docs/plans/2026-06-05-postiz-feasibility-spike.md
- A	docs/plans/2026-06-05-postiz-foundation-runbook.md
- A	docs/plans/2026-06-05-research-editorial-pipeline-spike.md
- A	docs/project-status.md
- A	docs/spec.md
- A	e2e/dashboard.spec.ts
- A	e2e/setup-flow.spec.ts
- A	eslint.config.mjs
- A	lib/__tests__/backfill.test.ts
- A	lib/__tests__/cortex.test.ts
- A	lib/__tests__/github.test.ts
- A	lib/__tests__/ideas.test.ts
- A	lib/__tests__/imageAlt.test.ts
- A	lib/__tests__/imageOptimize.test.ts
- A	lib/__tests__/llmClient.test.ts
- A	lib/__tests__/v2.test.ts
- A	lib/__tests__/v2ClaimMap.test.ts
- A	lib/__tests__/v2Migration.test.ts
- A	lib/__tests__/v2Outline.test.ts
- A	lib/__tests__/v2ProviderAdapters.test.ts
- A	lib/__tests__/v2Research.test.ts
- A	lib/__tests__/workflow.test.ts
- A	lib/__tests__/workflowBoard.test.ts
- A	lib/backfill.ts
- A	lib/cortex.ts
- A	lib/github.ts
- A	lib/ideas.ts
- A	lib/imageAlt.ts
- A	lib/imageOptimize.ts
- A	lib/llmClient.ts
- A	lib/models.ts
- A	lib/utils.ts
- A	lib/v2.ts
- A	lib/v2Migration.ts
- A	lib/v2ProviderAdapters.ts
- A	lib/workflow.ts
- A	lib/workflowBoard.ts
- A	next.config.ts
- A	package-lock.json
- A	package.json
- A	playwright.config.ts
- A	postcss.config.mjs
- A	proxy.ts
- A	public/file.svg
- A	public/globe.svg
- A	public/next.svg
- A	public/vercel.svg
- A	public/window.svg
- A	scripts/__tests__/update-docs.test.ts
- A	scripts/backfill-content.ts
- A	scripts/install-git-hooks.sh
- A	scripts/linkedin-backfill.json
- A	scripts/update-docs.mjs
- A	scripts/v2-migration-dry-run.mjs
- A	tests/fixtures/resonate-v1-export.sample.json
- A	tests/setup.ts
- A	tsconfig.json
- A	tsconfig.typecheck.json
- A	vitest.config.ts

### Working Tree Snapshot

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

### Branch

- codex/resonate-v2-mvp-foundation

## 06/06/2026 02:10:41 PDT

### Summary

- Touched the main dashboard surfaces.

### Staged Changes

- M	.github/workflows/test.yml
- M	app/page.tsx

### Working Tree Snapshot

- M  .github/workflows/test.yml
- M  app/page.tsx

### Branch

- codex/resonate-v2-mvp-foundation

## 06/06/2026 02:11:23 PDT

### Summary

- Refreshed documentation for the current repository state.

### Staged Changes

- No staged changes were present when the docs refresh ran.

### Working Tree Snapshot

- Working tree was clean.

### Branch

- codex/resonate-v2-mvp-foundation

## 06/06/2026 02:26:17 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- No staged changes were present when the docs refresh ran.

### Working Tree Snapshot

-  M docs/mvp-implementation-map.md
-  M docs/ops-runbook.md

### Branch

- codex/resonate-v2-mvp-foundation

## 06/06/2026 10:47:01 PDT

### Summary

- Updated repository documentation and handoff records.

### Staged Changes

- M	app/v2/page.tsx
- A	app/v2/research/page.tsx
- M	docs/adr/0002-provider-routing-and-approval.md
- A	docs/adr/0004-single-composer.md
- M	docs/cutover-checklist.md
- M	docs/mvp-implementation-map.md

### Working Tree Snapshot

- M  app/v2/page.tsx
- A  app/v2/research/page.tsx
- M  docs/adr/0002-provider-routing-and-approval.md
- A  docs/adr/0004-single-composer.md
- M  docs/cutover-checklist.md
- M  docs/mvp-implementation-map.md

### Branch

- b1-foundation-cleanups

## 06/06/2026 11:09:56 PDT

### Summary

- Refreshed documentation for the current repository state.

### Staged Changes

- A	convex/__tests__/v2Publishing.test.ts
- M	convex/schema.ts
- M	convex/v2Publishing.ts
- M	lib/v2.ts

### Working Tree Snapshot

-  M app/editor/[id]/page.tsx
-  M app/v2/page.tsx
-  M components/PersistedPublishingPanel.tsx
-  M components/__tests__/PersistedPublishingPanel.test.tsx
- A  convex/__tests__/v2Publishing.test.ts
-  M convex/_generated/api.d.ts
- M  convex/schema.ts
- M  convex/v2Publishing.ts
- M  lib/v2.ts
- ?? _b2a_stash/
- ?? components/EditorPageRouter.tsx
- ?? scripts/_persisted_composer_snippet.tsx
- ?? scripts/_platform_pane_snippet.tsx
- ?? scripts/patch-panel.py

### Branch

- b2a-single-composer

## 06/06/2026 11:10:01 PDT

### Summary

- Refreshed documentation for the current repository state.

### Staged Changes

- M	app/editor/[id]/page.tsx
- M	app/v2/page.tsx
- A	components/EditorPageRouter.tsx
- M	components/PersistedPublishingPanel.tsx

### Working Tree Snapshot

- M  app/editor/[id]/page.tsx
- M  app/v2/page.tsx
- A  components/EditorPageRouter.tsx
- M  components/PersistedPublishingPanel.tsx
-  M components/__tests__/PersistedPublishingPanel.test.tsx
-  M convex/_generated/api.d.ts
- ?? _b2a_stash/
- ?? scripts/_persisted_composer_snippet.tsx
- ?? scripts/_platform_pane_snippet.tsx
- ?? scripts/patch-panel.py

### Branch

- b2a-single-composer

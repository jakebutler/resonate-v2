# Full-Screen Blog Post Editor — Implementation Plan

**PRD:** GitHub issue #6
**Date:** 2026-04-09
**Tech Stack:** Next.js 16 (App Router), React 19, Convex, Clerk auth, Tailwind 4, shadcn/ui, Tiptap

---

## Strategy: Tracer-Bullet Vertical Slices

Each phase delivers a working, deployable vertical slice — not a horizontal layer. Phase 1 is the thinnest possible end-to-end path that proves the architecture works: a user can navigate to the new editor route, type rich text, and save it to Convex. Every subsequent phase adds depth to that working system.

The existing `BlogPostEditor` SlideOver is **never modified** — the new editor lives at a dedicated route and coexists with it.

---

## Phase 1: Tracer Bullet — Route + Tiptap + Auto-Save

**Goal:** Prove the full vertical architecture works. A user navigates to `/editor/new`, sees a Tiptap WYSIWYG editor with a title field, types content, and it auto-saves to Convex as a blog post draft. Navigating to `/editor/:id` loads an existing post into the editor.

### What it delivers
- New `/editor/[id]/page.tsx` route (handles both `new` and existing IDs)
- `FullScreenEditor` shell component with a single-column layout (no chat sidebar yet)
- `TiptapEditor` component with minimal extensions: paragraph, headings (H2/H3), bold, italic, link, bullet list, numbered list, blockquote, code block
- A basic sticky toolbar with icons for each supported format
- Borderless title field at top (`font-forum`, ~32px)
- Debounced auto-save (~3s) to Convex `posts` table via existing `create` and `update` mutations
- "Saved" / "Saving..." indicator
- Back-arrow navigation to return to the dashboard
- Tiptap content stored as HTML in the `content` field (markdown serialization comes in Phase 3)

### Files created
| File | Purpose |
|------|---------|
| `app/editor/[id]/page.tsx` | Route entry point. Parses `id` param (`new` vs Convex ID), renders `FullScreenEditor`. |
| `components/FullScreenEditor/FullScreenEditor.tsx` | Layout shell — title field, toolbar, editor canvas, auto-save logic, back nav. |
| `components/TiptapEditor/TiptapEditor.tsx` | Tiptap instance with StarterKit extensions. Exposes `editor` instance upward via ref/callback. |
| `components/TiptapEditor/Toolbar.tsx` | Single-row sticky toolbar. Reads active marks/nodes from editor state. |

### Files modified
| File | Change |
|------|--------|
| `app/page.tsx` | In `handleEditPost`, when `post.type === "blog"`, navigate to `/editor/:id` via `router.push` instead of opening SlideOver. Similarly for new blog post creation. |
| `components/WorkflowBoard/WorkflowBoard.tsx` | If it has edit-post handlers for blog type, route to `/editor/:id`. |
| `package.json` | Add `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/pm`. |

### Acceptance criteria
- [ ] `/editor/new` renders an empty Tiptap editor with title field
- [ ] Typing in the title and body auto-saves to Convex after ~3s idle
- [ ] `/editor/<valid-convex-id>` loads the existing post title and content into the editor
- [ ] Toolbar buttons toggle bold, italic, headings, link, lists, blockquote, code block
- [ ] Keyboard shortcuts work (Cmd+B, Cmd+I, Cmd+K for link)
- [ ] Back arrow navigates to previous page
- [ ] Existing SlideOver editor for LinkedIn posts is unaffected
- [ ] No regressions in existing tests

### Estimated complexity
**Medium** — Tiptap setup is straightforward but wiring auto-save with Convex optimistic updates, handling the `new` vs existing ID routing, and maintaining the dashboard entry-point changes require care.

### Dependencies
None — this is the foundation.

### Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Tiptap's HTML output differs from the markdown the existing `content` field stores | Phase 1 stores HTML. Existing SlideOver still writes markdown. Both coexist because the `content` field is a plain string. Phase 3 adds markdown serialization so publishing works correctly. |
| Auto-save race conditions (rapid edits create multiple concurrent mutations) | Use a single `useRef`-based debounce timer that cancels on each keystroke. Only one mutation in flight at a time — queue the next if one is pending. |
| `/editor/new` needs to create a post before it can auto-save updates | On first auto-save, call `posts.create` and then `router.replace(`/editor/${newId}`)` so subsequent saves use `posts.update`. |

---

## Phase 2: Chat Sidebar — Resizable AI Panel

**Goal:** Add the right-panel AI chat sidebar so the two-panel split layout is complete. The chat works for general conversation (no text-selection context yet).

### What it delivers
- Resizable two-panel split layout in `FullScreenEditor`
- `EditorChat` component (refactored from existing `AIAssistant`, adapted for sidebar form factor)
- Drag handle for resizing (default ~380px, min 280px, max 50% viewport)
- Collapsible sidebar (button to toggle)
- Model selector (reuses `CLAUDE_MODELS` from `lib/models.ts`)
- Full chat history within the session
- Streams responses from existing `/api/llm` route with `assistantType: "blog"`

### Files created
| File | Purpose |
|------|---------|
| `components/EditorChat/EditorChat.tsx` | Chat panel adapted for sidebar layout. Streams from `/api/llm`. |
| `components/FullScreenEditor/ResizeHandle.tsx` | Draggable divider for panel width. |

### Files modified
| File | Change |
|------|--------|
| `components/FullScreenEditor/FullScreenEditor.tsx` | Add two-panel layout with resizable split. Mount `EditorChat` in right panel. Add collapse toggle. |

### Acceptance criteria
- [ ] Chat sidebar visible by default at ~380px width
- [ ] Drag handle resizes sidebar between 280px and 50% viewport
- [ ] Collapse button hides sidebar; editor expands to full width
- [ ] Chat messages stream correctly from `/api/llm`
- [ ] Model selector works
- [ ] Chat state persists within the editing session (not across page reloads)

### Estimated complexity
**Medium** — The resize handle with pointer events and the layout CSS are the main complexity. Chat logic is largely lifted from the existing `AIAssistant`.

### Dependencies
- Phase 1 (editor route and shell must exist)

### Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Resize handle conflicts with Tiptap selection events | Use `onPointerDown` capture on the handle and `e.preventDefault()` to avoid Tiptap stealing focus. |
| Mobile/narrow viewports break two-panel layout | For viewports < 768px, default the sidebar to collapsed. Add a floating toggle button. Full mobile optimization is a future concern. |

---

## Phase 3: Markdown Serialization + Metadata Bar + Publish

**Goal:** The editor can now publish to GitHub. Content round-trips between WYSIWYG (Tiptap HTML) and markdown. Metadata fields (status, date, time, tags, SEO description) are editable.

### What it delivers
- Tiptap markdown serialization via `tiptap-markdown` extension (HTML-to-markdown on save/publish, markdown-to-HTML on load)
- Collapsible metadata bar below the title: status badge, date picker, time dropdown
- Gear icon expands secondary row: tags input, SEO description textarea
- "Publish" button that calls `/api/publish` (existing GitHub PR flow)
- Updated frontmatter generation to include `heroImage`, `tags`, `description` fields

### Files created
| File | Purpose |
|------|---------|
| `components/FullScreenEditor/MetadataBar.tsx` | Status badge, date picker, time selector, expandable tags/SEO row. |

### Files modified
| File | Change |
|------|--------|
| `convex/schema.ts` | Add optional fields to `posts` table: `heroImageId`, `tags`, `seoDescription`. |
| `convex/posts.ts` | Extend `create` and `update` mutations to accept `tags`, `seoDescription`, `heroImageId`. |
| `components/FullScreenEditor/FullScreenEditor.tsx` | Mount `MetadataBar`. Wire publish handler. Convert Tiptap content to markdown on publish. Load markdown as HTML on mount. |
| `components/TiptapEditor/TiptapEditor.tsx` | Add `tiptap-markdown` extension. Expose `getMarkdown()` helper. |
| `lib/github.ts` | Extend `buildFrontmatter` to include `heroImage`, `tags`, `description` when present. |
| `app/api/publish/route.ts` | Accept and forward new frontmatter fields. |
| `package.json` | Add `tiptap-markdown`. |

### Acceptance criteria
- [ ] Existing markdown blog posts load into Tiptap as formatted rich text
- [ ] Tiptap content serializes to clean markdown on save
- [ ] Markdown round-trip is lossless for supported block types (headings, bold, italic, link, lists, blockquote, code block)
- [ ] Status badge is clickable and cycles through draft/scheduled/published
- [ ] Date picker and time dropdown update the post
- [ ] Tags input accepts comma-separated values
- [ ] SEO description textarea saves to Convex
- [ ] "Publish" button creates GitHub PR with updated frontmatter (including tags, description)
- [ ] Convex schema migration is backward-compatible (all new fields are optional)

### Estimated complexity
**High** — Markdown round-tripping is the riskiest part of the entire project. `tiptap-markdown` handles most cases but edge cases with complex formatting, nested lists, and code blocks need thorough testing.

### Dependencies
- Phase 1 (editor core)

### Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Markdown round-trip lossy for edge cases (nested blockquotes, footnotes, complex tables) | Footnotes and tables are Phase 5, not Phase 3. For Phase 3, restrict to well-supported types. Add snapshot tests comparing input markdown to round-tripped output. |
| Schema migration breaks existing posts | All new fields are `v.optional(...)`. Existing posts are untouched. Run `convex dev` and verify no migration errors. |
| Publishing from new editor conflicts with old SlideOver publish flow | Both editors call the same `/api/publish` endpoint. The new editor adds optional fields; the old editor omits them. The API is backward-compatible. |

---

## Phase 4: Image Handling — Upload, Inline Display, Image Tray

**Goal:** Images can be inserted into blog posts via drag-drop, toolbar, or clipboard paste. An image tray provides a bird's-eye view with hero image designation.

### What it delivers
- Custom Tiptap `Image` extension with:
  - Drag-and-drop onto editor canvas
  - Toolbar button / `/image` slash command (opens file picker)
  - Clipboard paste (screenshots)
- Client-side image optimization before upload (cap 2000px wide, ~80% JPEG quality)
- Upload via Convex `generateUploadUrl` (existing mutation)
- Loading placeholder with progress indicator during upload
- Inline image display: full content width, border-radius, click-to-select with floating toolbar (alignment, alt text, delete)
- Collapsible `ImageTray` at bottom of editor:
  - Thumbnails of all post images
  - Star icon for hero image designation (vivid-tangerine border)
  - Trash icon to remove
  - Click thumbnail to scroll to image position
- `heroImageId` stored on post record

### Files created
| File | Purpose |
|------|---------|
| `components/TiptapEditor/extensions/ImageUpload.ts` | Custom Tiptap node extension for image upload, display, and floating controls. |
| `components/ImageTray/ImageTray.tsx` | Collapsible thumbnail strip with hero designation. |
| `lib/imageOptimize.ts` | Client-side image resize and compression using Canvas API. |

### Files modified
| File | Change |
|------|--------|
| `components/TiptapEditor/TiptapEditor.tsx` | Register `ImageUpload` extension. Handle drag/drop/paste events. |
| `components/TiptapEditor/Toolbar.tsx` | Add image insert button. |
| `components/FullScreenEditor/FullScreenEditor.tsx` | Mount `ImageTray`. Pass `heroImageId` state. Wire upload handler. |
| `convex/posts.ts` | Ensure `heroImageId` field is accepted in `create`/`update`. |
| `lib/github.ts` | Include `heroImage: <url>` in frontmatter when `heroImageId` is present. Resolve storage ID to URL before publishing. |
| `app/api/publish/route.ts` | Accept `heroImageUrl` field. |

### Acceptance criteria
- [ ] Drag-and-drop image onto editor inserts it at drop position
- [ ] Toolbar image button opens file picker; selected image inserts at cursor
- [ ] Pasting a screenshot inserts the image inline
- [ ] Images are optimized client-side before upload (verify via DevTools network tab)
- [ ] Upload shows a loading placeholder with progress
- [ ] Clicking an image shows floating toolbar with alignment, alt text, delete
- [ ] Image tray shows all post images as thumbnails
- [ ] Star icon on thumbnail designates hero image (only one active at a time)
- [ ] Hero image has vivid-tangerine border in tray
- [ ] Trash icon removes image (with confirmation)
- [ ] Clicking tray thumbnail scrolls editor to image position
- [ ] `heroImage` URL appears in GitHub PR frontmatter

### Estimated complexity
**High** — Client-side image optimization, the custom Tiptap node with floating controls, and the image tray with scroll-to-position all require significant work.

### Dependencies
- Phase 1 (editor core)
- Phase 3 (markdown serialization — images need to serialize as `![alt](url)`)

### Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Large images cause browser tab memory issues during optimization | Process one image at a time. Use `createImageBitmap` for off-main-thread decoding. Set a 10MB file-size cap with user-facing error. |
| Tiptap image node conflicts with markdown serialization | Define a custom `toMarkdown` serializer on the image node that outputs `![alt](url)`. Test round-trip with images. |
| Hero image URL resolution on publish requires async Convex query from the API route | Pass the resolved hero image URL from the client (which already has it from `getFileUrl`) in the publish request body. Avoid server-side Convex calls. |

---

## Phase 5: Text Selection to Chat + Suggest-and-Accept

**Goal:** The signature interaction — select text in the editor, ask AI about it, and accept AI-suggested rewrites that replace the original text.

### What it delivers
- **Floating action button:** On text selection, a tooltip appears above the selection with a sparkle icon and "Ask AI" button. Clicking focuses the chat input.
- **Sidebar chip:** "Selected text" chip above chat input showing truncated preview (~80 chars). Dismissable. Updates on re-selection. Fades after ~2s if deselected.
- **Context-aware messages:** When sent with a selection, the message includes the selected text as a quoted reference. Renders as blockquote in chat.
- **Suggestion cards:** AI rewrites render as styled blocks with "Accept" and "Dismiss" buttons. Accept replaces original text in editor. Dismiss collapses to single line.
- **Stale selection warning:** If original text changed since selection, show warning before applying.

### Files created
| File | Purpose |
|------|---------|
| `components/TiptapEditor/extensions/AskAIButton.ts` | Tiptap plugin that renders a floating button on text selection. |
| `components/EditorChat/SelectionChip.tsx` | "Selected text" chip UI above chat input. |
| `components/SuggestionCard/SuggestionCard.tsx` | Accept/dismiss card for AI-suggested rewrites. |

### Files modified
| File | Change |
|------|--------|
| `components/FullScreenEditor/FullScreenEditor.tsx` | Manage selection state. Bridge selection events from Tiptap to `EditorChat`. |
| `components/EditorChat/EditorChat.tsx` | Accept selection context. Render `SelectionChip`. Detect rewrite responses and render `SuggestionCard`. Wire accept handler to replace text in editor. |
| `components/TiptapEditor/TiptapEditor.tsx` | Emit selection change events. Expose `replaceRange(from, to, content)` method. |
| `app/api/llm/route.ts` | No changes needed — the existing streaming endpoint handles the chat. Context is prepended client-side. |

### Acceptance criteria
- [ ] Selecting text in the editor shows a floating "Ask AI" button above the selection
- [ ] Clicking "Ask AI" focuses the chat input
- [ ] "Selected text" chip appears above chat input with truncated preview
- [ ] Chip dismissable via "x" button
- [ ] Chip updates when a new selection is made
- [ ] Chip fades after ~2s if text is deselected
- [ ] Message sent with selection includes quoted selected text
- [ ] AI rewrite responses render as suggestion cards
- [ ] "Accept" replaces the original text in the editor
- [ ] "Dismiss" collapses the suggestion card
- [ ] If original text changed, a warning appears before applying
- [ ] Selection interactions do not interfere with normal editing

### Estimated complexity
**High** — This requires a Tiptap plugin for the floating button (using `@tiptap/extension-bubble-menu` or a custom plugin), careful coordination between editor selection state and the chat sidebar, and the suggest-and-accept flow with stale-detection.

### Dependencies
- Phase 1 (editor core)
- Phase 2 (chat sidebar)

### Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Floating button flickers on rapid selection changes | Debounce selection events (~150ms). Only show the button when selection length > 0 and is stable. |
| Stale selection detection after user edits | Store the selection `from`/`to` positions and a hash of the selected text at the time of selection. Before applying, re-read the range and compare. If changed, show a diff-style warning. |
| AI response format unpredictable — hard to detect "this is a rewrite" vs "this is commentary" | Use a prompt convention: when the user sends a message with selected context, the system prompt instructs the AI to wrap rewrites in a specific delimiter (e.g., `<rewrite>...</rewrite>`). The client parses this to render suggestion cards. Falls back to plain text if delimiters are absent. |

---

## Phase 6: Slash Commands, Tables, and Footnotes

**Goal:** Power-user editing features that round out the WYSIWYG toolbar as specified in the PRD.

### What it delivers
- **Slash command menu:** Typing `/` opens a dropdown with all block types (heading, bullet list, numbered list, blockquote, code block, table, footnote, image)
- **Table support:** Insert via toolbar or `/table`. Floating controls on hover for add/remove rows and columns. No cell merging.
- **Footnote support:** Insert via toolbar or `/footnote`. Superscript number inline, footnote entry at bottom of editor. Bidirectional click-to-scroll.

### Files created
| File | Purpose |
|------|---------|
| `components/TiptapEditor/extensions/SlashCommand.ts` | Tiptap suggestion plugin for the `/` command menu. |
| `components/TiptapEditor/extensions/Footnote.ts` | Custom Tiptap node for footnotes with bidirectional linking. |

### Files modified
| File | Change |
|------|--------|
| `components/TiptapEditor/TiptapEditor.tsx` | Register Table, Footnote, and SlashCommand extensions. |
| `components/TiptapEditor/Toolbar.tsx` | Add table and footnote buttons. Add heading dropdown (H2/H3) replacing simple heading toggle. |
| `package.json` | Add `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`. |

### Acceptance criteria
- [ ] Typing `/` opens a command menu with all block types
- [ ] Selecting an item from the menu inserts the corresponding block
- [ ] Menu is keyboard-navigable (arrow keys + Enter)
- [ ] Menu dismisses on Escape or clicking outside
- [ ] Table inserts via toolbar button or `/table` with default 3x3
- [ ] Hovering a table shows floating add/remove row/column controls
- [ ] Footnote inserts via toolbar or `/footnote`
- [ ] Footnote renders as superscript number inline
- [ ] Footnote entry appears at bottom of editor
- [ ] Clicking superscript scrolls to footnote entry and vice versa
- [ ] Tables and footnotes serialize to valid markdown

### Estimated complexity
**Medium-High** — Tables are well-supported by Tiptap's official extensions. Footnotes require a custom node with bidirectional scroll behavior. The slash command menu is a well-known pattern with Tiptap's `Suggestion` utility but requires UI polish.

### Dependencies
- Phase 1 (editor core)
- Phase 3 (markdown serialization — tables and footnotes need custom markdown serializers)

### Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Footnote markdown serialization has no standard Tiptap extension | Implement custom `toMarkdown` that outputs `[^N]` inline and `[^N]: text` at the end. Test round-trip carefully. |
| Slash command menu conflicts with typing `/` in code blocks | Disable the slash command suggestion inside code block nodes. Check `editor.isActive('codeBlock')` before showing the menu. |

---

## Phase 7: Dashboard Integration and Entry Points

**Goal:** All entry points from the dashboard (calendar, library, workflow board) correctly route blog posts to the new full-screen editor. The old SlideOver remains for LinkedIn-only. Creating a new blog post from anywhere lands in `/editor/new`.

### What it delivers
- Calendar day-click → "Blog" type → navigates to `/editor/new?date=YYYY-MM-DD`
- Calendar post-click → blog post → navigates to `/editor/:id`
- Library row-click → blog post → navigates to `/editor/:id`
- Workflow board card-click → blog post → navigates to `/editor/:id`
- `CreatePostModal` updated: selecting "Blog" navigates instead of opening SlideOver
- The `BlogPostEditor` SlideOver component is **kept in the codebase but no longer opened** from any dashboard entry point for new/edit flows. It remains available as a fallback.

### Files modified
| File | Change |
|------|--------|
| `app/page.tsx` | Update `handlePostTypeSelect` and `handleEditPost` to use `router.push` for blog type. |
| `components/CreatePostModal/CreatePostModal.tsx` | If it handles navigation internally, update to redirect for blog type. |
| `components/WorkflowBoard/WorkflowBoard.tsx` | Update blog-type edit actions to navigate to `/editor/:id`. |
| `components/WorkflowBoard/WorkflowDraftEditor.tsx` | If it opens the blog SlideOver, redirect to `/editor/:id` instead. |
| `components/ContentLibrary/ContentLibrary.tsx` | Update blog-type row click to navigate. |
| `components/Calendar/Calendar.tsx` | Update blog-type post click to navigate. |
| `app/editor/[id]/page.tsx` | Accept `?date=` query param and pre-fill `scheduledDate` for new posts. |

### Acceptance criteria
- [ ] Clicking "New Blog Post" from anywhere navigates to `/editor/new`
- [ ] Clicking an existing blog post from calendar/library/workflow navigates to `/editor/:id`
- [ ] LinkedIn post interactions still open the SlideOver as before
- [ ] Initial date is pre-filled when creating from a calendar day
- [ ] Back-arrow from editor returns to the correct dashboard view
- [ ] No dead states or broken navigation flows

### Estimated complexity
**Low-Medium** — Mostly wiring changes across multiple components. The main subtlety is ensuring back-navigation returns to the correct view (calendar vs library vs workflow).

### Dependencies
- Phase 1 (editor route must exist)
- Phases 2-6 should ideally be complete so the editor is fully functional when users are routed to it

### Risks & mitigations
| Risk | Mitigation |
|------|------------|
| Breaking existing LinkedIn workflows while rewiring blog entry points | Each component change is isolated to `type === "blog"` conditionals. Add integration tests that verify LinkedIn flows still open the SlideOver. |
| Browser back-button behavior after `router.push` | Use `router.push` (not `router.replace`) so the dashboard is in the history stack. Test back-button behavior. |

---

## Phase 8: Polish, Accessibility, and Edge Cases

**Goal:** Production-readiness polish. Accessibility, responsive behavior, error handling, and visual refinements.

### What it delivers
- Keyboard accessibility for all toolbar buttons, slash command menu, image tray, chat input
- ARIA labels and roles throughout
- Focus management: editor auto-focuses on mount, returning from chat refocuses editor
- Error toasts for failed saves, failed publishes, failed image uploads (replace `alert()`)
- Empty-state handling: graceful behavior when post ID doesn't exist
- Loading states: skeleton UI while Convex data loads
- Responsive behavior: sidebar collapses by default on narrow viewports
- Visual polish: consistent spacing, animations, hover states per design system
- Vivid-tangerine (#ff7d00) active states on toolbar buttons as specified in PRD
- Comprehensive test coverage for all new components

### Files modified
All components created in Phases 1-7.

### Files created
| File | Purpose |
|------|---------|
| `components/FullScreenEditor/__tests__/FullScreenEditor.test.tsx` | Unit tests for layout, auto-save, navigation. |
| `components/TiptapEditor/__tests__/TiptapEditor.test.tsx` | Unit tests for editor initialization, toolbar, extensions. |
| `components/EditorChat/__tests__/EditorChat.test.tsx` | Unit tests for chat, selection chip, suggestion cards. |
| `components/ImageTray/__tests__/ImageTray.test.tsx` | Unit tests for image tray, hero designation. |
| `e2e/editor.spec.ts` | Playwright E2E tests for the full editor flow. |

### Acceptance criteria
- [ ] All interactive elements are keyboard-accessible
- [ ] Screen reader announces toolbar state, chat messages, save status
- [ ] Failed auto-save shows non-intrusive error indicator with retry
- [ ] Invalid post ID shows "Post not found" with link back to dashboard
- [ ] Sidebar collapses automatically on viewports < 768px
- [ ] All new components have unit test coverage > 80%
- [ ] E2E test covers: create post, type content, add image, publish

### Estimated complexity
**Medium** — Breadth of changes across many files, but each individual change is small. Test writing is the bulk of the work.

### Dependencies
- All previous phases

---

## Dependency Graph

```
Phase 1 ─────────┬──────────┬──────────┬──────────────┐
(Tracer Bullet)   │          │          │              │
                  v          │          │              │
              Phase 2        v          v              v
              (Chat)     Phase 3    Phase 4         Phase 7
                  │      (Markdown)  (Images)       (Dashboard
                  │          │          │            Integration)
                  v          │          │              │
              Phase 5 <──────┘          │              │
              (Selection               │              │
               + Suggest)              │              │
                  │                    │              │
                  v                    v              │
              Phase 6 <────────────────┘              │
              (Slash, Tables,                         │
               Footnotes)                             │
                  │                                   │
                  v                                   v
              Phase 8 <───────────────────────────────┘
              (Polish + Tests)
```

**Critical path:** Phase 1 -> Phase 3 -> Phase 5 -> Phase 6 -> Phase 8

**Parallelizable:**
- Phase 2 (Chat) can be built alongside Phase 3 (Markdown) after Phase 1 is done
- Phase 4 (Images) can be built alongside Phase 2 after Phase 1 is done, but must wait for Phase 3 for markdown serialization of images
- Phase 7 (Dashboard Integration) can begin as soon as Phase 1 is done, but should wait for substantial editor completeness before final merge

---

## Cross-Cutting Concerns

### Data migration
No data migration is needed. All new fields on the `posts` table are `v.optional(...)`. Existing posts continue to work. The existing `BlogPostEditor` SlideOver remains in the codebase and functional.

### Content field format transition
During Phases 1-2, the new editor stores HTML in the `content` field. Phase 3 adds markdown serialization. Posts created in Phase 1-2 with HTML content will be handled by detecting the format on load (HTML vs markdown) and converting accordingly. Strategy: if `content` starts with `<` or contains `<p>`, treat as HTML; otherwise treat as markdown.

### Package additions
| Package | Phase | Purpose |
|---------|-------|---------|
| `@tiptap/react` | 1 | Core Tiptap React bindings |
| `@tiptap/starter-kit` | 1 | Bundle of essential extensions |
| `@tiptap/extension-link` | 1 | Link support with auto-detection |
| `@tiptap/pm` | 1 | ProseMirror types needed by extensions |
| `tiptap-markdown` | 3 | Markdown serialization/deserialization |
| `@tiptap/extension-table` | 6 | Table editing |
| `@tiptap/extension-table-row` | 6 | Table row nodes |
| `@tiptap/extension-table-cell` | 6 | Table cell nodes |
| `@tiptap/extension-table-header` | 6 | Table header cells |
| `@tiptap/extension-image` | 4 | Base image node (extended with custom upload) |

### Testing strategy
- **Unit tests:** Each phase should include tests for its new components. Vitest + React Testing Library.
- **Tiptap-specific tests:** Use `@tiptap/core` `createDocument` helper for testing editor content transformations without mounting React.
- **Markdown round-trip tests:** Phase 3 should include snapshot tests that verify markdown -> HTML -> markdown fidelity.
- **E2E tests:** Phase 8 adds Playwright coverage for the full flow.

### Performance considerations
- Tiptap editor should lazy-load (`dynamic import`) to keep the dashboard bundle small
- Image optimization runs on a Web Worker if available, falls back to main thread
- Chat streaming already works — no additional optimization needed
- Auto-save debounce prevents excessive Convex mutations

---

## Estimated Timeline Summary

| Phase | Effort Estimate | Can Start After |
|-------|----------------|-----------------|
| Phase 1: Tracer Bullet | 3-4 days | Immediately |
| Phase 2: Chat Sidebar | 2-3 days | Phase 1 |
| Phase 3: Markdown + Metadata + Publish | 3-4 days | Phase 1 |
| Phase 4: Image Handling | 4-5 days | Phase 3 |
| Phase 5: Text Selection + Suggest | 3-4 days | Phase 2 + Phase 3 |
| Phase 6: Slash Commands, Tables, Footnotes | 3-4 days | Phase 3 |
| Phase 7: Dashboard Integration | 1-2 days | Phase 1 (full merge after Phase 6) |
| Phase 8: Polish + Tests | 3-4 days | All phases |
| **Total** | **~22-30 days** | |

Phases 2, 3, and 4 can overlap significantly, bringing the wall-clock time closer to 18-22 days with focused execution.

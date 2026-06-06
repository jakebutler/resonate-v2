# People's Post Generator Flow -- Implementation Plan

> **PRD:** GitHub issue #7
> **Date:** 2026-04-09
> **Strategy:** Tracer-bullet vertical slices -- each phase delivers a working end-to-end feature, not a horizontal layer.

---

## Architecture Overview

The PPG flow introduces a new `/generate` route that guides users through a collaborative AI conversation from raw material to polished draft, then hands off to the appropriate editor. The system touches every layer of the stack:

- **Route:** `app/generate/page.tsx`
- **Convex schema:** new `conversations` and `memories` tables, new `conversationId` field on `posts`
- **Convex functions:** new `convex/conversations.ts` for CRUD on conversation records
- **API layer:** extend `/api/llm` to support the `ppg` assistant type with context bundling
- **Prompt layer:** new PPG system prompt and handoff prompt in `lib/cortex.ts`
- **Components:** PPGChat, RawMaterialInput, IdeaPicker, DraftPreviewCard
- **Integration points:** capturedIdeas (Pull from Ideas), posts (brand voice retrieval + draft creation), existing editors (handoff target)

---

## Dependency Map

```
Feature 1: Full-Screen Blog Editor (external dependency)
    |
    v
Phase 1  Tracer bullet: raw text -> AI conversation -> LinkedIn draft created
    |
Phase 2  Conversations persisted to Convex, survive page refresh
    |
Phase 3  Pull from Ideas integration (IdeaPicker modal)
    |
Phase 4  Dynamic brand voice context (retrieve published posts)
    |
Phase 5  Blog handoff to full-screen editor with seeded chat
    |
Phase 6  Phase dividers, DraftPreviewCard, and conversational UX polish
    |
Phase 7  Memories table (schema only) + conversationId on posts
```

**Critical dependency:** Phase 5 requires Feature 1 (Full-Screen Blog Editor) to exist. Phases 1-4 and 6-7 can proceed independently of Feature 1. If Feature 1 is not ready when Phase 5 is reached, skip to Phase 6-7 and return to Phase 5 later.

---

## Phase 1: Tracer Bullet -- Raw Text to LinkedIn Draft

**Goal:** Prove the full vertical slice works end-to-end. A user navigates to `/generate`, pastes raw text, has a multi-turn AI conversation, and creates a LinkedIn draft in the `posts` table. No persistence of the conversation itself -- purely ephemeral state.

### What It Delivers

- `/generate` route accessible via browser
- "Generate" button in the dashboard header
- Raw material textarea (text only, no ideas integration yet)
- Full-width chat interface with streaming AI responses
- PPG system prompt in `lib/cortex.ts`
- `ppg` assistant type in `/api/llm`
- "Create LinkedIn draft" action that inserts into the `posts` table
- Navigation to the existing LinkedIn SlideOver editor after draft creation

### Files Created

| File | Purpose |
|------|---------|
| `app/generate/page.tsx` | Route shell, composes RawMaterialInput + PPGChat |
| `components/PPGChat/PPGChat.tsx` | Full-width chat with streaming, message list, input area |
| `components/RawMaterialInput/RawMaterialInput.tsx` | Collapsible textarea for raw material, collapses to summary bar after submit |

### Files Modified

| File | Change |
|------|--------|
| `lib/cortex.ts` | Add `PPG_SYSTEM_PROMPT`, add `"ppg"` to `AssistantType` union, add `"ppg"` to `SYSTEM_PROMPTS` map |
| `app/api/llm/route.ts` | Add `"ppg"` to `ASSISTANT_TYPES` set |
| `app/page.tsx` | Add "Generate" button (Sparkles icon) to dashboard header, linking to `/generate` |

### Implementation Details

**PPG System Prompt (`lib/cortex.ts`):**
The PPG prompt is distinct from the blog/linkedin prompts. It should encode the PPG philosophy:
- "Document, don't create" -- capture genuine experiences
- Ask clarifying questions one at a time (Understand phase)
- Propose angle and structure collaboratively (Shape phase)
- Ask for format choice when ready (Choose format phase)
- Never advance phases without user readiness
- Avoid AI-sounding language; sound like a real practitioner

The prompt should instruct the model to follow the conversational phases (Understand -> Shape -> Choose format -> Draft) but without rigid state machines -- the model uses judgment about when to transition.

**PPGChat component:**
- Reuse the SSE streaming pattern from `components/AIAssistant/AIAssistant.tsx` but extract the stream-parsing logic into a shared `lib/useSSEStream.ts` hook or utility
- Full-width layout (not sidebar like AIAssistant)
- Messages stored in React state (ephemeral for Phase 1)
- Raw material prepended as first user message with a system-level framing
- Model selector (reuse pattern from AIAssistant)

**RawMaterialInput component:**
- Large textarea with placeholder text from PRD
- Submit button that collapses the input area to a summary bar showing first ~100 chars
- No "Pull from Ideas" button yet (Phase 3)

**Draft creation:**
- When the AI produces a draft and the user confirms format = LinkedIn, show a "Create LinkedIn Draft" button
- Button calls `useMutation(api.posts.create)` with `type: "linkedin"`, `content: draftText`, `status: "draft"`
- After creation, open the existing `LinkedInPostEditor` SlideOver with the new post ID
- Alternatively, navigate using `router.push()` if the SlideOver cannot be triggered from `/generate`

### Acceptance Criteria

- [ ] User can navigate to `/generate` from dashboard header
- [ ] User can paste raw text and submit it
- [ ] Input area collapses to summary bar after submission
- [ ] AI responds with clarifying questions (streaming)
- [ ] Multi-turn conversation works (3+ exchanges)
- [ ] User can select "LinkedIn" when AI asks for format
- [ ] AI generates a LinkedIn draft in the conversation
- [ ] User can create a LinkedIn draft post from the generated content
- [ ] Created post appears in content library as a draft
- [ ] Existing LinkedIn editor can open and edit the created post

### Estimated Complexity

**Medium.** Most patterns already exist in `AIAssistant.tsx` and `LinkedInPostEditor.tsx`. The main new work is the PPG system prompt, the `/generate` page layout, and the RawMaterialInput collapse behavior. The SSE streaming is copy-adapted from existing code.

**Estimate:** 2-3 days

---

## Phase 2: Conversation Persistence

**Goal:** Conversations survive page refresh and can be resumed. This is the foundation for editor handoff (Phase 5) and conversation history display.

### What It Delivers

- `conversations` table in Convex schema
- `convex/conversations.ts` with CRUD functions
- PPGChat reads/writes messages to Convex in real time
- Conversation resumes after page refresh (URL includes conversation ID)
- Phase metadata stored per message

### Files Created

| File | Purpose |
|------|---------|
| `convex/conversations.ts` | Convex query/mutation functions: `create`, `getById`, `appendMessage`, `updateContext` |

### Files Modified

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `conversations` table per PRD schema definition |
| `app/generate/page.tsx` | Accept `?conversationId=` query param, load existing conversation |
| `components/PPGChat/PPGChat.tsx` | Read messages from Convex query, write new messages via mutation, optimistic local state for streaming |

### Implementation Details

**Schema (from PRD):**
```
conversations: defineTable({
  postId: v.optional(v.id("posts")),
  type: v.union(v.literal("ppg"), v.literal("editor"), v.literal("general")),
  messages: v.array(v.object({
    role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
    content: v.string(),
    timestamp: v.number(),
    metadata: v.optional(v.object({
      phase: v.optional(v.string()),
      selectedText: v.optional(v.string()),
      suggestionStatus: v.optional(v.union(
        v.literal("pending"),
        v.literal("accepted"),
        v.literal("dismissed")
      ))
    }))
  })),
  context: v.optional(v.object({
    rawMaterial: v.optional(v.string()),
    ideaId: v.optional(v.id("capturedIdeas")),
    retrievedPostIds: v.optional(v.array(v.id("posts"))),
    outputFormats: v.optional(v.array(
      v.union(v.literal("blog"), v.literal("linkedin"))
    ))
  })),
  createdAt: v.number(),
  updatedAt: v.number()
})
```

**Convex functions (`convex/conversations.ts`):**
- `create`: creates a new conversation with type "ppg" and initial context
- `getById`: returns conversation by ID (auth-gated -- need to add userId to schema or check via session)
- `appendMessage`: appends a message to the messages array, updates `updatedAt`
- `updateContext`: patches the context object (e.g., to record selected format, retrieved post IDs)
- `listByType`: lists conversations by type, ordered by `updatedAt` desc (useful for future "recent conversations" UI)

**Auth consideration:** The PRD schema does not include `userId` on conversations. For multi-user safety, add `userId: v.string()` to the conversations table and index by it. This is a small deviation from the PRD schema that prevents data leakage.

**Optimistic streaming pattern:**
- When the user sends a message, immediately append it to Convex via `appendMessage`
- Start the SSE stream to `/api/llm`
- While streaming, show the partial assistant response in local React state
- On stream completion, call `appendMessage` with the full assistant response
- This means Convex is the source of truth, but the streaming UX is snappy

### Acceptance Criteria

- [ ] Conversation is created in Convex when user submits raw material
- [ ] URL updates to include `?conversationId=xxx`
- [ ] Page refresh reloads the conversation from Convex
- [ ] New messages are persisted after each exchange
- [ ] Phase metadata is stored on messages (at minimum the phase name)
- [ ] Raw material is stored in conversation context

### Estimated Complexity

**Medium.** Schema creation and Convex functions are straightforward. The main complexity is the optimistic streaming pattern -- making sure the local streaming state and the Convex-persisted state stay in sync without flickering.

**Estimate:** 2 days

---

## Phase 3: Pull from Ideas Integration

**Goal:** Connect the PPG flow to the existing `capturedIdeas` system so users can start a generation session from a previously captured idea.

### What It Delivers

- "Pull from Ideas" button on the RawMaterialInput
- IdeaPicker modal with search, showing idea title/tags/source/entry count
- Selecting an idea populates the textarea with structured content from its entries
- Idea ID stored in conversation context for traceability

### Files Created

| File | Purpose |
|------|---------|
| `components/IdeaPicker/IdeaPicker.tsx` | Searchable modal overlay listing captured ideas |

### Files Modified

| File | Change |
|------|--------|
| `components/RawMaterialInput/RawMaterialInput.tsx` | Add "Pull from Ideas" button that opens IdeaPicker |
| `convex/conversations.ts` | `updateContext` stores `ideaId` |

### Implementation Details

**IdeaPicker modal:**
- Uses `useQuery(api.ideas.list, { search })` -- the existing `ideas.list` query already supports text search
- Each row shows: `latestEntryPreview`, `tags` as badges, `sourceDomain`, entry count (fetch entries count or show from a new query)
- Search input at top with debounced filtering
- On selection, query `api.ideas.getById` to get full entries
- Format entries into structured text: each entry on its own line, source URL appended if present, tags listed
- Return the formatted text to RawMaterialInput, which populates the textarea
- Use existing `components/ui/Modal.tsx` or `components/ui/dialog.tsx` as the shell

**Data flow:**
1. User clicks "Pull from Ideas"
2. IdeaPicker opens, user searches and selects an idea
3. IdeaPicker calls `onSelect(formattedText, ideaId)`
4. RawMaterialInput populates textarea with formatted text
5. User can edit the text before submitting
6. On submit, `ideaId` is stored in conversation context

### Acceptance Criteria

- [ ] "Pull from Ideas" button visible on RawMaterialInput
- [ ] IdeaPicker modal opens with list of captured ideas
- [ ] Search/filter works in the modal
- [ ] Selecting an idea populates textarea with entry content + source metadata
- [ ] User can edit the populated text before submitting
- [ ] `ideaId` is stored in the conversation's context field in Convex
- [ ] Ideas with no entries are not selectable (graceful empty state)

### Estimated Complexity

**Low-Medium.** The existing `ideas.list` and `ideas.getById` queries do all the heavy lifting. The IdeaPicker is a straightforward list + search + modal.

**Estimate:** 1-2 days

---

## Phase 4: Dynamic Brand Voice Context

**Goal:** On conversation start, retrieve 2-3 relevant published posts from the content library and include them as brand voice examples in the AI context window. This makes the PPG output mirror the user's established writing style.

### What It Delivers

- New Convex query to search published posts by keyword/tag relevance
- Context bundle sent to `/api/llm` includes retrieved post content
- Retrieved post IDs stored in conversation context
- PPG system prompt references the examples naturally

### Files Created

| File | Purpose |
|------|---------|
| `convex/posts.ts` (new query) | `searchRelevant` -- finds published posts matching keywords from raw material |
| `lib/ppgContext.ts` | Builds the full PPG context bundle: system prompt + brand voice examples + raw material + conversation history |

### Files Modified

| File | Change |
|------|--------|
| `app/api/llm/route.ts` | When `assistantType === "ppg"`, accept additional `context` payload (raw material, retrieved posts content) and inject into system prompt |
| `lib/cortex.ts` | Add `ppgWithContext` prompt builder that interpolates brand voice examples into the system prompt |
| `components/PPGChat/PPGChat.tsx` | On conversation start, call the relevance query, pass results to the API, store retrieved post IDs in context |
| `convex/conversations.ts` | Store `retrievedPostIds` in context |

### Implementation Details

**Relevance matching (`convex/posts.ts` new query):**
- Query all published posts (`status === "published"`)
- Score by: keyword overlap between raw material and post title/content, tag matching if raw material came from an idea with tags, recency bias (recent posts weighted higher)
- Return top 2-3 posts
- This is a simple client-side scoring algorithm on the Convex query results, not a vector search (sufficient for the current content library size)
- Future optimization: if the content library grows large, move to Convex search indexes or an external vector store

**Context bundle structure (`lib/ppgContext.ts`):**
```
1. PPG system prompt (with editorial principles)
2. "Here are examples of your published writing style:" + 2-3 post excerpts
3. "Raw material from the user:" + raw material text
4. Full conversation history
```

**API changes:**
- The `/api/llm` route currently just passes `messages` and a system prompt
- For PPG, the system prompt is dynamically constructed with the context bundle
- Option A: Build the full system prompt on the client and send it as part of messages (simpler, but leaks prompt construction to the client)
- Option B: Send `context` as a separate field in the API payload and let the server build the prompt (preferred -- keeps prompt logic server-side)
- Go with Option B: add a `context` field to the API request body, used only when `assistantType === "ppg"`

### Acceptance Criteria

- [ ] On conversation start, 2-3 relevant published posts are retrieved
- [ ] Retrieved post content is included in the AI context window
- [ ] AI responses reflect the writing style of the retrieved posts
- [ ] Retrieved post IDs are stored in the conversation context
- [ ] If no published posts exist, the flow still works (graceful degradation)
- [ ] The context bundle does not exceed reasonable token limits (truncate post content if needed)

### Estimated Complexity

**Medium.** The relevance matching is the most nuanced part -- it needs to be good enough to surface useful examples without over-engineering. The context bundling is mostly prompt engineering and data plumbing.

**Estimate:** 2-3 days

---

## Phase 5: Blog Handoff to Full-Screen Editor

**Goal:** When the user chooses "blog" format, the AI generates a blog draft, and the user is navigated to the full-screen editor (Feature 1) with the draft pre-populated and the chat sidebar seeded with the PPG conversation context.

### What It Delivers

- Blog draft creation from PPG conversation
- Navigation to `/editor/new` (Feature 1 route) with draft content
- Chat sidebar in the editor receives a seeded handoff message
- "Show earlier conversation" expandable section shows the full PPG history
- Full context bundle (raw material, brand voice examples, conversation history) carries through the handoff

### Files Created

| File | Purpose |
|------|---------|
| (none -- depends on Feature 1 components) | |

### Files Modified

| File | Change |
|------|--------|
| `lib/cortex.ts` | Add `PPG_HANDOFF_PROMPT` template for the seeded message |
| `components/PPGChat/PPGChat.tsx` | Add "Create Blog Draft" action that creates a post and navigates to the editor |
| `convex/conversations.ts` | Link conversation to the created post via `postId` |
| `convex/posts.ts` | `create` mutation to accept `conversationId` (Phase 7 field) |
| Feature 1 editor components | Accept `conversationId` prop, load conversation, display seeded message and history |

### Implementation Details

**Handoff flow:**
1. User selects "blog" format in PPG conversation
2. AI generates a blog draft
3. PPGChat shows "Create Blog Draft" button
4. Button creates a `posts` record with `type: "blog"`, `content: draftMarkdown`, `status: "draft"`, `conversationId: conversationId`
5. Links the conversation to the post via `postId` on the conversation record
6. Navigates to `/editor/{postId}` (Feature 1 route)

**Editor integration (depends on Feature 1 API):**
- The full-screen editor needs to accept a `conversationId` (via the post record or URL param)
- On load, it fetches the conversation and seeds the chat sidebar with the handoff message
- The handoff message is defined in `PPG_HANDOFF_PROMPT`: "Continuing from our brainstorm -- here is where we landed..."
- An expandable "Show earlier conversation" section renders the full PPG message history

**If Feature 1 is not ready:**
- This phase can be deferred entirely
- In the interim, the blog draft creation still works -- it creates a post and opens the existing `BlogPostEditor` SlideOver (same as the LinkedIn flow in Phase 1, but for blog)
- The seeded chat and conversation carry-over are added when Feature 1 ships

### Acceptance Criteria

- [ ] User can select "blog" format in the PPG conversation
- [ ] AI generates a blog-format draft
- [ ] "Create Blog Draft" button creates a post and links the conversation
- [ ] User is navigated to the full-screen editor with draft pre-populated
- [ ] Chat sidebar shows the handoff message
- [ ] "Show earlier conversation" displays the full PPG history
- [ ] Full context bundle is available in the editor's AI chat

### Estimated Complexity

**High.** This phase has the most integration surface area and depends on Feature 1's component API being stable. The handoff data flow (conversation -> post -> editor -> chat sidebar) crosses multiple boundaries.

**Estimate:** 3-4 days (after Feature 1 is available)

### External Dependency

**Blocked on Feature 1 (Full-Screen Blog Editor).** The editor must support:
- Loading a post by ID with pre-populated content
- A chat sidebar that can receive a `conversationId` and display seeded + historical messages
- The suggest-and-accept flow for inline editing

If Feature 1 is in progress, coordinate on the component API (props, data flow) early so this phase can begin immediately when Feature 1 ships.

---

## Phase 6: Conversational UX Polish

**Goal:** Add the visual and interaction refinements that make the PPG conversation feel like a guided collaboration rather than a generic chatbot.

### What It Delivers

- Phase dividers in the chat (subtle line with muted label like "-- Exploring your idea --")
- DraftPreviewCard component for rendered drafts in the chat
- Format-specific actions on draft cards (Create Blog Draft, Create LinkedIn Draft)
- "Both" format option that generates LinkedIn first, then hands off to blog
- Model selector in the PPG chat
- Gentle nudge behavior ("I think I have enough to work with. Ready to see a draft?")

### Files Created

| File | Purpose |
|------|---------|
| `components/DraftPreviewCard/DraftPreviewCard.tsx` | Rendered draft preview with format badge and action buttons |

### Files Modified

| File | Change |
|------|--------|
| `components/PPGChat/PPGChat.tsx` | Add phase divider rendering based on message metadata, integrate DraftPreviewCard, add "both" format flow |

### Implementation Details

**Phase dividers:**
- When the AI transitions phases (detectable via message metadata or heuristic), render a thin horizontal line with a muted label
- Phase labels: "Exploring your idea", "Shaping the angle", "Choosing format", "Drafting"
- The AI model sets the phase in its response (via a simple convention like starting a message with `[PHASE:shape]` which gets stripped from display and stored in metadata)
- Alternatively, the phase is inferred from conversation length / content heuristically

**DraftPreviewCard:**
- Renders inside the chat message list when the AI produces a draft
- Shows the draft content in a card with a format badge (Blog / LinkedIn)
- Action buttons: "Create Draft" (creates post), "Revise" (continues conversation)
- LinkedIn drafts show character count and warn if over 3000

**"Both" format flow:**
- If user selects "both", AI generates the LinkedIn version first (shorter)
- DraftPreviewCard appears for LinkedIn with "Create Draft" action
- After LinkedIn draft is created, AI continues to generate the blog version
- Blog DraftPreviewCard appears with "Create Blog Draft" action
- This is a sequential flow within the same conversation

### Acceptance Criteria

- [ ] Phase dividers appear at appropriate conversation transitions
- [ ] DraftPreviewCard renders draft content attractively within the chat
- [ ] Format badge and action buttons work correctly on draft cards
- [ ] "Both" format generates LinkedIn first, then blog
- [ ] Character count warning shows for LinkedIn drafts over 2700 characters
- [ ] Model selector allows switching models mid-conversation
- [ ] The overall UX feels like a guided collaboration, not a form wizard

### Estimated Complexity

**Medium.** Mostly UI work with some prompt engineering for phase transitions. The "both" format flow adds sequential logic.

**Estimate:** 2-3 days

---

## Phase 7: Memories Table + conversationId on Posts

**Goal:** Add the data model foundations for future memory extraction and complete the post-to-conversation linkage.

### What It Delivers

- `memories` table in Convex schema (schema only, not populated)
- `conversationId` optional field on the `posts` table
- Migration/backfill plan for existing posts (they will have `conversationId: undefined`)

### Files Modified

| File | Change |
|------|--------|
| `convex/schema.ts` | Add `memories` table definition, add `conversationId: v.optional(v.id("conversations"))` to `posts` table |
| `convex/posts.ts` | `create` and `update` mutations accept optional `conversationId` |

### Implementation Details

**Memories table schema (from PRD):**
```
memories: defineTable({
  scope: v.union(v.literal("asset"), v.literal("session"), v.literal("system")),
  postId: v.optional(v.id("posts")),
  content: v.string(),
  source: v.id("conversations"),
  confidence: v.number(),
  createdAt: v.number()
})
```

Add indexes:
- `by_scope`: `["scope"]`
- `by_post`: `["postId"]`
- `by_source`: `["source"]`

**Posts table change:**
- Add `conversationId: v.optional(v.id("conversations"))` to the `posts` table definition
- Update `posts.create` and `posts.update` to accept the optional field
- Existing posts will have `undefined` for this field, which is fine -- the field is optional

**This phase is intentionally minimal.** The memories table exists in schema only so future memory extraction work has a stable data model to target. No population logic is built here.

### Acceptance Criteria

- [ ] `memories` table exists in Convex schema with correct field types and indexes
- [ ] `conversationId` field exists on `posts` table as optional
- [ ] `posts.create` accepts `conversationId`
- [ ] `posts.update` accepts `conversationId`
- [ ] Existing posts are unaffected (field is optional)
- [ ] Convex codegen succeeds with the new schema

### Estimated Complexity

**Low.** Pure schema and mutation changes with no UI work.

**Estimate:** 0.5 days

---

## Risk Register

### Risk 1: Feature 1 Dependency Delay

**Impact:** Phase 5 (blog handoff) is blocked. The PPG flow can only produce LinkedIn drafts and cannot hand off to the full-screen editor.

**Probability:** Medium -- Feature 1 is being developed in parallel.

**Mitigation:**
- Phases 1-4, 6, and 7 are independent of Feature 1. Build them first.
- For Phase 5, implement a fallback that opens the existing `BlogPostEditor` SlideOver instead of the full-screen editor. This is less ideal but functional.
- Coordinate early on the Feature 1 component API (what props does the editor accept, how does the chat sidebar receive conversation context).
- Define an interface contract for the editor handoff and build Phase 5's PPG side against that contract.

### Risk 2: PPG Prompt Quality

**Impact:** The conversational flow feels robotic, asks too many questions, or produces generic drafts.

**Probability:** Medium -- prompt engineering for multi-phase conversations is iteratively difficult.

**Mitigation:**
- Start with a concrete prompt in Phase 1 and test with real raw material from existing captured ideas.
- Use the Phase 1 tracer bullet to iterate on prompt quality before building persistence (Phase 2).
- Include 2-3 example conversations in the system prompt as few-shot demonstrations.
- The phase structure is advisory to the model, not enforced by code -- this gives flexibility to iterate on the prompt without code changes.

### Risk 3: Conversation Context Window Overflow

**Impact:** With raw material + 2-3 published posts + full conversation history, the context window may exceed model limits, especially for longer conversations.

**Probability:** Low-Medium -- depends on length of raw material and published posts.

**Mitigation:**
- Truncate published post excerpts to ~1000 tokens each (roughly 750 words).
- Implement a sliding window on conversation history: always include the last N messages in full, summarize older messages.
- In Phase 4, add a `lib/ppgContext.ts` utility that manages context budget explicitly.
- Monitor actual token usage in Phase 1 to calibrate limits before building Phase 4.

### Risk 4: Convex Messages Array Growth

**Impact:** Storing all messages in a single array on the `conversations` document could hit Convex document size limits for very long conversations.

**Probability:** Low -- typical PPG conversations are 10-20 messages.

**Mitigation:**
- Convex document size limit is 1MB. A 20-message conversation with detailed content is well under this.
- If conversations grow longer (e.g., extended editing sessions), implement message pagination: store a `messageCount` and use a separate `conversationMessages` table for overflow.
- For v1, the array approach is fine and much simpler to query.

### Risk 5: SSE Streaming Reliability

**Impact:** Stream parsing bugs cause lost content or UI hangs.

**Probability:** Low -- the existing `AIAssistant.tsx` streaming code is proven.

**Mitigation:**
- Extract the stream-parsing logic from `AIAssistant.tsx` into a shared utility (`lib/useSSEStream.ts` or similar) rather than copy-pasting.
- Reuse the exact `processEventBlock` logic that handles Anthropic, OpenAI, and Cortex SSE formats.
- Add error recovery: if the stream fails mid-response, show the partial content with an error message and a "Retry" button.

### Risk 6: Brand Voice Retrieval Quality

**Impact:** The retrieved published posts are irrelevant, adding noise rather than useful style guidance.

**Probability:** Medium -- simple keyword matching may not surface the best examples.

**Mitigation:**
- Start with a simple scoring algorithm (keyword overlap + recency) in Phase 4.
- If the content library is small (<20 posts), even random recent posts are useful style examples.
- Add tag matching as a signal when the raw material came from a captured idea with tags.
- Make retrieval optional in the prompt: "If the following style examples are relevant, mirror their tone and approach."
- Iterate on retrieval quality based on output quality observation.

---

## Phase Sequencing Summary

| Phase | Depends On | Estimated Days | Running Total |
|-------|-----------|---------------|---------------|
| Phase 1: Tracer Bullet | Nothing | 2-3 | 2-3 |
| Phase 2: Conversation Persistence | Phase 1 | 2 | 4-5 |
| Phase 3: Pull from Ideas | Phase 2 | 1-2 | 5-7 |
| Phase 4: Brand Voice Context | Phase 2 | 2-3 | 7-10 |
| Phase 5: Blog Handoff | Phase 2 + Feature 1 | 3-4 | 10-14 |
| Phase 6: UX Polish | Phase 1 | 2-3 | 12-17 |
| Phase 7: Schema Foundations | Nothing | 0.5 | 12.5-17.5 |

**Notes on parallelism:**
- Phases 3 and 4 can be built in parallel after Phase 2.
- Phase 6 can be built in parallel with Phases 3-5 (it is mostly UI work on top of Phase 1).
- Phase 7 can be done at any time -- it is a standalone schema change.
- With parallelism, total calendar time is closer to 8-10 days, not the sequential 12-17.

---

## Auth Considerations

The PPG flow introduces user-scoped conversation data. Following the existing pattern in the codebase:

- `conversations` should include a `userId: v.string()` field (addition to PRD schema) with a `by_user` index
- All Convex functions in `conversations.ts` should call `ctx.auth.getUserIdentity()` and enforce ownership, matching the pattern in `convex/ideas.ts`
- The `/api/llm` route already gates on `auth()` from Clerk -- no changes needed there
- The `memories` table should also include `userId: v.string()` for future use

---

## Testing Strategy

Each phase should include:

1. **Unit tests** for new Convex functions (query/mutation logic)
2. **Component tests** for new React components (render, interaction, state management)
3. **Integration smoke test** for the end-to-end flow (can be manual for Phase 1, automated in later phases)

Specific test files to create:

| Phase | Test File | Covers |
|-------|-----------|--------|
| 1 | `components/PPGChat/__tests__/PPGChat.test.tsx` | Message rendering, send flow, streaming mock |
| 1 | `components/RawMaterialInput/__tests__/RawMaterialInput.test.tsx` | Submit, collapse, validation |
| 2 | `convex/__tests__/conversations.test.ts` | Create, append, getById, auth enforcement |
| 3 | `components/IdeaPicker/__tests__/IdeaPicker.test.tsx` | Search, select, format output |
| 4 | `lib/__tests__/ppgContext.test.ts` | Context bundle assembly, truncation, empty states |
| 6 | `components/DraftPreviewCard/__tests__/DraftPreviewCard.test.tsx` | Render, actions, character count |

Follow the existing test patterns: Vitest + React Testing Library, mock Convex hooks, mock fetch for API calls.

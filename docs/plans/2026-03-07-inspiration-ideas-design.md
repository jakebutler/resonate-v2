# Inspiration & Ideas Design

## Goal

Add a dedicated `Inspiration & Ideas` feature where a user can quickly capture thoughts that may later become blog posts or LinkedIn posts. The system must support both pure thoughts and source-backed insights. A source can be a podcast, article, YouTube video, Reddit post, or any other URL, but source attachment is optional.

The feature should ship web-first, while being explicitly designed so a Chrome extension and a future iOS share extension can reuse the same backend capture contract.

## Product Principles

- The atomic value is the user's thought, not the attached link.
- Ideas are not post drafts.
- A source is optional, singular, and contextual.
- Capture should be fast; enrichment must never block saving.
- The system should preserve the evolution of a thought over time.
- Ideas remain intact after spawning downstream posts.

## Validated Decisions

### Core model

- An idea is primarily a source-backed insight, but source attachment is optional.
- Pure thoughts and source-backed ideas live in one unified inbox.
- A note is required for capture.
- Shared URLs must require a note before saving.
- One idea may inspire many downstream posts.
- An idea should create new downstream posts rather than convert in place.

### Capture and organization

- Web app ships first.
- Chrome extension ships second.
- iOS share support comes later and may use a native share extension.
- Web capture defaults to `status = inbox`.
- Tags are freeform.
- Statuses are manual only: `inbox`, `reviewing`, `ready`, `used`, `archived`.
- The main Ideas page should be a fast capture box plus a chronological list.
- After successful capture on the web, stay on the page and clear the composer.

### Source behavior

- Source handling should be mostly uniform across content types.
- Metadata enrichment is shallow in v1: title + domain only.
- Metadata fetching is best-effort and non-blocking.
- One idea has at most one attached source.
- Source can be edited, replaced, or removed later.
- If a duplicate URL is detected, show an inline warning and allow either:
  - create a new idea anyway
  - append the new note to an existing matching idea
- For external share flows later, default toward append when a strong URL match exists.

### Browsing and promotion

- The list view represents one row/card per idea.
- Each list item should emphasize the latest user note, not the source.
- Idea detail should prioritize the thread of entries, with metadata around it.
- Search plus status filters are required in v1.
- Archived ideas are hidden by default and shown only when filtered.
- Creating a post from an idea should seed reference context, not auto-write a draft.
- Creating a post must not automatically change idea status.
- Ideas with linked downstream posts cannot be deleted; they must be archived instead.

## Irreducible Domain Model

### `ideas`

Represents the enduring insight container.

Suggested fields:

- `userId`
- `status`
- `tags: string[]`
- `sourceUrl?`
- `normalizedSourceUrl?`
- `sourceTitle?`
- `sourceDomain?`
- `latestEntryPreview`
- `lastCapturedAt`
- `createdAt`
- `updatedAt`
- `archivedAt?`

Notes:

- `latestEntryPreview` is a denormalized read model for list performance.
- `normalizedSourceUrl` powers duplicate detection.
- `archivedAt` is optional and only set when archived behavior needs explicit timestamps.

### `ideaEntries`

Represents a timestamped observation captured for an idea.

Suggested fields:

- `ideaId`
- `userId`
- `content`
- `createdAt`
- `captureChannel`

`captureChannel` values for now and later:

- `web`
- `extension`
- `ios_share`

This table exists because append-to-existing is a first-class workflow. A single mutable `note` field would lose chronology and make repeated captures from the same source much harder to reason about.

### `ideaPostLinks`

Represents downstream usage of an idea.

Suggested fields:

- `ideaId`
- `postId`
- `userId`
- `createdAt`

This table is preferable to a single embedded `derivedPostId` because one idea may legitimately inspire multiple posts over time.

## Architecture

## First principles

- Domain rules should not depend on the UI shell.
- Duplicate detection must behave the same across web, extension, and iOS.
- External capture surfaces should be thin clients over one backend contract.
- User ownership must be enforced in the data layer, not just in middleware.

### Backend shape

Use a separate `ideas` domain rather than trying to fit ideas into the existing `posts` table.

Recommended split:

- Convex stores the ideas domain and most domain logic.
- The web app can call Convex directly through the authenticated session.
- External capture clients should use a narrow authenticated API route that validates identity, normalizes URLs, checks duplicate matches, and then calls the same underlying idea mutations.

This preserves one ruleset while keeping the extension and future iOS client simpler.

### Auth and ownership

This feature should introduce proper user scoping in Convex.

Current risk:

- existing Convex `posts` and `settings` records are not user-scoped
- current route protection is primarily at the app/middleware layer
- this becomes unsafe once external capture surfaces are added

Required correction:

- add `userId` to new ideas tables
- enforce `userId` in every ideas query/mutation
- plan a follow-up migration to bring existing `posts` and `settings` into the same ownership model

### URL normalization

Normalization must be centralized and deterministic.

Suggested approach:

- trim whitespace
- parse URL safely
- lowercase hostname
- remove tracking parameters where appropriate
- normalize trivial trailing slash variance
- preserve enough structure to avoid collapsing genuinely distinct content

The exact normalization rules should be implemented in one shared utility and reused by all capture paths.

### Metadata enrichment

Metadata should be shallow and async.

Behavior:

- attempt to derive `sourceTitle` and `sourceDomain`
- never block idea creation on metadata fetch
- if enrichment fails, save the raw URL and move on

This avoids turning capture into a scraping problem.

## User Flows

### Web capture

The Ideas page should have a note-first composer:

- required note field
- optional URL field
- optional tags
- no status picker in the default fast path

On save:

- create a new `idea`
- create its first `ideaEntry`
- default `status` to `inbox`
- trigger non-blocking enrichment if URL exists
- clear the composer and keep the user on the page

### Duplicate handling

When a URL is entered and a duplicate is detected for the current user:

- show inline matching ideas immediately
- allow `Create new idea anyway`
- allow `Append to existing idea`

Append behavior:

- add a new `ideaEntry`
- update the parent idea's `latestEntryPreview`, `lastCapturedAt`, and `updatedAt`
- do not silently merge tags or status

### Ideas list

Default view:

- one item per idea
- newest activity first
- primary text = latest entry preview
- secondary source context if attached
- search input
- status filters
- archive hidden unless explicitly filtered

### Idea detail

Priorities:

- entry thread first
- metadata second

Editable elements:

- status
- tags
- source URL

Actions:

- append a new entry
- edit metadata
- create blog post from idea
- create LinkedIn post from idea
- archive
- delete only when no downstream links exist

### Post creation from idea

Creating a post should:

- spawn a new `posts` record
- create an `ideaPostLinks` record
- seed the new editor with the idea's entries and source as reference context

It should not:

- auto-generate finished copy
- auto-mark the idea as `used`
- destroy or convert the original idea

## Client Surfaces

### Web app

Add `Inspiration & Ideas` as a top-level peer to:

- Calendar
- Library

This should be a dedicated route and component set, not a sub-mode of the current content library.

### Chrome extension

v1 scope:

- toolbar popup
- current tab URL autofill
- manual URL paste/edit
- required note
- duplicate awareness
- default to append when strong duplicate match exists

Not required in v1:

- side panel
- right-click capture
- selected-text capture

### iOS share

Planned later.

Recommended direction:

- dedicated native share extension backed by the same authenticated capture API

Reason:

- more realistic path to reliable share-sheet UX than assuming a web-only share target will be sufficient

## Error Handling Rules

- If note is empty, reject capture.
- If URL is malformed but note is present, either store note alone or preserve raw URL if the parser can still retain user intent.
- If metadata enrichment fails, save anyway.
- If duplicate lookup fails, prefer saving normally rather than dropping the capture.
- If an idea has linked posts, block deletion and offer archive instead.
- If auth fails for external clients, fail clearly and require sign-in.

## Testing Strategy

### Domain tests

Cover:

- user scoping
- URL normalization
- duplicate detection
- create new idea with first entry
- append to existing idea
- archive vs delete rules
- idea-to-post link creation

### UI tests

Cover:

- fast capture flow
- duplicate warning rendering
- append vs create-new choice
- status filtering
- archive hidden by default
- idea detail thread rendering
- post creation from idea

### Later integration tests

Cover:

- authenticated extension capture via API route
- non-blocking metadata failure behavior
- duplicate handling parity between web and external clients

## Rollout Plan

### Phase 1: Web-first core

- add ideas tables
- add user ownership enforcement
- build Ideas route and components
- ship web capture, list, detail, search, status filtering, archive filtering
- ship create-post-from-idea flow

### Phase 2: Chrome extension

- add authenticated extension flow
- add popup-based capture using the shared backend contract

### Phase 3: iOS share

- evaluate native share extension backed by the same capture contract

## Key Risks

### 1. Data ownership drift

If ideas are user-scoped but posts/settings remain effectively global in Convex, the product will end up with inconsistent security boundaries.

### 2. Over-normalization

If URL normalization is too aggressive, distinct resources may be collapsed incorrectly. If too weak, duplicates become noisy.

### 3. Scope creep in enrichment

Trying to deeply parse podcasts, YouTube, Reddit, and article metadata in v1 will slow delivery and create brittle ingestion logic.

### 4. Forcing ideas into the post model

This would look faster initially but would produce long-term schema and UX debt.

## Recommended Implementation Bias

Keep v1 disciplined:

- web first
- note-first capture
- one source max
- shallow metadata
- manual statuses
- freeform tags
- one idea detail thread
- reference-seeded downstream posts

Do not add in v1:

- automatic status transitions
- deep source-specific schemas
- auto-written drafts from ideas
- multiple sources per idea
- heavy taxonomy/folder systems

## Ready for Implementation

The feature is now sufficiently specified to move into implementation planning.

Recommended next step:

1. create a concrete implementation plan
2. start with backend/user-ownership/schema changes before UI work
3. treat Chrome/iOS support as follow-on phases over the same capture contract

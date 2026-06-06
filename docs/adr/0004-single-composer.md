# ADR 0004: Single Composer Policy And Legacy Editor Retirement

Date: 2026-06-06

## Status

Accepted for the MVP validation phase.

## Context

Issue #7 requires that Resonate v2 not allow two competing composer components to survive in the MVP. The greenfield foundation (PR #20) layered a Postiz-compatible publishing spine on top of the tracked v1 app for parity, which left three composer-shaped entry points coexisting:

1. `components/PersistedPublishingPanel.tsx` — the v2 composer drawer used inside the persisted month/week calendar. Handles LinkedIn, Reddit, Corvo Blog, and planning channels through one shell. Owns Publishing Intent edits, approval transitions, schedule changes, and per-platform settings.
2. `components/V2ResonateApp.tsx` — the v1-parity research/AI tracer surface. Contains its own variant Accept/Reject flow that, when an Idea-derived variant was accepted, also created persisted publishing intents.
3. `components/BlogPostEditor.tsx`, `components/LinkedInPostEditor.tsx`, `components/FullScreenEditor.tsx` mounted at `/app/editor/[id]/page.tsx` — the v1 editors, kept in the repo for read-only parity during migration.

Until B.1, `app/v2/page.tsx` rendered both `PersistedPublishingPanel` and `V2ResonateApp` stacked on the same screen.

## Decision

There is exactly one canonical composer for Resonate v2 items: the composer drawer inside `PersistedPublishingPanel`.

- `PersistedPublishingPanel` owns all Publishing Intent edits, approval transitions, schedule changes, content edits, per-platform settings, and provider state surfacing for v2 items.
- `V2ResonateApp` is reduced to **research and AI scaffolding** (idea generation, draft variant exploration). When a variant is accepted there, control hands off to `PersistedPublishingPanel` — `V2ResonateApp` itself does not own Publishing Intent edits or approval transitions.
- `/app/editor/[id]` is **v1-parity read-only** post-merge. When the requested post has a corresponding row in `v2Posts`, the route redirects to the v2 composer (`/v2?postId=...`). For legacy `posts` rows only, the legacy editor still renders to preserve migration ergonomics.
- `/v2` renders only `PersistedPublishingPanel` as its primary surface. Research/AI flows live at `/v2/research` (sibling route) or in a tab inside the panel; the dual stacked render is removed in B.1.

## Consequences

- v2 has one place to learn for content authoring, approval, and scheduling.
- Per-platform settings (#7 AC), reschedule-after-PR (#15 AC), and authorization (#4 AC) all converge on one component, simplifying test coverage.
- Legacy `posts` rows remain editable through the v1 editor during the migration window so that no v1 historical content is stranded.
- After v1 cutover, the legacy editors and `/app/editor/[id]` can be removed entirely. This ADR records the deletion intent; the actual cleanup is gated on the cutover decision (Phase C.3).

## Implementation map

| Concern | Owner component | Notes |
|---|---|---|
| Capture / browse Ideas | `components/IdeasPage/IdeasPage.tsx` | brand-aware capture; spawns v2 Posts |
| Idea → variant generation | `components/V2ResonateApp.tsx` | accepts a variant, hands the resulting v2 Post off to the publishing panel |
| Research → claim → outline → long-form draft | `components/V2ResonateApp.tsx` + `/v2/research` | persists artifacts via `convex/v2Research.ts` |
| v2 Post composer drawer (LinkedIn, Reddit, Corvo Blog, planning) | `components/PersistedPublishingPanel.tsx` | Publishing Intent edits, approval, schedule, per-platform settings |
| Calendar (week/month) + filters | `components/PersistedPublishingPanel.tsx` | multi-select Brand/Platform/Status filters |
| Calendar item actions (approve, reschedule, cancel intent, submit, create PR) | `components/PersistedPublishingPanel.tsx` | gated by approval + routability |
| Provider attempts / audit | `components/PersistedPublishingPanel.tsx` | drawer surfaces `v2PublishAttempts` + `v2AuditEvents` |
| v1 legacy post editing | `components/BlogPostEditor.tsx`, `components/LinkedInPostEditor.tsx`, `components/FullScreenEditor.tsx` | migration-only; v2 posts redirect to v2 composer |

## Per-platform settings (deferred to B.2.A)

The v2 composer must collect and persist platform-specific settings before #7 can close:

- **LinkedIn:** call-to-action text, hashtag list, link-preview toggle.
- **Reddit:** subreddit, flair, NSFW/spoiler flags, sensitivity.
- **Corvo Blog:** canonical URL override, OG image, status flag override, category override.

These ride on a new `platformSettings` field on `v2Posts` (typed union by channel). Editing any platform setting clears approval, mirroring content-edit behavior.

## Validation

- `app/v2/page.tsx` renders one canonical surface (verified by test).
- `/app/editor/[id]` redirects v2 posts to v2 composer (verified by test).
- Per-platform settings clear approval when changed (verified by test in B.2.A).
- Date-only reschedule preserves approval (existing regression coverage).

# ADR 0005: Convex Is the Single Source of Truth for v2 Ideas, Drafts, and Posts

Date: 2026-06-06

## Status

Accepted.

## Context

A scrutiny audit on 2026-06-06 found that the `/v2` review surface ran on a split-brain
persistence model:

- `components/V2ResonateApp.tsx` (the `/v2/research` AI idea→draft surface) stored its **idea
  inbox and all draft variants in browser `localStorage`** (`resonate:v2:workspace`). Reloading
  on another device, or clearing storage, lost everything. It only wrote to Convex on "Accept
  variant" via a single `createPostWithIntent`, and that handoff failed silently.
- Meanwhile `convex/ideas.ts` already provided a complete, persisted captured-ideas backend
  (`list`, `create`, `appendEntry`, `spawnV2Posts`, `archive`, `remove`, `linkPost`) over the
  `capturedIdeas` / `capturedIdeaEntries` / `capturedIdeaV2PostLinks` tables — but it was only
  wired to the v1-parity surfaces (`/ideas`, `/editor/[id]`), not to the v2 review surface.

The result: the surface the user was asked to evaluate as "almost final" was the throwaway
prototype store, while the real persisted model sat unused. This made v2 impossible to evaluate
fairly against v1 (no cross-device state, silent data loss, demo-only behavior).

## Decision

Convex is the single source of truth for all v2 ideas, draft variants, and posts.

- The `/v2/research` idea inbox and draft-variant flows are migrated off `localStorage` and onto
  the persisted `capturedIdeas` model in `convex/ideas.ts`.
- Draft variants persist at generation time (tied to their idea), not only on accept, so a reload
  never loses work. Accept/reject changes status, not existence.
- `localStorage` (and equivalent client-only stores) may only hold **transient, unsaved form
  input** — never ideas, drafts, posts, schedules, approval, or provider state.
- There is one ideas model. The legacy workflow `ideas` table is merged into `capturedIdeas`
  (consistent with the prior migration decision); the `V2ResonateApp` local store is retired.

## Consequences

- Everything a reviewer sees survives reload and is consistent across devices and sessions.
- The AI idea→draft surface and the persisted calendar/composer share one backing model, so an
  idea captured on `/v2/research` and a post on `/v2` are the same data, not two copies.
- Tests and provisioning converge on the Convex path; the silent "accepted locally" degrade path
  is removed in favor of explicit, surfaced errors.
- Some `V2ResonateApp` state shapes (`V2WorkspaceState`, `loadState`/`saveState`) are deleted or
  reduced to view-model glue over Convex queries.
- This is hard to reverse once flows depend on server state, which is why it is recorded here.

## Validation

- `/v2/research` reads/writes ideas and draft variants through Convex; no idea/draft/post data is
  read from or written to `localStorage` (verified by test).
- A captured idea is visible on both `/v2/research` and the `/v2` calendar/composer without a
  second copy.
- Reloading the page preserves ideas and draft variants.

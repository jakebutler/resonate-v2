# ADR 0007: No Primary Ranking on Working-Set Ideas; Split/Merge Is a Pre-Save Edit

Date: 2026-09-08

## Status

Accepted (operator decision, 2026-09-08).

## Context

Two residuals from the campaign-loop audit were waiting on product calls:

1. **D-5 — `campaignIdeas.primary` is always `true` on add.** The field
   intended to distinguish campaign-primary ideas from merely linked ones, but
   every add path sets it, so it carries no information — while the UI copy
   ("campaign-primary") implies a ranking that does not exist.
2. **D-16 — no excerpt split/merge.** When segmentation gets an excerpt
   boundary wrong, operators could only mark the extract `unusable` (blocking
   it) or accept it as-is. There was no way to fix a usable-but-wrongly-bounded
   excerpt.

## Decision

### 1. Working-set ideas have no primary ranking — the concept is removed

The operator's call: never force an idea to be primary, never restrict which
ideas could be primary — incorporation guidance lives in copy and in the shape,
not in a status flag.

- `campaignIdeas` drops the `primary` field (schema and all write paths in
  `convex/campaigns.ts`).
- Product copy states the model directly: working-set ideas are equals, and
  the **shape's slots** carry the plan for how each idea is incorporated
  (CampaignSession add-flow toast, empty state, and intro copy).
- Many-to-many linking is unchanged: joining a second campaign links the idea
  and moves nothing.

### 2. Excerpt split/merge is a pre-save edit only

Split and merge are offered **only on the ingest review surface** — before an
immutable corpus version exists — per the operator's "pre-save only, keep it
simple" call:

- `ExcerptReviewList` gains an `editable` flag plus an `onExcerptsChange`
  callback. Split divides one excerpt at a blank-line boundary (parts inherit
  the source provenance); merge joins ≥2 **consecutive selected** excerpts
  (text joined with a blank line, first excerpt's provenance wins). A merge
  across a gap is refused with an inline error — gaps would silently swallow
  excerpts the operator deliberately left out.
- Index-keyed state (selection, sensitivity, correction flags) is remapped
  through every edit, so nothing silently attaches to the wrong excerpt.
- Saved corpus versions stay immutable: the post-save review surface
  (`CorpusExcerptReview`) does not set `editable`, so split/merge controls
  never render there.
- **Citation safety is inherited, not enforced:** pre-save excerpts cannot be
  cited yet (`corpus://…#excerpt-N` citations are only issued by saved
  versions), so "split/merge only while uncited" holds by construction. The
  post-save case is explicitly out of scope.

### 3. D-5 "in campaign" hint on the research surface — decided

The operator chose **Option B from the mockup**: quiet text (not a chip),
placed beside the flavor, capped at the first campaign name plus
"`+N more`", as a **static label** (no click-to-jump). The full campaign list
rides in the label's `title` attribute. Implementation lives on the campaign
session's research-inbox cards (`CampaignSession.renderIdeaCard`) — that
panel is the campaign loop's research-discovery surface. The standalone
`/research` page runs on the separate `capturedIdeas` system, which campaigns
never link into, so a hint there would never have data to show. The
"joining links it, nothing moves" explainer moved fully into the add-flow
toast, where the action actually happens. The mockup remains at
`prototypes/69-campaign-hint-mockup/index.html` as the decision record.

## Consequences

- No code path reads or writes `campaignIdeas.primary`; the misleading
  "campaign-primary" copy is gone.
- Mis-segmented usable excerpts are fixable at ingest time without an
  unblock/re-ingest cycle; corpus immutability is untouched.
- If post-save split/merge is ever wanted, it will need either a new immutable
  version or a reclamation of cited excerpt numbers — deliberately deferred.

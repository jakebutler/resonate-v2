# ADR 0006: Campaign Loop — Auto-Added CTA Links a Working-Set Idea, and Materialize Audits Unreviewed Citations

Date: 2026-09-07

## Status

Accepted.

## Context

Two spec questions from the campaign-loop audit (`docs/campaigns/2026-09-06-campaign-loop-spec.md`,
§9.1 and D-17) were previously unresolved and are now settled in code. This
record documents both resolutions so they stop resurfacing as open questions.

### 1. The auto-added CTA slot vs. strict slot completeness (§9.1, D-11)

The standard preset has no CTA slot, but the cohesion gate requires exactly
one (D-13). The gate's recommended default is to auto-add the CTA slot with an
explanatory note. That created a conflict with D-11: slot completeness is
re-checked at materialization, and an auto-added CTA with **no linked idea**
would be incomplete — so a batch that "passed" the gate could still be blocked
at materialize, and the operator would have to hand-link an idea the system
just invented.

### 2. The unreviewed-materialization warning (D-17)

Excerpts default to sensitivity `unreviewed`. Generation already refuses to
quote `internal-only` excerpts and only quotes accepted ones, but a batch could
still cite excerpts nobody has reviewed at all. The question was whether
materialization should block, warn, or ignore that fact.

## Decision

### 1. The gate's add-CTA auto-fix links the first working-set idea

`runCohesionGate` (`convex/cohesion.ts`) creates the CTA slot **with an
`ideaId` drawn from the campaign's working set** — the oldest `member` join by
`addedAt` — and composes the CTA draft from that idea's text and excerpt
citations. Because the slot is linked, the D-11 completeness re-check at
materialization (`countIncompleteSlots` / `isShapeComplete` in
`convex/queue.ts`) passes without operator intervention, and strict slot
completeness holds at materialize. The auto-fix is still logged with its
explanatory note (`created automatically…`), and the verification pass (D-13)
still re-runs the checks over the post-fix state, so a bad fix blocks instead
of reporting a false pass.

Alternatives rejected: changing the standard preset to include a CTA (loses
the locked preset compositions, #63); downgrading the CTA check to a warning
(weakens D-13's blocking guarantee).

### 2. Materialize warns (and audits) instead of blocking on unreviewed citations

`materializeDraftSet` (`convex/queue.ts`) resolves every citation on every
draft, counts those whose excerpt is still `unreviewed`, and:

- returns `unreviewedExcerptCount` to the caller, so the UI can surface the
  warning at the moment of action, and
- writes the count into the `campaign.materialize` audit event (summary and
  metadata), so the record of what went to the calendar carries the warning.

It does **not** block. Reviewing sensitivity is an excerpt-level editorial act
(D-17) with its own surface and audit trail (`corpus.excerpt_review`); blocking
the whole batch there would conflate set-level cohesion with excerpt-level
review, and the D-17 sensitivity filter already prevents the worst case
(never quoting `internal-only` material).

## Consequences

- The standard-preset flow is friction-free: gate run #1 auto-adds a complete,
  linked CTA slot and the batch can materialize without manual linking.
- The materialize audit trail answers "did we schedule unreviewed material?"
  for every batch, forever.
- `updateExcerptReview` writes `corpus.excerpt_review` audit events with the
  old → new sensitivity/review-state values, so D-17 flips are traceable.
- Tests: `convex/__tests__/cohesion.test.ts` (CTA auto-fix links a working-set
  idea), `convex/__tests__/queue.test.ts` (unreviewed warning count), and
  `convex/__tests__/excerptReview.test.ts` (audit coverage) pin this behavior.

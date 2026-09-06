---
date: 2026-05-26
type: hypothesis
title: Campaign-shaped batches need a cohesion gate, not a style guide
tags: [campaigns, cohesion, open-question]
---

## Hypothesis

A batch of posts derived from one source moves through a pipeline that
optimizes each post in isolation, so the batch reads as five strangers. A
cohesion check that scores the *set* — repeated framing, missing narrative
order, orphaned CTAs — will catch what per-post review structurally cannot.

## Proposed check

- Every post in the set must be classifiable as one of: pillar, satellite,
  hook, CTA, recap.
- The set must contain exactly one pillar and exactly one CTA.
- No two posts may open with the same framing sentence pattern.
- Each satellite must reference the pillar's core claim at least once.

## Status

Not yet run. Needs a real batch derived from one corpus before the check is
worth building. Next step is to hand-apply the checklist to the last batch we
shipped and see what it would have caught.

## Author judgment

Hand-applying first. If the checklist catches nothing on a batch we already
knew was weak, the idea is dead and the style guide was never the problem.

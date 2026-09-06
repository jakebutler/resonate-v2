---
date: 2026-05-12
type: experiment-result
title: Review comments convert cleanly into regression evals
tags: [hitl, evals, review-loops]
---

## Hypothesis

Human review feedback is usually treated as a one-time correction. If a review
comment can be converted into a durable eval case with mechanical effort, the
review loop becomes a training loop and repeat mistakes should trend to zero.

## Setup

- Rule: every review comment that names a concrete, checkable property gets
  converted into one eval case the same day. Comments like "make it punchier"
  do not qualify; "the CTA must name the waitlist, not the audit" does.
- Conversion cost logged in minutes.

## Result

- 18 qualifying comments in three weeks, 16 converted.
- Median conversion cost: 9 minutes.
- Repeat-mistake rate across drafts dropped from roughly 1-in-3 to 1-in-8 by
  week three.

## Author judgment

The 2 unconverted comments were both cross-cutting style preferences, which
belong in a voice profile, not an eval suite. The bottleneck is not writing
the case — it is noticing, in the moment, that a comment is checkable. The
review UI should prompt: "is this checkable?" before the reviewer types.

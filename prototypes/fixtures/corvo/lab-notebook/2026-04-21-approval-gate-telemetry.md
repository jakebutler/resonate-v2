---
date: 2026-04-21
type: experiment-result
title: Approval-gate telemetry — what reviewers actually catch
tags: [hitl, approval-gates, observability]
---

## Hypothesis

Human review in a publish pipeline is mostly believed to catch tone problems.
If that is wrong and reviewers actually catch *factual drift*, the approval
UI should foreground claim lineage instead of style hints.

## Setup

- Two weeks of live approvals on the content calendar, instrumented so each
  approval decision recorded: edit distance from draft, reason tag chosen by
  the reviewer, and time-to-decision.
- Reason tags: `tone`, `fact-drift`, `missing-context`, `wrong-channel`,
  `other`.

## Result

- 47 approvals reviewed.
- `fact-drift` was the top reason (21), then `wrong-channel` (11),
  `tone` (8).
- Median time-to-decision doubled when the reviewer had to open a second tab
  to verify a claim.

## Author judgment

We built the review screen for the failure mode reviewers rarely report. The
next iteration should show the claims and their sources inline, next to the
approve button. Time-to-decision is the metric to watch; if inline lineage
halves it, the hypothesis holds.

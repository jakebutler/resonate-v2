---
date: 2026-04-14
type: experiment-result
title: Eval harness v0 — gates beat prompt iteration
tags: [evals, harness, agentic-workflows]
---

## Hypothesis

Iterating on a single mega-prompt produces content that passes spot checks but
regresses silently. If we split the pipeline into testable components and gate
each one on a small eval suite, iteration speed stays flat while regression
rate drops.

## Setup

- Took the draft-generation step out of the mega-prompt and isolated it behind
  a narrow interface: idea in, three channel variants out.
- Wrote a 20-case eval suite: 12 "must keep" facts per idea, 5 tone checks,
  3 format checks per channel.
- Harness runs the suite on every candidate draft and writes a run log to
  `runs/` (see `eval-runs.csv` for the summary shape).

## Result

- Baseline (prompt roulette, 10 iterations): 4 of 10 outputs regressed a fact
  that an earlier iteration had right.
- With per-component gates (10 iterations): 1 of 10 regressed, and the harness
  named the failing case on every miss.

## Author judgment

The win is not accuracy, it is *explainability*. When the harness fails, it
points at a case. When the mega-prompt fails, we shrug. Treat AGENTS.md and
review feedback as documentation that feeds the eval suite, not as prose for
humans.

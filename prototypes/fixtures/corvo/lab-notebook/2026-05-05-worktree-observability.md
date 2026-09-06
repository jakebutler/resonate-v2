---
date: 2026-05-05
type: experiment-result
title: Worktree-local tracing makes agent runs debuggable
tags: [observability, harness, worktrees]
---

## Hypothesis

Shared tracing backends make agent debugging a queuing problem: you dump a run
ID into a search box and hope. If every agent run writes its trace into the
git worktree it ran in, debugging becomes file reading, and traces die with
the worktree instead of polluting a shared store.

## Setup

- Agent harness modified to emit one self-contained trace directory per run:
  prompt, tool calls, tool results, and final output, as plain files.
- No shared trace store. Cleaning up the worktree deletes the trace.

## Result

- 6 debugging sessions, 6 for 6 in finding root cause without leaving the
  worktree.
- Two of the six traces were immediately reusable as eval fixtures — the
  failing tool call became a test case.

## Author judgment

Ephemeral-by-default is the right default for traces and the wrong default for
evals. The promotion path (trace file → eval fixture) should be one copy
command, not a re-run.

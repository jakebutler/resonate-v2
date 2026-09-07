# Campaign Loop C1–C8 — Build Record

**Date:** 2026-09-07
**Scope:** Full implementation of `docs/campaigns/2026-09-06-campaign-loop-spec.md` §6 milestones C1–C8 (closed-loop: source → corpus → session → shape → draft set → review passes → materialize → approval queue), plus the lab CLI journey.
**Status:** All eight milestones implemented, tested, and merged to main via PRs #80–#87. **HITL validation on prod with Jake is pending** — checklist at the bottom.

## Evidence (unit + integration)

- Full suite at session end: **662 tests / 662 passing** (`npx vitest run`), typecheck clean, lint 0 errors, coverage thresholds unchanged (CI runs `vitest run --coverage` on every PR; all green).
- Convex-test suites cover auth + cross-brand authorization for every new public function (campaigns, corpora, shapes, draft set, cohesion gate, queue, lab import) — no function skips the identity/brand-access checks.
- Safety properties exercised by tests:
  - **Fail-closed grounding (D-21):** suggestions (C3) and draft-set generation (C5) refuse without explicit `mockAcknowledged`; live mode refuses outright (no provider wired — per Jake's standing instruction nothing calls a real model).
  - **Schedule ≠ approval:** materialize (C7) produces `status: scheduled, approvalState: unapproved` with `not-submitted` provider states; approval goes through the existing `publishing.setApproval` path only.
  - **Cohesion gate blocks materialization (D-13):** `queue.materializeDraftSet` refuses unless the latest `cohesionRuns` row passed. Auto-fixes (CTA add §9.1 default; opener regeneration) write explanatory notes.
  - **Immutable corpus versions (D-17):** insert helper is the only write path; post-save changes are review metadata only (sensitivity, accepted/excluded).
  - **Secret scan hard-fail (D-18):** server-side scan aborts the whole lab import; zero rows written (asserted).

## PR / merge record

| Milestone | PR | Scope |
|---|---|---|
| C1 foundation | #80 | 10 clean-name tables, provenance fields, fail-closed gate, shared corpus insert helper |
| C2 document ingest | #81 | /campaigns surface, upload/paste/link ingest, excerpt review, Flag & fix, corpus v1 |
| C3 campaign session | #82 | Session workbench, gated mock suggestions with citations, D-5/D-7 membership, reload survival |
| C4 shape | #83 | Seed/Standard/Deep presets (edit-preserving switch), slot editing, sequence, accept-blocks-on-incomplete |
| C5 draft set | #84 | Set-level placeholder generation, token highlighting, campaign provenance on posts |
| C6 review passes | #85 | EXP-020 cohesion gate (auto-resolve + block), SEO/AEO + humanizer placeholder surfaces |
| C7 approval queue | #86 | Gate-blocked materialize, scheduled-but-unapproved batch, inline review, next-draft flow, long-form → composer |
| C8 lab journey | #87 | CLI dry-run/import, secret hard-fail, skip+warn, post-import excerpt review, E2E spec |

## CLI verification against the real fixture (run in session)

```
$ node scripts/corpus-import.mjs prototypes/fixtures/corvo/lab-notebook --brand corvo --dry-run
Scanning folder… 8 file(s) found
  ✓ 2026-04-14-eval-harness-v0.md
  ✓ 2026-04-21-approval-gate-telemetry.md
  ✓ 2026-05-05-worktree-observability.md
  ✓ 2026-05-12-hitl-review-loop.md
  ✓ 2026-05-26-cohesion-gate.md
  ✓ eval-runs.csv
  ✓ experiments.json
  ⚠ board-sync-scratch.ipynb — SKIPPED — unsupported format (dirty warn)
Secret scan………… 0 findings (hard-fail if any)
Dry-run complete — 7/8 file(s) would import (1 skipped).
```

Seeded-secret folder hard-fails with exit 1 (verified in session).

## Pending HITL validation with Jake (on prod)

1. **C2:** upload the ReAct paper fixture on https://resonate.corvolabs.com/campaigns → review excerpts → confirm the mangled-table candidate is blocked → Flag & fix capture → save corpus v1.
2. **C3:** start campaign (title-only) → acknowledge mock mode → suggestions cite excerpts → accept/reject/undo → **reload → state intact**.
3. **C4:** switch presets → edits preserved; accept blocked until all slots linked; brief goal/audience saved.
4. **C5/C6:** generate draft set (mock ack) → tokens visible, all unapproved → run cohesion gate → CTA auto-adds with note → gate passes.
5. **C7:** materialize → scheduled-but-unapproved on the calendar → approve inline → next-draft auto-advance → fully-approved end state ("nothing submits automatically").
6. **C8:** `npx convex env set V2_OPS_SECRET` on prod → run the CLI against a real lower-db-style folder → dry-run → import → post-import review on /campaigns.
7. Record results in this file + close the follow-up issue.

## Notes / decisions recorded during build

- `campaignIdeas` joins `ideas` (spec §5); captured-inbox one-offs are surfaced by `searchSessionIdeas` over `ideas` (cross-brand scoped) — promotion of `capturedIdeas` rows can come later if wanted.
- §9.1 CTA/preset tension: gate auto-adds CTA slot with helper note (recommended default, unchallenged).
- §9.2 CLI post-import review: kept, as prototyped.
- §9.4 composer drawer depth on calendar rows: not built — prototype links out; queue links to the composer. Needs Jake's call before deeper work.
- Placeholder token guard: draft generation refuses if a composed draft lacks visible `[TOKEN:]` markers (no silent fabrication).

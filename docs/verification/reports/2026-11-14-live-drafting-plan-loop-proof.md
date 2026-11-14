# Live AI drafting + live plan loop proof — FreshProof — 2026-11-14

This report delivers the marketer re-score's #1 and #4 must-fix (art_bDYus9ld): the governed live loop — real AI campaign drafting under a declared budget ceiling, and the plan → seed-campaign-brief → campaign loop on real intel rows — was run LIVE against the FreshProof pilot brand for the first time and is evidenced here. It follows the established proof pattern (2026-11-14-main-live-proof.md, 2026-11-14-aeo-live-proof.md): dated report + committed evidence directory (the phase drivers and every receipt) + this sidecar note.

**Tested tree:** `verify/live-drafting-proof` at `origin/main` `29e5d9b` (includes wave-3 fixes #182–#189 and keyword-gap #188).

## Deployment

| Item | Value |
| --- | --- |
| Convex dev deployment | `precious-mole-481` (existing project dev deployment; functions pushed from this tree) |
| Run ceiling | `CAMPAIGN_DRAFT_RUN_CEILING_CENTS=100` declared before the drafting run |
| Drafting credentials | `OPENAI_API_KEY` on the deployment (Cortex gateway with its documented OpenAI-compatible fallback) |
| Auth | real Clerk dev session; Convex JWT minted for the current `e2e-test@corvolabs.com` user |

### Environment deviations (recorded honestly)

1. **No fresh isolated deployment.** A new isolated dev deployment could not be provisioned with the available `dev:` deploy key (the Convex CLI requires an interactive login or a project key to create deployments). The run used the existing `precious-mole-481` deployment, the same pattern as the #181 proof. Isolation within the deployment: a fresh campaign, a fresh corpus version, and a fresh answer-engine run, all owned by the current e2e user.
2. **A stale `SECRET_E2E_CLERK_USER_ID`:** Clerk's dev API 404s it; the current e2e user was identified from the dev-instance user list and tokens minted for it. Same finding as the main-live-proof report.

## Phase 1 — real crawl, corpus from real copy, campaign, shape (PASS)

Driver: `driver-phase1-setup.mts`; receipt: `phase1-receipt.json`.

| Step | Result |
| --- | --- |
| FreshProof target connected | `w9786jy4nzq2bz8650hg89phf58j7emr` |
| Real Firecrawl crawl of `https://freshproof.io` | 5 pages, snapshot `wx75kqvkjqdwgqg6hw24cdt38h8j71we` (v1, complete) recorded through the public `aeoIntel.recordCrawlSnapshot` |
| Grounded corpus | corpus `mh7772w6pbj0zngjs50d1dxbtn8j71s7` v4 — 10 excerpts built from the crawled page content (real site copy) |
| Campaign | `m57e1ac49ayhhja3bshyer60k58j7z7s` ("FreshProof verification push (live drafting proof)"), corpus attached |
| Ideas + working set | 5 suggested ideas (mode `acknowledged-mock` — the mock suggestion path, not a live LLM call), 5 added to the working set |
| Shape | `standard` preset accepted — shape `kx7bvcsm472n6f6ae5w39655x18j71ky`, 5 slots all linked (pillar/corvo-blog, hook/x, 3 satellites/linkedin incl. recap) |

### Discrepancy 1 — product gap: the capture action's poll loop has no delay (recorded, not fixed)

The product's own capture action (`aeoCrawl.captureCrawlSnapshot`) was tried first and failed live:

```
Error: Firecrawl crawl did not complete within 30 status polls; retry with a smaller limit.
    at handler (../convex/aeoCrawl.ts:74:11)
    [Request ID: 79f9e6bc7a4c93cf]
```

Root cause: `captureCrawlSnapshot` passes no `pollDelayMs`, so the adapter's 30 status polls run back-to-back and exhaust before a real crawl completes. This is the same root cause the #168 AEO proof recorded (its discrepancy 2); the #173 wave fixed the adapter's dedupe half, but the delay gap in the product action remains. Recorded verbatim in `phase1-receipt.json`. Not fixed here — a product-code change is outside this proof's scope; the proof proceeded through the same Firecrawl adapter with `pollDelayMs: 2000` and a real DNS resolver, which is the route #168 proved.

## Phase 2 — live AI draft generation (PASS) + budget refusal on real copy (PASS)

Driver: `driver-phase2-draft.mts` (generation), `driver-phase2-evidence.mts` (read-only dump); receipts: `phase2-refusal.json`, `phase2-receipt.json`.

### Refusal run (ceiling 10¢ against a 20¢ estimate — nothing spent, nothing written)

```
Uncaught Error: Live draft generation refused: generating 5 draft(s) is estimated at 20 cents,
above the 10-cent run ceiling (CAMPAIGN_DRAFT_RUN_CEILING_CENTS). Raise the ceiling and retry,
or generate in mock mode.
    at handler (../convex/draftGeneration.ts:328:11)
    [Request ID: 116c6c29214ad078]
```

The message matches `budgetRefusalMessage` exactly; budget admission is server-side before any dispatch.

### Live run (ceiling restored to the declared 100¢)

| Item | Value |
| --- | --- |
| Action | `draftGeneration.generateLiveDraftSet` — the user-triggered live path |
| Window | 2026-11-14T18:53:31.829Z → 18:53:41.633Z (~9.8 s) |
| Materialization | `mx7bx5xj034wm9b5pjcd507n8h8j6s0k`, mode `live` |
| Drafts | 5 generated + 1 cohesion-gate CTA = 6 posts, every one `unapproved` (L8 human gate) |
| Cohesion gate | run passed: all 4 checks green (`one-pillar`, `one-cta`, `unique-openers`, `satellites-reference-pillar`); autoFixLog records the CTA slot "not in initial generation; created automatically by the cohesion gate" |
| Grounding | drafts carry inline corpus citations into the real site-copy corpus, e.g. `[corpus://freshproof/mh7772w6pbj0zngjs50d1dxbtn8j71s7#excerpt-1]` and `#excerpt-2` in the pillar draft |

Sample of the real generated copy (pillar draft, verbatim from `phase2-receipt.json`):

> In an age where content accuracy is king, FreshProof emerges as a revolutionary tool that empowers writers to maintain editorial integrity by transforming their drafts into verified claims, complete with evidence and suggestions for modifications. Our campaign centers on an innovative animated example featuring a draft about the Eiffel Tower. Here, FreshProof effortlessly extracts factual claims, specifically correcting the erroneous completion year from 1899 to 1889, while cross-referencing with official historical records [corpus://freshproof/mh7772w6pbj0zngjs50d1dxbtn8j71s7#excerpt-2]. …

Budget receipt: declared ceiling 100¢ before the run; the server-side admission estimate for the accepted shape is 20¢ (5 slots × the 4¢/draft model); the refusal run's arithmetic states both numbers. Actual provider billing is usage-based on the OpenAI account and not observable from the application — the same disclosure as the prior proofs. No run hit its ceiling.

## Phase 3 — live plan loop on real intel findings (PASS)

Drivers: `driver-phase3-intel.mts` (inventory), `driver-phase3-plan.mts` (plan → brief → campaign); receipts: `phase3-intel.json`, `phase3-receipt.json`.

1. **Real intel findings.** The scheduled answer-engine batch (`answerEngine:runAnswerEngineBatch`, the exact function `convex/crons.ts` schedules daily, invoked live via the deploy-key CLI path — the same admin path the verification seed documents) ran against the connected FreshProof target: started 1, completed 1, failed 0, skipped 0. Run `ws70sbvnzg30eeka6dwaa3jd598j6pmv`, kind `answer-engine`, 6 questions, complete. All 6 findings are recorded with `source: "runner"` provenance — 1 gap, 5 opportunities, 5 cited, real brand-match verdicts (e.g. "What do users say about FreshProof?" → real answer text, `brandMatch: "match"`, extractability 43).
2. **Plan from real rows.** A strategy plan was composed whose every item cites REAL finding ids (`sourceFindingIdsAllReal: true` — the validator enforces `v.id("intelFindings")`, so fixture-free plans cannot exist): 1 gap item + 5 opportunity items. Saved through the append-only review flow — draft v1 `x175237q0gwwkkb2j9qd21246d8j6zxn`, then the accept action appended reviewed v2 `x179nw6z55am2pdp7c4rzzg8as8j643a` with the optimistic-concurrency `expectedVersion` guard.
3. **Seed campaign brief.** `shapes.saveBrief` — the exact call the PlanFlow UI makes — copied the plan's goal and audience onto the campaign. Readback via `getCampaignSession` confirms the brief fields landed: goal "Defend and extend the answer-engine visibility the live run observed for FreshProof." on campaign `m57e1ac49ayhhja3bshyer60k58j7z7s` — the same campaign that produced the live draft set, closing plan → brief → campaign → live drafts end to end.

## /verification sidecar

Not updated: the runner's sidecar shape (`docs/verification/<featureId>/latest.json`) is written only by manifest-feature runs (campaigns, smoke, image-generation); a narrative live-proof report has no featureId manifest, so the runner shape does not allow it. Consistent with the AEO live proof, which also left the sidecars untouched.

## Evidence directory

`docs/verification/reports/evidence/live-drafting-proof-20261114/`:

- `driver-phase1-setup.mts` — target connect, adapter crawl with DNS resolver + poll delay, snapshot record, corpus, campaign, ideas, shape.
- `driver-phase2-draft.mts` — the live drafting action (plus the `EXPECT_REFUSAL=1` refusal mode).
- `driver-phase2-evidence.mts` — read-only draft-set + cohesion verdict dump.
- `driver-phase3-intel.mts` — read-only intel run/finding inventory.
- `driver-phase3-plan.mts` — plan composition from real findings, append-only review, brief seeding, readback.
- `phase1-receipt.json`, `phase2-refusal.json`, `phase2-receipt.json`, `phase3-intel.json`, `phase3-receipt.json` — the receipts summarized above.

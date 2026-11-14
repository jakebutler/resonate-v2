# Consolidated live proof — campaigns, images, smoke — with the merged AEO/SEO proof — 2026-11-14

This report consolidates the live-proof run of the feature-verification workflow for the release build. Two workers split the scope: this branch (`verify/main-live-proof`) owns the campaigns walkthrough, the gated image qualification rerun, the smoke manifest, and the manifest runs on this tree; the parallel worker owned AEO/SEO, which landed separately and is consolidated here by reference (PR #168, `43fe2b2`). AEO spend is kept separate from image spend.

**Tested tree:** `verify/main-live-proof` rebased on `origin/main` through `9dbd74f` (PR #179) — includes the council-fix wave #169–#180 (#169 posts IDOR, #170 series approval signatures, #171 editorial single-article exception, #172 AEO backend robustness + plan seeding, #173 crawl dedupe/SSRF/snapshot-panel fixes, #174 series-review readability + revision guards, #175 /verification report surface, #177 proxy auth-bypass failsafe, #178 mismatch detection + audit depth, #179 real AI drafting) plus #176 (AEO UI) and #180 (E2E auth-bypass failsafe extension).

## Manifest results (on the tested tree)

| Manifest | Result | Dated evidence |
| --- | --- | --- |
| campaigns (Multi-post campaigns) | **6 PASS · 0 FAIL · 0 ABSENT · 0 UNPROVEN — READY** | `docs/verification/campaigns/2026-11-14.md` |
| smoke | **3 PASS · 0 FAIL · 0 ABSENT · 0 UNPROVEN — READY** | `docs/verification/smoke/2026-11-14.md` |
| image-generation | **6 PASS · 1 FAIL — NOT READY**: the live criterion (`live-route-qualification-receipt`) failed in all nine manifest-context attempts with the same transport error, while standalone gated packets pass 3-for-3 with identical command and environment. Analyzed below; recorded as an environment/robustness limitation, not a feature failure. | `docs/verification/image-generation/2026-11-14.md` |

The image-generation manifest's live criterion command runs under `npx --yes tsx` (the `.mjs` script imports TypeScript; plain `node` on Node 20 cannot execute it). A contract-placeholder resolution fix (`resolveContractCommandTokens`) lets keyed live criteria resolve `<dev-url>` / `<dir>` style tokens from operator environment values instead of executing documentation placeholders literally.

### Prerequisite disclosure (fail-closed design, not credentials)

The manifests' shell-level prerequisite presence checks accept any non-empty value. For the OpenAI-packet runs, `DIGITALOCEAN_INFERENCE_API_KEY` and `CORTEX_API_KEY` were set to the explicit marker value `not-required-for-openai-packet` — these are not credentials and were never used; the pinned packet's image and text credentials were already configured on the deployment. The real key used: `OPENAI_API_KEY`. The prerequisite design may deserve a review (presence-only checks cannot distinguish a real key from a marker).

## Deployment

| Item | Value |
| --- | --- |
| Convex dev deployment | `precious-mole-481` (existing project dev deployment; main-bundle functions pushed) |
| Verification seed | idempotent rerun reported `seeded: true, skipped: 2` |
| App | production Next.js build served locally; real Clerk dev session (instance `credible-gannet-1`) |
| E2E user | `e2e-test@corvolabs.com` / `user_3M4EgweJbjqzk7KFhtOcXrwwZCM` |

### Environment deviations (recorded honestly)

1. **Stale E2E user secret:** the configured `SECRET_E2E_CLERK_USER_ID` was stale — Clerk's dev API returned 404 for it. The dev-instance user list was inspected, the current e2e user ID was found, and sign-in tokens were minted for it.
2. **Dev-server binding:** launching the dev server without `--hostname 127.0.0.1` was required for the sandbox's render-proxy wiring; bound only to loopback, `/sign-in` hung. A production build (exit 0) served `/sign-in` with HTTP 200. This was an environment launch-flag interaction, not a product bug.
3. **Transient Convex auth race:** the first `/campaigns` load after sign-in failed once; reloading after the Clerk session was fully active loaded the page. The browser-minted Convex-template JWT was verified for issuer, audience, subject, and verified email.

## Campaigns — live walkthrough (browser, real Clerk session)

Campaign: `FreshProof review-digest push` (`m578re0sctgmkpm2zgbrg4tjzs8j7tqg`), FreshProof corpus v3 attached.

| Step | Mode | Result |
| --- | --- | --- |
| Sign-in | live (real Clerk dev session) | PASS |
| Campaign creation + corpus attach | live | PASS — FreshProof corpus v3 attached |
| Ideas → working set | live | PASS — five ideas added, linked one per slot |
| Shape acceptance | live | PASS — five-slot shape proposed and accepted |
| Draft generation | mock (explicitly acknowledged placeholder mode) | PASS — six-post placeholder draft set; the cohesion gate passed and automatically added the CTA post |
| Cohesion gate | live logic over placeholder drafts | PASS |
| Calendar materialization | live | PASS — six drafts added as scheduled-but-unapproved posts |
| Composer edit + visual planning | live | PASS — first plan was incomplete because the contract planner returned an article anchor with a case mismatch; after updating and saving the article so the anchor matched, replanning produced a complete visual plan |
| gpt-image-2 generation + edit | live (qualified route) | PASS — see Images section; in-app budget display showed $0.05 spent, $0.00 reserved after the edit |
| Hero export approval | live | PASS — after resolving a stale preview `loaded` flag (fixed by remounting the composer), alt text entered, review box checked, `Approve hero` → "Hero approval is saved." |
| Hero relevance confirmation | live | PASS — `publishing:getApprovalReview` surfaced the exact hold `Hero relevance review required`; the UI's "Confirm hero still fits this article" action cleared it |
| Post approvals (12 posts) | live | PASS — all 12 approved on the dev deployment. The pillar (blog post with visuals) required the strict composer path with matching article and visual signatures plus complete blog metadata (excerpt, tags, cover alt, uploaded hero, prepared hero) |
| Campaign-to-series bridge batch review | live | PASS — five social versions batch-approved; the pillar went through the strict composer path (see below) |

Evidence: `tc-1-campaign-flow.webm` (full flow recording), `tc-2-image-generation.webm` (focused generation/edit recording), `tc-2-generation-result.png` (generated image), `tc-3-series-batch-review.png` (batch review completion).

### Series batch review through the bridge

The campaign's posts were handed off to a FreshProof-branded series (1 article + 5 companions; six approved posts) and review packets were prepared through the bridge:

1. Packet `q177fr030e8qy1m5h1fer9rshs8j64gs` (6 selected): batch approval correctly disabled — the snapshot reported `Approval blocked: Review blog metadata: cover alt text, hero image, reviewed prepared hero` for the pillar (its hero metadata postdated the packet).
2. After completing the pillar's hero flow — cover alt saved, the approved 1600×900 WebP crop (133,578 bytes, under the 150 KB prepared-hero limit) uploaded as storage `kg2f6wxhdjtynphkqbc66p5n558j6vg2`, and the prepared hero generated (`1600×900 WebP · 133,122 bytes · centre`) — the pillar was re-approved through the strict composer path, restoring all 12 approvals.
3. Packets `q17cx5d62gam24g8m6egsaydeh8j6fev` (6 selected) and `q174ecq06qxbgkmr3jmv15va858j6nsk` (5 selected, pillar excluded): the five social versions batch-approved through the bridge — UI confirmed "Approved exactly 5 selected editorial versions. No dispatch or PR was requested."

**Superseded gap note:** during the walkthrough, the bridge's batch approval path called `applyEditorialApproval` without the article/visual review signatures, so visual-carrying blog posts could not be batch-approved (`assertReviewedApproval` rejected with "Review the current article and visual snapshot before final approval"). Main merged PR #170 (series approval signatures) after the walkthrough; that fix addresses this gap, and the strict composer path was the working approval route in the walkthrough itself. The gap as observed is recorded here for the walkthrough-era evidence trail only.

## Images — live

### Gated packet runs (gpt-image-2, main-bundle functions, `precious-mole-481`)

- Gate: approved — "Submission gate approved, operator token present, dev deployment resolved (packet budget $0.5, under the $5 provider caps)." Operator token deployment-matched (`VISUAL_QUALIFICATION_OPERATOR_TOKEN` read from the deployment's own env).
- Packet: `gpt-image-2` two-call functional sequence (generate + edit), caps $0.25/call, $0.50 sequence; $5 provider ledger caps. Successful runs: both calls HTTP 200 at 1536×1024.
- Dated receipt packet (executed at `2026-11-14T07:23:44.488Z`): generation request `req_559e5c503fa0465e8ff50d0c7894d670`, output sha256 `144af5b818eb…`, stored `kg2etrnn52vtppesq81vyf9zz18j7h7s`; edit request `req_0cabf0ce6cd24a3191d83784a9523ca4`, output sha256 `5f093fd7349e…`, stored `kg200dn2drsexn0s9h0rxr7ah98j7nks`; $0.0774 estimated spend; exit 0 in 44 s.
- Two independent post-rebase confirmations (`bisect1` at 11:29:00 UTC, `packet11` at 11:45:23 UTC): identical two-call HTTP 200 passes, $0.0774 estimated each, exit 0. One of them stored outputs as `kg21rdsmn78r5v8522cbpmmhs58j763v` / `kg2ctzmqkqewex5kd5q8yktpd58j7mqc`.
- Receipt: `docs/verification/receipts/2026-11-14-openai-image-editorial-visuals-functional-route-qualification-live-receipt.md`; qualification-run record: `docs/editorial-visuals/providers/qualification-runs/2026-11-14-live.md`.
- Qualified route registered on the deployment: image route `tn77gttfveszrvz47mrsef792x8j7swk` (30-day expiry), via `visualQualification:persistQualifiedRoutes`. No text route registered — the reflection follow-up is deferred with `reflection-route-unqualified` rather than represented as complete. (The registration helper exits with a cosmetic `client.close is not a function` error after registering; registration itself succeeds.)
- The packet's recorded output storage IDs serve as the capability receipt IDs cited in provenance.

### Manifest transport instability (the one failing criterion)

Inside full manifest runs on this sandbox, the live packet's child process repeatedly failed with `fetch failed` / `read ECONNRESET` after ~309–316 s — while the identical command, environment, deployment, and references passed standalone 3-for-3. This is a transport failure, not a qualification failure: the packet's Convex action call holds a single HTTPS request open for the action's full duration, and something in the sandbox's manifest-run context resets the connection.

Recorded observations (receipt log `docs/editorial-visuals/providers/qualification-runs/2026-11-14-live.md`, 13 entries):

- Manifest-context runs (`final2`–`final13` series, 9 attempts): all failed the live criterion with `fetch failed` / `read ECONNRESET`, exit 1 — most recently 10:46:07, 11:11:25, 11:34:01, 11:50:35, and 12:35:16 UTC (the last after a correct gate variable and a real packet launch, 445 s in).
- Standalone runs (identical chain from `run-visual-live-qualification.mjs` → `qualify-visual-routes.mjs`): 11:06:25, 11:29:00, and 11:45:23 UTC — all exit 0 with both calls HTTP 200.
- The 11:29:00 standalone pass (`bisect1`) ran with the **full manifest environment** exported; the 11:50:35 manifest-context failure (`final11`) began ~5 minutes after the 11:45:23 standalone pass. OpenAI-side latency cannot swing from ~2-minute completions to 300-second hangs on that cadence; the correlation is with spawn context (manifest runs execute the packet child via the verification runner's `runCommand` with piped stdio), not with provider behavior.
- The runner's `runCommand` path was inspected: it spawns children with the full environment and repo root cwd, stdin ignored, stdout/stderr piped; no timeout or environment filtering exists in that path.
- A delayed-response reproduction attempt (local 310-second hold server; identical `fetch` in a standalone child vs a `runCommand`-style spawned child) was inconclusive: the sandbox recycled the diagnostic sessions mid-hold twice (process start times shifted under observation), which is itself consistent with the sandbox pausing/restarting sessions — a plausible breaker of long-held connections.
- Failed calls are not treated as free: a client-side `ECONNRESET` does not establish whether the server-side action ran or incurred provider spend. The legacy OpenAI usage endpoint returned empty arrays for the day, which did not resolve it. Confirmed successful packet runs total ≈ $0.3096 estimated spend; failed-run spend is unverified and bounded by the packet's own $0.25/call cap.

**Status: UNPROVEN-with-explanation (final).** The live-route-qualification criterion has no passing verdict inside a full manifest run on this sandbox after nine attempts; the packet itself passes standalone with identical inputs. The bounded rerun budget is spent; no further attempts were made.

**Rerun disclosure (`final12`, invalidated):** a first bounded rerun returned "7 PASS · 0 FAIL — READY", but its own evidence shows the live packet never executed: the operator exported the wrong gate variable (`VISUAL_QUALIFICATION_APPROVED` instead of the gate's `VISUAL_LIVE_SUBMISSION`), the gate reported `outcome: unapproved` ("received no value"), and the harness exited 0 in dry-run mode — which the runner scores as a criterion PASS. That pass is **not** live proof (no provider calls, no spend) and is recorded here as invalid rather than claimed. It does expose a runner-semantics weakness worth a follow-up: a contract criterion whose command exits 0 via an explicit dry-run/skip path still counts as PASS.

**Corrected rerun (`final13`, final attempt):** launched 12:34:41 UTC with the proper `VISUAL_LIVE_SUBMISSION=approved`; the gate approved, the packet launched live (run entry 12:35:16 UTC), and it failed with the identical transport error after 445 s: `qualification failed: fetch failed (cause: Error: read ECONNRESET)`. 6 PASS · 1 FAIL · NOT READY. Recorded honestly as an environment/robustness limitation of long-lived fetches from spawned verification children in this sandbox — not a feature failure: the qualification gate, packet execution, receipts, and route registration all demonstrably work live (standalone 3-for-3, dated receipts committed).

## Smoke — live

The smoke manifest passed 3/3 on the tested tree with `OPENAI_API_KEY` present, including the `composer-live-receipt` criterion (live OpenAI smoke checks). Dated evidence: `docs/verification/smoke/2026-11-14.md`.

## AEO/SEO (live) — consolidated from the merged PR #168 proof

All six steps ran LIVE on the isolated Convex deployment `neighborly-bird-443` (worker branch `verify/aeo-live-proof`, squash-merged as PR #168 / `43fe2b2`, +353/−10; full detail in `docs/verification/reports/2026-11-14-aeo-live-proof.md` with 3 drivers and 9 screenshots under `docs/verification/reports/evidence/aeo-live-proof/`):

| Step | Mode | Result |
| --- | --- | --- |
| Connect FreshProof pilot target | live (browser, Clerk dev sign-in as the verified e2e user) | PASS — target connected to `https://freshproof.io`, review pinned |
| Firecrawl crawl + immutable snapshots | live (Firecrawl API via repo adapter) | PASS — real crawl recorded as immutable snapshot v1 `qh73md07v596xk3f2qzdxw1sa18j6c81`, status `complete` |
| Answer-engine visibility run | live (`answerEngine:runAnswerEngineBatch` — OpenAI-compatible fallback; Cortex gateway unavailable from the dev deployment) | PASS — run `ms73vpw9sgj9w061qz8h2f04558j6rhd`: 2/2 questions cited FreshProof, extractability 0.79 / 0.58, classification `opportunity` |
| Competitor discovery cycle + review queue | live (`competitorSuggestions:runDiscoveryBatch`) | PASS — run `ms71w1hpmtvw00xkb04q7sdw1n8j65xs`: 15 deduplicated suggestions; review UI walked with 2 accepted and 1 rejected with a recorded reason |
| Intel / competitors / gaps / plan surfaces | live | PASS — screenshots captured |

AEO estimated spend: **≈ 8¢** of the 100¢ combined run ceilings (4¢ visibility + 4¢ discovery; Firecrawl free-tier crawl). Kept separate from image spend.

**Currency caveat:** the AEO proof ran on code predating the later AEO council fixes (#172, #173, #178). Those PRs changed crawl snapshot page counts, dedupe behavior, and robustness — the merged report's two documented-not-fixed observations (snapshot panel showing 0 pages vs a 10-row comparison table; the crawl adapter double-counting 5 unique URLs as 10 rows across poll iterations) were addressed by #173's dedupe/snapshot-panel fixes on main. The AEO numbers above are cited as proven on their own branch as merged in #168; they were not re-verified against the newer main by this worker.

## Total spend (this worker)

| Item | Estimated spend | Cap |
| --- | --- | --- |
| Confirmed gated gpt-image-2 packet runs (4 × 2 calls) | ≈ $0.3096 ($0.0774 each) | $0.50 sequence |
| Campaign in-app generation + edit (qualified route) | $0.05 displayed in-app | provider ledger caps |
| Manifest-context packet attempts that ended in `ECONNRESET` | unverified (bounded by $0.25/call) | — |
| AEO/SEO (other worker, separate) | ≈ 8¢ | 100¢ combined |

No cap was hit. All figures are usage-derived estimates, not invoice figures.

## Live vs offline summary

| Feature | Live | Offline / mock |
| --- | --- | --- |
| Campaigns | creation, corpus, ideas, shape, cohesion gate, calendar, approvals, hero flow, batch review, image generation/edit | draft text (placeholder mode, explicitly acknowledged) |
| Images | gated gpt-image-2 qualification packet (generate + edit), qualified-route registration | reflection (no qualified text route — deferred) |
| Smoke | live OpenAI smoke checks | — |
| AEO/SEO | connect, crawl, visibility run, discovery + review queue | — |

## Evidence index

- `docs/verification/campaigns/2026-11-14.md`, `docs/verification/image-generation/2026-11-14.md`, `docs/verification/smoke/2026-11-14.md` — dated manifest evidence.
- `docs/verification/receipts/2026-11-14-openai-image-editorial-visuals-functional-route-qualification-live-receipt.md` — packet receipt.
- `docs/editorial-visuals/providers/qualification-runs/2026-11-14-live.md` — qualification-run record (all 13 packet attempts, passes and transport failures).
- `docs/verification/reports/evidence/main-live-proof/` — this worker's screenshots and recordings. The original walkthrough captures were 1280×577, below the evidence platform's 720 px shorter-edge minimum (upscaling is not permitted); the persisted walkthrough state on dev deployment `precious-mole-481` was therefore re-captured at 1440×900 (2880×1800 actual) against a UI rebuilt from this branch with the real deployment URL and a real Clerk dev session (re-established via a minted single-use sign-in token): `tc-1-campaigns-freshproof.png` (campaign + corpus list), `tc-1-campaign-session.png` (campaign working set), `tc-2-composer-visuals-recap.png` (composer Editorial-visuals section showing the qualified `openai · gpt-image-2-2026-04-21` route and $0.05 spent / $0.00 reserved / $5 limit), `tc-3-series-batch-review-recap.png` (five approved companions + approved pillar, nothing queued), plus a fresh flow recording `tc-1-campaign-flow-recap.webm` (sign-in → campaigns → FreshProof → campaign session). The original 1280×577 captures are retained for provenance. Disclosure: the original image-generation recording (`tc-2-image-generation.webm`, 14.1 MB, also below the QA minimum) was accidentally overwritten by a stale recording session during re-capture; the generation result itself is preserved in `tc-2-generation-result.png` and the composer state in `tc-2-composer-visuals-recap.png`.
- `docs/verification/reports/2026-11-14-aeo-live-proof.md` + `docs/verification/reports/evidence/aeo-live-proof/` — AEO worker's report and evidence.

## Addendum — bounded reruns (`final12` / `final13`)

The report body carries the full account; this addendum is the dated sequence:

1. **`final12` (launched 12:24 UTC, completed 12:33 UTC):** manifest reported 7 PASS · 0 FAIL · READY — **invalid as live proof**. The operator exported `VISUAL_QUALIFICATION_APPROVED` but the gate reads `VISUAL_LIVE_SUBMISSION`; the gate outcome was `unapproved` and the packet ran in dry-run mode (exit 0, no provider calls, no spend). The runner scored the dry-run exit as a criterion PASS. Its dated evidence was superseded by `final13`'s run.
2. **`final13` (launched 12:34:41 UTC, completed ~12:46 UTC):** correct gate variable; gate approved; live packet launched at 12:35:16 UTC; failed with `qualification failed: fetch failed (cause: Error: read ECONNRESET)` after 445 s. Manifest: 6 PASS · 1 FAIL · NOT READY. This is the recorded, dated final state of the image-generation manifest on this sandbox.

Diagnosis stands: a transport-level failure specific to manifest-context (spawned) packet executions in this sandbox — 0/9 manifest-context successes versus 3/3 standalone successes with identical command, environment, deployment, and references. Suggested follow-ups outside this task's scope: (a) the runner should not score an explicit dry-run/skip exit as a criterion PASS; (b) the packet could use Convex's `flow`/async action API or a resume-token pattern instead of holding one HTTPS request open for the action's full duration.

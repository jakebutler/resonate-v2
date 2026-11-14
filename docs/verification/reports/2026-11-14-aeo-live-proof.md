# AEO/SEO live proof — 2026-11-14

Worker: `verify/aeo-live-proof` (AEO scope; the parallel `verify/main-live-proof` worker owns campaigns and image generation). Base: `origin/main` at `b5ea7d3` (PRs #141, #142, #166, #167 merged). Isolation: own git worktree, own Convex dev deployment, own report/evidence paths only.

## Deployment

| Item | Value |
| --- | --- |
| Convex dev deployment | `neighborly-bird-443` (reference `dev/aeo-proof-20261114`, team `jake-butler`, project `resonate`) |
| Functions pushed | `convex dev --once` at 2026-11-14 07:55 UTC, functions ready (23.49 s) |
| Verification seed | `verificationSeed:seedVerificationWorkspace` → `seeded: true, corpusCreated: true, budgetCreated: true, skipped: 0`, subject `user_ci_verification`, brand `freshproof` |
| Gates | `ALLOW_VERIFICATION_SEED=1`, `AEO_ANSWER_ENGINE_ENABLED=1`, `AEO_DISCOVERY_ENABLED=1`, `AEO_DISCOVERY_LIVE_APPROVED=approved`, `CLERK_JWT_ISSUER_DOMAIN=credible-gannet-1.clerk.accounts.dev` |
| Provider keys | `FIRECRAWL_API_KEY`, `OPENAI_API_KEY` set on the deployment (dev only) |
| App | Next.js production build against `NEXT_PUBLIC_CONVEX_URL=https://neighborly-bird-443.convex.cloud`, Clerk dev instance `credible-gannet-1`, allowlist `RESONATE_ALLOWED_EMAILS=e2e-test@corvolabs.com` |

## Budget caps declared before spending

| Run | Cap | Estimated spend |
| --- | --- | --- |
| Answer-engine visibility run | 50¢ run ceiling (`AEO_ANSWER_ENGINE_RUN_CEILING_CENTS` default) | 6 questions × 2¢ = 12¢ |
| Competitor discovery cycle | 50¢ run ceiling (`AEO_DISCOVERY_RUN_CEILING_CENTS` default) | 4 queries × 2¢ = 8¢ |
| Firecrawl crawl | free-tier crawl of the pilot target | — |

## Provisioning deviations (recorded honestly)

1. **Deployment selection:** the repo's pinned `convex` CLI (1.32.0) ignores the selected deployment for `env`/`run` commands and silently targets the project's default dev deployment. The first env sets and seed call landed on the shared CI dev deployment `precious-mole-481` before this was noticed. Impact assessed as benign: `ALLOW_VERIFICATION_SEED=1` and the AEO gate flags are exactly what CI itself sets on that deployment (`.github/workflows/feature-verification.yml`), and the seed returned `skipped: 2` (idempotent, created nothing). All subsequent commands used Convex CLI 1.50.0 on Node 22, which honors the selection; everything from the functions push onward is verified on `neighborly-bird-443` (each `env set` output names the target deployment).
2. **Seed path:** `scripts/seed-verification.mjs` requires a `CONVEX_DEPLOY_KEY`; deploy keys cannot be minted via the CLI, so the seed mutation was invoked through the authenticated CLI (`npx convex run verificationSeed:seedVerificationWorkspace …`) after `ALLOW_VERIFICATION_SEED=1` was confirmed on the deployment. Same gate, same internal-only mutation, same synthetic subject.

## Step log (live vs offline)

| Step | Mode | Result |
| --- | --- | --- |
| Provisioning + seed | live (Convex cloud) | PASS — see Deployment |
| Connect FreshProof pilot target | live (browser, Clerk dev sign-in as verified `e2e-test@corvolabs.com` / `user_3M4EgweJbjqzk7KFhtOcXrwwZCM`) | PASS — target connected to `https://freshproof.io`, review pinned. Screenshots: `tc-1-home-signed-in.png`, `tc-2-aeo-connect-connected.png`, `tc-3-aeo-review-pinned.png` |
| Firecrawl crawl + immutable snapshots | live (Firecrawl API via repo adapter `firecrawlCrawl`) | PASS — real crawl of `https://freshproof.io` (limit 5, 2 s poll interval); snapshot `qh73md07v596xk3f2qzdxw1sa18j6c81` v1 recorded via authenticated `recordCrawlSnapshot`, status `complete`. Pages captured (unique URLs): `/`, `/blog`, `/pricing`, `/terms`, `/sitemap.xml` |
| Answer-engine visibility run | live (`convex run answerEngine:runAnswerEngineBatch` — OpenAI-compatible fallback; Cortex gateway unavailable from the dev deployment) | PASS — run `ms73vpw9sgj9w061qz8h2f04558j6rhd`, status `complete`, 2 questions, ceiling 50¢. Findings: both questions `cited` (FreshProof), classification `opportunity`, extractability 0.79 ("Would you recommend FreshProof?") and 0.58 ("What is FreshProof and what does it do?"). Visible on `/aeo/intel` with quoted answers |
| Competitor discovery cycle + review queue | live (`convex run competitorSuggestions:runDiscoveryBatch`) | PASS — run `ms71w1hpmtvw00xkb04q7sdw1n8j65xs`, status `complete`, proposed 15 deduplicated suggestions. Review UI walked as the e2e user: accepted `slickwrite.com` and `gingersoftware.com` (now Confirmed), recorded a rejection for `prowritingaid.com` with reason "Not a competing product for FreshProof's verification niche". Screenshots: `tc-4-competitors-review-queue.png`, `tc-5-competitors-after-review.png`, `tc-6-competitors-reject-recorded.png` |
| Screenshots (connect/intel/competitors/gaps/plan) | live | PASS — all five surfaces captured, including `tc-7-intel.png`, `tc-7-gaps.png`, `tc-7-plan.png` |

## Findings from the live runs

Answer-engine run `ms73vpw9sgj9w061qz8h2f04558j6rhd` (2 findings, both `unreviewed`):

| Question | Citation | Extractability | Classification |
| --- | --- | --- | --- |
| Would you recommend FreshProof? | cited | 0.79 | opportunity |
| What is FreshProof and what does it do? | cited | 0.58 | opportunity |

Competitor comparison on `/aeo/intel`: FreshProof Target 10 pages / 2 citations; slickwrite.com 0/0; gingersoftware.com 0/0.

## Discrepancies observed (recorded, not fixed — outside this task's scope)

1. **Crawl snapshot panel page count:** `/aeo/intel`'s "Crawl snapshots" section shows `v1 — 0 pages crawled` while the competitor-comparison table on the same page shows 10 pages for the FreshProof target. The snapshot's stored `pageCount` is 10.
2. **Page-count double-counting:** the `firecrawlCrawl` adapter's poll loop appends every poll's full page list, so the 5 unique crawled pages are recorded as 10 page rows (each URL appears twice). The deduplicated URL set above is the real crawl result.
3. **Question count:** both runs planned 2 questions (not the 6 estimated in the budget table) — `buildAnswerEngineQuestions` produced 2 questions for the FreshProof brand set, so estimated spend per run is lower than declared.

## Provider errors (verbatim)

All encountered errors were resolved; none blocked the proof. Recorded verbatim:

1. Convex JWT minted via the Clerk **backend** API (`POST /v1/sessions/{id}/tokens`, template `convex`) lacks the `aud: "convex"` claim; Convex refused it:
   `"No auth provider found matching the given token. Check that your JWT's issuer and audience match one of your configured providers: [OIDC(domain=https://credible-gannet-1.clerk.accounts.dev, app_id=convex)]"`
   Resolution: mint the token from the signed-in **browser** session (`window.Clerk.session.getToken({ template: 'convex' })`), which carries `aud: "convex"` and `azp: http://localhost:3000`.
2. First crawl attempt (no poll delay): `"Firecrawl crawl did not complete within 30 status polls; retry with a smaller limit."` (`crawlStatus: "incomplete"`, `pageCollectCount: 0`). Resolution: passed `pollDelayMs: 2000` (the driver had been polling with 0 delay, exhausting 30 polls instantly). The crawl job itself had been accepted and completed on the second attempt.
3. Driver-side adapter refusals before explicit approval was set (expected fail-closed behavior): `"Live provider validation requires explicit approval."` — resolved by passing `liveProviderValidationApproved: true` to the adapter context, as the brief authorizes live calls on the dev deployment.

## Total spend

| Run | Questions | Estimated spend | Ceiling | Status |
| --- | --- | --- | --- | --- |
| Answer-engine visibility | 2 | 2 questions × 2¢ = 4¢ | 50¢ | complete |
| Competitor discovery | 2 | 2 queries × 2¢ = 4¢ | 50¢ | complete |
| Firecrawl crawl | — | free-tier crawl of the pilot target | — | complete |
| **Total estimated** | | **≈ 8¢** | **100¢ combined** | |

Actual provider billing is usage-based on the OpenAI account and not observable from the application; the recorded estimates use the repo's `planAnswerEngineRun` 2¢/question model. No run hit its ceiling.

## Evidence files (this directory)

- `driver-crawl.mts` — authenticated crawl driver (browser-minted Convex JWT + Firecrawl adapter + `recordCrawlSnapshot`).
- `driver-query.mts`, `driver-runs.mts` — evidence queries (crawls, runs, findings).
- `tc-1-home-signed-in.png` … `tc-7-plan.png` — nine surface screenshots as listed in the step log.

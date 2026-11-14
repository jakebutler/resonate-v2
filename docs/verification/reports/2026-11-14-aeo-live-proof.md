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
| Connect FreshProof pilot target | pending | — |
| Firecrawl crawl + immutable snapshots | pending | — |
| Answer-engine visibility run | pending | — |
| Competitor discovery cycle + review queue | pending | — |
| Screenshots (connect/intel/competitors/gaps/plan) | pending | — |

## Provider errors (verbatim)

None recorded yet.

## Total spend

Recorded at the end of the run.

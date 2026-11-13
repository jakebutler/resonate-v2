# Verification seed (CI)

Bootstrap the rows a feature-verification run needs on a **dev** Convex deployment — no human session, no Clerk identity.

Do **not** run this against the production Convex deployment (`healthy-platypus-553`). The mutation refuses it outright; the script also refuses locally before invoking anything.

## What it creates

| Fixture | Purpose |
| --- | --- |
| All brands + channels | Same rows `seedMvpWorkspace` writes |
| Owner memberships | One per brand for the seed subject (default `user_ci_verification`) |
| 1 corpus version | For the target brand (default `freshproof`), one document, one accepted, public-safe excerpt |
| 1 budget row | `v2VisualBudgets` at the default $5 provider cap — without it `reserveAttempt` throws "Reservation budget is missing" |
| Rollout flag | `EDITORIAL_VISUALS_ENABLED=1` on the dev deployment (the `NEXT_PUBLIC_` twin is a Vercel env var, provisioned on the platform) |

## Gates (fail-closed)

1. `ALLOW_VERIFICATION_SEED=1` must be set on the **dev** deployment: `npx convex env set ALLOW_VERIFICATION_SEED 1`. The script checks this before running and names the fix.
2. The production deployment is refused by the mutation itself (`seedVerificationWorkspace`), same as `seedPreviewWorkspace`.
3. The mutation is **internal-only**: it is unreachable from the internet except through a caller holding the deployment's deploy key. CI holds `CONVEX_DEPLOY_KEY` as an ops secret — the same pattern `/api/ops/lab-import` uses with `V2_OPS_SECRET`. No user identity exists on this path; rows are owned by the synthetic `subject`.

## Idempotency

Rows that would duplicate on a re-run — the corpus version and the budget row — are keyed through `v2MigrationRecords` with `legacyTable: "verificationSeed"` (scoped per subject, like `previewSeed`). Brand/channel/membership rows are existence-checked per call, like `seedMvpWorkspace`. An operator-set budget row is never clobbered. Re-running reports `skipped` counts and creates nothing.

## Run

```bash
# CI (or locally): the deploy key of the DEV deployment
CONVEX_DEPLOY_KEY=<dev-deploy-key> node scripts/seed-verification.mjs

# Options
node scripts/seed-verification.mjs --subject=user_ci_verification --brand=freshproof
node scripts/seed-verification.mjs --dry-run          # report what would be created, write nothing
node scripts/seed-verification.mjs --skip-env-flags   # leave EDITORIAL_VISUALS_ENABLED untouched
```

One-time provisioning of the dev deployment:

```bash
npx convex env set ALLOW_VERIFICATION_SEED 1   # dev deployment only
```

The verification workflow (CI) calls this script before running feature criteria; its seeded subject owns every row a verification run reads.

# Preview sandbox seed

Minimal Convex fixtures for **localhost** and **Vercel Preview** when the shared dev deployment is empty or you need predictable calendar/composer examples.

Do **not** run this against the production Convex deployment (`healthy-platypus-553`). Production already has live operator data; the seed is only for the dev/preview sandbox paired with Clerk development keys.

## What it creates

| Fixture | Purpose |
| --- | --- |
| All brands + channels | Same as `seedMvpWorkspace` |
| 1 captured idea | Harness-engineering note adapted from prod snapshot |
| 3 scheduled posts | Two Corvo LinkedIn items on the same day (busy-dot UI), one Corvo blog draft with metadata for composer/Preview checks |

Dates are relative to the seed run (`dayOffset` 1 and 3), so calendar cells stay populated without manual rescheduling.

Idempotency uses `v2MigrationRecords` with `legacyTable: "previewSeed"`. Re-running skips existing fixtures.

## Run

```bash
# 1. Deploy functions to your dev deployment
npx convex dev   # or deploy once with CONVEX_DEPLOY_KEY for preview

# 2. Seed while authenticated as your Clerk dev user
npx convex run publishing:seedPreviewWorkspace "$(node scripts/seed-preview.mjs)" \
  --identity '{"subject":"user_3ATLtcH9lcXKLMfIj9AxHXvpAR9"}'

# Dry-run counts only
npx convex run publishing:seedPreviewWorkspace "$(node scripts/seed-preview.mjs --dry-run)" \
  --identity '{"subject":"user_3ATLtcH9lcXKLMfIj9AxHXvpAR9"}'
```

Or paste `{ "dryRun": false }` into the Convex dashboard → `publishing.seedPreviewWorkspace`.

## Env pairing

| Surface | Convex URL | Clerk keys |
| --- | --- | --- |
| Production (`resonate.corvolabs.com`) | `healthy-platypus-553` | `pk_live` / prod secret |
| Local + Preview | Dev deployment from `npx convex dev` | `*_DEV` vars in `.env.local` or Vercel Preview env |

See `.env.local.example` for the dev/prod split.

## Extending

Edit `convex/previewSeedData.ts` and add rows with new `legacyId` keys. Keep the set small; import more prod-shaped examples over time as parity cases appear.

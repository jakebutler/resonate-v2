# v1 Ideas Import (post-cutover)

After you archive v1 Convex data, import captured ideas into v2 `capturedIdeas` so `/v2/research` and spawn flows can use real history instead of demo seeds.

## Source data

Use your full Convex backup (ZIP export). The existing conversion pipeline already maps v1 tables:

| v1 table | v2 target |
| --- | --- |
| `capturedIdeas` + `capturedIdeaEntries` | `capturedIdeas` + `capturedIdeaEntries` |
| legacy workflow `ideas` | `capturedIdeas` (merged inbox) |

Posts/drafts import remains a separate gated step (`scripts/v2-migration-dry-run.mjs` → future `importV1Posts`).

## Operator workflow

```bash
# 1. Convert export to normalized JSON (ZIP or unpacked snapshot directory)
node scripts/convert-convex-export-to-v1-json.mjs \
  --unpacked docs/v1-legacy-data/snapshot_healthy-platypus-553_1780767659398368636 \
  --out /tmp/resonate-v1-export.json

# Or from a ZIP:
# node scripts/convert-convex-export-to-v1-json.mjs \
#   --zip /path/to/resonate-v1-backup.zip \
#   --out /tmp/resonate-v1-export.json

# 2. Build migration plan (dry-run, no writes)
node scripts/v2-migration-dry-run.mjs \
  --input /tmp/resonate-v1-export.json \
  --out /tmp/resonate-v1-migration-plan.json \
  --brand corvo

# 3. Review plan counts and samples in the JSON output

# 4. Generate Convex mutation payload
node scripts/v2-import-ideas.mjs --plan /tmp/resonate-v1-migration-plan.json --dry-run

# 5. Run import (authenticated as the target Clerk user)
npx convex run v2Migration:importV1Ideas "$(cat /tmp/import-live.json)" \
  --identity '{"subject":"user_YOUR_CLERK_ID"}' --prod

# Or Convex dashboard → Functions → v2Migration.importV1Ideas
# Paste the `ideas` array from step 4 with dryRun: false
```

## Idempotency

`v2Migration.importV1Ideas` writes a `v2MigrationRecords` row per legacy ID (`legacyTable` + `legacyId`). Re-running the import skips already-imported ideas.

## What this does not do yet

- Import v1 `posts` into `v2Posts` (planned follow-up mutation)
- Replace `/v2/research` localStorage ideas — imported ideas live in Convex `capturedIdeas` and surface through the persisted ideas API (`convex/ideas.ts`), not the browser-only demo state

## Acceptance checks

- [ ] Imported idea count matches `v2IdeaCandidates` in the migration plan
- [ ] Ideas visible in Convex dashboard (`capturedIdeas` table) for your Clerk user ID
- [ ] Spawn-from-idea creates `v2Posts` without "Channel not found" errors

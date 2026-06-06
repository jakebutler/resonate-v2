# Real v1 Migration Dry-Run Summary

Date: 2026-06-06  
Work unit: B.3 (issue #16 / tracker #21)

## Source

- v1 Convex deployment: `healthy-platypus-553` (production, shared v1+v2 project)
- Export method: `npx convex export` using production `CONVEX_DEPLOY_KEY` from Vercel (`resonate` project)
- Raw export artifact: kept locally only (`/tmp/resonate-v1-backup-2026-06-06.zip`); not committed

## Raw table counts

| v1 table | rows |
| --- | ---: |
| `posts` | 3 |
| `capturedIdeas` | 10 |
| `capturedIdeaEntries` | 10 |
| `capturedIdeaPostLinks` | 0 |
| `ideas` (workflow board) | 0 |
| `workflowDrafts` | 0 |
| `settings` | 0 |

## Dry-run result

Command:

```bash
node scripts/convert-convex-export-to-v1-json.mjs \
  --zip /tmp/resonate-v1-backup-2026-06-06.zip \
  --out /tmp/resonate-v1-export.json

node scripts/v2-migration-dry-run.mjs \
  --input /tmp/resonate-v1-export.json \
  --out docs/archive/resonate-v1-migration-dry-run-2026-06-06.json \
  --brand corvo
```

| metric | value |
| --- | ---: |
| raw records archived | 23 |
| v2 post candidates | 3 |
| v2 idea candidates | 10 |
| imported | 13 |
| skipped | 0 |
| ambiguous | 0 |
| failed | 0 |
| warnings | 0 |

### Post candidate breakdown

| channel | status | count |
| --- | --- | ---: |
| `corvo-blog` | `scheduled` | 2 |
| `linkedin` | `draft` | 1 |

Both scheduled blog posts carry GitHub PR URLs (`providerState: github-pr`). The LinkedIn draft has schedule metadata but no PR or external URL yet.

### Idea candidate breakdown

- 10 captured ideas → 10 v2 `capturedIdeas` candidates (all `inbox`)
- 2 ideas include `sourceUrl`; none linked to legacy posts via `capturedIdeaPostLinks`
- No workflow-board `ideas` or `workflowDrafts` rows in production export

## Assessment

The migration path handles the live production corpus cleanly: zero skips, zero ambiguous published rows, and no workflow-merge edge cases in this snapshot (workflow tables are empty).

Full dry-run report with raw post bodies remains in `docs/archive/` locally and is gitignored. Review that file before approving a live import.

## Next step

Live import remains a separate gated step after operator review. Proceed to B.4 (Buffer live submission).

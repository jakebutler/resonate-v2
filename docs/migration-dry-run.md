# Resonate v1 to v2 Migration Dry Run

Date: 2026-06-06

This is the issue #16 migration path for MVP validation. It archives raw v1 records and produces v2 import candidates without writing to Convex.

## Inputs

Export v1 Convex tables into one JSON object:

```json
{
  "posts": [],
  "capturedIdeas": [],
  "capturedIdeaEntries": [],
  "capturedIdeaPostLinks": [],
  "ideas": [],
  "workflowDrafts": [],
  "settings": []
}
```

The source tables come from the v1 checkout at `/Volumes/rexy/GitHub/resonate`:

- `posts`
- `capturedIdeas`
- `capturedIdeaEntries`
- `capturedIdeaPostLinks`
- `ideas`
- `workflowDrafts`
- `settings`

## V1 Data Source Inventory

Verified against `/Volumes/rexy/GitHub/resonate/convex/schema.ts` on 2026-06-06.

| v1 source | Purpose | Migration handling |
| --- | --- | --- |
| `posts` | Blog and LinkedIn drafts, scheduled posts, published rows, PR URL, external URL, editor metadata, media storage IDs | Import as v2 post candidates with channel, status, schedule, provider/PR trace, and single-composer editability |
| `capturedIdeas` | `/ideas` source-backed or freeform idea headers with status, tags, source URL/title/domain, latest preview | Import as v2 idea candidates |
| `capturedIdeaEntries` | Threaded additive notes for captured ideas | Join into v2 idea text in creation order |
| `capturedIdeaPostLinks` | Links from captured ideas to spawned legacy `posts` | Preserve as `sourceLegacyCapturedIdeaId` on post candidates and `linkedLegacyPostIds` on idea candidates |
| `ideas` | Workflow-board ideas used for editorial progression, research fields, references, and gate metadata | Merge into v2 capturedIdeas candidates with `sourceLegacyWorkflowIdeaId` lineage |
| `workflowDrafts` | Workflow stage rows linking workflow `ideas` to shared `posts` | Preserve workflow idea/post linkage on post and idea candidates |
| `settings` | Legacy blog/LinkedIn frequency toggles | Archive for audit; not imported into v2 publishing records |

The v1 spec also notes that `posts` and `settings` are not scoped the same way as the idea/workflow tables. The dry-run report preserves raw rows first so ownership or brand assumptions can be reviewed before a live import.

## Command

```bash
node scripts/v2-migration-dry-run.mjs \
  --input path/to/resonate-v1-export.json \
  --out docs/archive/resonate-v1-migration-dry-run-YYYY-MM-DD.json
```

Optional flags:

```bash
--brand corvo
--timezone America/Los_Angeles
```

## Output

The report contains:

- `summary`: counts for raw records, archived rows, v2 candidates, and warnings.
- `archive`: the raw v1 rows copied unchanged for audit/recovery.
- `v2Candidates.posts`: proposed v2 post records with Brand, Channel, status, schedule, approval state, external URL, and PR URL.
- `v2Candidates.ideas`: proposed v2 capturedIdeas records derived from captured ideas, entries, and merged workflow ideas.
- `records.imported`: dry-run candidate IDs that would be imported if approved.
- `records.skipped`: rows excluded from candidates with warnings.
- `records.ambiguous`: rows that can be imported but require review, such as published posts without a public URL or PR/provider trace.
- `records.failed`: reserved for live import execution failures; dry-runs should normally leave this empty.
- `warnings`: skipped rows and why they were skipped.

## Mapping Rules

Posts:

| v1 field | v2 candidate |
| --- | --- |
| `type: "blog"` | `channelId: "corvo-blog"` |
| `type: "linkedin"` | `channelId: "linkedin"` |
| `status: "published"` | `status: "published"`, `approvalState: "approved"` |
| `status: "scheduled"` | `status: "scheduled"`, `approvalState: "unapproved"` |
| `status: "draft"` | `status: "draft"`, `approvalState: "unapproved"` |
| `githubPrUrl` | `prUrl` |
| `externalUrl` | archived on the candidate for traceability |
| missing `githubPrUrl` and `externalUrl` on a published row | `providerState: "ambiguous"` |
| `capturedIdeaPostLinks.postId` | `sourceLegacyCapturedIdeaId` |
| `workflowDrafts.postId` | `sourceLegacyWorkflowIdeaId` and `sourceLegacyWorkflowDraftId` |

Captured ideas:

- Entries are sorted by `createdAt` and joined into one v2 candidate text body.
- `sourceTitle` becomes the candidate title.
- `sourceUrl` and tags are preserved.
- Missing entry text falls back to `latestEntryPreview`.
- Linked legacy post IDs are preserved from `capturedIdeaPostLinks`.

Workflow ideas and drafts:

- Workflow `ideas` merge into v2 capturedIdeas candidates; they are not imported as a separate v2 idea type.
- Merged workflow candidates always use `sourceLegacyTable: "capturedIdeas"` and set `sourceLegacyWorkflowIdeaId` to the legacy workflow row id.
- `status: "research"` maps to `ready`; `status: "idea"` maps to `reviewing`; `status: "backlog"` maps to `inbox`; `status: "archived"` maps to `archived`.
- `references[0].url` becomes the candidate `sourceUrl` when present.
- Workflow drafts preserve the legacy idea/post relationship on post candidates via `sourceLegacyWorkflowIdeaId` and `sourceLegacyWorkflowDraftId` instead of becoming separate v2 documents.

## Safety

- The dry run does not call `convex run`.
- The dry run does not mutate v1 or v2 data.
- Invalid rows are preserved in `archive` and reported in `warnings`.
- Live import remains a separate approval step after reviewing the report.

## Verification

```bash
npm test -- lib/__tests__/v2Migration.test.ts
node scripts/v2-migration-dry-run.mjs --input tests/fixtures/resonate-v1-export.sample.json --out /tmp/resonate-v1-migration-dry-run.sample.json
```

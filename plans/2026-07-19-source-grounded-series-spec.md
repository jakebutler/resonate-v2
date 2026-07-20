# Feature Spec: Source-Grounded Post Series

**Date:** 2026-07-19
**Status:** Draft for Jake's review — spec only, nothing implemented
**Author:** Opus (research + spec pass)
**Related:** issue #45 (Marketing Director PRD), `plans/2026-07-19-ship-plan.md` Phase 5

---

## 1. Problem statement

Jake has, in a git repo, a **lab notebook** and **experiment data** for a project. He wants to turn that body of material into a **coherent series of Corvo Labs blog posts plus companion LinkedIn posts**, refined through Resonate's existing authoring/approval/publishing flows.

He describes this as a recurring pattern — "several instances where I have all of this context to kick off a project" — so the feature is not a one-off importer. It is: *point Resonate at a body of project source material, get a multi-post series out of it.*

Today Resonate cannot do this. Three concrete gaps, each verified below:

1. **No document ingestion.** The research pipeline discovers *web* sources only. There is no path for user-supplied documents.
2. **No series concept.** Every post is an island. Nothing carries a shared thesis or shared evidence base across posts.
3. **The research pipeline dead-ends before the composer.** The long-form draft is displayed as text with an instruction to copy it out by hand.

---

## 2. What exists today (verified)

Everything in this section was read in this repo at commit `9bbbde4`. Line citations are to files as they exist now.

### 2.1 The research pipeline discovers web sources; it does not ingest documents

`app/api/research-brief/route.ts` takes `{ topic, audience, thesis, depth, riskLevel }` (`route.ts:10-18`) and asks PioneerAI to return a JSON array of **real, verifiable web sources** — "no invented URLs" (`route.ts:126-127`). There is no request field for user-supplied text, files, or paths.

When `PIONEER_API_KEY` is unset it returns `FRESHPROOF_MOCK_SOURCES` (`route.ts:198-209`), a hardcoded list of seven GLP-1 / semaglutide papers (`route.ts:21-98`).

**This fallback is a live hazard for this feature.** The same canned-content pattern repeats downstream:

- `app/api/claim-map/route.ts:93-101` returns `buildMockClaims()` — five hardcoded GLP-1 weight-regain claims (`claim-map/route.ts:14-53`).
- `app/api/long-form-draft/route.ts:97-105` returns `buildMockDraft()`, hardcoded to the title *"Weight Regain After GLP-1 Discontinuation"* (`long-form-draft/route.ts:28`).

So with a missing or failing API key, a "grounded" run against Jake's lab notebook would silently produce **semaglutide content**. The route returns HTTP 200 with a `warning` string; nothing forces the operator to see it. This is already flagged as audit finding F4 in `plans/2026-07-19-ship-plan.md`. This spec treats it as a blocker (§9.1).

### 2.2 Convex has no series, campaign, corpus, or document concept

`convex/schema.ts` defines 20 tables. Confirmed absent: any table for series, campaigns, corpora, documents, chunks, or embeddings. There are **no search indexes and no vector indexes anywhere in `convex/`** (verified by grep across the directory).

The only file-handling in the schema is image storage: `v2Posts.heroImageStorageId: v.optional(v.id("_storage"))` (`schema.ts:182`), `posts.fileIds` (`schema.ts:518`), backed by `convex/posts.ts:109-113` (`generateUploadUrl`) and `convex/posts.ts:115-120` (`getFileUrl`). Both operate on the legacy `posts` table and are image-oriented.

### 2.3 The research artifact chain is persisted and reusable

`convex/research.ts` persists the whole chain, brand-scoped and auth-checked:

| Mutation | Line | Writes |
|---|---|---|
| `saveResearchBrief` | `research.ts:148` | `v2ResearchBriefs` + N `v2ResearchSources` |
| `saveClaimMap` | `research.ts:218` | `v2ClaimMaps` + N `v2Claims` |
| `reviewSource` | `research.ts:282` | source status + reviewer notes |
| `reviewClaim` | `research.ts:315` | claim status + reviewer notes |
| `saveEditorialOutline` | `research.ts:375` | `v2EditorialOutlines` |
| `saveLongFormDraft` | `research.ts:428` | `v2LongFormDrafts` |

Every mutation calls `requireUserId` (`research.ts:83`) then `requireBrandAccess` (`research.ts:89`), and writes a `v2AuditEvents` row via the local `audit()` helper (`research.ts:142-147`).

**The critical structural fact for this feature:** `v2Claims.sourceIds` is `v.array(v.string())` (`schema.ts:361`) — opaque strings, not foreign keys. And `v2ResearchSources.sourceId` is likewise `v.string()` (`schema.ts:318`). The claim→source link is a string join over an app-minted ID (`makeId("src")`, `lib/domain.ts:965`).

That means **anything that can present itself as a `SourceRecord` can flow through the entire existing pipeline unmodified.** This is the hinge of the design in §5.

The one constraint: `v2ResearchSources.url` is a required `v.string()` (`schema.ts:320`), and `sourceValidator` in `convex/research.ts:44-54` requires `url` too. A repo file has no URL. §5.2 addresses this.

### 2.4 The research surface dead-ends at the long-form draft

`components/ResearchApp.tsx` (1755 lines) is the `/research` surface (`app/research/page.tsx:11-13`). It calls the four AI routes directly:

- `/api/generate-draft` at `ResearchApp.tsx:370`
- `/api/claim-map` at `ResearchApp.tsx:466`
- `/api/editorial-outline` at `ResearchApp.tsx:562`
- `/api/long-form-draft` at `ResearchApp.tsx:621`
- `/api/research-brief` at `ResearchApp.tsx:679`

and persists via the `convex/research.ts` mutations (`ResearchApp.tsx:117-122`).

But after the long-form draft renders, the UI says:

> "Copy this draft into your CMS or editor. Review all claims and citations before publishing." — `ResearchApp.tsx:1722-1724`
>
> "Next step: review, edit, and schedule via your standard editorial workflow." — `ResearchApp.tsx:1734-1735`

The only action offered is **Regenerate Draft** (`ResearchApp.tsx:1740-1745`). There is no button that turns a long-form draft into a `v2Posts` row. `api.publishing.createVariantPost` is imported at `ResearchApp.tsx:126` but is used by the idea→variant path, not the research→draft path.

**This gap must be closed regardless of the series feature.** A series that produces drafts Jake has to copy-paste is not worth building.

### 2.5 Post creation and the publishing path work

`convex/publishing.ts:522` `createPostWithIntent` is the canonical creation mutation. It takes `{ brandId, channelId, title, content, scheduledDate?, scheduledTime?, timezone?, sourceIdeaId?, sourceResearchBriefId? }` and in one transaction writes:

- a `v2Posts` row — status `"scheduled"` if a date was given else `"draft"`, `approvalState: "unapproved"` always (`publishing.ts:544-561`)
- a matching `v2PublishingIntents` row (`publishing.ts:563-578`)
- a `v2ProviderStates` row at `"not-submitted"` (`publishing.ts:580-587`)
- a `v2AuditEvents` row (`publishing.ts:589-596`)

Note `sourceResearchBriefId` already exists as a provenance field on both `v2Posts` (`schema.ts:173`) and `v2PublishingIntents` (`schema.ts:222`) — and it is `v.optional(v.string())`, not an `Id`, so it can hold any provenance token.

`convex/publishing.ts:1233` `createVariantPost` does the same plus a `capturedIdeaV2PostLinks` row (`publishing.ts:1307-1314`) and an idea status bump. **This is the precedent for how a new grouping concept links to posts: a dedicated link table written inside the same mutation as post creation.**

Downstream: `setApproval` (`publishing.ts:663`), `reschedule` (`publishing.ts:703`), `updateContent` (`publishing.ts:863`), `updatePlatformSettings` (`publishing.ts:902`), `recordGithubPr` (`publishing.ts:1133`). Blog publishing is real — `app/api/publish/route.ts:98` calls `createBlogPostPR` and returns a PR URL (`publish/route.ts:115-119`).

### 2.6 UI surfaces

Three nav destinations in `components/shell/Shell.tsx`: `/` (calendar, `Shell.tsx:32`), `/research` (`Shell.tsx:39`), `/#connections` (`Shell.tsx:46`). Page routes: `/`, `/editor/[id]`, `/ideas`, `/legacy`, `/research`, `/research/review/[postId]`, `/setup`, plus auth routes.

Per ADR 0004, `components/PersistedPublishingPanel.tsx` is **the one canonical composer** and owns all intent edits, approval transitions, scheduling, platform settings, and provider state. This spec does not touch it beyond adding a series filter.

### 2.7 The operator-CLI precedent

`docs/v1-ideas-import.md:20-46` documents a working pattern for bulk-loading data as the operator:

```bash
node scripts/convert-convex-export-to-v1-json.mjs --unpacked <dir> --out /tmp/export.json
node scripts/v2-migration-dry-run.mjs --input /tmp/export.json --out /tmp/plan.json --brand corvo
node scripts/v2-import-ideas.mjs --plan /tmp/plan.json --dry-run
npx convex run v2Migration:importV1Ideas "$(cat /tmp/import-live.json)" \
  --identity '{"subject":"user_YOUR_CLERK_ID"}' --prod
```

The Node script **builds a payload and prints it** (`scripts/v2-import-ideas.mjs:58-88`); `npx convex run --identity` executes it authenticated. Idempotency comes from `v2MigrationRecords` keyed on `legacyTable`+`legacyId` (`schema.ts:483-492`, `docs/v1-ideas-import.md:48-50`).

§4 reuses this pattern wholesale rather than inventing an upload flow.

### 2.8 Naming convention

Issue #45 locked decision 13: *"Drop `v2` from new feature naming... new docs, route concepts, schema proposals, and product language should use clean Resonate names."* Commit `cf94b4e` ("Standardize workspace UI and drop transitional v2 naming") applied this to UI copy; the schema still carries `v2*` prefixes.

**All new tables, routes, and UI copy in this spec use unprefixed names.** New tables sit alongside `v2*` tables without renaming them.

### 2.9 Stale documentation warning

`docs/spec.md` is dated 2026-04-09 (`spec.md:3`) and describes the **pre-cutover** app: `/` as a combined dashboard (`spec.md:15`), `/ideas` as the capture inbox (`spec.md:41`), a route inventory with no `/research` (`spec.md:165-174`), and `posts` as the core content record (`spec.md:88`). It predates the `v2Posts` spine, `/research`, and the production cutover. **Do not treat `docs/spec.md` as current.** `docs/glossary.md` (2026-06-06) and the ADRs are current.

---

## 3. Design principles

Inherited from the ADRs, the glossary, and issue #45's locked decisions:

| # | Principle | Source |
|---|---|---|
| P1 | Convex is the single source of truth. No corpus, series, or claim state lives only in the browser or on disk. | ADR 0005 |
| P2 | One canonical composer. Series posts are ordinary `v2Posts` rows edited in `PersistedPublishingPanel`. No second editor. | ADR 0004 |
| P3 | Schedule ≠ approval. Materializing a series never approves anything. | `glossary.md:96-102` |
| P4 | Brand-scoped. Corpora and series carry `brandId` and go through `requireBrandAccess`. | `research.ts:89` |
| P5 | No new publishing path. Blog → GitHub PR, LinkedIn → Buffer (when wired). | `publish/route.ts:98` |
| P6 | Reuse the claim/evidence vocabulary rather than inventing a parallel one. | `lib/domain.ts:861-891` |
| P7 | No `v2` prefix on new names. | issue #45, decision 13 |
| P8 | AI never auto-publishes; human review gates every transition. | `ResearchApp.tsx:1712-1714` |

**P9 (new, specific to this feature): grounding must be falsifiable.** Every claim in a series draft must resolve to a specific excerpt at a specific commit in a specific file. A citation the operator cannot click through to the underlying evidence is worse than no citation, because it manufactures unearned confidence.

---

## 4. Source material ingestion

### 4.1 Decision: CLI import from a git path

Three options considered:

| Option | Pros | Cons |
|---|---|---|
| **A. CLI import from a git working tree** | No new auth surface; reuses `npx convex run --identity`; commit SHA available for free; handles hundreds of files; runs where the material already lives | Requires terminal; not usable from the phone |
| **B. Browser upload** | Discoverable UI; no terminal | Convex storage is image-oriented today; multi-file/directory upload is real UI work; loses git provenance; parsing moves to the browser |
| **C. Server-side git clone** | Fully in-app | Needs repo credentials server-side, a clone/checkout worker, and disk in a serverless runtime. Large. |

**Proposal: A for the first slice.** Jake is the only operator, the material is already in a git repo on his machine, and §2.7 proves the pattern works in this codebase. B becomes worthwhile once a second person authors series. C is out of scope indefinitely.

*This is a proposal, not a description of existing behavior.*

### 4.2 What gets stored vs. referenced

| Artifact | Where | Why |
|---|---|---|
| Corpus metadata (repo, commit SHA, root path, label) | Convex `sourceCorpora` | Small; the provenance anchor |
| Per-file metadata (relative path, kind, size, hash) | Convex `sourceDocuments` | Small; the manifest |
| Text excerpts (chunked, with line ranges) | Convex `sourceExcerpts` | **Must** be in Convex — this is what claims cite (P1, P9) |
| Original binary files (images, `.parquet`, large CSVs) | **Not stored.** Referenced by path + hash only | Convex is not a blob store for experiment data |
| Full-file raw text | **Not stored** in the first slice | Excerpts are the citable unit; full text doubles storage for no read path |

Rationale for the last row: if a claim cites `notebook.md#L120-L164`, the excerpt *is* the evidence. Storing the whole file adds bytes without adding a review affordance. If we later need whole-file view, the CLI can re-emit on demand from the same commit SHA.

### 4.3 File handling

Parsed into excerpts:

- `.md`, `.mdx`, `.txt`, `.org` — split on headings, then on a token budget
- `.ipynb` — one excerpt per cell; markdown cells as prose, code cells as code, outputs truncated to a cap (proposal: 2 KB per output)
- `.csv`, `.tsv` — header + first N rows as a **schema-and-sample excerpt** (proposal: N = 20), plus row count and column list. Not row-by-row.
- `.json`, `.yaml`, `.yml` — pretty-printed, chunked, truncated at a cap
- `.py`, `.ts`, `.r`, `.sql` — chunked on top-level definitions where cheaply detectable, else on line count

Manifest-only (metadata row, no excerpt): images, `.parquet`, `.pkl`, `.h5`, binaries, and anything over a size ceiling.

Skipped entirely: anything matched by `.gitignore`, plus `node_modules/`, `.git/`, `.venv/`, `__pycache__`, and lockfiles.

### 4.4 Chunking

- Target ≈ 400–800 tokens per excerpt, hard ceiling 1,500.
- Never split mid-table-row or mid-code-fence.
- Each excerpt records `startLine`/`endLine` in the source file. **Line numbers are the provenance primitive** — combined with the commit SHA they make every citation independently checkable.
- Each excerpt carries a `headingPath` (e.g. `"Experiments > Run 14 > Ablation"`) for human-readable citations.

### 4.5 Secret and PII scanning — mandatory, not optional

A lab notebook is a private artifact. It may contain unpublished results, third-party data, collaborator names, credentials, or internal URLs. Content flowing from it into a **public blog post and a public LinkedIn post** is a one-way door.

The import script must, before emitting any payload:

1. Run a secret-pattern scan (API-key shapes, `AKIA`, PEM headers, `Bearer `, `.env` assignments) and **hard-fail** on a hit, naming the file and line.
2. Emit a `--dry-run` manifest listing every file and excerpt count, for the operator to eyeball before the live run.
3. Mark every excerpt with `sensitivity`, defaulting to `"unreviewed"`, and surface unreviewed-excerpt counts in the UI.

This is a proposal. It is the single highest-risk aspect of the feature (§9.2).

### 4.6 The import command

```bash
# 1. Scan and build the payload (no writes, no network)
node scripts/import-source-corpus.mjs \
  --path ~/GitHub/my-experiment \
  --brand corvo \
  --label "Fact Drift experiment notebook" \
  --include "notebook/**,data/*.csv,README.md" \
  --out /tmp/corpus-payload.json \
  --dry-run

# 2. Review /tmp/corpus-payload.json — file list, excerpt counts, flagged lines

# 3. Import, authenticated as the operator
npx convex run corpus:importCorpus "$(cat /tmp/corpus-payload.json)" \
  --identity '{"subject":"user_YOUR_CLERK_ID"}' --prod
```

Re-running against the same repo at a new commit creates a **new corpus version** rather than mutating the old one (§4.7). Re-running at the same commit is a no-op, keyed on `(repoRemote, commitSha, rootPath)`.

### 4.7 Provenance and immutability

`sourceCorpora` rows are **immutable once imported**. A new commit produces a new row with `supersedesCorpusId` pointing at the previous one.

This matters because a series may take weeks. If the notebook changes mid-series, silently re-pointing citations would invalidate already-approved posts without anyone noticing. Instead: the old corpus stays; the series stays pinned to it; the UI shows *"a newer version of this corpus exists"* and re-pointing is an explicit operator action.

Citation URI format (proposal):

```
corpus://<corpusId>/<relativePath>#L<start>-L<end>@<shortSha>
```

This is what goes in `v2ResearchSources.url` (§5.2) and satisfies the required-`url` constraint from `schema.ts:320`.

---

## 5. Grounded research: reusing the existing pipeline

### 5.1 The core reuse insight

Because `v2Claims.sourceIds` is an array of opaque strings (`schema.ts:361`) and the claim→source join is by app-minted string ID (`lib/domain.ts:965`), **a corpus excerpt presented as a `SourceRecord` flows through the entire existing pipeline with zero changes to `claim-map`, `editorial-outline`, or `long-form-draft`.**

Concretely, the existing chain works unmodified:

```
sourceExcerpts  ──(adapter)──▶  SourceRecord[]
                                     │
                                     ▼
                          POST /api/claim-map          (unchanged, route.ts:77)
                                     │  claims cite excerpt IDs
                                     ▼
                          reviewClaim                   (unchanged, research.ts:315)
                                     │
                                     ▼
                          POST /api/editorial-outline   (unchanged, route.ts)
                                     │
                                     ▼
                          POST /api/long-form-draft     (unchanged, route.ts:84)
```

This is the reason the first slice is small. We are not building a grounded-drafting pipeline. We are building an **adapter** into the one that already exists, plus the series layer above it and the missing composer handoff below it.

### 5.2 The excerpt → SourceRecord adapter

Proposed `lib/corpus.ts`:

```ts
export function excerptToSourceRecord(
  excerpt: SourceExcerpt,
  doc: SourceDocument,
  corpus: SourceCorpus
): SourceRecord;
```

Field mapping into the existing `SourceRecord` shape (`lib/domain.ts:921-937`):

| `SourceRecord` field | Value from corpus |
|---|---|
| `id` | the excerpt's stable `excerptId` (not a fresh `makeId`) |
| `url` | the `corpus://` URI from §4.7 |
| `title` | `"<relativePath> — <headingPath>"` |
| `domain` | `"corpus"` (literal; keeps `classifySourceQuality` from throwing on a bad URL parse) |
| `evidenceLabel` | derived — see below |
| `relevanceScore` | operator-set, default `3` |
| `useCase` | the excerpt's summary, or its first 200 chars |
| `addedBy` | `"user"` (the operator supplied it, not a discovery agent) |
| `status` | `"accepted"` — the operator chose these files; web-discovery vetting does not apply |
| `qualityRating` | via existing `classifySourceQuality` (`lib/domain.ts:899`) |

**Evidence label for repo material.** The existing labels (`lib/domain.ts:861-867`) are clinical: `rct-meta-analysis`, `mechanism`, `expert-practice`, `practice-principle`, `primary-source`, `weaker-support`. For a lab notebook, the honest mapping is:

- experiment data, run logs, measured results → `primary-source`
- notebook prose explaining *why* something behaves as it does → `mechanism`
- the author's judgments, hunches, and design opinions → `weaker-support`

`primary-source` is defined as "original trial data, regulatory filing, **official dataset**, or primary document" (`lib/domain.ts:886-887`) — experiment data fits without stretching. `weaker-support` for the author's own opinions is deliberate and slightly uncomfortable, which is the point: **Jake's own notebook musings are not evidence for a public claim just because he wrote them down.** The label makes that visible during claim review.

Assignment is heuristic on import (file kind + heading) and **operator-editable** in the UI. It is not model-inferred in the first slice.

*Open question O4 (§10) asks whether Jake wants a corpus-native label set instead.*

### 5.3 Selection, not retrieval

Convex has no search or vector index (§2.2). Building embedding-based retrieval is a large slice on its own.

**First slice: the operator selects excerpts.** The series-planning UI lists documents and excerpts with checkboxes; selected excerpts become the `acceptedSources` array. The UI shows a running token estimate and warns past a threshold (proposal: 60k tokens).

Realistically, a single project's notebook is tens of files, not thousands. Manual selection is *better* than retrieval at this scale — it is faster to reason about and produces no silent recall failures. Retrieval becomes necessary at multi-hundred-document corpora, not here.

**Deferred:** a `.searchIndex("by_text", { searchField: "text", filterFields: ["corpusId"] })` on `sourceExcerpts` for keyword pre-filtering. Cheap to add later; not needed for slice 1.

### 5.4 Claim traceability and review

The claim map already carries `sourceIds` (`schema.ts:361`), evidence label, confidence, caveats, and a six-state review status (`schema.ts:84-91`: `unreviewed | accepted | needs-revision | unsupported | too-risky | out-of-scope`), reviewable via `reviewClaim` (`research.ts:315`).

What's new is the **review affordance**: for a corpus-grounded claim, the UI must render, inline next to the claim, the actual excerpt text with its file path, line range, and commit SHA. Not a link out — the text itself. Grounding review that requires leaving the page will not happen.

Enforced constraints (proposed, in the series-plan route and validated at post-materialization):

1. Every claim must cite ≥ 1 corpus excerpt from the pinned corpus. Zero-citation claims are rejected before reaching review.
2. Cited excerpt IDs must exist in the pinned corpus. Unknown IDs are dropped and surfaced as a warning — this is the hallucination trap, and it is cheap to check because the ID space is closed.
3. Only `accepted` claims reach the outline and draft, matching the existing gate (`glossary.md:122-124`).

### 5.5 Grounding in the drafted output

`long-form-draft` already emits `[^N]` footnotes and a References section (`long-form-draft/route.ts:70-71`). For corpus-grounded drafts the reference lines should render as file path + heading + line range, not as a raw `corpus://` URI — a published blog post must not leak internal repo paths.

**Proposal:** references are rendered for *review* with full provenance, and stripped or rewritten to prose attribution ("in our own experiments…") when the post is materialized for publication. The reviewable provenance stays on the series entry in Convex, not in the published markdown.

*This needs Jake's call — see open question O3.*

---

## 6. The series concept

### 6.1 Definition

A **Series** is a brand-scoped set of planned posts that share one thesis and one pinned source corpus. It is a *planning and provenance* object. It owns no content and no publishing behavior. Each installment materializes into an ordinary `v2Posts` row that flows through the existing composer, approval, and PR path.

Glossary addition (proposed for `docs/glossary.md`):

> **Series.** A brand-scoped, thesis-driven group of planned posts sharing one source corpus. A series is a plan, not a publishing unit — each entry becomes an ordinary Post with its own approval and schedule. Approving or scheduling one entry has no effect on the others.
>
> **Source Corpus.** An immutable snapshot of user-supplied project material — a lab notebook, experiment data, outlines — imported from a git working tree at a specific commit and stored as citable excerpts.

### 6.2 Lifecycle

```
  ┌─────────────┐
  │   drafting  │  corpus pinned, thesis written, no entries yet
  └──────┬──────┘
         │  operator runs series planning
         ▼
  ┌─────────────┐
  │   planned   │  entries exist with working titles + angles; no posts yet
  └──────┬──────┘
         │  per entry: claim review → outline → draft → materialize
         ▼
  ┌─────────────┐
  │  in-flight  │  ≥1 entry has a v2Posts row; entries progress independently
  └──────┬──────┘
         │  every entry published or dropped
         ▼
  ┌─────────────┐
  │  completed  │  terminal
  └─────────────┘
         ▲
  ┌─────────────┐
  │  abandoned  │  terminal; entries and posts survive
  └─────────────┘
```

Series status is **derived where possible and never gates a post.** A series being `in-flight` does not block approving an entry; approving an entry does not advance the series. Per P3, the series layer has no authority over approval.

### 6.3 Entries and the blog + LinkedIn pairing

One `seriesEntries` row per **(installment, channel)** pair. A three-post series with LinkedIn companions is six entries: three `corvo-blog` primaries and three `linkedin` companions, each companion carrying `derivedFromEntryId` pointing at its blog entry.

Alternative considered: one row per installment with a `channels[]` array and a link table (mirroring `capturedIdeaV2PostLinks`, `schema.ts:494-505`). Rejected for slice 1 — two tables where one works, and per-channel state (title, draft, post link, status) then needs its own nested structure anyway. The cost is that angle and claim IDs duplicate between a blog entry and its companion; `derivedFromEntryId` makes that relationship explicit and re-derivable.

The companion LinkedIn entry is generated **from the approved blog draft**, not independently from the corpus. That is the actual working rhythm — the LinkedIn post is a distillation of the article, not a parallel artifact — and it keeps the two from drifting.

### 6.4 Relationship to a post

`seriesEntries.postId: v.optional(v.id("v2Posts"))`. Null until materialized. On materialization we call the existing `createPostWithIntent` (`publishing.ts:522`) and store the returned `postId`.

**A materialized post is a normal post.** It appears on the calendar, opens in `PersistedPublishingPanel`, gets approved, and publishes via `/api/publish` → GitHub PR. The series link is metadata. If the series row were deleted, every post would keep working.

Deletion semantics: deleting a series does **not** delete its posts. Entries are soft-detached (`postId` retained on the post via `sourceSeriesEntryId`, series row removed). Posts are the durable artifact.

---

## 7. Concrete design

### 7.1 Schema additions

Four new tables in `convex/schema.ts`. No changes to existing tables except two optional fields on `v2Posts` (§7.1.5).

#### 7.1.1 `sourceCorpora`

```ts
sourceCorpora: defineTable({
  userId: v.string(),
  brandId: brandId,                       // reuse the existing v2BrandId union
  label: v.string(),                      // "Fact Drift experiment notebook"
  description: v.optional(v.string()),

  // Provenance — the anchor for every citation
  origin: v.union(v.literal("git-path"), v.literal("upload")),
  repoRemote: v.optional(v.string()),     // git remote URL, if any
  repoRootPath: v.string(),               // absolute path at import time
  commitSha: v.optional(v.string()),      // full SHA; absent if not a git repo
  branch: v.optional(v.string()),
  workingTreeDirty: v.boolean(),          // true = citations are not reproducible
  importedAt: v.number(),

  documentCount: v.number(),
  excerptCount: v.number(),
  totalBytes: v.number(),

  supersedesCorpusId: v.optional(v.id("sourceCorpora")),
  scanSummary: v.optional(v.any()),       // secret-scan + skip report from §4.5

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_brand", ["brandId"])
  .index("by_commit", ["repoRemote", "commitSha"]),
```

`workingTreeDirty` is not cosmetic. If the tree was dirty at import, `commitSha` does not identify the bytes that were read, and every citation from that corpus is unverifiable by a third party. The UI must say so.

#### 7.1.2 `sourceDocuments`

```ts
sourceDocuments: defineTable({
  corpusId: v.id("sourceCorpora"),
  userId: v.string(),
  brandId: brandId,

  relativePath: v.string(),               // "notebook/2026-05-run-14.md"
  fileName: v.string(),
  extension: v.string(),
  kind: v.union(
    v.literal("notebook"),                // lab notebook prose
    v.literal("data"),                    // CSV/parquet/JSON results
    v.literal("code"),
    v.literal("outline"),
    v.literal("reference"),               // README, papers, external notes
    v.literal("other")
  ),
  byteSize: v.number(),
  contentHash: v.string(),                // sha256 of file bytes
  parsed: v.boolean(),                    // false = manifest-only (binary/oversized)
  skipReason: v.optional(v.string()),
  excerptCount: v.number(),
  summary: v.optional(v.string()),        // deferred to slice 2; null in slice 1

  createdAt: v.number(),
})
  .index("by_corpus", ["corpusId"])
  .index("by_corpus_and_path", ["corpusId", "relativePath"])
  .index("by_user", ["userId"]),
```

#### 7.1.3 `sourceExcerpts`

```ts
sourceExcerpts: defineTable({
  corpusId: v.id("sourceCorpora"),
  documentId: v.id("sourceDocuments"),
  userId: v.string(),
  brandId: brandId,

  excerptId: v.string(),                  // stable, deterministic; used as SourceRecord.id
  ordinal: v.number(),                    // position within the document
  headingPath: v.optional(v.string()),    // "Experiments > Run 14 > Ablation"
  text: v.string(),                       // the citable evidence
  startLine: v.number(),
  endLine: v.number(),
  tokenEstimate: v.number(),

  excerptKind: v.union(
    v.literal("prose"),
    v.literal("code"),
    v.literal("table"),
    v.literal("data-sample"),
    v.literal("output")
  ),
  evidenceLabel: v.string(),              // existing EvidenceLabel vocabulary; operator-editable
  sensitivity: v.union(
    v.literal("unreviewed"),
    v.literal("public-ok"),
    v.literal("internal-only")
  ),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_corpus", ["corpusId"])
  .index("by_document", ["documentId"])
  .index("by_corpus_and_excerpt", ["corpusId", "excerptId"])
  .index("by_user", ["userId"]),
```

`excerptId` should be deterministic — proposal: `sha256(relativePath + startLine + endLine + contentHash).slice(0, 16)`, prefixed `exc_`. Deterministic IDs mean a re-import at the same commit produces identical IDs, so citations survive a re-import.

`sensitivity` defaults to `"unreviewed"`. An `internal-only` excerpt must not be usable as a claim source; the series-plan route filters it out and the UI shows why.

#### 7.1.4 `postSeries` and `seriesEntries`

```ts
postSeries: defineTable({
  userId: v.string(),
  brandId: brandId,

  title: v.string(),
  thesis: v.string(),                     // the through-line; every entry must serve it
  audience: v.string(),
  corpusId: v.id("sourceCorpora"),        // pinned; never silently re-pointed
  researchBriefId: v.optional(v.id("v2ResearchBriefs")),
  claimMapId: v.optional(v.id("v2ClaimMaps")),

  status: v.union(
    v.literal("drafting"),
    v.literal("planned"),
    v.literal("in-flight"),
    v.literal("completed"),
    v.literal("abandoned")
  ),
  plannedEntryCount: v.optional(v.number()),
  provider: v.optional(v.string()),       // which model planned it; "mock" is a red flag
  warning: v.optional(v.string()),        // carries the fallback warning from §2.1

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_brand", ["brandId"])
  .index("by_corpus", ["corpusId"])
  .index("by_brand_and_status", ["brandId", "status"]),

seriesEntries: defineTable({
  seriesId: v.id("postSeries"),
  userId: v.string(),
  brandId: brandId,

  installment: v.number(),                // 1-based; blog + companion share a number
  channelId: channelId,                   // reuse the existing v2ChannelId union
  derivedFromEntryId: v.optional(v.id("seriesEntries")),  // companion → primary

  workingTitle: v.string(),
  angle: v.string(),                      // what THIS entry argues, vs. the series thesis
  claimIds: v.array(v.string()),          // into v2Claims.claimId
  excerptIds: v.array(v.string()),        // into sourceExcerpts.excerptId

  outlineId: v.optional(v.id("v2EditorialOutlines")),
  longFormDraftId: v.optional(v.id("v2LongFormDrafts")),
  postId: v.optional(v.id("v2Posts")),    // null until materialized

  status: v.union(
    v.literal("planned"),
    v.literal("outlined"),
    v.literal("drafted"),
    v.literal("materialized"),            // v2Posts row exists; post state takes over
    v.literal("dropped")
  ),
  targetDate: v.optional(v.string()),     // YYYY-MM-DD; a plan, never an approval
  notes: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_series", ["seriesId"])
  .index("by_series_and_installment", ["seriesId", "installment"])
  .index("by_post", ["postId"])
  .index("by_user", ["userId"]),
```

Note that `seriesEntries.status` stops at `materialized`. Once a post exists, `v2Posts.status` and `approvalState` are authoritative. Two status machines racing over one artifact is exactly the split-brain ADR 0005 was written to prevent.

#### 7.1.5 Two optional fields on `v2Posts`

```ts
sourceSeriesId: v.optional(v.id("postSeries")),
sourceSeriesEntryId: v.optional(v.id("seriesEntries")),
```

Both optional, so no migration is required — Convex tolerates absent optional fields on existing rows. Plus one index: `.index("by_series", ["sourceSeriesId"])`, for calendar filtering.

These mirror the existing `sourceIdeaId` / `sourceResearchBriefId` provenance fields (`schema.ts:172-173`). Direct `Id` references rather than strings, because unlike those fields these are always internal.

### 7.2 Convex functions

New file `convex/corpus.ts`:

| Function | Kind | Purpose |
|---|---|---|
| `importCorpus` | mutation | Accepts the CLI payload; writes corpus + documents + excerpts + audit event. Idempotent on `(repoRemote, commitSha, rootPath)`. |
| `listCorpora` | query | Brand-scoped list with counts |
| `getCorpus` | query | Corpus + documents (not excerpt text — too heavy) |
| `listExcerpts` | query | By `corpusId`, optionally by `documentId`; paginated |
| `getExcerpts` | query | By explicit `excerptId[]`, for citation rendering |
| `setExcerptSensitivity` | mutation | Operator marks `public-ok` / `internal-only` |
| `setExcerptEvidenceLabel` | mutation | Operator corrects the heuristic label |
| `deleteCorpus` | mutation | Blocked if any non-abandoned series pins it |

New file `convex/series.ts`:

| Function | Kind | Purpose |
|---|---|---|
| `createSeries` | mutation | Title, thesis, audience, pinned `corpusId` |
| `saveSeriesPlan` | mutation | Replaces entries for a series from a plan payload |
| `listSeries` | query | Brand-scoped |
| `getSeries` | query | Series + entries + linked post summaries |
| `updateEntry` | mutation | Working title, angle, target date, notes, claim/excerpt IDs |
| `dropEntry` | mutation | Sets `dropped`; does not delete a materialized post |
| `materializeEntry` | mutation | **Calls the same insert path as `createPostWithIntent`**, then sets `entry.postId` and `entry.status = "materialized"` |
| `setSeriesStatus` | mutation | Explicit transitions (`abandoned`, `completed`) |

Every one of these follows the established shape: `requireUserId` → `requireBrandAccess` → mutate → `audit()`, exactly as `convex/research.ts:148-215` does.

`materializeEntry` must **not** duplicate the insert logic in `publishing.ts:522-598`. The three-row transaction (post + intent + provider state) should be extracted into a shared internal helper that both `createPostWithIntent` and `materializeEntry` call. Copy-pasting it is how the approval-state invariant gets broken six months from now.

`materializeEntry` always produces `approvalState: "unapproved"` and, if `targetDate` is set, `status: "scheduled"` — identical to the existing behavior at `publishing.ts:552-553`. Per P3, and per issue #45's locked decision 8 (scheduled-but-unapproved is the only thing automation may create), materialization never approves.

### 7.3 API routes

| Route | Status | Notes |
|---|---|---|
| `app/api/series-plan/route.ts` | **New** | Given thesis, audience, accepted claims, and selected excerpts, propose an N-installment decomposition: per-installment working title, angle, and claim assignment. Must return `{ plan, provider, warning? }` matching the shape of the sibling routes. |
| `app/api/claim-map/route.ts` | **Unchanged** | Called with corpus-derived `acceptedSources`. §5.1. |
| `app/api/editorial-outline/route.ts` | **Unchanged** | Per entry, with that entry's accepted claims. |
| `app/api/long-form-draft/route.ts` | **Unchanged** | Per entry, from that entry's outline. |
| `app/api/research-brief/route.ts` | **Unchanged, not called** | Web discovery is orthogonal. A later slice can blend web sources with corpus excerpts, since both are `SourceRecord`s. |
| `app/api/companion-post/route.ts` | **New (slice 2)** | Blog draft + voice guidance → LinkedIn companion. Slice 1 uses the existing `/api/generate-draft` with `channel: "linkedin"` (`generate-draft/route.ts:11-16`, `:34-39`). |

`series-plan` must follow the house pattern from the sibling routes — `runtime = "nodejs"`, POST-only, validate required fields with a 400, call PioneerAI with `store: false`, and degrade with a `warning`. **But it must not fabricate a fallback plan.** Unlike its siblings, when `PIONEER_API_KEY` is missing it should return a 503 with an explicit error. A canned series plan is not "continuity"; it is a lie about Jake's project (§9.1).

### 7.4 UI surfaces

**`/series` — new route, new nav item in `components/shell/Shell.tsx`.** Requires extending `WorkspaceSurface` (`Shell.tsx:8`) with `"series"`.

- Series list: title, brand, corpus label, entry count, materialized/approved/published counts.
- "New series" → pick a corpus, write thesis + audience.

**`/series/[seriesId]` — the working surface.** Sections:

1. **Header** — thesis, pinned corpus with commit SHA (short), status. A loud banner if `workingTreeDirty`, or if a newer corpus version exists, or if `provider === "mock"`.
2. **Corpus panel** — document tree, excerpt selection with checkboxes, running token estimate, `sensitivity` badges.
3. **Claim review** — the claim map for this series. Each claim renders its **cited excerpt text inline** with path, line range, and heading path (§5.4). Accept / needs-revision / unsupported / too-risky / out-of-scope, via the existing `reviewClaim` (`research.ts:315`).
4. **Plan table** — one row per entry: installment, channel, working title, angle, claim count, status, target date, materialized-post link. Drag to reorder; edit inline.
5. **Per-entry drawer** — outline → draft → **"Send to composer"**.

**Composer additions.** In `PersistedPublishingPanel`, a series-derived post shows a small "Series: <title> · Part N" chip linking back to `/series/[id]`, and a read-only grounding panel listing the claims and excerpts behind the draft. **No editing behavior changes.** Per ADR 0004 this component keeps sole ownership of content edits, approval, and scheduling.

**Calendar addition.** A series filter alongside the existing brand/platform/status filters, and a subtle series-color marker on series posts, so Jake can see the cadence.

**`/research` addition — required, and valuable independent of this feature.** A **"Send to composer"** button on the long-form draft, closing the §2.4 dead end. Calls `createPostWithIntent` with `sourceResearchBriefId` set, then routes to the composer. Six lines of UI against an existing mutation; it turns the research pipeline from a demo into a tool.

---

## 8. The refinement loop

Jake's actual working rhythm, end to end. Steps marked **(new)** need building; the rest exist.

**Phase A — get the material in (once per project, ~5 min)**

1. `node scripts/import-source-corpus.mjs --path ~/GitHub/my-experiment --brand corvo --dry-run` **(new)**
2. Read the manifest. Confirm the right files, no secrets flagged.
3. Re-run without `--dry-run`, pipe to `npx convex run corpus:importCorpus --identity ... --prod` **(new)**

**Phase B — frame the series (~15 min)**

4. `/series` → New series. Pick the corpus. Write the thesis and audience by hand. **(new)**
   *The thesis is Jake's, not the model's. A model-generated through-line for a project it has no lived context on is the fastest route to a generic series.*
5. Browse the corpus panel; select the excerpts that carry the argument. **(new)**

**Phase C — establish the evidence base (~30 min, the highest-leverage step)**

6. Generate the claim map from selected excerpts — existing `/api/claim-map`.
7. Review every claim against its inline excerpt. Accept, revise, or reject — existing `reviewClaim`.
   *This is where grounding is actually earned. Everything downstream inherits whatever passes here.*

**Phase D — plan the decomposition (~15 min)**

8. Generate the plan: N installments, each with a working title, an angle, and assigned claims — `/api/series-plan` **(new)**
9. Edit the plan by hand. Reorder, merge, split, drop. Set target dates. **(new)**
10. Add LinkedIn companion entries for the installments that warrant one. **(new)**

**Phase E — per installment (~45–90 min each)**

11. Generate the outline — existing `/api/editorial-outline`, per entry.
12. Generate the long-form draft — existing `/api/long-form-draft`, per entry.
13. **Send to composer** → a `v2Posts` row exists **(new; also fixes `/research`)**
14. Refine in the composer: title, excerpt, hero image, author, tags, slug, category — existing `PersistedPublishingPanel`.
15. Approve — existing `setApproval` (`publishing.ts:663`).
16. Open PR → merge on `corvo-labs-dot-com` when you want it live — existing `/api/publish` (`publish/route.ts:98`).
17. Generate the LinkedIn companion from the approved blog draft **(new)**; refine, approve, submit to Buffer (once ship-plan Phase 3 lands) or paste manually.

**Phase F — series-level**

18. Watch the calendar for cadence. Reschedule freely — date-only reschedule preserves approval (`glossary.md:102`).
19. When something learned in installment 3 changes the framing of installment 5, edit entry 5's angle and regenerate. The corpus and claim map do not change; only the decomposition does.

The loop that matters is **Phase C once, Phase E many times.** The evidence review is expensive and shared; per-post work is cheap and repeated. The design deliberately front-loads scrutiny into the shared step.

---

## 9. Scope boundary

### 9.1 Blocker — must land before or with slice 1

**The mock-fallback hazard.** With `PIONEER_API_KEY` absent or failing, `research-brief`, `claim-map`, and `long-form-draft` all return canned GLP-1 content with HTTP 200 (`research-brief/route.ts:198-209`, `claim-map/route.ts:93-101`, `long-form-draft/route.ts:97-105`). For a *grounded* feature this is not graceful degradation — it is silent fabrication attributed to Jake's notebook.

Required:

1. `/api/series-plan` returns 503 on a missing key rather than a canned plan.
2. When the claim-map or draft route returns `provider: "mock"`, the series UI blocks materialization and shows a blocking banner. No quiet warning text.
3. `postSeries.provider` and `postSeries.warning` persist the provider used, so a mock-contaminated series is identifiable after the fact.
4. Ship-plan Phase 2.1 (verify `PIONEER_API_KEY` produces real output) runs before any real series.

Separately, ideally: make the mock fallbacks topic-neutral rather than GLP-1-specific. Out of scope here, worth an issue.

### 9.2 Slice 1 — "one grounded series, published"

Success test: *Jake points the CLI at his experiment repo and, within a working day, has a 3-post blog series with LinkedIn companions sitting on the calendar as approved posts, where every claim traces to a specific notebook line range.*

**In:**

| Item | Est. |
|---|---|
| `scripts/import-source-corpus.mjs` — walk, filter, chunk `.md`/`.txt`/`.csv`/`.ipynb`, secret scan, dry-run manifest | M |
| Schema: `sourceCorpora`, `sourceDocuments`, `sourceExcerpts`, `postSeries`, `seriesEntries` + 2 optional fields on `v2Posts` | S |
| `convex/corpus.ts`: `importCorpus`, `listCorpora`, `getCorpus`, `listExcerpts`, `getExcerpts`, `setExcerptSensitivity` | M |
| `convex/series.ts`: `createSeries`, `saveSeriesPlan`, `getSeries`, `listSeries`, `updateEntry`, `dropEntry`, `materializeEntry` | M |
| Extract the shared post+intent+providerState insert helper from `createPostWithIntent` | S |
| `lib/corpus.ts`: `excerptToSourceRecord` adapter | S |
| `app/api/series-plan/route.ts` | S |
| `/series` list + `/series/[seriesId]` working surface | L |
| **"Send to composer" on `/research` long-form draft** — closes §2.4 | S |
| Mock-provider blocking banner + materialization gate (§9.1) | S |
| Series chip + grounding panel in the composer (read-only) | S |
| LinkedIn companion via existing `/api/generate-draft` with `channel: "linkedin"` | S |

**Explicitly out of slice 1:**

- Browser upload of corpus material — the CLI covers Jake (§4.1)
- Embedding / vector retrieval, and the `sourceExcerpts` search index — manual selection is adequate at this corpus size (§5.3)
- AI-generated per-document summaries (`sourceDocuments.summary` stays null)
- Blending web-discovered sources with corpus excerpts in one claim map
- Corpus re-import diffing and citation migration across versions — new corpus, new series, or manual re-point
- A dedicated `/api/companion-post` route with voice guidance
- Series-level analytics, performance, or cadence recommendations
- Cross-brand series
- Any agent, chat, or orchestration layer — that is #45 (§9.4)
- Reddit, X, or YouTube entries — the channel union supports them; the workflow does not
- `.pdf` and `.docx` parsing
- Auto-regeneration of downstream entries when an upstream entry changes

### 9.3 Slice 2 and beyond

Sequenced by expected value after slice 1 is used for one real series:

1. Search index on `sourceExcerpts` + keyword pre-filter — the first thing that hurts as corpora grow
2. `/api/companion-post` with brand voice guidance
3. AI per-document summaries, for faster excerpt selection
4. Corpus versioning UX: diff two versions, re-point a series, flag citations whose lines moved
5. Blended sourcing: web `SourceRecord`s + corpus `SourceRecord`s in one claim map — trivial given §5.1, and genuinely useful ("our experiments show X, consistent with published Y")
6. Browser upload, for when someone other than Jake authors a series
7. `.pdf` / `.docx` parsing

### 9.4 Relationship to issue #45 (Marketing Director)

**This spec must not preempt #45, and does not.** The boundary:

| | Series (this spec) | Marketing Director (#45) |
|---|---|---|
| Layer | Content production | Campaign strategy and orchestration |
| Driver | Operator, step by step | Agent team, delegated |
| Input | A body of source material | Brand, goal, audience, CTA, metrics |
| Output | Posts grounded in that material | Campaign brief, VOICE.md, content plan, scheduled drafts |
| Chat/agents | None | Central |
| New surfaces | `/series` | `/campaigns` |

#45's object graph (issue body) runs `Campaign → Campaign Brief → Content Plan → Campaign Content Items → Posts`. A Series slots in as a *narrower, operator-driven sibling of Content Plan* — same position in the graph, no agent layer.

**How #45 sits above this later, without rework:**

1. Add `campaignId: v.optional(v.id("campaigns"))` to `postSeries`. One optional field; no migration.
2. #45's Content Strategist agent can call `series.saveSeriesPlan` as a tool instead of inventing its own decomposition.
3. #45's Evidence/Claim QA Reviewer — described in the issue as "especially important for FreshProof and Fact Drift" — gets a real substrate: `sourceExcerpts` and the corpus-grounded claim map are exactly what it needs to check claims against. Building it now makes #45's hardest agent tractable.
4. #45's Ops Publisher creates scheduled-but-unapproved posts; `materializeEntry` already has precisely that contract.

**No overlap** with #45's memory tables (`campaigns`, `campaignBriefs`, `voiceProfiles`, `agentRuns`, `customerResearchArtifacts`, `marketingDecisionRecords`, `strategicLearnings`, `metricSnapshots`, `analystReadouts`). None of those appear here.

**Naming does not collide.** #45 reserves `campaigns`/`campaignBriefs`/`campaignContentItems`; this spec uses `postSeries`/`seriesEntries`/`sourceCorpora`/`sourceDocuments`/`sourceExcerpts`.

**Research-split alignment.** #45's locked decision 14 separates *customer/market research* from *content research for publishing*. `sourceCorpora` is unambiguously the latter — it feeds source discovery, claim maps, evidence labels, and citation planning. #45's `customerResearchArtifacts` remain a separate family.

One honest note: #45's PRD says the Marketing Director should "ingest available FreshProof homepage/articles as seed positioning and voice artifacts." That is document ingestion, and it may end up reusing `sourceCorpora`. That is reuse in the intended direction — #45 building on this layer — not duplication. Flagged so it is a deliberate decision when #45 starts.

---

## 10. Open questions for Jake

Genuinely blocking or design-shaping. Not invented answers.

**O1 — Which repo, and how big?** Sizing the chunker and the token budget needs the real numbers: file count, total text size, formats present. Are there `.ipynb` files? How large are the CSVs? Is the material in one repo or several?

**O2 — Does the source repo stay private?** If the notebook repo is public, `corpus://` citations could become real clickable URLs, which is strictly better for reader trust. If private, §5.5's stripping requirement stands.

**O3 — How should grounding appear in the *published* post?** Three options: (a) full internal provenance stays in Convex, published post uses prose attribution ("in our own experiments…"); (b) published post carries a methods/appendix section with file references; (c) if the repo is public, real links. Affects `/api/long-form-draft` prompting and the materialization step. §5.5 assumes (a) as the default.

**O4 — Evidence labels for repo material.** The existing set is clinical (`lib/domain.ts:861-867`). §5.2 maps repo material onto it. Do you want (a) that mapping, (b) an added corpus-native label set (`experiment-result`, `observation`, `hypothesis`, `author-judgment`), or (c) a per-corpus configurable vocabulary? (a) is the zero-schema-change path and is what slice 1 assumes.

**O5 — Series size and shape for the first real one?** How many posts? Does every blog post get a LinkedIn companion, or only some? Are all installments planned up front, or does the plan grow as you write? The design supports all of these; knowing the actual first case sharpens the plan table UI.

**O6 — Does the notebook contain anything that can't be published?** Unreleased results, third-party data, collaborator names, client material. Determines whether `sensitivity` review is a required gate before materialization or an advisory badge. §4.5 assumes required-and-loud.

**O7 — CLI or UI for import?** §4.1 proposes CLI on the reasoning that the material is already on your machine and `docs/v1-ideas-import.md` proves the pattern. If you'd rather never open a terminal for this, say so now — it changes the shape of slice 1 substantially (add ~L for multi-file upload UI, drop the git provenance).

**O8 — Slice-1 ordering against the ship plan.** `plans/2026-07-19-ship-plan.md` Phase 3 (Buffer submission wiring) is the other pending build slice. If both land, do LinkedIn companions submit to Buffer, or is the first series blog-only with manual LinkedIn paste? The ship plan's Phase 3 fallback already contemplates manual paste.

---

## 11. Risks and failure modes

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Mock fallback fabricates GLP-1 content attributed to Jake's notebook** | High if env unverified | Severe — reputational | §9.1 blocker: 503 on `series-plan`, materialization gate, `provider` persisted, env verified first |
| R2 | **Model cites excerpt IDs that don't exist** (hallucinated grounding) | Medium | Severe — a citation that looks checkable but isn't | Closed ID space; validate every `sourceId` against the pinned corpus; drop unknowns and surface them. Cheap and complete. |
| R3 | **Model cites a real excerpt that doesn't support the claim** | Medium-high | Severe | Not solvable in code. Mitigated by rendering excerpt text *inline* with the claim (§5.4) so review is one glance, not a click-through. The review step is the control. |
| R4 | **Unpublishable material reaches a public post** | Medium | Severe, irreversible | Secret scan hard-fails import; `sensitivity` defaults to unreviewed; `internal-only` excerpts filtered from claim sourcing; the composer's grounding panel shows sources before approval |
| R5 | **Token budget blowout** — whole notebook into one prompt | High without guards | Moderate — cost, truncation, quality collapse | Running token estimate in the selection UI; hard ceiling on `acceptedSources`; per-entry drafting uses only that entry's claims |
| R6 | **Corpus drifts from the repo mid-series** | High over weeks | Moderate — stale citations | Immutable corpora; `commitSha` pinned; `workingTreeDirty` surfaced; new version is explicit and never silent |
| R7 | **Series posts drift apart** — repetition or contradiction across installments | Medium | Moderate — reads as sloppy | Shared thesis on the series; per-entry `angle` distinct from thesis; plan table shows all angles side by side. Cross-entry consistency checking is deferred and honestly not solved in slice 1. |
| R8 | **Two status machines fight** (`seriesEntries.status` vs `v2Posts.status`) | Medium | Moderate — the exact split-brain ADR 0005 names | Entry status terminates at `materialized`; post state is authoritative thereafter; entry status is never written by post transitions |
| R9 | **Series layer accidentally becomes a second composer** | Medium (scope creep) | High — violates ADR 0004 | `/series` renders drafts read-only. Every content edit routes to `PersistedPublishingPanel`. Enforce with a test. |
| R10 | **Series approval bulk-approves posts** | Low but tempting | High — violates P3 and #45 decision 8 | No bulk-approve action exists. `materializeEntry` hardcodes `approvalState: "unapproved"`. Test asserts it. |
| R11 | Import script chokes on a malformed/huge file | Medium | Low | Per-file try/catch → `parsed: false` + `skipReason`; size ceiling; dry-run surfaces skips |
| R12 | Convex document-size limits on large excerpts | Low | Low | Hard 1,500-token cap per excerpt (§4.4) keeps rows well under limits |
| R13 | This lands and #45 then duplicates it | Medium | Moderate — wasted work | §9.4 boundary; add `campaignId` to `postSeries` when #45 starts; #45's PRD explicitly says the agent layer must not create a parallel content system |

---

## 12. Test strategy

Follows the existing setup: vitest + jsdom + `@testing-library/react` (`vitest.config.ts:8-12`), `convex-test` for Convex functions (`package.json` devDependencies), Playwright for e2e (`playwright.config.ts`). Coverage thresholds are 60% lines/functions/statements, 50% branches (`vitest.config.ts:33-38`) — new `lib/` and `app/api/` code counts against these.

### 12.1 Unit — the chunker and adapter (`lib/__tests__/`)

- Markdown splits on headings; `headingPath` is correct for nested headings
- Line numbers are accurate, including after multi-byte characters and CRLF
- Code fences and table rows are never split mid-structure
- `.ipynb` produces one excerpt per cell with correct kinds; oversized outputs truncate
- CSV produces a schema-and-sample excerpt with correct row count and column list
- `excerptId` is deterministic — same input, same ID, across runs
- Secret scan catches `AKIA…`, PEM headers, `Bearer` tokens, `.env` assignments; hard-fails with file and line
- `.gitignore` and the skip list are honored
- `excerptToSourceRecord` produces a valid `SourceRecord`; `qualityRating` matches `classifySourceQuality`; the `corpus://` URI round-trips to `{ corpusId, path, lines, sha }`

### 12.2 Convex (`convex/__tests__/`, `convex-test`)

- `importCorpus` writes corpus + documents + excerpts with correct counts and an audit event
- `importCorpus` is idempotent on `(repoRemote, commitSha, rootPath)` — second run is a no-op
- `importCorpus` rejects a caller without brand access (`requireBrandAccess` path)
- `getExcerpts` returns only the caller's excerpts; cross-user access throws
- **`materializeEntry` produces `approvalState: "unapproved"` — always, regardless of entry state** (R10)
- `materializeEntry` with a `targetDate` produces `status: "scheduled"`, not `"approved"` (P3)
- `materializeEntry` writes post + intent + provider-state rows identical in shape to `createPostWithIntent`
- Materializing twice does not create a duplicate post
- `dropEntry` on a materialized entry leaves the post intact
- Deleting a series leaves its posts intact and reachable
- `deleteCorpus` is blocked while an active series pins it
- `setExcerptSensitivity("internal-only")` removes the excerpt from claim-sourcing candidates

### 12.3 API routes (`app/api/series-plan/__tests__/`)

Mirroring the existing route tests (`app/api/claim-map/__tests__/route.test.ts` et al.):

- Missing required fields → 400
- **Missing `PIONEER_API_KEY` → 503, and no canned plan in the body** (R1) — this is the test that distinguishes `series-plan` from its siblings
- Upstream error → 5xx with a warning, never fabricated content
- Unparseable model output → error, not silent fallback
- Claims citing unknown excerpt IDs are dropped and reported in the response (R2)
- Every returned entry has ≥ 1 claim and a non-empty angle

### 12.4 Component (`components/__tests__/`)

- Claim review renders cited excerpt text inline with path and line range (R3's control)
- A `provider: "mock"` series shows the blocking banner and disables materialization (R1)
- A `workingTreeDirty` corpus shows the reproducibility warning
- `/series` renders drafts read-only — no content-editing affordance (R9)
- No bulk-approve control exists anywhere in the series UI (R10)
- Token estimate updates as excerpts are selected; warning appears past threshold
- **`/research` long-form draft renders a "Send to composer" button that calls `createPostWithIntent`** (§2.4)

### 12.5 E2E (`e2e/`)

One high-value Playwright spec, alongside `dashboard.spec.ts` and `setup-flow.spec.ts`:

`series-flow.spec.ts` — seed a small corpus fixture → create a series → select excerpts → generate a plan (stubbed provider) → review and accept claims → materialize one entry → assert the post appears on the calendar as **unapproved** → approve it → assert it becomes eligible for PR creation.

### 12.6 Manual acceptance for the first real series

Not automatable, and the actual bar:

1. Import Jake's real repo; confirm the manifest matches expectations and nothing sensitive is flagged.
2. Confirm generated claims are traceable — pick five at random, click through to the notebook lines, verify support.
3. Confirm the series thesis and per-entry angles read as *his* argument, not a generic LLM structure.
4. Publish installment 1 end to end: composer → approve → PR → merge → live on corvolabs.com.
5. Confirm the LinkedIn companion reads as a distillation of the post, not a summary of a summary.

---

## 13. Summary of proposed changes

| Area | Change | New/Modified |
|---|---|---|
| `convex/schema.ts` | +5 tables, +2 optional `v2Posts` fields, +1 index | Modified |
| `convex/corpus.ts` | Corpus import and query functions | New |
| `convex/series.ts` | Series and entry lifecycle | New |
| `convex/publishing.ts` | Extract shared post+intent+providerState insert helper | Modified |
| `lib/corpus.ts` | Excerpt → `SourceRecord` adapter, URI helpers | New |
| `scripts/import-source-corpus.mjs` | Walk, chunk, scan, emit payload | New |
| `app/api/series-plan/route.ts` | Series decomposition | New |
| `app/api/{claim-map,editorial-outline,long-form-draft}` | — | **Unchanged** |
| `app/series/page.tsx`, `app/series/[seriesId]/page.tsx` | Series surfaces | New |
| `components/shell/Shell.tsx` | Nav item; extend `WorkspaceSurface` | Modified |
| `components/ResearchApp.tsx` | "Send to composer" on the long-form draft | Modified |
| `components/PersistedPublishingPanel.tsx` | Series chip + read-only grounding panel | Modified |
| `docs/glossary.md` | Series, Source Corpus, Excerpt, Grounded Claim | Modified |
| `docs/adr/0006-source-grounded-series.md` | Record the reuse-the-claim-pipeline decision | New (suggested) |

**Net new concepts: two.** Source Corpus and Series. Everything else is reuse.

**Not built:** a second composer, a second publishing path, a second claim model, an agent layer, an embedding store.

---

# Consolidated review (2026-07-19)

Three independent fresh-context reviews — security, coding/requirements, adversarial — plus verification of every load-bearing claim by the consolidating agent. **The three reviews converged**, which raises confidence in the conclusions below.

## Verdict: do NOT build this spec as slice 1 yet

All three reviewers independently concluded the spec is architecturally sound but **operationally overstated**, and that building it now works against the stated goal (publish the first series soon). The consolidated recommendation is a much smaller wedge first.

### The spec's central claim does not survive verification

The spec claims repo excerpts flow through `claim-map` → `editorial-outline` → `long-form-draft` with **"zero changes"** (§5.1, spec:260). Verified false in the way that matters:

`buildClaimPrompt` (`app/api/claim-map/route.ts:56-58`) sends only `title`, `evidenceLabel`, `relevanceScore`, and `useCase` to the model. **The excerpt body is never in the prompt.** The spec's adapter maps excerpt text into `useCase` truncated to the first 200 chars (§5.2) while excerpts are 400–800 tokens (§4.4). So the model would generate claims about a lab notebook it has never read — grounded in a truncated preview, cited as if authoritative.

The *types* fit with zero changes. The *prompts* do not. Corrected claim: **adapter + caller changes only, plus `buildClaimPrompt` must accept excerpt bodies.**

### Effort is ~3–4 weeks, not "small"

The spec calls the first slice small (spec:280) and its success test "within a working day" (spec:747) — but that describes usage *after* build. Independent rollup: import script 3–5d, four tables + Convex modules + tests 4–6d, `/series` UI 5–8d, routes/gates/publishing extract 2–3d, E2E 2–3d ≈ **3–4 focused weeks**. The `/series` UI alone is ~40% of slice 1 and is essentially a second `ResearchApp`.

### LinkedIn in slice 1 is hand-waved

Spec routes the LinkedIn companion through `/api/generate-draft` (spec:656, 764), but that route requires `{ idea, voicePackMarkdown, channel }` (`app/api/generate-draft/route.ts:11-16, 68-72`) — not the approved blog draft the spec says it distills from (spec:400). Two reviewers rated this P0. Compounding it: **LinkedIn submission is separately blocked** on the Buffer wiring slice (ship plan Phase 3), so this half of the feature is inert until that lands regardless.

### Real-data failure modes are under-addressed

Huge CSVs reduce to header + 20 rows (spec:193); Jupyter outputs truncate at 2 KB (spec:191) and plots — often the actual evidence — survive only as file paths; contradictory runs are both emitted with no reconciliation (spec:190-194, R7 concedes this at spec:857); heading-based chunking splits mid-argument while `headingPath` makes fragments look authoritative. The secret-scan hard-fail (spec:213) will trip on innocuous strings and turn first import into whack-a-mole.

## Findings that must be fixed regardless of whether the series feature is built

### 1. SECURITY — `/api/publish` has no approval gate, and there is no email allowlist (HIGH, live in production)

`app/api/publish/route.ts:37-43` checks only that a Clerk `userId` exists, then passes client-supplied `title`/`content` straight to `createBlogPostPR`. It never checks `approvalState`.

Worse, `/sign-up(.*)` is a public route (`proxy.ts:4-8`), and the allowlist that `proxy.ts:20` claims handles this — *"Email allowlist check is handled in the app via currentUser()"* — **does not exist**. A repo-wide grep for `allowlist`/`ALLOWED_EMAIL`/`currentUser` returns only that comment.

**Impact:** anyone who can sign up can POST to `/api/publish` and open a PR with arbitrary content against the public `corvo-labs-dot-com` repo, and can burn Pioneer/Cortex credits via the other authenticated AI routes. It creates a PR rather than merging, so nothing auto-publishes — but this is a live hole on a production app. *Unverified from here:* whether the Clerk instance restricts sign-ups at the dashboard level, which would mitigate it. **Check that first.**

**Fix:** implement the allowlist in `proxy.ts` (not "in the app"), and gate `/api/publish` on the Convex post's `approvalState` rather than trusting the client payload.

### 2. The mock-fallback fabrication hazard (HIGH)

With `PIONEER_API_KEY` missing or the API erroring, `research-brief`, `claim-map`, and `long-form-draft` return **hardcoded GLP-1/semaglutide content at HTTP 200** (`app/api/claim-map/route.ts:93-101, 124-129`; `app/api/long-form-draft/route.ts:97-105`). Not just on missing key — **on API error too**. For a grounded-content feature this is silent fabrication attributed to Jake's own notebook. The spec gates materialization (§9.1) but doesn't fix the routes. They should fail closed with a 503.

This also explains why Phase 2.1's Pioneer verification matters more than it appeared.

### 3. `/research` dead-ends before the composer (MEDIUM, blocks any grounded workflow)

`components/ResearchApp.tsx:1722-1724` tells the operator to "copy this draft into your CMS or editor." Nothing turns a long-form draft into a `v2Posts` row. Until this is fixed, `/research` is a demo, not a tool — and no grounding feature can pay off.

### 4. AuthZ gaps in the proposed design (MEDIUM)

The spec mandates `requireUserId` → `requireBrandAccess` (spec:641) but omits the `userId` ownership check that `convex/research.ts:110-118` pairs with it. Idempotency key `(repoRemote, commitSha, rootPath)` (spec:238) lacks `brandId`, and the `by_commit` index omits `repoRootPath`. Prompt-injection surface is real but human claim review is the only genuine control — the spec is honest about this (R3, spec:852), which is to its credit.

## Recommended path

**Do this now (small, unblocks publishing):**
1. Fix the `/api/publish` approval gate + implement the allowlist. Security, live, unrelated to this feature.
2. Make `claim-map` / `long-form-draft` / `research-brief` fail closed (503) instead of returning GLP-1 mock content.
3. Add "Send to composer" from the research long-form draft (§2.4) — small, and converts `/research` into something usable.
4. Verify `PIONEER_API_KEY` produces real output (ship plan Phase 2.1).
5. Publish series 1 using `capturedIdeas` + pasted notebook excerpts + the composer, blog-first, LinkedIn manual or post-Phase-3.

**Then reassess.** Build the corpus/series machinery only if, after one real series, Jake is demonstrably spending significant authoring time on "which notebook line supports this claim?" If grounding proves non-negotiable before then, the smallest honest wedge is: a markdown→`SourceRecord[]` script carrying **full excerpt text**, a patched `claim-map` prompt that includes excerpt bodies, and reuse of the existing `/research` claim review UI — skipping the series tables, `/series` UI, and `series-plan` route entirely.

## What the reviews confirmed as correct

The `/research` dead-end and mock-fallback hazards are real and well-caught. Immutable corpus pinned to a commit SHA (spec:240-244) is the right call for a multi-week series. The publishing-safety invariants hold: `materializeEntry` never approves, no bulk approve, schedule≠approval (spec:147, 645-646), consistent with `createPostWithIntent` (`convex/publishing.ts:552-553`). The relationship to #45 is correctly drawn — no overlap, and this layer would make #45's evidence-QA agent tractable. The spec's own honesty about R3 being unsolvable in code is a point in its favor.

---

# Addendum: real notebook samples (2026-07-19) — answers O1

Jake supplied three representative lab notebooks, all in `/Volumes/rexy/GitHub/lower-db`:

- `docs/operations/claim-ledger-review/experiments/2026-05-25-v2-concurrent-experiments/human-review-calibration/repair-iteration-5/lab-notes.md` — 157 lines, 6.5 KB
- `docs/operations/claim-ledger-review/experiments/2026-05-26-evidence-eval-loop-series/input-snapshot/human-review-calibration/repair-iteration-2/lab-notes.md` — 117 lines, 4.6 KB
- `experiments/weekly-digest-search-bakeoff/lab-book.md` — 432 lines, 21 KB

## What this changes

**1. The "messy data" risk is much smaller than the adversarial review assumed.** These are clean, heading-structured markdown with an explicit `## Objective` / `## Implementation` / phase-or-round sections / conclusions rhythm. Heading-based chunking (§4.4) will work well on this shape. Sizes are trivial — the largest is 21 KB, so the whole corpus for one series fits comfortably in a single prompt if needed. **The chunker can be far simpler than specced, and the CSV/Jupyter truncation logic is not needed for slice 1.**

**2. The corpus unit is the experiment DIRECTORY, not the notebook file.** `repair-iteration-5/` also contains `proposal.md`, `routing-summary.md`, `tuning-summary.md`, `review/`, and comparison output dirs; `weekly-digest-search-bakeoff/` also contains `notebook.ipynb`, `labels/`, `normalized/`, `reports/`. The notebook is the spine, but the citable artifacts sit beside it. `--path` pointed at the experiment directory is the right default.

**3. The content is unusually citable — this is the strongest argument FOR the feature.** These notebooks are dense with hard numbers: `false_accept_rate: 0.0%`, `exact_agreement_rate: 68.8%`, `Raw result count: 505`, `deduped: 383`, `GDELT ... 76.2% error/failure rate`. Claims map to specific measured values with no interpretive gap — exactly the case where citation traceability pays off, and exactly where fabricated content would be most damaging.

**4. A series maps naturally onto iterations/rounds.** `lab-book.md` runs Round 0 → Round 1 → …; the claim-ledger work runs repair-iteration-2 → 4 → 5, with later iterations explicitly referencing earlier ones. The narrative arc a reader wants ("the baseline failed, here's what we changed, here's what it proved") is already latent in the structure. **The series decomposition should follow the notebook's own round/iteration boundaries** rather than asking a model to invent an arc.

**5. Publication scrubbing is confirmed necessary, with a concrete example.** `lab-book.md:33` cites `/Users/jacobbutler/Downloads/hybrid-results.json`. The notebooks also embed full `pnpm tsx` invocations with internal repo paths, internal prompt aliases (`bakeoff_judge_pioneer`, `claim_review_eval_judge_fireworks`), and vendor names. Some of that is fine to publish and some is not — it needs an operator decision at materialization, not a regex. Confirms O3 is real and that the `unreviewed` default gate matters.

**6. `.gitignore` is a live concern (spec:198).** These experiment dirs contain generated output (`normalized/`, `reports/`, `labels/`) that may well be gitignored — and some of it is the actual evidence. The dry-run must clearly report what it skipped.

## Revised guidance for the follow-up build

Keep: immutable corpus pinned to commit SHA, heading-based chunking, the excerpt→`SourceRecord` adapter, series-as-installments.

Change: drop CSV/ipynb chunking from slice 1 (markdown only); default the corpus unit to a directory; derive series installments from the notebook's own round/iteration headings; and carry **full excerpt text** into the claim step — non-negotiable given the P0 finding that `buildClaimPrompt` (`app/api/claim-map/route.ts:56-58`) never sees excerpt bodies.

# Content bundles → coordinated cross-brand campaigns

**Date:** 2026-11-20
**Status:** Rev 5 — revised after three GPT-6.2 Sol reviews and Jake's answers of 2026-11-20 (§13). Awaiting Jake's approval. Nothing is built yet.
**Author:** Claude Fable 5.2, from a 20-question interview with Jake on 2026-11-19/20
**Builds on:** `docs/campaigns/2026-09-06-campaign-loop-spec.md` (the campaign loop, shipped as C1–C8)
**Baseline:** `origin/main` at `5a5f016`

---

## 1. Outcome

Jake finishes an experiment in any repo, types one command to his coding agent, and a few minutes later a **proposed campaign** is waiting in Resonate:

- the lab notebook, outline, first drafts, result data and an account of the session are stored as one immutable source version, visible only through that campaign;
- a plan the agent proposed is laid out as pieces across brands, each brand with its own angle and voice;
- open publishing questions ("do we name the vendors?") wait for his answer and block drafting until answered;
- after he accepts the plan, Resonate drafts every piece with each number and quote bound to the passage or data cell it came from, rejects drafts whose claims are not supported, and puts the set on the calendar as scheduled-but-unapproved;
- blog posts go out as pull requests, LinkedIn posts through Buffer, and everything else (LinkedIn Articles, TikTok, Reels, Shorts, Instagram carousels) as an export he uploads himself and then records the live URL for.

A bundle may describe a single experiment or a **multi-article series**: several installments, each with its own article, complemented by posts, video and carousels across brands, with brands promoting each other's articles where that fits.

**First proof:** the Firecrawl search-comparison experiment in the `freshproof-lite` worktree (`exp/search-provider-comparison`). Its lab notebook is a Claude doc and its run data sits in a git-ignored folder.

**Standing rules that do not change:** schedule ≠ approval; nothing auto-approves; nothing reaches a provider without approval; the agent's token can propose, never accept, approve or publish.

## 2. Decisions from the interview (fixed requirements)

| # | Topic | Jake's decision |
|---|---|---|
| J1 | Handoff | A skill in the coding agent plus a command-line push to Resonate over an authenticated API |
| J2 | Planner | The coding agent proposes the plan; Jake refines and accepts it in Resonate |
| J3 | His own drafts | Polished in brand voice |
| J4 | First proof | The Firecrawl search-comparison thread |
| J5 | Short video | Script package now; data model must allow rendered video later without rework |
| J6 | LinkedIn essay | A native LinkedIn Article, published by hand. May be the same content as a blog post, republished. Promo posts on LinkedIn point at the LinkedIn Article, not the external blog URL |
| J7 | Instagram | Carousel of slides |
| J8 | TikTok / IG / YouTube publishing | Export first; provider API later |
| J9 | Cross-brand | One campaign; each piece names its brand |
| J10 | Brand angle | A different angle per brand, in that brand's voice |
| J11 | Blog homes | Corvo Labs blog and FreshProof blog (`freshproof-lite/content/blog`) |
| J12 | LinkedIn identities | Personal profile, Corvo Labs page, FreshProof page, the lower dB page |
| J13 | Voice | Voice profiles stored and editable in Resonate, one per brand and one personal |
| J14 | Open publishing questions | Answered in Resonate before drafting; answers become rules every draft follows |
| J15 | Re-push | New source version; affected drafts flagged stale; Jake picks what to regenerate; approved and published pieces never touched |
| J16 | Scheduling | Resonate proposes dates from the sequence; Jake adjusts |
| J17 | Agents | Claude Code (including T3 Code) and Codex |
| J18 | Carousel art | Brand templates rendered from data plus AI image generation for variety |
| J19 | Accuracy | Block untraceable numbers and quotes |
| J20 | Sources | Repo files, Claude docs by link, result data files, and the coding session itself |
| J21 | Default plan | Standard pack per brand: one article (blog + LinkedIn Article), three LinkedIn posts, one short-video script for TikTok/Reels/Shorts, one Instagram carousel |
| J22 | Video/IG brands | Corvo Labs, FreshProof, the lower dB |
| J23 | Source safety | Automatic scrub at push; review happens at the draft, with the source beside each figure |
| J24 | Build routing | §11 |
| J25 | Personal | Personal is an editorial brand in its own right, with its own pieces, as well as an account |
| J26 | LinkedIn Articles | **Every** long-form LinkedIn Article, for any brand, is published by hand from Jake's personal profile |
| J27 | The lower dB | May lead a bundle campaign |
| J28 | Series | One bundle can carry a multi-article series, complemented by cross-brand posting, cross-promotion between brands where appropriate, and all formats |
| J29 | Support check | Keep it (CB-13) |
| J30 | Series proof | The six-post FreshProof history outline (`freshproof/docs/history/blog-series-outline.md`), first two installments (CB-39) |
| J31 | Personal profile | Publishing anything from Jake's profile needs rights on the Personal brand as well as on the brand that wrote the piece |

## 3. What exists and what is missing

Verified against `origin/main`. Corrected in rev 2 where the review found errors.

**Exists** (what a bundle campaign reuses is decided in §4.5: posts, review series, approval and publishing; not the in-app campaign, corpus or idea records)
- Campaign loop: `convex/campaigns.ts`, `shapes.ts`, `draftSet.ts`, `draftGeneration.ts`, `cohesion.ts`, `queue.ts`, `campaignSeries.ts`; UI under `app/campaigns/**`. One slot produces one draft post for one destination.
- Immutable brand corpus: `corpora`, `corpusDocuments` (generic `meta`), `corpusExcerpts` (free-text `provenance`); `convex/corpora.ts`; `lib/corpusExtract.ts`. Corpus reads are authorised by brand membership only.
- Machine ingest precedent: `scripts/corpus-import.mjs` → `app/api/ops/lab-import/route.ts` → `corpora.importLabBundle`. It uses a shared bearer secret, a deployment-wide deploy key, and a process-local rate limiter. It is a precedent, not a pattern to copy.
- Live drafting with inline `corpus://` citations. Budget control is admission against an estimated cost per draft. The validator checks cited strings against the idea's allow-list; it does not prove the evidence resolves.
- Voice: a Corvo placeholder pack and Jake's personal pack exist as code constants, Jake's bound as the Corvo default (`lib/domain.ts:371`), and are used by `/api/llm` and `/api/generate-draft`. **Campaign drafting injects no voice.**
- Article ↔ companion link binding (`{{articleUrl}}`, hold until published): `convex/articleDependencies.ts`. Requires a same-brand `corvo-blog` parent.
- Blog pull requests: `lib/github.ts`, `app/api/publish/route.ts`. Corvo-channel-specific, one deployment-configured repository, article and hero bytes exported together.
- LinkedIn via Buffer: `convex/bufferLive.ts`, `convex/bufferDelivery.ts`. Corvo and the lower dB are the source defaults; any brand can be mapped through `BUFFER_LINKEDIN_CHANNELS`. Which accounts are mapped live is unverified.
- Evidence-bound SVG figures from tabular data: `lib/visualFigures.ts`.
- Feature verification: `npm run verify:feature -- <id>`.

**Missing**
1. No bundle concept: outlines, drafts, data and a plan cannot arrive together.
2. No user-scoped machine credential.
3. No dedicated source lineage (repo, commit, path, hash, role).
4. Slots carry no brand, one destination each, and no notion of a piece published in several places.
5. Campaign drafting uses no voice.
6. **Live defect: nothing removes `corpus://` markers from campaign posts before a blog PR or Buffer submit.**
7. **Live defect: "add to calendar" on a partly scheduled batch resets every post, including approved ones, to unapproved with new dates** (`convex/queue.ts:165-230`).
8. Numbers and quotes are not checked against evidence. The CSV extractor keeps column names and a row count only, so a data value cannot be traced at all.
9. No manual-publish path, no export package, no way to record a live URL for a hand-published piece.
10. No structured content for video scripts or carousels; no slide rendering.
11. Brand and channel lists are duplicated across validators, UI maps and routes.
12. FreshProof has no blog destination. Its blog loader (`freshproof-lite/src/lib/blog.ts`) has a strict frontmatter schema and no hero image.

## 4. Design

Sections 4.1–4.13 are **normative**: issue contracts cite them instead of repeating shared rules. Where a contract and this section disagree, this section wins and the contract is corrected. This file is landed on `main` by CB-00.

### 4.1 Vocabulary (to be added to `docs/glossary.md`)

| Term | Meaning |
|---|---|
| **Content bundle** | What a coding session pushes: a manifest, source files, open decisions and a proposed plan. Identified by a stable `bundleKey`. |
| **Bundle version** | One immutable push. Creates one campaign-scoped source version. |
| **Source** | One file in a bundle, with a role: `notebook`, `outline`, `draft`, `data`, `session-account`, `reference`. |
| **Installment** | One step of a campaign's plan: at least one article plus the pieces that complement it. Every bundle campaign has installments; a single-experiment campaign has exactly one, keyed `main`. |
| **Series** | A campaign with more than one installment. |
| **Bundle campaign** | A campaign created from a bundle. It lives in its own tables, separate from in-app campaigns (§4.5). |
| **Piece** | One unit of content in an installment: an article, a post, a short-video script, a carousel. Has one **editorial brand** and a permanent key. |
| **Editorial brand** | The brand whose voice, angle and review series a piece belongs to. Never changes with where the piece is published. |
| **Account** | A physical place content is published: Jake's LinkedIn profile, the FreshProof LinkedIn page, the Corvo blog, FreshProof's TikTok. Each account has an owning brand. |
| **Delivery** | One publication of a piece on one account, in one mode (`provider` or `manual`). Each delivery becomes one post on the calendar. |
| **Primary delivery** | The delivery whose post holds the piece's canonical draft. |
| **Mirror delivery** | A delivery whose body is the approved body of the primary (blog article → LinkedIn Article). |
| **Cross-promotion** | A piece from one editorial brand that links to another brand's article in the same installment. |
| **Claim binding** | A number or quote at a specific place in a draft, tied to the passage or data cell that supports it. |
| **Decision** | An open publishing question carried by the bundle. Its answer becomes a drafting rule. |
| **Run** | One drafting or regeneration job for one installment, pinned to exact plan, source, decision and voice versions. |
| **Manual publish** | A delivery Resonate prepares and exports; a human uploads it and records the live URL. |
| **Dispatch** | Any step that moves a post out of Resonate or commits a provider to it: queue reservation, release, submission, pull-request creation, export. Giving a post a calendar date is not dispatch. |

### 4.2 Flow

```
coding session (any repo)
  └─ /resonate-campaign skill
       1. resonate capabilities          what this Resonate accepts today
       2. gather sources                 repo files · Claude doc export · result data · session account
       3. write manifest + plan          installments · standard pack per brand · distinct angles · decisions
       4. resonate bundle push --dry-run local secret scan, then the server's report
       5. show Jake the report → push    returns the campaign URL
Resonate
  ingest endpoint (Convex HTTP action; ingest token: propose-only)
    → bundle version: sanitised, immutable sources with lineage, in the bundle's own tables
    → proposed bundle campaign: sources · decisions · plan (installments → pieces → deliveries)
  Jake: answer decisions → edit plan → accept (once, for the whole plan)
  per installment:
    → run: clean copy + claim bindings, pinned to plan / source / decision / voice versions
    → evidence gate (deterministic bindings, support check) → cohesion report
    → add to calendar (installments in order): one post per delivery, dated but unapproved
  Jake: review claims beside evidence → approve
    → dispatch interlock → blog PR · Buffer · manual export → record live URL → held promos ask for review
```

### 4.3 Bundle format v1

A directory, conventionally `.resonate/bundles/<slug>/` (git-ignored), holding `bundle.json` and the files it references by relative path. No archives, no absolute paths, no traversal, no symlinks leaving the directory.

```jsonc
{
  "schemaVersion": 1,
  "bundleKey": "freshproof-lite/firecrawl-search-comparison",
  "title": "Is Firecrawl good enough to pay for?",
  "origin": { "repoRemote": "github.com/jakebutler/freshproof-lite", "branch": "exp/search-provider-comparison",
              "commitSha": "8acd4b61", "dirty": true, "agent": "claude-code" },
  "sources": [
    { "key": "notebook", "role": "notebook", "path": "sources/lab-notebook.md", "sha256": "…",
      "title": "Lab notebook", "visibility": "publishable",
      "internalHeadings": ["For the essay", "Data appendix"], "exportedFrom": { "kind": "claude-doc" } },
    { "key": "results", "role": "data", "path": "data/results.csv", "sha256": "…", "visibility": "publishable",
      "table": { "rowKey": "provider",
                 "columns": [{ "name": "agreement", "type": "number", "unit": "%",
                               "measure": "agreement with the answer key", "population": "48 claims" }] },
      "lineage": { "script": "analyze.py", "scriptSha256": "…",
                   "inputs": [{ "path": "eval-output/verdict/cmp-fc-dev2-A.json", "sha256": "…" }] } },
    { "key": "session", "role": "session-account", "path": "sources/session-account.md", "sha256": "…",
      "visibility": "publishable" },
    { "key": "my-draft", "role": "draft", "path": "drafts/linkedin-essay.md", "sha256": "…", "visibility": "publishable" }
  ],
  "decisions": [
    { "key": "name-vendors", "question": "Name Parallel, Exa and Firecrawl?",
      "options": [
        { "key": "yes", "label": "Name all three", "rule": "Vendors may be named." },
        { "key": "no", "label": "Do not name them", "rule": "Refer to vendors generically.",
          "bannedTerms": ["Firecrawl", "Exa", "Parallel"] }],
      "recommended": "yes" }
  ],
  "plan": {
    "leadBrand": "freshproof", "goal": "…", "audience": "…",
    "brands": [{ "brand": "freshproof", "angle": "…" }, { "brand": "corvo", "angle": "…" }],
    "series": { "title": "…", "thesis": "…", "cadenceDays": 7,
                "installments": [{ "key": "main", "order": 1, "title": "…", "theme": "…" }] },
    "pieces": [
      { "key": "fp-article", "brand": "freshproof", "installment": "main",
        "format": "article", "role": "pillar", "order": 1,
        "title": "…", "angle": "…", "sourceKeys": ["notebook", "session", "results"], "treatment": "generate",
        "deliveries": [
          { "key": "blog", "channel": "freshproof-blog", "primary": true },
          { "key": "li-article", "channel": "linkedin", "as": "article", "account": "linkedin:personal", "mirrorOf": "blog" }] },
      { "key": "fp-post-1", "brand": "freshproof", "installment": "main",
        "format": "post", "role": "cta", "order": 2,
        "title": "…", "angle": "…", "sourceKeys": ["notebook"], "linksTo": "fp-article",
        "deliveries": [{ "key": "li", "channel": "linkedin", "primary": true }] },
      { "key": "corvo-promo", "brand": "corvo", "installment": "main",
        "format": "post", "role": "satellite", "order": 3,
        "title": "…", "angle": "…", "sourceKeys": ["notebook"], "linksTo": "fp-article",
        "deliveries": [{ "key": "li", "channel": "linkedin", "primary": true }] }
    ]
  }
}
```

**Structure rules**
- `plan.series` is optional. Without it there is one implicit installment, `main`, and pieces may omit `installment`.
- **Keys are permanent identities.** `sources[].key`, `decisions[].key`, installment keys and **piece keys are unique across the whole manifest** (a piece key is not scoped to its installment); a delivery key is unique within its piece. Keys match `[a-z0-9][a-z0-9-]{0,47}`. `order` only orders pieces inside an installment and may repeat across installments. A later version that reuses a piece key with a different `brand` or `format`, or a delivery key with a different `channel`, `as` or `account`, is malformed (`key-reused`). Rows for unchanged keys are never re-created when the plan changes.
- A piece has exactly one editorial `brand`. A delivery has **no brand**: it names a `channel`, optionally `as` and `account`. `account` defaults to the editorial brand's own account for that channel (§4.6). **A LinkedIn delivery with `as: "article"` always uses `linkedin:personal`** (J26); any other value is rejected.
- Each piece has exactly one `primary` delivery. `mirrorOf` names the primary delivery of the same piece.
- `treatment: "polish"` requires `draftSourceKey` naming a `draft` source.
- Personal (J25) takes `post` and `article` pieces only (J22).
- `visibility: "reference-only"` sources and `internalHeadings` sections can support numeric claims but are never quoted.
- A `data` source declares its table: `rowKey`, and per column `name`, `type`, and for numeric columns `unit`, `measure`, and where relevant `population` and `timeframe`. `lineage` pins the script, its invocation, each input and the output by hash.
- Format v1 carries UTF-8 text only (`.md`, `.txt`, `.csv`, `.json`). Anything else is malformed.
- Manifest text fields (titles, angles, decision text, file names) are **rejected**, not rewritten, if they contain secrets or scrub-rule matches.

**Plan rules, checked per installment** (the single authority; used at ingest, after capability filtering, after every operator edit, at acceptance and at append):
1. Each installment has at least one `article` piece.
2. Per editorial brand, per installment: at most one `article`, at most one `pillar`, at most one `cta`. A brand's `pillar`, if it has one, is its `article`.
3. Each installment has at least one `cta` **overall** (never required per brand).
4. Every non-article piece either `linksTo` an article **in the same installment** (its own brand's, or another brand's: a cross-promotion) or sets `standalone: true`.
5. The installment's **anchor article** is the lead brand's article if it has one in that installment; otherwise the article of the first brand in `plan.brands` order that has one. Scheduling starts from the anchor.
6. A brand may take part in an installment with no article, pillar or CTA of its own (for example one cross-promotion post).

**Deferral and link targets.**
- A piece whose `linksTo` **piece** is deferred is itself deferred (`target-deferred`).
- A piece whose target piece is supported keeps its link even when one of the target's *deliveries* (for example its LinkedIn Article) is deferred. What the dependent then waits for is decided by §4.10.
- After deferral is applied, the plan rules are checked on the supported subset. If they fail, the push is **still stored** and the campaign is proposed as `not-acceptable`, with each failing rule named. It becomes acceptable through operator edits (retarget a link, mark a piece standalone, change a role, remove a piece: CB-06) or when the server gains the capability. Nothing can be accepted, drafted or scheduled while it is `not-acceptable`.

**Validation result classes.** Every source, decision, installment, piece and delivery item is exactly one of: `malformed` (the push is rejected), `unauthorised` (the push is rejected), `deferred` (well-formed but this server does not support it yet; kept in the stored manifest, creates no row), `supported`.

**Capabilities.** `GET /ingest/capabilities` returns, as versioned stable JSON: schema versions; enabled `(editorial brand, channel, as, account, format, mode, dispatch)` tuples; `maxInstallments`; `rePush` (bool); and the **enabled limits**.
- `mode` is `provider`, `manual` or `undetermined`. A LinkedIn post delivery is `undetermined` until its account has been verified (CB-29): the tracer does not claim to know whether Buffer is mapped.
- `dispatch` is `enabled` or `held`. `held` means the piece can be drafted, reviewed and given a calendar date, but cannot leave Resonate yet (§4.7, dispatch interlock).

The format's maximums and the enabled limits are separate:

| Limit | Applies to | Format maximum | Enabled at M1 |
|---|---|---|---|
| Request body | raw bytes, counted as they stream | 8 MB | 3 MB |
| Manifest | raw bytes | 250 KB | 250 KB |
| Sources | count | 60 | 20 |
| Text source | sanitised bytes, each | 200 KB | 200 KB |
| Total text | sanitised bytes | 4 MB | 1.5 MB |
| Data source | parsed table | 500 rows × 24 columns and 400 KB serialised | 200 rows × 24 and 200 KB |
| All data sources together | serialised bytes | 2 MB | 600 KB |
| Excerpt | stored bytes (hard-split) | 8 KB | 8 KB |
| Excerpts per version | count | 2,000 | 600 |
| Installments | count | 12 | 1 (`maxInstallments`) |
| Pieces | count | 120 total, 20 per installment | 20 total; 10 supported |
| Deliveries per piece | count | 4 | 1 |
| Evidence per piece | per run | 40 passages and 150 KB | same |
| Bindings per post | count | 200 | same |
| Posts per editorial brand per installment | count | 25 | 10 |
| Report | items and bytes | 200 items, 64 KB | same |

An enabled limit is raised only by the issue that owns the capability, after its measured test passes with headroom (§9). Until typed datasets exist (CB-12), a data source is validated against these limits and stored as one reference-only summary (its header and row count); numbers bind to passages.

**Wire contract** (frozen; `lib/contentBundle` and the command-line tool are both tested against the examples committed by CB-04):

```
POST /ingest/bundles[?dryRun=1]
Authorization: Bearer rsn_ing_…
Content-Type: application/json

{ "manifest": { …bundle.json, unmodified… },
  "files": [ { "path": "sources/lab-notebook.md", "content": "…UTF-8 text…" } ],
  "baseVersion": null,
  "fingerprint": "sha256:…" }
```

- `files` has exactly one entry per `sources[].path` and nothing else. The server recomputes each file's SHA-256 over the UTF-8 bytes of `content` and compares it with the manifest's `sha256`.
- `fingerprint` is `sha256:` + the SHA-256 of the manifest serialised by RFC 8785 (JSON Canonicalization Scheme). It covers the **whole** manifest, `origin` included; file contents are covered through the hashes the manifest carries. V1 manifests contain integers only, so number formatting is not in play. The server recomputes it and rejects a mismatch.
- `baseVersion` is `null` on a first push, otherwise the version the client last saw.
- Every response is a JSON report:

```
{ "reportVersion": 1,
  "result": "dry-run" | "created" | "unchanged" | "new-version" | "rejected" | "conflict",
  "bundleKey": "…", "version": 1, "currentVersion": 1, "campaignUrl": "…", "acceptable": true,
  "items": [ { "kind": "source" | "decision" | "installment" | "piece" | "delivery" | "manifest",
               "key": "fp-article/li-article", "class": "supported" | "deferred" | "malformed" | "unauthorised",
               "code": "delivery-not-enabled", "message": "…" } ],
  "planRules": [ { "installment": "main", "rule": 3, "passed": false, "message": "…" } ],
  "scrub": { "paths": 4, "privateUrls": 1, "emails": 2 },
  "limits": [ { "name": "sources", "value": 4, "enabled": 20 } ],
  "truncated": false }
```

- `items` lists malformed and unauthorised items first, then deferred, then supported; it is cut at the report limit with `truncated: true`. `code` comes from one fixed list (`lib/contentBundle/codes.ts`).
- HTTP status: 200 for `dry-run`, `created`, `unchanged`, `new-version`; 400 malformed; 401 bad, expired or revoked token; 403 unauthorised; 409 conflict; 413 over a limit; 429 rate limited. The body is a report in every case where the token was valid.
- A dry run of a `bundleKey` the server has never seen predicts `created`; otherwise it predicts `unchanged`, `new-version` or `conflict` from `baseVersion` and the fingerprint.

### 4.4 Authentication and the ingest endpoint

- **Endpoint:** Convex HTTP actions in a new `convex/http.ts` (`/ingest/capabilities`, `/ingest/bundles`, `/ingest/bundles/status`). Each calls fixed internal functions. No deploy key and no Next.js route.
- **Token:** `rsn_ing_` + 32 random bytes, shown once; only its SHA-256 is stored, indexed. Lifetime 1–365 days, default 90. Scope `bundle:push`. It carries `brandIds`, fixed at mint.
- **Authority is decided in one place, inside the transaction that acts on it.** `authoriseIngest(ctx, tokenHash, need)` is called by every committing mutation and by the status query. In that same transaction it reloads the token row and checks: it exists, is not expired, is not revoked, has the scope; every editorial brand and every account-owning brand named **anywhere in the manifest, deferred items included**, is in the token's `brandIds`; the token's owner **currently** holds owner or editor on each of those brands; an existing `bundleKey` belongs to that owner. The lookup the HTTP action does before reading the body is an early rejection only and grants nothing: a token revoked between that lookup and the commit commits nothing.
- **Revocation.** An owner revokes their own tokens in Resonate. Removing a person: remove their brand memberships (their tokens fail at next use), then the deployment operator runs the internal mutation `ingestTokens.revokeAllForUser` from the Convex dashboard or CLI. It is not callable from a client. Convex cannot see the sign-in allow-list; the runbook says so.
- **Cannot do:** anything but capabilities, dry run, commit and minimal status of its own bundles. A token is not a Convex identity; public functions still require a Clerk session.
- **Abuse limits:** the bearer token is looked up before the body is read. The body is counted **as it streams** and cut off at the enabled limit (`Content-Length` is advisory). Rate limits are stored in Convex per token and per owner. Rejection audit is bounded: per token one row a minute; for unknown tokens one global row a minute with a count.
- **No file storage at ingest.** Sanitised text is stored as excerpt rows and tables as dataset rows, written with the bundle version, its campaign and its plan rows by **one** mutation. Nothing is staged, so there is nothing to orphan. The M1 enabled limits are chosen to fit one transaction, and CB-40 measures the largest accepted push against Convex's limits. An issue that raises a limit beyond one transaction (CB-49) owns the staged commit and its recovery.
- **Dry run** writes no product state. Rate-limit and audit accounting are allowed.
- **Idempotency and concurrency:** a commit carries `baseVersion` and the fingerprint (§4.3). Same fingerprint as an existing version → `unchanged`, with the **current** version number (the client stores the current one). A new fingerprint with a stale `baseVersion` → `conflict`. Concurrent first pushes yield one bundle (Convex transaction conflicts). Changed re-pushes are refused until `rePush` is enabled, which CB-14 does once impact protection exists (§4.6).
- `/api/ops/lab-import` is untouched.

### 4.5 Isolation

**Bundle data lives in its own tables.** A bundle campaign is a `bundleCampaigns` row, with `bundleVersions`, `bundleDocuments`, `bundleExcerpts`, `bundleDatasets`, `bundleInstallments`, `bundlePieces`, `pieceDeliveries`, `bundleDecisions`, `acceptedPlanRevisions` and `bundleRuns` beside it. No bundle row is ever written to `campaigns`, `campaignShapes`, `campaignSlots`, `campaignIdeas`, `campaignDrafts`, `materializations`, `ideas`, `corpora`, `corpusDocuments` or `corpusExcerpts`.

The consequence is the point: no in-app campaign, corpus, idea, research or workflow function can list, attach, ground on or change bundle data, because their arguments and queries only reach the legacy tables. Nothing needs to be remembered when a legacy function is added later. A static test (owned by CB-40) asserts that no module outside the bundle modules references a bundle table, and that the bundle modules reference none of the legacy tables listed above. Bundle campaigns need no hidden ideas, and none are created.

- **Only sanitised text is stored.** Originals stay in the repo they came from.
- **One evidence resolver** (`convex/bundleEvidence.ts`) is the only reader of `bundleExcerpts` and `bundleDatasets`. It takes `{ bundleCampaignId, sourceVersion, purpose, postId? }` where `purpose` is `proposal-display`, `ground`, `quote` or `post-review`. It authorises the caller (§4.6), checks that the named version **belongs to that campaign**, and for `post-review` that the post belongs to that campaign and that the version is one a recorded revision of that post is pinned to. It then resolves against the named version, so a post drafted on version 1 still shows version 1 evidence after version 2 arrives. `quote` never returns reference-only text. Reads are bounded and deduplicated.
- Bundle functions live in `bundleCampaigns`, `bundleRuns`, `bundleCohesion`, `bundleCalendar`, all behind `requireBundleCampaign(ctx, bundleCampaignId, action, pieceKey?)`, which applies the role matrix in §4.6.

**Shared surfaces.** Bundle rows appear in exactly these shared tables: `v2Posts`, `postSeries`, `seriesEntries`, `seriesPostLinks`, and the publishing and queue tables keyed by a post.

- A bundle post carries `bundleCampaignId` and `sourceDeliveryId`, set when it is created and never changed. It never sets `sourceCampaignId`, `sourceIdeaId`, `sourceResearchBriefId`, `sourceExcerptIds` or `companionLink`, and holds no `corpus://` citation. To legacy readers it is therefore a plain post with nothing to resolve; its evidence is reachable only through the resolver.
- Every exported Convex function, HTTP route and scheduled function that reads or writes those shared tables is classified in `docs/content-bundles/shared-surfaces.md` as one of:
  - `plain`: treats a bundle post as any post, and is safe because it neither dispatches nor reads sources;
  - `guarded`: calls the dispatch interlock (§4.7) before it acts;
  - `refuses`: rejects a bundle post or a bundle-managed series;
  - `bundle-aware`: has bundle-specific behaviour, naming the issue that adds it and the class it has until then (`refuses` unless the table gives a reason it is safe as `plain`).
- The table covers at least `publishing`, `seriesReview`, `series`, `campaignSeries`, `queue`, `queuePlanning`, `queueRelease`, `articleDependencies`, `articlePublication`, `bufferDelivery`, `bufferLive`, `visualLinkedEvidence`, the visual modules that read posts, the import modules that write series, and `app/api/publish/route.ts`. CB-00 writes the table. A test fails when an export in a listed module is unclassified, and when a `guarded` or `refuses` entry lacks its check.
- **CB-45 lands the marker, the interlock, the managed-series locks and every `guarded` and `refuses` check before any bundle post exists.** The first bundle post is written by CB-07.

### 4.6 Pieces, accounts, deliveries, runs

**Editorial brand and account are separate identities.**
- A piece (`bundlePieces`) has one editorial brand. **Every post of every delivery carries `post.brandId` = the editorial brand**, so series membership, voice and brand permissions follow the editorial brand even when the piece is published elsewhere.
- An **account** is a registry entry: `id`, `channel`, `ownerBrand`, `kind`, `timezone`, `defaultTimes`. LinkedIn: `linkedin:personal` (owner `personal`, a profile), `linkedin:corvo`, `linkedin:freshproof`, `linkedin:lower-db` (pages). Blogs: `blog:corvo`, `blog:freshproof`. Short video and Instagram: one account per brand for Corvo Labs, FreshProof and the lower dB.
- Before acceptance a piece's proposed deliveries are part of its `bundlePieces` row. **A delivery row is created at acceptance**, from the first accepted plan onward, and pins the physical account. `pieceDeliveries` stores: `bundleCampaignId`, `installmentKey`, `pieceKey`, `deliveryKey`, `editorialBrandId`, `accountId`, `channel`, `as?`, `format`, `mode` (`provider | manual | undetermined`), `role: primary | mirror | fanout`, `mirrorOfDeliveryKey?`, `linkTarget?` (§4.10), `postId?`, and, once verified, the pinned provider identity. Its identity is `(bundleCampaignId, pieceKey, deliveryKey)` for the life of the campaign.
- Routing, capacity, reservation and dispatch of a bundle post use the delivery's `accountId` and pinned provider identity, never a lookup by `post.brandId`. Until CB-29 changes the provider code paths to do so, no LinkedIn delivery of a bundle post is dispatchable (§4.7).
- Using `linkedin:personal` for a delivery does **not** create a Personal editorial piece, series or voice.

**Role matrix.** "Editorial" = owner or editor on the piece's editorial brand. "Account" = owner or editor on the account's owning brand. The campaign's owner is always required as well. Every bundle function states which row it is.

| Action | Scope | Requires |
|---|---|---|
| Ingest commit, status (token) | whole plan | editorial on every piece brand; account on every delivery account; all within the token's scope |
| Read the proposal, the plan and the sources as a whole | whole plan | editorial on every brand in the plan |
| Accept, append an installment, answer decisions, apply plan differences, edit the plan | whole plan | editorial on every brand in the plan; account on every delivery account |
| Start a run for an installment; add an installment to the calendar | whole installment | editorial on every brand with a piece in that installment; account on every delivery account in it |
| Read one piece, its drafts and its evidence | piece | editorial on that piece's brand |
| Regenerate or edit one piece; approve its canonical copy | piece | editorial on that piece's brand |
| Approve a delivery on an account other than the editorial brand's own | delivery | editorial **and** account |
| Export, download, record or correct a live URL | delivery | editorial **and** account |
| Provider dispatch | delivery | editorial **and** account, rechecked at dispatch against the pinned provider identity |

Losing a role blocks further actions that need it and nothing else: a person who loses FreshProof keeps piece-scoped access to Corvo pieces and loses every whole-plan and whole-installment action on a campaign that includes FreshProof. An approved, undispatched delivery is rechecked at dispatch and held if a role is gone. Anything already dispatched or published is untouched.

**Installments and runs.**
- Every bundle campaign has `bundleInstallments` rows from its first push (`main` for a single-part bundle), each with `key`, `order`, `title`, `theme`, `state`.
- A **run** (`bundleRuns`) drafts or regenerates pieces of **one** installment. It records `installmentKey`, `pieceKeys` and its pins: the **installment plan fingerprint** (that installment's pieces, deliveries and link targets), the **series context fingerprint** (the thesis plus the title and theme of this installment and of those before it), source version, decisions version, voice and brand-profile versions. Appending a later installment changes neither fingerprint and does not disturb a run in progress.
- **One active run per installment, held by a lease.** A run holds `leaseExpiresAt` and renews it as each piece completes. A start request, and a scheduled sweep, mark a run whose lease has expired as `abandoned` and free the installment. A result arriving from an abandoned run is refused. A failed or abandoned run can be started again; pieces it already recorded are kept.
- Before sending anything to a model the run rechecks ownership, roles, that no decision is open and that no source update is being checked (below). When recording results it rechecks ownership, roles and its pins; if any has moved it records nothing for the affected pieces and reports why.
- **One revision transition.** Every change to a bundle post's copy (run result, regeneration, composer edit, rebind, polish restore, link assembly) goes through one function, `writeBundlePostRevision`. It is a compare-and-set that succeeds only if: the post's `draftRevision` is the one the writer read; the post is not approved; it has no claimed, submitted or accepted publishing intent, no export claim or pull request, no live queue reservation and no current export receipt. On success it writes the new revision, bumps `draftRevision`, marks the post's evidence `unchecked` (§4.7) and updates the post's unsent publishing intent in the same mutation. Otherwise it changes nothing and says which condition failed. Approved or dispatched copy can therefore never be overwritten, by a run or by an edit: to change an approved post Jake first returns it to draft. Each revision is kept in `bundlePostRevisions` with its pins. (The export-receipt condition applies from CB-24, when receipts exist.)
- Drafting writes one canonical post per piece: the primary delivery's post, created as an unscheduled draft.
- **Three different things have versions**, and they are not the same thing: the *latest source version* a push has made available; the *accepted plan revision*, which records the source version it was accepted against; and *impact completion* for a source version. When a new version is committed on an accepted campaign, the same mutation sets `impactPendingVersion` on the campaign. While it is set, no run starts and **no post of that campaign can be approved**: approval reads the flag in its own transaction. The impact job (CB-14) marks affected posts stale in bounded batches and clears the flag when it has covered every post.
- **Decisions and existing drafts.** An open decision blocks runs and blocks approval of that campaign's unapproved posts. Answering a decision, or changing an answer, creates a new decisions version; every unapproved or approved-but-unsent post drafted under an older one becomes stale with reason `decision-changed` and must be re-reviewed or regenerated. A stale approved-but-unsent post keeps its copy and its approval record but cannot be dispatched until Jake has re-reviewed it. (A *source* change is different: an approved post gets a notice and Jake decides, J15.) Sent and published posts are never touched.

**Cohesion is a report** (`bundleCohesionReports`), keyed by installment and by the fingerprint of the exact canonical revisions it read. Its predicates are the bundle's own (`lib/bundleCohesion.ts`); it does not call the in-app cohesion gate, which enforces exactly one pillar and one CTA and expects its caller to apply fixes. A bundle report has no automatic fixes and never rewrites copy.
- **Blocking** (the report fails): an accepted piece of the installment has no current draft; the plan rules of §4.3 do not hold for the pieces as drafted; a piece that links has no link slot where its format requires one (§4.10); a banned term is present.
- **Warnings** (shown, never blocking): two drafts share a title or an opening, within a brand or across brands; a piece that links does not refer to its article's main claim.

**Add to calendar** (`bundleCalendar.addInstallment`) requires a passing report whose fingerprint matches the current canonical revisions. It gives each delivery's post a proposed date (§4.10), creates each non-primary delivery's post idempotently by `(bundleCampaignId, pieceKey, deliveryKey)`, never resets an existing post, and returns counts. **Installments are added to the calendar in order**: installment *k+1* is refused until installment *k* has been added. Giving a post a calendar date is not dispatch (§4.7).

The campaign queue reads **deliveries** for an installment through indexes, so fan-out and mirror posts are visible.

**Review series.** `bundleSeriesLinks`, unique on `(bundleCampaignId, editorialBrandId)`, gives each editorial brand one bundle-managed series (`postSeries.managedByBundleCampaignId`). Within it, an installment is one entry with identity `(seriesId, installmentKey)` and order from the plan. Its display anchor (the entry's required `articlePostId`) is that brand's article in the installment if it has one, otherwise its first primary piece in plan order. The anchor is for grouping only; publication dependencies are separate (§4.10). Invariants, in force from the first managed series (CB-45, CB-47):
1. A managed series, its entries and its links are written only by bundle operations. Every legacy series mutation (`attach`, `detach`, `move`, `addCompanions`, the campaign bridge, the importers) refuses a managed series.
2. A bundle post cannot be attached to a series that is not its own managed one.
3. A bundle post is deleted only by a bundle operation (removing a piece that is unapproved and unsent). That operation recomputes the entry's anchor, and removes the entry if nothing is left. The legacy delete refuses a bundle post.
4. Series review reads a managed series like any other. For a bundle post it tells article from companion by the delivery's `format`, not by `channelId`, and shows evidence only through the resolver.

**Fan-out and mirrors.**
- A `fanout` post starts as a copy of the primary's public fields and is then edited independently where the format allows.
- A `mirror` post has no body of its own. Its approval is bound to the parent's approved revision fingerprint and to the destination account. The moment the parent is edited or loses its approval, the mirror's approval and any unsent export are void.
- A delivery with `mode: "manual"` or `undetermined`, or `as: "article"`, is never eligible for a provider.

Rendered video (J5) later adds a renderer over the same `video-script` payload. Direct publishing (J8) later changes a delivery's mode. Neither changes the format.

### 4.7 Trust

**Scrub at push (J23).** Secret scan on every source and manifest field: any finding rejects the push. Source content is scrubbed before storage (absolute local paths, `~/` paths, `localhost` and private-network URLs, `t3-thread://` links, private `claude.ai/artifact/…` links, e-mail addresses), with counts reported. Excerpts under `internalHeadings`, and excerpts that are mostly paths after scrubbing, are reference-only.

**Decisions (J14).** Open decisions block every run and every approval (§4.6). Each answer adds its `rule` to prompts and its `bannedTerms` to a deterministic check. Answers are versioned.

**Evidence gate (J19).**

*What is checked.* Every **public field** of a post's current revision, as it will be published: title, body, first comment, hashtags, description or excerpt, alt text, captions, each text field of a structured payload (hook, voiceover, on-screen text, call to action, slide fields), and every label, unit, denominator and caption Resonate renders into an image. Text Resonate generates for display is a public field like any other. Typed non-text fields (beat seconds, slide index) are not claims. Instructions to Jake that are exported but not published (shooting directions) are not claims, but are still scrubbed.

*Bindings.* A binding identifies one **occurrence**: `fieldPath`, `start`, `end`, the revision fingerprint, `kind` (`number`, `quote`, `derived`), and evidence: a passage (source version, excerpt) or a data cell (dataset version, row key, column). Two identical numbers in one field need two bindings. A value rendered from a cell is bound to that cell by construction.

*Deterministic layer.*
- Every numeral occurrence (URLs parsed out first), every **multiplier, fraction and magnitude word** from a fixed list (twice, double, triple, half, a third, a quarter, dozen, hundred, thousand, million, billion and their inflections, and a spelled-out number followed by "percent" or "times"), and every span in quotation marks, of any length, has a binding.
- A number's value and unit appear in its evidence after normalisation. No rounding.
- A data-cell binding matches the cell's value and unit, and the column is numeric.
- A quotation is an exact span of a quotable passage after typography normalisation. Quotation marks are reserved for verbatim text.
- A `derived` claim declares inputs (each bound), a formula from a fixed set (ratio, difference, percent change, sum, round to stated places) and its result; the server recomputes it.
- No banned term from an answered decision appears.
- Drafts are instructed to write quantities as numerals. Spelled-out small numbers ("three vendors") that remain are **flagged phrases**: each must be bound, rewritten, or dismissed by Jake as not a factual quantity. A dismissal is recorded for that occurrence and revision. This is the one place a person's judgement stands in for evidence, and it is limited to deciding that a phrase is not a number (A22).

*Support check.* For every binding that passes the deterministic layer, a second model call judges whether the evidence supports what the sentence says: the right entity, measure, population and timeframe. For a cell it is given the row and the column's declared measure. It is also asked to list any quantity or quotation in the field that has no binding; each becomes a flagged phrase.

*States.* Each binding has a deterministic result (`pass`, `fail`) and a support state:

| Support state | Meaning | Can Jake confirm it? |
|---|---|---|
| `pending` | not checked yet for this revision | no |
| `unavailable` | the check timed out, errored, or returned nothing usable for this binding | **no**: it is retried, within a bound; the post waits |
| `supported` | the checker judged it supported | not needed |
| `ambiguous` | the checker completed and returned a judgement that the evidence neither clearly supports nor contradicts the sentence, with its reason | **yes**, after seeing the evidence; tied to that occurrence and revision |
| `unsupported` | the checker judged it not supported | **no** |

A missing or failed check is never treated as an ambiguous one. A post's evidence is `unchecked`, `checking` (the deterministic layer passed and support is not yet in), `blocked` (a deterministic failure, an `unsupported` or an exhausted `unavailable`), `needs-confirmation` (only `ambiguous` bindings or flagged phrases remain) or `cleared`.

- Deterministic failure or `unsupported`: the copy must change, the binding must point at evidence that supports it, or new evidence must arrive in a re-push.
- A run regenerates a failing piece at most twice, within a budget admitted up front that includes support-check calls. After that the piece is `needs-evidence-review`.
- **Every change gets a fresh verdict.** `writeBundlePostRevision` (§4.6) sets the post to `unchecked`; so do a rebind, generated metadata and link assembly. A verdict is keyed by the binding, the field's revision fingerprint and the evidence. The check then runs again on the exact fields that will be published, within the campaign's budget. A neighbouring edit that leaves a numeral intact but changes what it is said about is therefore re-judged.

*Enforcement.* One function, `assertEvidenceApprovable(post)`, is called by the shared approval path that batch review already uses, by composer approval, and by variant acceptance (`acceptVariantPost`). A static test enumerates every write of `approvalState: "approved"`. It passes only when the post is `cleared` for the assembled payload it is about to approve, no decision is open and no source update is being checked. The layers it requires are a list in code: no bundle post can be approved before CB-11; CB-11 requires the deterministic layer; CB-13 adds the support check and, when it lands, returns any approved, unsent bundle post that is not `cleared` to unapproved without touching its copy.

**Dispatch interlock.** *Dispatch* means any step that moves a post out of Resonate or commits a provider to it: reserving provider queue capacity, queue release, submission, pull-request creation, receipt writes that mark a post sent or published, and manual export. Giving a post a date on Resonate's calendar is not dispatch.

- One function, `assertBundleDispatchAllowed(ctx, post, action)`, is called at every dispatch site: the GitHub export claim and its receipt transitions, the Buffer claim and its revalidation, the mock path, queue reservation and release, and manual export. For a post that is not a bundle post it returns at once. For a bundle post it is **default-deny**.
- A delivery needs a set of **prerequisites**: `evidence` always; `blog:<destination>` for a blog delivery; `account` for a provider LinkedIn delivery; `link` when it has a link target; `manual` for a manual delivery; `payload` for a structured format. The function allows dispatch only if every prerequisite the delivery needs has **shipped** (it is in a list in code) and **passes now** for this delivery and this assembled revision.
- Each prerequisite is added to the list by the issue that implements its check: `evidence` and `blog:corvo` by CB-13, `blog:freshproof` by CB-22, `manual` by CB-24, `link` by CB-27, `account` by CB-29, `payload` by CB-30. Until then every delivery that needs it is held with a visible reason. There is no global switch to lift. (A LinkedIn Article needs only `evidence` and `manual`, so CB-25 and CB-26 add no prerequisite of their own.)
- The legacy rule that holds any series post without a `companionLink` does not apply to a bundle post, because the interlock already runs at the same sites and denies by default. No legacy check is relaxed before its replacement exists.
- The capabilities report shows each tuple's `dispatch` as `enabled` or `held` from the same list.

**Clean copy and the outbound boundary.**
- `corpus://` source markers are removed from stored copy **before review**. Bundle drafts never contain them. For in-app campaigns they are moved into the post's citation list at "add to calendar".
- What is reviewed is the **assembled payload** built by the same functions dispatch uses (`linkedInPayload` trims the body and appends hashtags; the first comment is trimmed). Every outbound path asserts, and never rewrites, that this assembled payload is publishable, before its first remote **write** (reads needed to prepare a reschedule are allowed). This covers both things a blog export writes: the file and the pull-request body. A failure is audited in a committing mutation.
- Existing editorial fingerprints, visual signatures and Buffer snapshots are preserved.
- Existing records: an approved, undispatched post with markers is held with "Clean and re-review" (which returns it to unapproved). A post Buffer has already accepted is left alone. **A post with an open pull request or a pending export claim is not repaired automatically**: the code has no path that rewrites an existing branch with different bytes, and an export claim has no expiry. Such a post is held and listed in an operator report. The operator closes the pull request and deletes the branch on GitHub, then runs a reviewed `reconcileBlogExport`, which confirms by reading GitHub that the pull request is closed and the branch is gone, clears the claim and returns the post to unapproved.
- The mock-draft placeholder tokens `[EVIDENCE: …]` and `[SOURCE: …]` keep their existing explicit-confirmation flow in series review. They are out of scope here.

### 4.8 Voice, brand profiles and polish

- `voiceProfiles`: `scope: "brand" | "person"`, `brandId` or `ownerUserId`, immutable numbered versions, one current approved version, approval audit. Brand profiles are edited by that brand's owners and editors. A person profile belongs to its owner.
- **One voice per piece**, the editorial brand's (the person profile for Personal pieces). The account does not change the voice: a FreshProof article republished from the personal profile keeps FreshProof's voice.
- A run pins the exact voice and brand-profile versions in each draft revision. A newer approved version is picked up only when Jake regenerates; drafts written under the older one are flagged through the impact mechanism (CB-14).
- A run refuses a piece whose voice has no approved version (after M1; the tracer uses the existing Corvo default constant).
- `brandProfiles` carry audience, angle guidance, default call to action and link targets. Carousel templates and assets are a separate record (CB-44).
- **Polish (J3):** Jake's sanitised draft is the base; structure and supported claims are kept. A claim in the original with no evidence is listed for Jake: remove it, or supply evidence. It is never kept on his say-so alone (§4.7). Restoring the original goes through the normal edit, verification and approval path.

### 4.9 Cross-brand

- One campaign, one plan, one review surface, grouped by installment and then by editorial brand.
- Plan rules are per installment (§4.3). Authorisation follows the role matrix (§4.6).
- Each editorial brand has its own campaign-managed review series (§4.6). Publishing intents carry the editorial brand and the delivery's account.

### 4.10 Destinations, manual delivery, links and scheduling

**Registry.** Brands, channels, accounts, channel capabilities and blog destinations come from one module. Each consumer keeps its own subset rules (which brands are selectable, which channels are routable, which formats an importer accepts).

**FreshProof blog.** One `.md` file in `content/blog` of `jakebutler/freshproof-lite`. Resonate writes `title`, `description`, `date`, `author: "Jake Butler"`, `pillar` and, while unpublished, `draft: true`; the loader also accepts optional fields (`image`, `imageAlt` and others) that Resonate does not write. The loader's scalar parser coerces unquoted `true`/`false` and all-digit values, so any value that could be coerced, or that contains `:` or starts with a quote, is JSON-quoted. No hero. Generated files are tested through a pinned copy of the real parser and loader.
- **Merged is not live.** The loader hides a post whose `date` is in the future (compared in UTC) even when it is not a draft, and a missing page can be served from cache. A FreshProof article counts as published only when the file on the default branch matches the reviewed bytes **and** its canonical route serves that revision, checked by the existing availability check once CB-43 has made it destination-aware. The canonical origin is the site's configured origin (`https://freshproof.io` by default), read from destination configuration, not assumed.

**Manual delivery is not a provider.** States: `approved → exported → published`; an exported delivery's post shows as awaiting manual publish. Receipts (`manualDeliveryReceipts`): an **export** receipt bound to the reviewed payload hash; a **publication** receipt (human-reported URL) that requires a current export receipt; a **correction** receipt that supersedes the bound URL. Every receipt write rechecks, in its own transaction, the delivery's mode (`manual`), the caller's roles and the revision it is bound to, and is idempotent: a retry returns the existing receipt, and a correction names the receipt it replaces and fails if that is no longer current. An export that loses a race with an edit is discarded with its package. **No export package is stored.** The export receipt binds the payload hash and the hash of every file in the package; the authenticated download route rebuilds the package from the approved revision, verifies it against the receipt and streams it. A superseded package cannot be downloaded, and no storage URL is ever sent to the browser.

**Link targets.**

Each delivery of a piece that links stores a **link target** at acceptance: `{ pieceKey, via }`, where `via` is `linkedin-article`, `blog` or `none`. It is computed from the plan as accepted, **including deliveries that are deferred**:

| Dependent delivery is on | Target has a LinkedIn Article delivery (enabled or deferred) | Target has a blog delivery only | Target is Article-only (no blog: the lower dB, Personal) |
|---|---|---|---|
| LinkedIn | `linkedin-article` | `blog` | `linkedin-article` |
| anything else | `blog` | `blog` | `none`, shown as such in plan review |

- J6 wants LinkedIn promos to point at the Article. So when the plan offers an Article and this server cannot deliver it yet, the LinkedIn dependent is **held**, not quietly pointed at the blog. Jake can change `via` to `blog` in plan review when a blog delivery exists (A25).
- `none` is only ever an explicit outcome: the last cell of the table, or a `standalone` piece.
- **Where the link goes**, by format: a LinkedIn post, in the body or the first comment (Jake's choice per post); any other post, in the body; a short video, in the caption only; a carousel, in the caption only. An article has no link target.
- A dependent is dispatchable only when its target's receipt exists (a publication receipt for an Article, a verified live URL for a blog), **and** its assembled payload contains exactly that URL, **and** that revision has been reviewed. Dispatch rechecks the receipt and the revision. A URL arriving never approves or dispatches anything; it asks for review. Inserting the URL is an explicit action ("Insert link and review"): it returns the dependent to unapproved, writes the URL as a new revision, and Jake approves the assembled result.
- If the URL arrives after the dependent's proposed time, the dependent stays held and asks for a new reviewed date.
- Correcting a URL supersedes the old receipt, invalidates the reviews of unsent dependents, blocks new claims against the old receipt, and lists dependents already sent or already claimed.

**Schedule proposal (J16).** A pure function over deliveries.
1. Collisions are judged per **physical account** and its **local calendar date**, across everything on the calendar. Occupancy comes from one lookup over all posts: a bundle post's account is its delivery's; any other post's account is the registry's default account for its brand and channel (or the pair itself where the registry has no account, as for X and Reddit). Jake's profile is one account whether a post is a Personal post or another brand's Article.
2. Existing scheduled posts are fixed points.
3. An installment starts from its anchor article (§4.3), at least three days out, on a weekday. A lower dB-led installment starts from its primary Article on the personal profile.
4. A mirror Article follows its blog post by a day.
5. Dependents come after their target: posts +1, +3, +6 days; carousel +2; short video +4. A standalone piece counts from the installment's start.
6. Each further editorial brand starts two days after the previous brand's article. A brand with no article of its own follows the article its pieces link to.
7. **Articles on the personal profile are at least two days apart**: their local calendar dates differ by two or more. This is mandatory, and it is also enforced when Jake moves an Article by hand.
8. Installments follow the series cadence. Cadence yields to fixed dates and to rules 1 and 7: a date moves later, never earlier. Installments reach the calendar in order (§4.6), so a later installment is always proposed after the previous installment's anchor.
9. Ties are broken by plan order, then delivery key. Times and timezone come from the account. All spacing is counted in calendar days in the account's timezone, so daylight-saving changes do not matter.

A same-day collision on one account that Jake creates by hand is allowed after a warning; rule 7 is not. A proposal is not a reservation. Reserving queue capacity remains the existing explicit `reserve` operation, behind the dispatch interlock. Everything lands unapproved.

**Account mapping.** Whether a LinkedIn post delivery is `provider` or `manual` comes from the verified Buffer mapping for its account (CB-29), which distinguishes *not connected*, *connected but stale* and *connected to a different account than expected*. Until then the delivery's mode is `undetermined`. A later remap or mode switch returns the delivery to review. LinkedIn Articles are always manual.

### 4.11 New formats

**Structured payloads** live in `postPayloads` (`postId`, `kind`, `payload`, `version`), with a shared interface owned by CB-30: validate, list **every** public text field with its path (for the evidence gate, hashtags included), list exported-but-unpublished text (for the scrub), render export.

**Short-video script** (`video-script`): `hook`, `beats[{seconds, voiceover, onScreenText, visual}]`, `cta`, `estimatedSeconds` (30–60), `caption`, `hashtags`. Public text: hook, voiceover, on-screen text, call to action, caption, hashtags. `visual` is an instruction to Jake, not published, and is not a claim.

**Carousel** (`carousel`): 5–8 slides of type `cover | stat | chart | text | quote | cta` plus the caption and hashtags. Template slides render to 1080×1350 PNG with a pinned renderer, pinned fonts and per-field layout budgets. **The hash of each rendered image is part of what is approved and what an export receipt binds.** Chart slides draw from a pinned dataset version through the figure renderer, within what that renderer supports today (2–12 rows, one series, a citation per row) unless the issue extends it. AI imagery (J18) supplies backgrounds only; Jake inspects and accepts each actual generated asset, and the acceptance is bound to its hash. Plain templates remain a complete, shippable result when image generation is unavailable.

### 4.12 Skill and command-line tool

- `tools/resonate-cli/resonate.mjs`: one file, Node ≥ 20, no dependencies. M1 (CB-46): `bundle push [--dry-run]`. M2: `capabilities`, `bundle init`, `bundle validate`, `bundle status`. Its structural validator and its request are tested against the wire examples of §4.3. It reads the server address and token from `~/.config/resonate/credentials.json` (`{ "baseUrl": "…", "token": "…" }`, mode 600) or the `RESONATE_URL` and `RESONATE_TOKEN` environment variables, and stores the server's **current** version beside the bundle.
- `skills/resonate-campaign/SKILL.md` and references. Installed with the tool into `~/.claude/skills/resonate-campaign/` and `~/.codex/skills/resonate-campaign/`; the skill calls the tool by its installed path.

### 4.13 Multi-article series (J28)

- **Plan.** `plan.series` gives title, thesis, cadence and ordered installments. Plan rules are per installment (§4.3). Cross-promotion is a piece that `linksTo` another brand's article.
- **Acceptance** is once, for the whole plan, and is stored as an immutable accepted plan revision. While `maxInstallments` is 1, later installments are shown as deferred and have no drafting or calendar effect; Jake explicitly accepts the supported installment.
- **Append.** A deferred or newly pushed installment joins the accepted plan only by an explicit **Add installment**, in plan order, with the same validation, role and aggregate-limit checks as acceptance. This creates a new accepted plan revision. It does not disturb earlier installments: their plan fingerprints, runs, drafts and summaries are unchanged (§4.6).
- **Runs** are per installment (§4.6). A run's context includes the series thesis, this installment's place in the order, and the titles and themes of earlier installments. It does not state how many installments there will be, so appending one changes nothing already written.
- **Carrying facts forward** (CB-48). For each earlier installment the run may also be given a bounded summary of its anchor article, pinned by that article's revision. Only a summary of an **approved** article that has itself passed the evidence gate with every binding `supported` is eligible (a summary is never confirmed by hand); the summaries a run used join its pins; any number or quote reused in new copy must bind to current evidence like any other. If an earlier installment has no eligible summary, the run says so in the prompt and offers no facts from it. Until CB-48 lands, no summaries are offered.
- **Cohesion** per installment, plus a series report: no two installments share a title or opening; each anchor article states its place in the series. Both are warnings.
- **Calendar and review** per installment, in order (§4.6): one entry per editorial brand per installment in that brand's managed series.
- **Scheduling** per §4.10.
- **Scale.** Reads are installment-scoped and indexed. Batch review and queue release keep their existing selection limits (50 and 20) and operate within an installment. `maxInstallments` is raised by CB-49 only after a **legal** maximum fixture (within every format maximum of §4.3) passes every affected read and write on a populated account, with newer unrelated posts inserted after the target so that the existing recent-post scans are actually exercised.

## 5. Data model summary

**New tables.** Bundle-owned (never read by legacy modules): `ingestTokens`, `ingestRateWindows`, `ingestRejections`, `bundleCampaigns`, `bundleVersions`, `bundleDocuments`, `bundleExcerpts`, `bundleDatasets`, `bundleInstallments`, `bundlePieces`, `pieceDeliveries`, `bundleDecisions`, `acceptedPlanRevisions`, `bundleRuns`, `bundlePostRevisions`, `bundleCohesionReports`, `bundleSeriesLinks`, `installmentSummaries`, `claimBindings`, `claimConfirmations`, `sourceImpacts`, `manualDeliveryReceipts`, `postPayloads`, `carouselSlides`. Brand-owned: `voiceProfiles`, `voiceProfileVersions`, `brandProfiles`, `brandProfileVersions`, `profileApprovals`, `brandTemplates`.

**Shared tables extended with optional fields only:** `v2Posts` (`bundleCampaignId`, `sourceDeliveryId`, `primaryPostId`, `destinationAccountId`, `draftRevision`, `evidenceState`, `staleSince`, `staleReasons`, `holdReason`) and `postSeries` (`managedByBundleCampaignId`).

**Not touched:** `campaigns`, `campaignShapes`, `campaignSlots`, `campaignIdeas`, `campaignDrafts`, `materializations`, `ideas`, `corpora`, `corpusDocuments`, `corpusExcerpts`.

A value-list entry (channel, format, status) is added only by the issue that first uses it, together with every duplicated validator, label map, filter and reader.

## 6. Assumptions I made without asking (veto any)

| # | Assumption |
|---|---|
| A1 | X and Reddit are not offered to bundles. Existing support is untouched. |
| A2 | Personal joins a plan when Jake or the agent includes it; its default pack is LinkedIn posts, plus an Article of its own only when planned. |
| A3 | A campaign's sources belong to the campaign, not to a brand's shared corpus. |
| A4 | A new `freshproof-blog` channel, not a migration of `corvo-blog` to a generic one. |
| A5 | *(Changed in rev 5.)* Bundle campaigns are stored in their own tables, separate from in-app campaigns. They appear together in the campaign list but share no campaign, corpus or idea records. |
| A6 | After acceptance, a re-push updates sources and impact but does not change the plan; differences are offered for Jake to apply. |
| A7 | A number must bind to evidence or be a declared, recomputed derivation. Jake can confirm only a claim the support check completed and found ambiguous; never one that failed, was judged unsupported, or could not be checked. |
| A8 | Every LinkedIn Article is published from the personal profile (J26). In the standard pack each brand's article gets one. |
| A9 | The lower dB has no blog: its article is a primary LinkedIn Article on the personal profile, in the lower dB's voice. |
| A10 | A run refuses a piece whose voice is not approved (after M1). |
| A11 | Only sanitised source text is stored in Resonate. |
| A12 | The in-app campaign flow keeps working unchanged. |
| A13 | LinkedIn accounts not mapped in Buffer fall back to manual publish, shown before acceptance. |
| A14 | One article per editorial brand per installment. |
| A15 | Ingest tokens expire after 90 days by default. |
| A16 | A series is accepted once and drafted one installment at a time. |
| A17 | Default series cadence is one installment a week. |
| A18 | A cross-promotion is written in the promoting brand's voice; the agent proposes one only where audiences overlap, and Jake can remove it. |
| A19 | Articles on the personal profile are at least two days apart (mandatory, including when moved by hand). |
| A20 | *(Approved by Jake, J31.)* Publishing from Jake's profile needs editor rights on the Personal brand as well as on the editorial brand. |
| A21 | The mock-draft `[EVIDENCE: …]` / `[SOURCE: …]` confirmation flow is left as it is. |
| A22 | Quantities are written as numerals. A spelled-out small number left in a draft ("three vendors") must be bound, rewritten, or dismissed by Jake as not a factual quantity. |
| A23 | The test fixture is **synthetic** (an invented experiment with invented vendors and numbers), because this repository is public. The real Firecrawl notebook is never committed to Resonate; it is pushed from `freshproof-lite` by the tool during the live proof. |
| A24 | Installments reach the calendar in order. |
| A25 | When a plan offers a LinkedIn Article that this server cannot deliver yet, LinkedIn promos wait for it. Jake can point one at the blog instead. |
| A26 | A new source version pauses approvals for that campaign until Resonate has finished working out which drafts it affects. |
| A27 | Answering or changing a publishing decision marks every unsent draft written before it for re-review. |

## 7. Proposed issues

Full contracts are in the GitHub issues: epic [#196](https://github.com/jakebutler/resonate-v2/issues/196). CB-01 … CB-36 are #197 … #232 in order; CB-00 #233, CB-37 #239, CB-38 #240, CB-39 #241, CB-40 #234, CB-41 #235, CB-42 #236, CB-43 #238, CB-44 #237, CB-45 {{CB-45}}, CB-46 {{CB-46}}, CB-47 {{CB-47}}, CB-48 {{CB-48}}, CB-49 {{CB-49}}. The epic's issue list is the authoritative mapping. **Rigor**: *high* = auth, publishing gate or approval surface; *standard*; *light*. **+Fable** = Fable reviews in addition to Opus 5.5.

| ID | Title | Depends on | Rigor | Review |
|---|---|---|---|---|
| **Groundwork** | | | | |
| CB-00 | Land the plan, the shared-surface table, the tracer fixture and strict proof receipts on `main` | — | standard | Opus |
| **M0 — Two live defects** (may start at once, in parallel with CB-00) | | | | |
| CB-01 | Keep source markers out of published copy | — | high | Opus +Fable |
| CB-02 | "Add to calendar" never resets approved or scheduled posts | — | high | Opus +Fable |
| **M1 — Tracer** | | | | |
| CB-03 | Ingest tokens (entry point off) | CB-00 | high | Opus +Fable |
| CB-04 | Bundle format v1: schema, plan rules, limits, scrub, wire contract, fixtures | CB-00 | standard | Opus |
| CB-05 | Ingest request path: authenticate, bound, validate, dry-run report | CB-03, CB-04 | high | Opus +Fable |
| CB-40 | First push becomes a bundle campaign in its own tables; evidence resolver | CB-05 | high | Opus +Fable |
| CB-46 | Minimal `resonate bundle push` | CB-40 | standard | Opus |
| CB-06 | Review a proposed campaign; repair the plan; answer decisions; accept | CB-40 | standard | Opus |
| CB-45 | Bundle posts on shared surfaces: marker, dispatch interlock, managed-series locks | CB-00, CB-40 | high | Opus +Fable |
| CB-07 | Tracer run: draft one installment with bound claims; cohesion report | CB-06, CB-45 | high | Opus +Fable |
| CB-47 | Add an installment to the calendar: managed series, proposed dates, review with evidence | CB-02, CB-07 | high | Opus +Fable |
| CB-08 | M1 proof: Firecrawl bundle to an unapproved Corvo calendar (Jake in the loop) | CB-01, CB-46, CB-47 | standard | Jake |
| **M2 — The real handoff** | | | | |
| CB-09 | `resonate` tool: capabilities, init, validate, status | CB-46 | standard | Opus |
| CB-10 | Handoff skill for Claude Code and Codex, with installer | CB-09 | standard | Opus |
| **M3 — Trust completes** | | | | |
| CB-41 | Edit and regenerate bundle drafts | CB-47 | high | Opus +Fable |
| CB-11 | Claims beside their evidence; approval enforces bindings | CB-01, CB-41 | high | Opus +Fable |
| CB-12 | Tabular evidence: typed datasets and cell bindings | CB-11 | standard | Opus |
| CB-13 | Support check; enables dispatch of the Corvo blog article | CB-11, CB-12 | high | Opus +Fable |
| CB-42 | Changed re-push: version n+1 and pre-acceptance plan replacement (kept off) | CB-06, CB-12, CB-40 | high | Opus +Fable |
| CB-14 | Impact of new versions on drafts and approved posts; enables re-push | CB-12, CB-13, CB-42 | high | Opus +Fable |
| CB-15 | "What changed": review impact, apply plan differences, regenerate selected | CB-14, CB-41 | standard | Opus |
| **M4 — Voice** | | | | |
| CB-16 | Voice and brand profiles: stored, versioned, approved | CB-00, CB-03 | standard | Opus |
| CB-17 | Runs use the piece's pinned voice and brand profile | CB-14, CB-16 | standard | Opus |
| CB-18 | Polish Jake's own drafts | CB-13, CB-17 | standard | Opus |
| CB-19 | Draft a voice profile from published posts | CB-16 | light | Opus |
| CB-44 | Brand templates and assets for carousels | CB-16 | standard | Opus |
| **M5 — Cross-brand and destinations** | | | | |
| CB-20 | One registry for brands, channels, accounts and channel capabilities | CB-04, CB-45 | standard | Opus |
| CB-43 | Blog destinations as explicit configuration (Corvo only) | CB-01, CB-20 | standard | Opus +Fable |
| CB-21 | Cross-brand campaigns: editorial brand on every piece, one managed series per brand | CB-13, CB-20 | high | Opus +Fable |
| CB-22 | FreshProof blog destination, full lifecycle | CB-01, CB-21, CB-43 | high | Opus +Fable |
| CB-23 | Deliveries and accounts: one piece, several places; idempotent fan-out | CB-14, CB-21, CB-41 | high | Opus +Fable |
| CB-24 | Manual delivery: approved export, receipts, recorded live URL | CB-01, CB-13, CB-23 | high | Opus +Fable |
| CB-25 | LinkedIn Article as a primary delivery on the personal profile | CB-17, CB-24 | standard | Opus +Fable |
| CB-26 | LinkedIn Article as a mirror of a blog article | CB-22, CB-25 | high | Opus +Fable |
| CB-27 | Link targets by delivery | CB-26 | high | Opus +Fable |
| CB-28 | Schedule proposal by account, sequence and link targets | CB-27 | standard | Opus |
| CB-29 | LinkedIn account identity and mapping (Jake in the loop) | CB-24 | high | Opus +Fable |
| **M6 — New formats** | | | | |
| CB-30 | Structured payloads and the short-video script, with one complete export | CB-24 | standard | Opus |
| CB-31 | Short-video fan-out: Reels and Shorts | CB-30 | light | Opus |
| CB-32 | Carousel: template slides and export | CB-30, CB-44 | standard | Opus |
| CB-33 | Carousel chart slides bound to datasets | CB-14, CB-32 | standard | Opus |
| CB-34 | AI-generated backgrounds for carousels | CB-32 | standard | Opus |
| **M7 — Multi-article series** | | | | |
| CB-37 | Accept series plans, append installments, draft one installment at a time | CB-15, CB-17, CB-21 | high | Opus +Fable |
| CB-48 | Carry facts forward: approved installment summaries | CB-37 | high | Opus +Fable |
| CB-38 | Review and schedule series deliveries by installment | CB-28, CB-29, CB-37 | high | Opus +Fable |
| CB-49 | Series at scale: measured limits; enable series | CB-31, CB-32, CB-38, CB-48 | high | Opus +Fable |
| **M8 — Proof and housekeeping** | | | | |
| CB-35 | Full proof: standard pack across FreshProof and Corvo Labs (Jake in the loop) | CB-10, CB-15, CB-18, CB-28, CB-29, CB-31, CB-33, CB-34 | standard | Jake |
| CB-39 | Series proof: two installments of the FreshProof history series, live (Jake in the loop) | CB-35, CB-49 | standard | Jake |
| CB-36 | Glossary, spec addendum and older-issue disposition | CB-35, CB-39 | light | Opus |

## 8. Sequencing

Build order (a valid order of the dependencies above): CB-00, 01, 02, 03, 04, 05, 40, 46, 06, 45, 07, 47, 08, 09, 10, 41, 11, 12, 13, 42, 14, 15, 16, 17, 18, 19, 44, 20, 43, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 37, 48, 38, 49, 35, 39, 36.

**Dependency order is not merge safety.** Many issues touch `convex/schema.ts`. Independent issues may be developed in parallel; schema-touching pull requests are merged one at a time and the rest rebased. Verification criteria live in one manifest per milestone (`content-bundles-m0` … `content-bundles-m8`).

**Contracts are checked again when they are assigned.** Three reviews have each found more to fix in later-milestone contracts, and code written in earlier milestones will change what later ones can assume. Before assigning an issue, the orchestrator checks its contract against the code as it then stands and against the open review notes for that issue, and amends the issue before work starts. An implementer who finds a contract wrong stops and says so.

Milestone exits:
- **M0:** no source marker can reach a published post; re-running "add to calendar" cannot undo an approval.
- **M1:** a real first push from `freshproof-lite` becomes a proposed Corvo Labs campaign with one article and one post, which Jake accepts and takes to an unapproved calendar. No bundle post can leave Resonate.
- **M2:** Jake does that with one command from Claude Code or Codex.
- **M3:** a claim that is not supported cannot be approved; a corrected notebook flags exactly the affected drafts; the Corvo blog article of a bundle can be published.
- **M4:** drafts sound like the brand they belong to; Jake's own draft comes back polished.
- **M5:** one campaign spans FreshProof, Corvo Labs and Personal, with a FreshProof blog PR, LinkedIn Articles exported for the personal profile, LinkedIn posts through verified accounts, and promos held on the Article URL.
- **M6:** the standard pack is complete.
- **M7:** a multi-article series is accepted once, drafted and scheduled installment by installment, with brands promoting each other's articles.

## 9. Verification

- One manifest per milestone, `content-bundles-m0` … `-m8`. Tiers `offline-fixture` and `offline-contract` everywhere. `live-receipt` criteria only in the three proofs (CB-08 in `-m1`, CB-35 and CB-39 in `-m8`), each named in its manifest.
- **A passing command is not a passing proof.** The existing runner accepts any dated receipt with passing lines at the declared path. CB-00 tightens it for these manifests: a live criterion declares its scenario and its required check ids, and a receipt counts only if it states that scenario, an environment, a code revision that contains the feature, and a passing line for every required check. Offline results and live proof are reported separately; a missing or non-matching receipt leaves the proof **pending** and never passes by default.
- A live receipt also states bundle version, installment, delivery, account, reviewed payload revision and outcome. Screenshots and receipts are redacted before they are committed. Live model runs and image generation in a proof have a spend ceiling Jake sets on the issue before it starts. Two live checks outside the proofs are rollout gates, not manifest criteria: CB-13's support-check evaluation and CB-34's image qualification. Each needs Jake's authorisation and ceiling, and its feature stays off until its receipt is committed.
- The **synthetic tracer fixture** (`tests/fixtures/content-bundles/tracer/`, on this branch) is shared by unit, Convex and Playwright tests. A fixture drafting provider makes runs repeatable.
- On high-rigor issues the negative tests come first.
- **Named owners for the measured and deployed checks:**

| Check | Owner |
|---|---|
| Deployed rate limiting and token revocation | CB-08 |
| Largest accepted push in one transaction (documents, bytes) | CB-40 |
| Run context reads, and the largest draft and binding write, at the enabled limits | CB-07, then CB-49 at series scale |
| Calendar, series review, approval and release reads and writes on a populated account | CB-47, then CB-23, then CB-49 |
| Impact computation at the enabled limits | CB-14 |
| Concurrent first pushes; A → B → delayed retry of A | CB-40, CB-42 |
| Approval racing regeneration; a run whose worker died | CB-41 |
| Rescheduling a mixed batch | CB-02 |
| Membership revoked mid-campaign | CB-21 |

A populated-account test inserts unrelated posts **newer** than the target, so that scans limited to recent posts are exercised.

## 10. Risks and open questions

**Risks**
1. **Three reviews returned "not ready".** Each found a deeper layer than the last. Rev 5 changes the structure the third review objected to (§13) rather than patching it, and adds a contract check at assignment (§8), but a design this size will not be closed by reading alone. M0 and M1 are where the evidence will come from.
2. **Evidence gate usability.** Occurrence-level bindings ask a lot of the model. CB-07 reports the first-pass rate on the fixture with recorded outputs, CB-08 with a live model. If the live rate is poor, the remedy is prompt and format work, not loosening the gate.
3. **Breadth.** 50 issues. The tracer and the two defects are valuable on their own; each later milestone is independently shippable.
4. **Nothing but the Corvo blog article can be published before M5.** That is deliberate (§4.7) and matches the proofs, but it means LinkedIn posts from a bundle wait for account verification (CB-29) and link targets (CB-27).
5. **LinkedIn Article paste fidelity** is outside our control (CB-25 demonstrates it).
6. **Carousel rendering runtime** (CB-32 starts with a spike).
7. **Claude doc export** needs the docs connector in the coding session; fallback is a manual Markdown export.
8. **Live account state is unverified** until CB-29 and the proofs.

**Open questions for Jake:** none. Q6 was answered as J30 and Q7 as J31. Assumptions A22–A27 are new in rev 5 and open to veto.

## 11. Roles and model routing (J24)

| Stage | Who |
|---|---|
| Plan with proposed issues | Claude Fable 5.2 |
| Plan review | GPT-6.2 Sol, high effort, via the Codex CLI (§13) |
| Response to review, then GitHub issues | Claude Fable 5.2 |
| Approval of plan and issues | Jake |
| Implementation, in a new thread | GPT-6.2 Sol, high effort, orchestrating; one new GPT subagent per issue with a scoped contract; model and effort by rigor |
| Code review | Claude Opus 5.5 on every pull request; Fable in addition where marked |

Building does not start until Jake approves the plan and the issues.

## 12. Out of scope

Rendered video; direct publishing to TikTok, Instagram or YouTube; X and Reddit for bundles; a Resonate MCP server; analytics; an agent team inside Resonate; a lower dB blog destination; LinkedIn Articles from company pages; storing unsanitised sources; binary sources; changes to `/api/ops/lab-import`; the mock-draft placeholder confirmation flow; automatic repair of existing pull requests.

Older issues: #45 and #49–#55 are superseded and #61, #66–#68 have met their destination; CB-36 closes them after checking their current state. #56 and #57 stay parked. #110–#123 are unchanged and linked from CB-33 and CB-34.

## 13. Review history

The three reviews are committed beside this file (`…sol-review-1.md`, `-2.md`, `-3.md`).

**Review 1 (rev 1), verdict "not ready", 8 blocking findings.** All accepted. Main changes: deliveries in their own table; campaign-scoped sources with one resolver; Convex HTTP ingest with no deploy key; base-version idempotency; claim bindings in place of "the numeral appears somewhere"; markers removed before review; manual delivery separate from providers; explicit limits.

**Jake's answers, 2026-11-20.** Personal is an editorial brand (J25); every LinkedIn Article is published from the personal profile (J26); the lower dB may lead (J27); multi-article series with cross-brand posting and cross-promotion (J28); keep the support check (J29); the series proof is the FreshProof history outline (J30); publishing from his profile needs Personal-brand rights (J31).

**Review 2 (rev 3 and 36 issues), verdict "not ready", 9 blocking findings.** All accepted, in rev 4: installment-scoped runs and reports; one managed series per editorial brand; editorial brand separate from account; per-installment plan rules; enabled limits separate from format maximums; a failed or unsupported claim cannot be confirmed; compare-and-set writes and bound receipts; M1 split into thinner issues.

**Review 3 (rev 4 and 45 issues), verdict "not ready".** Eight findings classed "before build", ten "before that issue", two notes. All accepted. Where the review recommended more guards on shared code, rev 5 mostly removes the sharing instead.

| Finding (before build) | Change in rev 5 |
|---|---|
| 1. The first bundle write precedes a complete isolation boundary | Bundle campaigns, plans, sources and excerpts move to their own tables; hidden ideas are dropped; the only shared tables are posts and series. Bundle posts carry no legacy source links. A shared-surface table replaces the entry-point table, and CB-45 lands every check before the first bundle post exists (§4.5). |
| 2. One global hold is lifted before a delivery can prove it is ready | No global hold. A default-deny dispatch interlock at every dispatch site, with per-delivery prerequisites that each ship with the issue that can check them. Calendar dates are distinguished from dispatch (§4.7). |
| 3. Authority and physical account identity | One `authoriseIngest` inside every committing transaction; an operator-only revocation path; a role matrix with whole-plan, installment, piece and delivery scopes; delivery rows with a pinned account from the first acceptance; mode `undetermined` until an account is verified (§4.4, §4.6). |
| 4. The gate cannot tell missing support from reviewed ambiguity | Separate states: `pending`, `unavailable`, `supported`, `ambiguous`, `unsupported`. Only `ambiguous` is confirmable. Every change gets a fresh verdict on the assembled fields. Quantity words are covered; the evaluation measures the approval policy (§4.7, CB-13). |
| 5. Version changes lack an end-to-end transition | Run leases; one revision-transition function with a full compare-and-set; source version, accepted plan revision and impact completion separated; approvals fenced while impact is pending; one rule for decision changes; re-push enabled by CB-14, not CB-42 (§4.6). |
| 6. The ingest contract was not frozen | Wire request, fingerprint and report fixed in §4.3; no file staging at all; stored-but-not-acceptable for an invalid supported subset, with repair actions in CB-06; a synthetic fixture committed with the plan. |
| 7. Cohesion and series membership depended on legacy checks | Bundle cohesion has its own blocking and warning predicates and no automatic fixes; plan rule 3 is per installment only; four managed-series invariants from the first managed series (§4.6). |
| 8. Delivery targets need stable identity | Piece keys unique across the manifest and permanent; link target stored on the delivery at acceptance, computed with deferred deliveries included; a deferred Article holds LinkedIn promos; link placement per format; `none` only explicit (§4.3, §4.10). |

Findings 9–18 are carried into the individual contracts (CB-01's repair path; guarded manual receipts; FreshProof "merged is not live"; one account-and-date lookup; legal, populated measurement fixtures; strict proof receipts; and the per-issue edits). CB-40, CB-07, CB-37 and CB-38 are each split, adding CB-45 to CB-49.

Factual corrections from review 3: there is no existing path that updates a pull request with changed bytes, and export claims do not expire; FreshProof accepts optional frontmatter fields, hides future-dated posts and has a configurable origin; the figure renderer takes 2–12 rows, one series and a citation per row.

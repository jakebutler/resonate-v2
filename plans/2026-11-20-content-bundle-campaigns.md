# Content bundles → coordinated cross-brand campaigns

**Date:** 2026-11-20
**Status:** Rev 4 — revised after two GPT-6.2 Sol reviews and Jake's answers of 2026-11-20 (§13). Rev 4 has not itself been re-reviewed. Awaiting Jake's approval. Nothing is built yet.
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

## 3. What exists and what is missing

Verified against `origin/main`. Corrected in rev 2 where the review found errors.

**Exists and is reused**
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

Sections 4.1–4.13 are **normative**: issue contracts cite them instead of repeating shared rules. This file is landed on `main` by CB-00 before any issue is assigned.

### 4.1 Vocabulary (to be added to `docs/glossary.md`)

| Term | Meaning |
|---|---|
| **Content bundle** | What a coding session pushes: a manifest, source files, open decisions and a proposed plan. Identified by a stable `bundleKey`. |
| **Bundle version** | One immutable push. Creates one campaign-scoped source version. |
| **Source** | One file in a bundle, with a role: `notebook`, `outline`, `draft`, `data`, `session-account`, `reference`. |
| **Installment** | One step of a campaign's plan: at least one article plus the pieces that complement it. Every bundle campaign has installments; a single-experiment campaign has exactly one, keyed `main`. |
| **Series** | A campaign with more than one installment. |
| **Piece** | One unit of content in an installment: an article, a post, a short-video script, a carousel. Stored as a campaign slot. Has one **editorial brand**. |
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
    → bundle version + campaign-scoped source version (sanitised, immutable, with lineage)
    → proposed campaign: sources · decisions · plan (installments → pieces → deliveries)
  Jake: answer decisions → edit plan → accept (once, for the whole plan)
  per installment:
    → run: clean copy + claim bindings, pinned to plan / source / decision / voice versions
    → evidence gate (deterministic bindings, support check) → cohesion report
    → add to calendar: one post per delivery, scheduled-but-unapproved, dates proposed
  Jake: review claims beside evidence → approve
    → blog PR · Buffer · manual export → record live URL → held promos ask for review
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
- A piece has exactly one editorial `brand`. A delivery has **no brand**: it names a `channel`, optionally `as` and `account`. `account` defaults to the editorial brand's own account for that channel (§4.6). **A LinkedIn delivery with `as: "article"` always uses `linkedin:personal`** (J26); any other value is rejected.
- Each piece has exactly one `primary` delivery. `mirrorOf` names the primary delivery of the same piece.
- `treatment: "polish"` requires `draftSourceKey` naming a `draft` source.
- Personal (J25) takes `post` and `article` pieces only (J22).
- `visibility: "reference-only"` sources and `internalHeadings` sections can support numeric claims but are never quoted.
- A `data` source declares its table: `rowKey`, and per column `name`, `type`, and for numeric columns `unit`, `measure`, and where relevant `population` and `timeframe`. `lineage` pins the script and each input by hash.
- Manifest text fields (titles, angles, decision text, file names) are **rejected**, not rewritten, if they contain secrets or scrub-rule matches.

**Plan rules, checked per installment** (the single authority; used at ingest, after capability filtering, after every operator edit, at acceptance and at append):
1. Each installment has at least one `article` piece.
2. Per editorial brand, per installment: at most one `article`, at most one `pillar`, at most one `cta`. A brand's `pillar`, if it has one, is its `article`.
3. Each installment has at least one `cta` overall.
4. Every non-article piece either `linksTo` an article **in the same installment** (its own brand's, or another brand's: a cross-promotion) or sets `standalone: true`.
5. The installment's **anchor article** is the lead brand's article if it has one in that installment; otherwise the article of the first brand in `plan.brands` order that has one. Scheduling starts from the anchor.
6. A brand may take part in an installment with no article, pillar or CTA of its own (for example one cross-promotion post).

A piece whose link target is deferred or removed is invalid until it is retargeted, marked `standalone` or removed; the report names it.

**Validation result classes.** Every sources, piece and delivery item is exactly one of: `malformed` (the push is rejected), `unauthorised` (the push is rejected), `deferred` (well-formed but this server does not support it yet; kept in the stored manifest, creates no slot), `supported`.

**Capabilities.** `GET /ingest/capabilities` returns, as versioned stable JSON: schema versions; enabled `(editorial brand, channel, as, account, mode, format)` tuples; `maxInstallments`; `rePush` (bool); and the **enabled limits**. The format's maximums and the enabled limits are separate:

| Limit | Format maximum | Enabled at M1 |
|---|---|---|
| Streamed request body | 8 MB | 3 MB |
| Manifest | 250 KB | 250 KB |
| Sources | 60 | 20 |
| Text source | 200 KB each | 200 KB |
| Total sanitised text | 4 MB | 1.5 MB |
| Data source | 500 rows × 24 columns and 400 KB serialised | 200 rows × 24 and 200 KB |
| Excerpt | 8 KB (hard-split) | 8 KB |
| Excerpts per version | 2,000 | 600 |
| Installments | 12 | 1 (`maxInstallments`) |
| Pieces | 120 total, 20 per installment | 20 total; 10 supported |
| Deliveries per piece | 4 | 1 |
| Evidence per piece | 40 passages and 150 KB | same |
| Bindings per post | 200 | same |
| Posts per editorial brand per installment | 25 | 10 |

An enabled limit is raised only by the issue that owns the capability, after its measured test passes with headroom (§9). Limits are applied to the sanitised, serialised result, not to the raw upload.

### 4.4 Authentication and the ingest endpoint

- **Endpoint:** Convex HTTP actions in a new `convex/http.ts` (`/ingest/capabilities`, `/ingest/bundles`, `/ingest/bundles/status`). Each calls fixed internal functions. No deploy key and no Next.js route.
- **Token:** `rsn_ing_` + 32 random bytes, shown once; only its SHA-256 is stored, indexed. Lifetime 1–365 days, default 90. Scope `bundle:push`. It carries `brandIds`, fixed at mint.
- **Authority, checked inside the committing transaction** (and for status reads): token not expired or revoked; every editorial brand in the plan and every account-owning brand of every delivery is in the token's `brandIds`; the token's owner **currently** holds owner or editor on each of those brands; an existing `bundleKey` belongs to that owner.
- **Owner removal:** Convex cannot see the sign-in allow-list. Removing a person therefore means removing their brand memberships (which invalidates their tokens at next use) and running `revokeAllForUser`. The runbook says so.
- **Cannot do:** anything but capabilities, dry run, commit and minimal status of its own bundles. A token is not a Convex identity; public functions still require a Clerk session.
- **Abuse limits:** the bearer token is resolved before the body is read. The body is counted **as it streams** and cut off at the enabled limit (`Content-Length` is advisory). Rate limits are stored in Convex per token and per owner. Rejection audit is bounded: per token one row a minute; for unknown tokens one global row a minute with a count.
- **Staged uploads:** sanitised blobs are stored before the committing mutation runs. Each is recorded in `stagedUploads`. They are deleted on conflict, on an unchanged-retry no-op, on any failure, and by a sweeper for anything unreferenced after an hour.
- **Dry run** writes no product state. Rate-limit and audit accounting are allowed.
- **Idempotency and concurrency:** a commit carries `baseVersion` and the content fingerprint. Same fingerprint as an existing version → that version is returned as unchanged, together with the **current** version number (the client stores the current one). A new fingerprint with a stale `baseVersion` → conflict. Concurrent first pushes yield one bundle (Convex transaction conflicts). Changed re-pushes are refused until `rePush` is enabled (CB-42).
- `/api/ops/lab-import` is untouched.

### 4.5 Source isolation and legacy entry points

Bundle sources never join the brand-wide corpus pool, and a bundle campaign never passes through the in-app campaign functions.

- `corpora.scope: "brand" | "campaign"`. Bundle versions are `campaign`.
- **Only sanitised text is stored.** Originals stay in the repo they came from.
- **One evidence resolver** (`convex/bundleEvidence.ts`) is the only reader of bundle evidence. It takes `{ campaignId, sourceVersion, purpose, postId? }` where `purpose` is `proposal-display`, `ground`, `quote` or `post-review`. It authorises the caller first (campaign owner; owner or editor on the relevant editorial brand), then resolves against the **named** version, so a post drafted on version 1 still shows version 1 evidence after version 2 arrives. `quote` never returns reference-only text. Reads are bounded and deduplicated.
- **Legacy entry-point policy.** Every exported function in the modules below is classified in a checked-in table, and a test fails if an export is unclassified:

| Module | For campaign-scoped sources / private ideas / bundle campaigns |
|---|---|
| `convex/corpora.ts`: `listCorpora`, `getCorpus`, `listCorpusExcerptPreview`, `updateExcerptReview`, `recordExcerptCorrection` | excluded or refused |
| `convex/campaigns.ts`: `attachCorpus`, `suggestIdeas`, `addIdeaToCampaign`, `removeIdeaFromCampaign`, `rejectIdea`, `undoIdeaRejection`, `searchSessionIdeas`, `getCampaignSession` | refused for bundle campaigns; private ideas never returned or attachable elsewhere |
| `convex/shapes.ts`: `saveBrief`, `proposeShape`, `updateSlot`, `linkSlotIdea`, `moveSlot`, `acceptShape` | refused |
| `convex/draftSet.ts`, `convex/draftGeneration.ts`, `convex/cohesion.ts` `runCohesionGate`, `convex/queue.ts` `materializeDraftSet` | refused |
| `convex/series.ts`: `attach`, `detach`, `move`, `addCompanions` | refused for a campaign-managed series |
| research inbox and idea conversion queries | private ideas excluded |

Bundle campaigns have their own functions (`bundleCampaigns`, `bundleRuns`, `bundleCohesion`, `bundleCalendar`), all behind `requireBundleCampaign(ctx, campaignId, action)`: the caller owns the campaign and holds the roles in §4.6 for that action.

### 4.6 Pieces, accounts, deliveries, runs

**Editorial brand and account are separate identities.**
- A piece's editorial brand is on its slot. **Every post of every delivery carries `post.brandId` = the editorial brand**, so series membership, voice and brand permissions follow the editorial brand even when the piece is published elsewhere.
- An **account** is a registry entry: `id`, `channel`, `ownerBrand`, `kind`. LinkedIn: `linkedin:personal` (owner `personal`, a profile), `linkedin:corvo`, `linkedin:freshproof`, `linkedin:lower-db` (pages). Blogs: `blog:corvo`, `blog:freshproof`. Short video and Instagram: one account per brand for Corvo Labs, FreshProof and the lower dB.
- A delivery row (`pieceDeliveries`) stores: `campaignId`, `installmentKey`, `slotId`, `pieceKey`, `deliveryKey`, `editorialBrandId`, `accountId`, `channel`, `as?`, `format`, `mode`, `role: primary | mirror | fanout`, `mirrorOfDeliveryKey?`, `postId?`, and for provider deliveries the pinned verified provider identity.
- Using `linkedin:personal` for a delivery does **not** create a Personal editorial piece, series or voice.

**Role matrix.** "Editorial" = owner or editor on the piece's editorial brand. "Account" = owner or editor on the account's owning brand.

| Action | Requires |
|---|---|
| Ingest commit (token) | editorial on every piece brand; account on every delivery account; all in the token's scope |
| Accept or append to the plan, answer decisions | editorial on every brand in the plan; account on every delivery account |
| Start a run, regenerate, edit copy | editorial on that piece's brand |
| Approve canonical copy | editorial |
| Approve a delivery on an account other than the editorial brand's own | editorial **and** account |
| Export, download, record or correct a live URL | editorial and account |
| Provider dispatch | editorial and account, rechecked at dispatch, against the pinned provider identity |

Losing a role blocks further writes that need it. An approved, undispatched delivery is rechecked at dispatch and held if the role is gone. Anything already dispatched or published is untouched.

**Installments and runs.**
- Every bundle campaign has `campaignInstallments` rows from its first push (`main` for a single-part bundle), each with `key`, `order`, `title`, `theme`, `state`.
- A **run** (`bundleRuns`) drafts or regenerates pieces of **one** installment. It records `installmentKey`, `pieceKeys`, and pins: accepted plan revision, source version, decisions version, voice and brand-profile versions. At most one active run per installment; a concurrent request is refused. Before dispatching to a model the run rechecks ownership, roles and that no decision is open. When recording results it rechecks ownership, roles and that its pins are still current; otherwise it records nothing and reports why.
- Drafting writes one canonical post per piece: the primary delivery's post. Each write is a compare-and-set against the post's current revision, approval state and provider state, so a run can never overwrite approved or dispatched copy.
- **Cohesion is a report** (`bundleCohesionReports`), keyed by installment and by the fingerprint of the exact canonical revisions it read. It uses the existing pure checks and never rewrites copy. Per editorial brand within the installment it checks plan rules 2 and 3 on the drafts; across brands it reports shared titles or openings.
- **Add to calendar** (`bundleCalendar.addInstallment`) requires a passing report whose fingerprint matches the current canonical revisions. It creates each non-primary delivery's post idempotently by `(campaignId, pieceKey, deliveryKey)`, never resets an existing post, and returns counts.
- The campaign queue reads **deliveries** for an installment through indexes, not slots, so fan-out and mirror posts are visible.

**Review series.** A new mapping `campaignSeriesLinks`, unique on `(campaignId, editorialBrandId)`, gives each editorial brand one campaign-managed series. Within it, an installment is one entry with identity `(seriesId, installmentKey)` and order from the plan. Its display anchor is that brand's article in the installment if it has one, otherwise its first primary piece in plan order. The anchor is for grouping only; publication dependencies are separate (§4.10). A campaign-managed series is writable only through campaign operations.

**Ideas.** One campaign-private idea per piece keeps the slot → idea invariant. Acceptance checks evidence and destinations directly; a linked idea proves neither.

**Fan-out and mirrors.**
- A `fanout` post starts as a copy of the primary's public fields and is then edited independently where the format allows.
- A `mirror` post has no body of its own. Its approval is bound to the parent's approved revision fingerprint and to the destination account; if the parent's approved revision changes, the mirror's approval and export are void.
- A delivery with `mode: "manual"`, or `as: "article"`, is never eligible for a provider. This is checked on the server in live and mock dispatch, queue candidates, reservations and review surfaces.

Rendered video (J5) later adds a renderer over the same `video-script` payload. Direct publishing (J8) later changes a delivery's mode. Neither changes the format.

### 4.7 Trust

**Scrub at push (J23).** Secret scan on every source and manifest field: any finding rejects the push. Source content is scrubbed before storage (absolute local paths, `~/` paths, `localhost` and private-network URLs, `t3-thread://` links, private `claude.ai/artifact/…` links, e-mail addresses), with counts reported. Excerpts under `internalHeadings`, and excerpts that are mostly paths after scrubbing, are reference-only.

**Decisions (J14).** Open decisions block every run. Each answer adds its `rule` to prompts and its `bannedTerms` to a deterministic check. Answers are versioned.

**Evidence gate (J19).**

*What is checked.* Every **public field** of a post's current revision: title, body, first comment, hashtags, description or excerpt, alt text, captions, and each text field of a structured payload (hook, voiceover, on-screen text, call to action, slide fields). Typed non-text fields (beat seconds, slide index) are not claims.

*Bindings.* A binding identifies one **occurrence**: `fieldPath`, `start`, `end`, the revision fingerprint, `kind` (`number`, `quote`, `derived`), and evidence: a passage (source version, excerpt) or a data cell (dataset version, row key, column). Two identical numbers in one field need two bindings.

*Deterministic layer.*
- Every numeral occurrence (URLs parsed out first) and every span in quotation marks, of any length, has a binding.
- A number's value and unit appear in its evidence after normalisation. No rounding.
- A data-cell binding matches the cell's value and unit, and the column is numeric.
- A quotation is an exact span of a quotable passage after typography normalisation. Quotation marks are reserved for verbatim text.
- A `derived` claim declares inputs (each bound), a formula from a fixed set (ratio, difference, percent change, sum, round to stated places) and its result; the server recomputes it.
- No banned term from an answered decision appears.

*Support check.* For every binding that passes the deterministic layer, a second model call judges whether the evidence supports what the sentence says: the right entity, measure, population and timeframe. For a cell it is given the row and the column's declared measure. Verdict per binding: `supported`, `unsupported` or `unclear`; a missing, malformed or timed-out verdict is `unclear`.

*Outcomes.*
- Deterministic failure or `unsupported`: the claim **cannot be confirmed by a person.** The copy must change, the binding must point at evidence that supports it, or new evidence must arrive in a re-push.
- `unclear`: Jake may confirm it after seeing the evidence. The confirmation is tied to that occurrence and revision.
- A run regenerates a failing piece at most twice, within a budget admitted up front that includes support-check calls. After that the piece is `needs-evidence-review`.

*Enforcement.* One function, `assertEvidenceApprovable(post)`, is called by the shared approval path that batch review already uses, by composer approval, and by variant acceptance (`acceptVariantPost`). A static test enumerates every write of `approvalState: "approved"`. The check runs on the fields as they will be published, after link assembly. Any edit, link change or payload change makes the affected verdicts stale.

*Publish hold.* A bundle post cannot be submitted, exported, queued or turned into a pull request until **both** approval enforcement (CB-11) and the support check (CB-13) have shipped. Until then it carries a visible hold. CB-13 lifts it.

**Clean copy and the outbound boundary.**
- `corpus://` source markers are removed from stored copy **before review**. Bundle drafts never contain them. For in-app campaigns they are moved into the post's citation list at "add to calendar".
- What is reviewed is the **assembled payload** built by the same functions dispatch uses (`linkedInPayload` trims the body and appends hashtags; the first comment is trimmed). Every outbound path asserts, and never rewrites, that this assembled payload is publishable, before its first remote **write** (reads needed to prepare a reschedule are allowed). A failure is audited in a committing mutation.
- Existing editorial fingerprints, visual signatures and Buffer snapshots are preserved.
- Existing records: an approved, undispatched post with markers is held with "Clean and re-review" (which returns it to unapproved). A post Buffer has already accepted is left alone. A post with an open pull request whose file contains markers is listed by a report; cleaning it goes through the existing "update the PR for the current artifact" path.
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

**FreshProof blog.** One `.md` file in `content/blog` of `jakebutler/freshproof-lite`. Its loader's schema is strict (`title`, `description`, `date`, `author: "Jake Butler"`, `pillar`, optional `draft`); its scalar parser coerces unquoted `true`/`false` and all-digit values, so any value that could be coerced, or that contains `:` or starts with a quote, is JSON-quoted. No hero. Canonical URL `https://freshproof.io/blog/<slug>`. Generated files are tested through a pinned copy of the real parser.

**Manual delivery is not a provider.** States: `approved → exported → awaiting-manual-publish → published`. Receipts (`manualDeliveryReceipts`): an **export** receipt bound to the reviewed payload hash; a **publication** receipt (human-reported URL) that requires a current export receipt; a **correction** receipt that supersedes the bound URL. Exports are downloaded through an authenticated route that streams the bytes; storage URLs are never sent to the browser.

**Link outcome**, by dependent delivery and target article:

| Dependent delivery is on | Target has a LinkedIn Article delivery | Target has a blog delivery only | Target is Article-only (no blog: the lower dB, Personal) |
|---|---|---|---|
| LinkedIn | the Article's recorded URL | the blog's verified URL | the Article's recorded URL |
| anything else | the blog's verified URL | the blog's verified URL | no link; shown as such in plan review |

- A dependent is held until its target URL exists **and** its assembled copy has been reviewed with that URL. A URL arriving never approves or dispatches anything; it asks for review.
- If the URL arrives after the dependent's proposed time, the dependent stays held and asks for a new reviewed date.
- Correcting a URL supersedes the old receipt, invalidates the reviews of unsent dependents, and lists dependents already sent.
- Bundle rows do not use the legacy blanket hold for series companions without a `companionLink`; they use delivery-bound targets.

**Schedule proposal (J16).** A pure function over deliveries.
1. Collisions are judged per **physical account** and its **local date**, across all campaigns. Jake's profile is one account whether a post is a Personal post or another brand's Article.
2. Existing scheduled posts are fixed points.
3. An installment starts from its anchor article (§4.3), at least three days out, on a weekday. A lower dB-led installment starts from its primary Article on the personal profile.
4. A mirror Article follows its blog post by a day.
5. Dependents come after their target: posts +1, +3, +6 days; carousel +2; short video +4.
6. Each further editorial brand starts two days after the previous brand's article.
7. **Articles on the personal profile are at least two days apart.** This is mandatory.
8. Installments follow the series cadence. Cadence yields to fixed dates and to rules 1 and 7: a date moves later, never earlier. An installment is never proposed before the previous installment's anchor.
9. Ties are broken by plan order, then delivery key. Times and timezone come from the account.

A proposal is not a reservation. Reserving queue capacity remains the existing explicit `reserve` operation. Everything lands unapproved.

**Account mapping.** Whether a LinkedIn post delivery is `provider` or `manual` comes from the verified Buffer mapping for its account, is shown before acceptance, and is stored with the pinned provider identity. A later remap or mode switch returns the delivery to review. LinkedIn Articles are always manual.

### 4.11 New formats

**Structured payloads** live in `postPayloads` (`postId`, `kind`, `payload`, `version`), with a shared interface owned by CB-30: validate, list public text fields with paths (for the evidence gate), render export.

**Short-video script** (`video-script`): `hook`, `beats[{seconds, voiceover, onScreenText, visual}]`, `cta`, `estimatedSeconds` (30–60), `caption`. Public text: hook, voiceover, on-screen text, call to action, caption. `visual` is an instruction to Jake, not published, and is not a claim.

**Carousel** (`carousel`): 5–8 slides of type `cover | stat | chart | text | quote | cta` plus the caption. Template slides render to 1080×1350 PNG with a pinned renderer, pinned fonts and per-field layout budgets. Chart slides draw from a pinned dataset version through the figure renderer. AI imagery (J18) supplies backgrounds only; Jake inspects and accepts each actual generated asset, and the acceptance is bound to its hash.

### 4.12 Skill and command-line tool

- `tools/resonate-cli/resonate.mjs`: one file, Node ≥ 20, no dependencies. M1: `bundle push [--dry-run]`. M2: `capabilities`, `bundle init`, `bundle validate`, `bundle status`. Its structural validator is tested against one versioned contract shared with `lib/contentBundle`. It stores the server's **current** version beside the bundle.
- `skills/resonate-campaign/SKILL.md` and references. Installed with the tool into `~/.claude/skills/resonate-campaign/` and `~/.codex/skills/resonate-campaign/`; the skill calls the tool by its installed path.

### 4.13 Multi-article series (J28)

- **Plan.** `plan.series` gives title, thesis, cadence and ordered installments. Plan rules are per installment (§4.3). Cross-promotion is a piece that `linksTo` another brand's article.
- **Acceptance** is once, for the whole plan, and is stored as an immutable accepted plan revision. While `maxInstallments` is 1, later installments are shown as deferred and have no drafting or calendar effect; Jake explicitly accepts the supported installment.
- **Append.** A deferred or newly pushed installment joins the accepted plan only by an explicit **Add installment**, with the same validation, role and aggregate-limit checks as acceptance. This creates a new accepted plan revision.
- **Runs** are per installment (§4.6). A run's context includes the series thesis, the installment list, and for each earlier installment a bounded summary of its anchor article, pinned by that article's revision. Only approved, evidence-cleared summaries carry facts forward; any number or quote reused in new copy must bind to current evidence like any other. If an earlier installment has no eligible summary, the run says so in the prompt and offers no facts from it.
- **Cohesion** per installment, plus a series report: no two installments share a title or opening; each anchor article states its place in the series.
- **Calendar and review** per installment (§4.6): one entry per editorial brand per installment in that brand's managed series.
- **Scheduling** per §4.10.
- **Scale.** Reads are installment-scoped and indexed. Batch review and queue release keep their existing selection limits (50 and 20) and operate within an installment. `maxInstallments` is raised by CB-38 only after the maximum accepted fixture passes every affected read and write on a populated account.

## 5. Data model summary

New tables: `ingestTokens`, `ingestRateWindows`, `stagedUploads`, `contentBundles`, `bundleVersions`, `bundleDatasets`, `campaignInstallments`, `campaignDecisions`, `acceptedPlanRevisions`, `pieceDeliveries`, `campaignSeriesLinks`, `bundleRuns`, `bundleCohesionReports`, `claimBindings`, `claimConfirmations`, `sourceImpacts`, `voiceProfiles`, `brandProfiles`, `brandTemplates`, `postPayloads`, `carouselSlides`, `manualDeliveryReceipts`.

Extended with optional fields only: `corpora` (`scope`, `bundleVersionId`), `corpusDocuments` (`sourceKey`, `role`, `path`, `sha256`, `visibility`, `storageId`), `corpusExcerpts` (`contentHash`, `headingPath`, `visibility`), `ideas` (`campaignPrivate`), `campaigns` (`origin`, `bundleId`, `brandIds`, `proposalState`, `proposalVersion`, `decisionsVersion`, `acceptedPlanRevision`), `campaignShapes` (`preset` gains `custom`), `campaignSlots` (`pieceKey`, `installmentKey`, `brandId`, `format`, `treatment`, `draftSourceDocumentId`, `sourceDocumentIds`, `linksToPieceKey`, `standalone`, `operatorEditedFields`), `postSeries` (`managedByCampaignId`), `v2Posts` (`sourcePieceKey`, `sourceDeliveryId`, `primaryPostId`, `destinationAccountId`, `draftRevision`, `evidenceState`, `staleSince`, `staleReasons`, `holdReason`).

A value-list entry (channel, format, status) is added only by the issue that first uses it, together with every duplicated validator, label map, filter and reader.

## 6. Assumptions I made without asking (veto any)

| # | Assumption |
|---|---|
| A1 | X and Reddit are not offered to bundles. Existing support is untouched. |
| A2 | Personal joins a plan when Jake or the agent includes it; its default pack is LinkedIn posts, plus an Article of its own only when planned. |
| A3 | A campaign's sources belong to the campaign, not to a brand's shared corpus. |
| A4 | A new `freshproof-blog` channel, not a migration of `corvo-blog` to a generic one. |
| A5 | One hidden, campaign-private idea per piece. |
| A6 | After acceptance, a re-push updates sources and impact but does not change the plan; differences are offered for Jake to apply. |
| A7 | *(Changed in rev 4.)* A number must bind to evidence or be a declared, recomputed derivation. Jake can confirm only a claim whose support is unclear, never one that failed. |
| A8 | Every LinkedIn Article is published from the personal profile (J26). In the standard pack each brand's article gets one. |
| A9 | The lower dB has no blog: its article is a primary LinkedIn Article on the personal profile, in the lower dB's voice. |
| A10 | A run refuses a piece whose voice is not approved (after M1). |
| A11 | Only sanitised source text is stored in Resonate. |
| A12 | The in-app campaign flow keeps working unchanged, and bundle campaigns never pass through its functions. |
| A13 | LinkedIn accounts not mapped in Buffer fall back to manual publish, shown before acceptance. |
| A14 | One article per editorial brand per installment. |
| A15 | Ingest tokens expire after 90 days by default. |
| A16 | A series is accepted once and drafted one installment at a time. |
| A17 | Default series cadence is one installment a week. |
| A18 | A cross-promotion is written in the promoting brand's voice; the agent proposes one only where audiences overlap, and Jake can remove it. |
| A19 | Articles on the personal profile are at least two days apart (mandatory). |
| A20 | Publishing Jake's own content from his profile needs editor rights on the Personal brand as well as on the editorial brand. For Jake, who owns every brand, this changes nothing. |
| A21 | The mock-draft `[EVIDENCE: …]` / `[SOURCE: …]` confirmation flow is left as it is. |

## 7. Proposed issues

Full contracts are in the GitHub issues: epic [#196](https://github.com/jakebutler/resonate-v2/issues/196); CB-01 … CB-36 are #197 … #232 in order; CB-00 #233, CB-37 #239, CB-38 #240, CB-39 #241, CB-40 #234, CB-41 #235, CB-42 #236, CB-43 #238, CB-44 #237. **Rigor**: *high* = auth, publishing gate or approval surface; *standard*; *light*. **+Fable** = Fable reviews in addition to Opus 5.5.

| ID | Title | Depends on | Rigor | Review |
|---|---|---|---|---|
| **Groundwork** | | | | |
| CB-00 | Land the plan, the legacy entry-point table and the pinned Firecrawl source on `main` | — | light | Jake |
| **M0 — Two live defects** | | | | |
| CB-01 | Keep source markers out of published copy | — | high | Opus +Fable |
| CB-02 | "Add to calendar" never resets approved or scheduled posts | — | high | Opus +Fable |
| **M1 — Tracer** | | | | |
| CB-03 | Ingest tokens (entry point off) | CB-00 | high | Opus +Fable |
| CB-04 | Bundle format v1: schema, plan rules, limits, scrub, fingerprint, fixtures | CB-00 | standard | Opus |
| CB-05 | Ingest request path: authenticate, bound, validate, stage, dry-run report | CB-03, CB-04 | high | Opus +Fable |
| CB-40 | First push becomes an isolated source version and a proposed campaign; minimal `resonate bundle push` | CB-05 | high | Opus +Fable |
| CB-06 | Review a proposed campaign; answer decisions; accept | CB-40 | standard | Opus |
| CB-07 | Tracer run: draft one installment with bound claims, report cohesion, add to calendar, hold | CB-02, CB-06 | high | Opus +Fable |
| CB-08 | M1 proof: Firecrawl bundle to an unapproved Corvo calendar (Jake in the loop) | CB-01, CB-07 | standard | Jake |
| **M2 — The real handoff** | | | | |
| CB-09 | `resonate` tool: capabilities, init, validate, status | CB-40 | standard | Opus |
| CB-10 | Handoff skill for Claude Code and Codex, with installer | CB-09 | standard | Opus |
| **M3 — Trust completes** | | | | |
| CB-41 | Edit and regenerate bundle drafts | CB-07 | high | Opus +Fable |
| CB-11 | Claims beside their evidence; approval enforces bindings | CB-01, CB-41 | high | Opus +Fable |
| CB-12 | Tabular evidence: typed datasets and cell bindings | CB-11 | standard | Opus |
| CB-13 | Support check; lifts the publish hold | CB-11, CB-12 | high | Opus +Fable |
| CB-42 | Changed re-push: version n+1 and pre-acceptance plan replacement | CB-06, CB-40 | high | Opus +Fable |
| CB-14 | Impact of new versions on drafts and approved posts | CB-12, CB-13, CB-42 | high | Opus +Fable |
| CB-15 | "What changed": review impact, apply plan differences, regenerate selected | CB-14, CB-41 | standard | Opus |
| **M4 — Voice** | | | | |
| CB-16 | Voice and brand profiles: stored, versioned, approved | CB-00 | standard | Opus |
| CB-17 | Runs use the piece's pinned voice and brand profile | CB-14, CB-16 | standard | Opus |
| CB-18 | Polish Jake's own drafts | CB-13, CB-17 | standard | Opus |
| CB-19 | Draft a voice profile from published posts | CB-16 | light | Opus |
| CB-44 | Brand templates and assets for carousels | CB-16 | standard | Opus |
| **M5 — Cross-brand and destinations** | | | | |
| CB-20 | One registry for brands, channels, accounts and channel capabilities | CB-00 | standard | Opus |
| CB-43 | Blog destinations as explicit configuration (Corvo only) | CB-20 | standard | Opus +Fable |
| CB-21 | Cross-brand campaigns: editorial brand on every piece, one managed series per brand | CB-13, CB-20 | high | Opus +Fable |
| CB-22 | FreshProof blog destination, full lifecycle | CB-01, CB-21, CB-43 | high | Opus +Fable |
| CB-23 | Deliveries and accounts: one piece, several places; idempotent fan-out | CB-02, CB-21 | high | Opus +Fable |
| CB-24 | Manual delivery: approved export, receipts, recorded live URL | CB-01, CB-13, CB-23 | high | Opus +Fable |
| CB-25 | LinkedIn Article as a primary delivery on the personal profile | CB-24 | standard | Opus +Fable |
| CB-26 | LinkedIn Article as a mirror of a blog article | CB-22, CB-25 | high | Opus +Fable |
| CB-27 | Link targets by delivery | CB-26 | high | Opus +Fable |
| CB-28 | Schedule proposal by account, sequence and link targets | CB-27 | standard | Opus |
| CB-29 | LinkedIn account identity and mapping (Jake in the loop) | CB-24 | standard | Opus |
| **M6 — New formats** | | | | |
| CB-30 | Structured payloads and the short-video script, with one complete export | CB-24 | standard | Opus |
| CB-31 | Short-video fan-out: Reels and Shorts | CB-30 | light | Opus |
| CB-32 | Carousel: template slides and export | CB-30, CB-44 | standard | Opus |
| CB-33 | Carousel chart slides bound to datasets | CB-14, CB-32 | standard | Opus |
| CB-34 | AI-generated backgrounds for carousels | CB-32 | standard | Opus |
| **M7 — Multi-article series** | | | | |
| CB-37 | Accept series plans and draft one installment at a time | CB-15, CB-17, CB-21 | high | Opus +Fable |
| CB-38 | Review and schedule series deliveries by installment; enable series | CB-28, CB-29, CB-37 | high | Opus +Fable |
| **M8 — Proof and housekeeping** | | | | |
| CB-35 | Full proof: standard pack across FreshProof and Corvo Labs (Jake in the loop) | CB-10, CB-15, CB-18, CB-28, CB-29, CB-31, CB-33, CB-34 | standard | Jake |
| CB-39 | Series proof: two installments of a real series, live (Jake in the loop) | CB-35, CB-38 | standard | Jake |
| CB-36 | Glossary, spec addendum and older-issue disposition | CB-35, CB-39 | light | Opus |

## 8. Sequencing

```
CB-00 ─┬─ CB-03 ─┐
       ├─ CB-04 ─┴─ CB-05 ─ CB-40 ─┬─ CB-06 ─ CB-07 ─┬─ CB-08   (CB-01, CB-02 before CB-08 / CB-07)
       │                           └─ CB-09 ─ CB-10  │
       │                                             └─ CB-41 ─ CB-11 ─ CB-12 ─ CB-13
       │                              CB-06 + CB-40 ─ CB-42 ─┐
       │                                   CB-12 + CB-13 ────┴─ CB-14 ─ CB-15
       ├─ CB-16 ─┬─ CB-17 (after CB-14) ─ CB-18 (after CB-13)
       │         ├─ CB-19
       │         └─ CB-44
       └─ CB-20 ─┬─ CB-43
                 └─ CB-21 (after CB-13) ─┬─ CB-22 (after CB-43, CB-01)
                                         └─ CB-23 ─ CB-24 ─┬─ CB-25 ─ CB-26 ─ CB-27 ─ CB-28
                                                           ├─ CB-29
                                                           └─ CB-30 ─┬─ CB-31
                                                                     └─ CB-32 ─┬─ CB-33
                                                                               └─ CB-34
CB-37 (after CB-15, CB-17, CB-21) ─ CB-38 (after CB-28, CB-29)
CB-35 ─ CB-39 ─ CB-36
```

**Dependency order is not merge safety.** Many issues touch `convex/schema.ts`. Independent issues may be developed in parallel; schema-touching pull requests are merged one at a time and the rest rebased. Verification criteria live in one manifest per milestone (`content-bundles-m0` … `-m7`).

Milestone exits:
- **M0:** no source marker can reach a published post; re-running "add to calendar" cannot undo an approval.
- **M1:** a real first push from `freshproof-lite` becomes a proposed Corvo Labs campaign with one article and one post, which Jake accepts and takes to an unapproved calendar. Bundle posts cannot be published.
- **M2:** Jake does that with one command from Claude Code or Codex.
- **M3:** a claim that is not supported cannot be approved; a corrected notebook flags exactly the affected drafts; bundle posts can be published.
- **M4:** drafts sound like the brand they belong to; Jake's own draft comes back polished.
- **M5:** one campaign spans FreshProof, Corvo Labs and Personal, with a FreshProof blog PR, LinkedIn Articles exported for the personal profile, and promos held on the Article URL.
- **M6:** the standard pack is complete.
- **M7:** a multi-article series is accepted once, drafted and scheduled installment by installment, with brands promoting each other's articles.

## 9. Verification

- One manifest per milestone. Tiers `offline-fixture` and `offline-contract` everywhere. `live-receipt` criteria only in the three proofs, each named in its manifest.
- **A live receipt must state** environment, code revision, bundle version, installment, delivery, account, reviewed payload revision and outcome. A missing receipt leaves the proof pending; it never passes by default. Screenshots and receipts are redacted before they are committed.
- A sanitised Firecrawl fixture is shared by unit, Convex and Playwright tests. A fixture drafting provider makes runs repeatable.
- On high-rigor issues the negative tests come first.
- **Named owners for the measured and deployed checks:**

| Check | Owner |
|---|---|
| Deployed rate limiting and token revocation | CB-08 |
| Ingest at the M1 enabled limits (documents, transaction size) | CB-40 |
| Run context and evidence reads at the enabled limits | CB-07, then CB-37 at series scale |
| Impact computation at the enabled limits | CB-14 |
| Fan-out and queue reads on a populated account | CB-23, then CB-38 |
| Concurrent first pushes; A → B → delayed retry of A | CB-40, CB-42 |
| Approval racing regeneration | CB-41 |
| Rescheduling a mixed batch | CB-02 |
| Membership revoked mid-campaign | CB-21 |

## 10. Risks and open questions

**Risks**
1. **Evidence gate usability.** Occurrence-level bindings ask a lot of the model. CB-07 reports the first-pass rate on the fixture with the fixture provider's recorded outputs, CB-08 with a live model. If the live rate is poor, the remedy is prompt and format work, not loosening the gate.
2. **Breadth.** 45 issues. The tracer (M1) and the two defects are valuable on their own; each later milestone is independently shippable.
3. **Two reviews returned "not ready".** The second review's findings are addressed in this revision (§13) but this revision has not itself been re-reviewed.
4. **LinkedIn Article paste fidelity** is outside our control (CB-25 demonstrates it).
5. **Carousel rendering runtime** (CB-32 starts with a spike).
6. **Claude doc export** needs the docs connector in the coding session; fallback is a manual Markdown export.
7. **Live account state is unverified** until CB-29 and the proofs.

**Open questions for Jake** (none blocks M0–M3)
- Q6. *Answered 2026-11-20 (J30):* the series proof (CB-39) uses the six-post FreshProof history outline, first two installments.
- Q7. A20: is requiring Personal-brand editor rights for anything published from your profile right, should someone else ever work in Resonate?

## 11. Roles and model routing (J24)

| Stage | Who |
|---|---|
| Plan with proposed issues | Claude Fable 5.2 |
| Plan review | GPT-6.2 Sol, high effort, via the Codex CLI (two rounds; §13) |
| Response to review, then GitHub issues | Claude Fable 5.2 |
| Approval of plan and issues | Jake |
| Implementation, in a new thread | GPT-6.2 Sol, high effort, orchestrating; one new GPT subagent per issue with a scoped contract; model and effort by rigor |
| Code review | Claude Opus 5.5 on every pull request; Fable in addition where marked |

Building does not start until Jake approves the plan and the issues.

## 12. Out of scope

Rendered video; direct publishing to TikTok, Instagram or YouTube; X and Reddit for bundles; a Resonate MCP server; analytics; an agent team inside Resonate; a lower dB blog destination; LinkedIn Articles from company pages; storing unsanitised sources; changes to `/api/ops/lab-import`; the mock-draft placeholder confirmation flow.

Older issues: #45 and #49–#55 are superseded and #61, #66–#68 have met their destination; CB-36 closes them after checking their current state. #56 and #57 stay parked. #110–#123 are unchanged and linked from CB-33 and CB-34.

## 13. Review history

**Review 1 (rev 1), verdict "not ready", 8 blocking findings.** All accepted. Main changes: slots remain the piece record with deliveries in their own table; campaign-scoped sources with one resolver; Convex HTTP ingest with no deploy key; base-version idempotency; claim bindings in place of "the numeral appears somewhere"; markers removed before review; manual delivery separate from providers; explicit limits.

**Jake's answers, 2026-11-20 (rev 3).** Personal is an editorial brand (J25); every LinkedIn Article is published from the personal profile (J26); the lower dB may lead (J27); multi-article series with cross-brand posting and cross-promotion (J28); keep the support check (J29).

**Review 2 (rev 3 and the 36 issues), verdict "not ready", 9 blocking findings.** All accepted:

| Finding | Change in rev 4 |
|---|---|
| 1. An installment key does not scope a run | Installment records from the first push; runs and cohesion reports keyed by installment and exact revisions; bundle campaigns get their own run, cohesion and calendar functions; delivery-aware queue reads (§4.6). |
| 2. The review bridge cannot be called per brand or installment | `campaignSeriesLinks` on (campaign, editorial brand); entry identity (series, installment); display anchor separate from publication dependencies; campaign-managed series locked to campaign operations (§4.6). |
| 3. Editorial brand and publishing account need separate identities | Accounts registry; deliveries carry both; `post.brandId` is always the editorial brand; role matrix; server-side manual and Article checks (§4.6). |
| 4. Plan and calendar rules reject valid packs | One per-installment rule set with a deterministic anchor; link outcome table; scheduling by physical account with mandatory Article spacing and defined yielding (§4.3, §4.10). |
| 5. Raised limits have no safety argument | Format maximums separated from enabled limits; small enabled limits at M1; each raise owned by a named measured test; per-installment, indexed, deduplicated reads (§4.3, §9). |
| 6. Security boundary incomplete at existing entry points | Classified legacy entry-point table with a completeness test; bundle-only functions behind one guard; resolver by explicit version and purpose; token brand scope enforced at use; streamed byte counting; staged-upload cleanup (§4.4, §4.5). |
| 7. The gate can approve what it must block | A failed or unsupported claim cannot be confirmed; occurrence-level bindings over every public field; support check for every binding including cells; the publish hold stays until the support check ships (§4.7). |
| 8. Revision and receipt transitions | Compare-and-set writes for runs; mirror approval bound to the parent's approved revision; export and URL receipts bound to the reviewed payload; authenticated byte serving; defined behaviour for existing Buffer and GitHub records (§4.6, §4.7, §4.10). |
| 9. M1 thin in outcome only; ordering errors | Ingest split into a request path (CB-05) and atomic activation (CB-40); the tracer run (CB-07) separated from editing and regeneration (CB-41); changed re-push moved to CB-42; registry split from destination plumbing (CB-43); template data split out (CB-44); Article issues ordered before link targets; cyclic and missing dependencies fixed; CB-00 lands shared contracts and the fixture first. |

Factual corrections: the 100-post figure is the bridge's per-call input limit, not a series cap; capacity reservation is an explicit operation, not part of release; stored copy and dispatched bytes differ by assembly (trim, hashtags); FreshProof's parser coerces booleans and digits; the storage getter issues a reusable URL.

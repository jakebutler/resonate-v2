# Architecture Review — resonate-v2

**Date:** 2026-09-14
**Scope:** `main` @ `a7b255d`, Next.js 16 + Convex + Clerk, ~244 TS/TSX files
**Method:** full read of README, `docs/spec.md`, ADRs 0001–0007, campaign-loop spec, `convex/schema.ts`, all of `convex/`, hot paths in `components/` and `app/`, spot reads across `lib/`.

---

## (a) Verdict

This is a well-above-average codebase for a solo-operator app: the campaign loop is genuinely well-architected (immutable corpus versions, server-issued mock-acknowledgment tokens, fingerprint-pinned cohesion gates, a real audit trail, and cross-brand authorization tested with `convex-test` `withIdentity`), and the recent remediation pass closed the campaign-scoped full-table-scan problem cleanly with `by_user_and_campaign`. The architecture's weakness is **stratification**: the v2 campaign/publishing spine is held to a high standard while three older strata underneath it — the legacy `posts`/`settings` tables, the `lib/domain.ts` in-memory domain model, and the v1 workflow board — run on completely different (or absent) rules. The single most serious finding is not the Buffer gap: it is that `convex/posts.ts` and `convex/settings.ts` expose **eight unauthenticated public Convex functions** against a live production deployment whose URL is a `NEXT_PUBLIC_` variable, which the `proxy.ts` email allowlist cannot protect because Convex is a separate origin. The second is that `listCalendarItems` — the app's primary screen — is an unbounded N+1 that reads every audit event of every post on every reactive tick. On the Buffer/LinkedIn question specifically, the premise I was given is **stale**: the wiring exists, is complete, and the gates are set in Convex prod; what is missing is verification, a status-refresh loop, and two of four brands' channel mappings (see §d). Health: **structurally sound core, with a sharply defined perimeter problem and one scaling cliff.**

---

## (b) Top 10 issues, ranked

### 1. Eight unauthenticated public Convex functions on a live deployment
**Evidence:** `convex/posts.ts:4` (`list`), `:20` (`getById`), `:27` (`create`), `:65` (`update`), `:102` (`remove`), `:109` (`generateUploadUrl`), `:115` (`getFileUrl`); `convex/settings.ts:4` (`get`), `:11` (`upsert`). None call `ctx.auth.getUserIdentity()`. Contrast `convex/posts.ts:128`, which does check — in the same file.

**Why it matters:** `proxy.ts:118` enforces the `RESONATE_ALLOWED_EMAILS` allowlist, but it is *Next.js middleware*. Convex functions are served from `NEXT_PUBLIC_CONVEX_URL` (`.env.local.example:33`), a different origin that middleware never sees. Anyone who can reach that URL — no Clerk token at all, since these functions never ask for one — can enumerate every legacy blog/LinkedIn post (`posts.list`), overwrite them (`posts.update`), delete them (`posts.remove`), flip publishing settings (`settings.upsert`), and mint arbitrary Convex storage upload URLs (`posts.generateUploadUrl`). The `posts` table has no `userId` column at all (`convex/schema.ts:567-600`), so there is nothing to scope against even if a check were added naively. These are live: `app/legacy/page.tsx:97`, `components/BlogPostEditor/BlogPostEditor.tsx:35-39`, `components/FullScreenEditor/FullScreenEditor.tsx:154-159`, and `components/PersistedPublishingPanel.tsx:1957` (the v2 composer's hero-image upload) all call them today.

**Recommended change:** Add `requireUserId(ctx)` to all nine functions immediately — that alone closes the anonymous hole. Then decide ownership for `posts`: either add `userId` + a `by_user` index and backfill (`convex/backfill.ts` already has the upsert path), or accept single-tenant semantics and gate on membership in any brand. `generateUploadUrl`/`getFileUrl` should move to a v2-owned module since the v2 composer is their real consumer.

**Effort:** S for the auth check; M for the `posts` ownership model.
**Safe now?** The auth check is safe to do now. The ownership model needs a product decision (is `posts` retired at cutover per ADR 0004's deletion intent, or does it survive?).

---

### 2. `listCalendarItems` is an unbounded N+1 over the whole audit trail
**Evidence:** `convex/publishing.ts:601-670`. Line 619 collects every post for the user; line 637 maps over the filtered set calling `latestIntent` (`:268`, itself a `collect()`); line 646 collects all attempts per intent; **line 653 collects every `v2AuditEvents` row for every post** and returns them all to the client.

**Why it matters:** This is the home page (`app/page.tsx:24`). `v2AuditEvents` grows monotonically — every `post.create`, `post.approve`, `reschedule`, `updateContent`, `provider.mock_submit`, `provider.skip`, and `campaign.materialize` writes a row (`convex/publishing.ts:284`, `convex/campaignAccess.ts:51`), and there is **no pruning anywhere** (the only `ctx.db.delete` on the table is the post-delete cascade at `convex/publishing.ts:804`). Cost is `O(posts × audit_events_per_post)` documents read per calendar render, and because Convex queries are reactive, that recomputes on *every* mutation that touches any of those documents. Filters are applied in JS (`:626-640`) after the full collect, so narrowing the view doesn't reduce the read. At 200 posts × 25 events this is ~5,000 doc reads per tick; a materialized 12-draft campaign batch adds 12 posts and a burst of events at once.

**Recommended change:** (i) Stop returning `auditEvents` from the list query — the drawer is the only consumer; make it a separate `getPostAuditTrail(postId, limit)` query. (ii) Same for `attempts`: return `attemptCount` + `lastAttempt` only. (iii) Add `v2Posts.by_user_and_status` (or query `by_brand_and_status`, which already exists at `convex/schema.ts:205`, per selected brand) and push `statuses`/`brandIds` into the index instead of `.filter()` in JS. (iv) Add a date-window argument — the calendar renders one month; it should not read the whole history.

**Effort:** M.
**Safe now?** Yes — mechanical, and `components/__tests__/PersistedPublishingPanel.test.tsx` (1,117 lines) covers the surface.

---

### 3. `providerForChannel` — ADR 0002's routing contract exists in three copies
**Evidence:** `lib/providerAdapters.ts:70` (canonical, exported, returns `ProviderId | null`); `convex/publishing.ts:118` (private copy, returns `undefined`); `convex/ideas.ts:41` (second private copy, returns `undefined`).

**Why it matters:** ADR 0002 states provider routing must sit "behind explicit contracts so it can later map onto Postiz providers." Three hand-maintained copies is the opposite: adding a channel (or repointing LinkedIn off Buffer) requires three edits, and a miss silently produces `routable: false` channels that cannot submit (`convex/publishing.ts:188`). The Convex copies are gratuitous — `convex/queue.ts:9-14` and `convex/shapes.ts:15` already import from `@/lib/...`, proving the path alias resolves inside Convex functions. The same duplication repeats for `sanitizeProviderResponse` (`convex/publishing.ts:225` vs. `lib/domain.ts:687`, byte-identical) and `formatYmdFromOffset` (`convex/publishing.ts:317` vs. `convex/queue.ts:18`, byte-identical).

**Recommended change:** Delete the two Convex copies of `providerForChannel` and import from `lib/providerAdapters`; normalize the `null`/`undefined` return at the two call sites. Move `sanitizeProviderResponse` and `formatYmdFromOffset` into `lib/` and import.

**Effort:** S.
**Safe now?** Yes.

---

### 4. The ADR 0002 approval gate is inlined three times, and the tested copy is dead code
**Evidence:** `lib/domain.ts:666-686` `isEligibleForProviderSubmission` implements the four-rung ladder (routable → approved → scheduled → fingerprint unchanged). It is imported by exactly one file in the repo: `lib/__tests__/domain.test.ts:14`, asserted at `:228`. Production re-implements the same ladder by hand at `convex/publishing.ts:1101-1109` (`submitMockProvider`) and again inside `claimBufferSubmission` (`convex/publishing.ts:1930`+).

**Why it matters:** This is the app's central safety invariant — README:81-85 and ADR 0002's "Approval Rules" both hinge on it. The version with test coverage is not the version that runs. A divergence between the three (say, someone adds a "channel unavailable" rung to two of them) would not fail any test. This also means `lib/domain.ts` (1,193 lines) is largely a parallel in-memory domain model whose relationship to the Convex system of record (ADR 0005) is undeclared.

**Recommended change:** Export the ladder as one pure function taking `{routable, approvalState, scheduledDate, contentFingerprint, currentFingerprint}` from `lib/`, call it from both Convex sites, and point `domain.test.ts` at it. Then audit the rest of `lib/domain.ts` and mark what is live vs. v1-parity scaffolding.

**Effort:** S for the gate; M for the `lib/domain.ts` audit.
**Safe now?** Gate consolidation: yes. The `lib/domain.ts` triage needs a decision on whether the v1-parity model is retired at cutover (ADR 0004 records the deletion intent but gates it on the cutover decision).

---

### 5. `/api/ops/lab-import` is unreachable by its own CLI in any deployed environment
**Evidence:** `proxy.ts:4-8` lists public routes: `/sign-in`, `/sign-up`, `/api/ops/validate-workflow`. `/api/ops/lab-import` is **not** on it, and `proxy.ts:183-187`'s matcher includes `/(api|trpc)(.*)`. So `proxy.ts:123-125` runs `redirectToSignIn()` for any request without a Clerk session. `scripts/corpus-import.mjs:214-221` posts with only `Authorization: Bearer ${V2_OPS_SECRET}` and no cookie.

**Why it matters:** `fetch` follows the 307 to the Clerk sign-in page, gets HTML, `response.ok` is true, `response.json().catch(() => ({}))` at `scripts/corpus-import.mjs:221` swallows the parse failure, and the script prints `✓ Imported corpus vundefined — undefined excerpt(s) saved` (`:228`) — a **false success**. The entire C9/C10 lab-import journey, which the last commit built and which my memory notes is the content-series ingestion path, cannot work against prod or a preview deploy. The route's careful timing-safe compare (`app/api/ops/lab-import/route.ts:44-48`), rate limit, and rejection audits are all dead code in deployment.

**Recommended change:** Add `/api/ops/lab-import` to `isPublicRoute` (the route does its own stronger auth), **or** have the CLI mint a Clerk machine token. Separately, make the CLI fail loudly on a non-JSON body. Also worth noting: the rate limiter at `:31` is an in-process `Map`, which on Vercel's serverless runtime resets per cold start — the comment at `:30` concedes this but the route ships to Vercel.

**Effort:** S.
**Safe now?** Yes. The route's own bearer check is stronger than the middleware's.

---

### 6. Six ad-hoc `requireUserId` definitions; no single auth helper
**Evidence:** `convex/campaignAccess.ts:14` (the exported, canonical one), `convex/publishing.ts:235`, `convex/ideas.ts:74`, `convex/research.ts:88`, `convex/workflow.ts:63`, `convex/v2Migration.ts:45`, plus `convex/bufferLive.ts:33` (`requireActionUserId`). `requireBrandAccess` is defined four times: `convex/campaignAccess.ts:20`, `convex/publishing.ts:241`, `convex/ideas.ts:94`, `convex/research.ts:94`. They are not identical: `convex/ideas.ts:76` checks `if (!identity)`, everyone else checks `if (!identity?.subject)`.

**Why it matters:** `convex/campaignAccess.ts` already is the shared helper module and is used correctly by `queue.ts`, `shapes.ts`, `cohesion.ts`, `draftSet.ts`, `corpora.ts`, `mockAck.ts`, `opsAudit.ts`. The older modules simply predate it. A divergence here is an authorization bug, and there is no lint rule or test that would catch one.

**Recommended change:** Make `convex/campaignAccess.ts` the single source (rename it — it is no longer campaign-specific; `convex/access.ts`), delete the five copies, and add an ESLint rule banning bare `ctx.auth.getUserIdentity()` outside that module.

**Effort:** S.
**Safe now?** Yes — `convex/__tests__/publishing.test.ts:142-194` already pins the cross-brand denial behavior.

---

### 7. No pruning on any append-only table; corpora grow without bound by design
**Evidence:** The only `ctx.db.delete` calls in `convex/` are `ideas.ts:521-522`, `posts.ts:105`, `publishing.ts:785-815` (post-delete cascade), `shapes.ts:144` (slot replacement). Nothing prunes `v2AuditEvents`, `v2PublishAttempts`, `cohesionRuns`, `materializations`, `mockAcknowledgments`, or `corpusExcerpts`.

**Why it matters:** Three specific cliffs. (i) **`mockAcknowledgments`** (`convex/schema.ts:844-850`) — `requestMockAcknowledgment` inserts on every dialog confirm (`convex/mockAck.ts:32`) and nothing ever deletes; tokens are also not single-use, so a token stays valid for its full 10-minute TTL after being spent, and they are minted with `Math.random()` (`convex/mockAck.ts:17`), which in Convex's deterministic runtime is not a CSPRNG. (ii) **`corpusExcerpts`** — corpora are immutable versions (ADR 0007 §2), so every re-import of the same lab folder writes a *complete new copy* of every excerpt, forever, and `insertCorpusVersion` (`convex/corpora.ts:129-166`) has no dedupe against the prior version. (iii) **`v2AuditEvents`** with `postId: undefined` — campaign, corpus, and `ops:lab-import` events (`convex/opsAudit.ts:18`, `convex/corpora.ts:168`) are never reachable by the post-delete cascade at all.

**Recommended change:** Add a `crons.ts` (there is none — `find . -name crons.ts` returns nothing) with a daily prune of expired `mockAcknowledgments` and a retention policy for `v2AuditEvents` older than N months (archive-on-delete if the trail is compliance-relevant). Mark tokens consumed on verify (`convex/mockAck.ts:44`) and switch to `crypto.randomUUID()`. For corpora, add a content-hash dedupe so a re-import that changes nothing does not mint a new version.

**Effort:** M.
**Safe now?** Token consumption + CSPRNG + cron pruning of `mockAcknowledgments`: yes. Audit retention needs a product decision (ADR 0006 explicitly makes the materialize audit trail a permanent record — "answers 'did we schedule unreviewed material?' for every batch, **forever**"; a retention policy contradicts that and needs a call).

---

### 8. `getCampaignSession` ships every excerpt of every attached corpus to the browser
**Evidence:** `convex/campaigns.ts:479-492` — for each `corpusId` on the campaign, `collect()` all `corpusExcerpts` `by_corpus`, sort, and return the full `{corpus, excerpts}` array. Same pattern in `suggestIdeas` at `convex/campaigns.ts:190-207` and `getCorpus` at `convex/corpora.ts:356-359`.

**Why it matters:** This is the campaign loop's main screen (`app/campaigns/[campaignId]/page.tsx` → `components/campaigns/CampaignSession.tsx`). The corpus unit is a lab experiment directory; a single import can produce hundreds to thousands of excerpts, each carrying full `text` (`convex/schema.ts:743`). Attaching a second corpus version doubles it. Convex has a hard limit on function return size, so this fails *cliff-style* (an error, not a slowdown) once a brand's corpus crosses the threshold — and it will fail first for the brand with the most content, which is the one that matters most. `getCorpus` has the same exposure on the excerpt-review surface.

**Recommended change:** Paginate. `corpusExcerpts` already has `by_corpus_and_seq` (`convex/schema.ts:751`), so `.paginate()` with a seq cursor is a small change. For `suggestIdeas`, cap the excerpt window server-side (the LLM prompt cannot consume thousands of excerpts anyway — bounding it is a correctness improvement, not just a perf one). For `getCampaignSession`, return excerpt *counts* and load excerpts on demand when a corpus card is expanded.

**Effort:** M.
**Safe now?** Yes for `getCorpus`/`getCampaignSession`. The `suggestIdeas` cap needs a product decision on *which* excerpts get sampled — that changes grounding behavior and touches ADR 0006's D-17 filter.

---

### 9. Blog PR creation is a two-phase write with the browser as the coordinator
**Evidence:** `components/PersistedPublishingPanel.tsx:783-836`. The client `fetch`es `/api/publish` (which creates a real GitHub PR — `app/api/publish/route.ts` → `lib/github.ts createBlogPostPR`), then *separately* calls `recordGithubPr` (`:821`) to write `v2ProviderStates`/`prUrl` into Convex. The wrapper is `try { ... } finally { ... }` (`:782`, `:834`) — **no `catch`**.

**Why it matters:** If the tab closes, the network drops, or `recordGithubPr` throws between line 794 and line 821, the PR exists on `jakebutler/corvo-labs-dot-com` and Convex has no record of it. The post stays `approved` with no `prUrl`, so the duplicate guard at `:755-759` (`if (existingPrUrl) return`) does not fire and the next click opens a **second PR**. Contrast the Buffer path, which does this correctly: `convex/bufferLive.ts:76` claims, calls the provider, then records — all inside one Convex action, with a stale-check on the record (`bufferLive.ts:132-136`). The blog path predates that pattern and never caught up. The missing `catch` also means a `recordGithubPr` failure surfaces as an unhandled promise rejection with no UI message at all.

**Recommended change:** Move PR creation into a Convex `"use node"` action mirroring `convex/bufferLive.ts` (`claimGithubPrSubmission` → `createBlogPostPR` → `recordGithubPrResult`). `convex/githubPrSync.ts` already proves the pattern works for GitHub from a Convex action. Short of that, at minimum add a `catch` that surfaces the orphan and stores the `prUrl` locally for retry.

**Effort:** M for the full action; S for the `catch` + orphan message.
**Safe now?** Yes.

---

### 10. Two competing error-surfacing conventions, and a genuinely silent catch in the composer
**Evidence:** Every campaign component defines its own local `showToast`: `ApprovalQueue.tsx:73`, `CampaignSession.tsx:151`, `CampaignShapeBuilder.tsx:84`, `ReviewPassesPanel.tsx:65`, `CampaignsHome.tsx:64`, `DraftSetView.tsx:70` — six near-identical `setState` + `setTimeout(4200)` implementations. `PersistedPublishingPanel.tsx` instead uses `setMessage` (31 call sites) with only 9 `try` blocks total, so `handleSubmit` (`:619`), `handleRetry` (`:652`), and `handleProviderIntent` (`:690`) call mutations with no `catch` at all. And `PersistedPublishingPanel.tsx:2042` swallows hero-image upload failures entirely with the comment *"Upload errors surface on next save attempt via missing hero URL"* — they do not; the spinner stops, no image appears, no message is shown.

**Why it matters:** C6 in the last commit ("all critical-path mutation rejections surface via showToast") was applied to the campaign components only. The calendar composer — the older, larger, and more critical surface — was not brought along, so a thrown Convex error there is invisible to the operator. The six `showToast` copies also mean the toast has no single place to add an error variant, a dismiss affordance, or `aria-live`.

**Recommended change:** Extract one `useToast` hook (or adopt the existing `components/ui` primitives) and use it in both strata. Wrap the three unguarded composer handlers in `try/catch` → toast. Replace the hero-upload silent catch with a real message.

**Effort:** S.
**Safe now?** Yes.

---

## (c) Unindexed / full-scan / unbounded query sites

Only three sites query with **no index at all**; the more consequential problem is *indexed but unbounded* `collect()` followed by JS filtering. Both classes are listed.

| # | Site | Table | Pattern | Growth driver | Severity |
|---|------|-------|---------|---------------|----------|
| 1 | `convex/posts.ts:16` | `posts` | `.query("posts").order("desc").collect()` — **no index, no auth** | all legacy blog + LinkedIn posts, global (table has no `userId`) | High |
| 2 | `convex/settings.ts:6`, `:19` | `settings` | `.query("settings").first()` — no index, no auth | singleton; scan is harmless, the missing auth is not | Low (perf) / High (auth) |
| 3 | `convex/publishing.ts:619` | `v2Posts` | `by_user` → `collect()` → 4× JS `.filter()` (`:620-626`) | per-user posts, all time | High |
| 4 | `convex/publishing.ts:653` | `v2AuditEvents` | `by_post` → `collect()` **per post, inside the N+1 at `:637`** | events/post × posts; never pruned | **Critical** |
| 5 | `convex/publishing.ts:646` | `v2PublishAttempts` | `by_intent` → `collect()` per post, full rows returned | attempts/post × posts | High |
| 6 | `convex/publishing.ts:576` | `v2Posts` | `by_user` → `collect()` → 4× JS `.filter()` (`listPosts`) | per-user posts | High |
| 7 | `convex/campaigns.ts:441` | `ideas` | `by_user_id` → `collect()` → JS substring search → `.slice(0,20)` | per-user ideas; no search index exists anywhere in the schema | High |
| 8 | `convex/campaigns.ts:485` | `corpusExcerpts` | `by_corpus` → `collect()` per attached corpus, **full text returned to client** | excerpts/corpus × corpora; immutable versions never deleted | **Critical** |
| 9 | `convex/campaigns.ts:192` | `corpusExcerpts` | `by_corpus` → `collect()` per corpus, feeds the suggestion prompt | same | High |
| 10 | `convex/corpora.ts:357` | `corpusExcerpts` | `by_corpus` → `collect()`, full text to client (`getCorpus`) | same | High |
| 11 | `convex/ideas.ts:130-138` | `capturedIdeas` | `by_user`/`by_user_and_status` → `collect()` → JS haystack search (`:141-160`) | per-user captured ideas | Medium |
| 12 | `convex/workflow.ts:212-218` | `ideas` + `workflowDrafts` | both `by_user_id` → `collect()`, whole board | per-user ideas & drafts | Medium |
| 13 | `convex/publishing.ts:270` | `v2PublishingIntents` | `by_post` → `collect()` → JS sort for latest (`latestIntent`) | 1–few per post | Low |
| 14 | `convex/draftSet.ts:172`, `convex/cohesion.ts:31`, `:242`, `convex/queue.ts:86` | `materializations` | `by_campaign` → `collect()` → JS `.sort(desc)[0]` | materializations/campaign; should be `.order("desc").first()` | Low |
| 15 | `convex/cohesion.ts:187`, `:288`, `convex/queue.ts:97` | `cohesionRuns` | `by_materialization` → `collect()` → JS `.sort(desc)[0]`; never pruned | runs/materialization | Low |
| 16 | `convex/research.ts:339`, `:368` | `v2Claims`, `v2ResearchSources` | `by_claim_map` / `by_brief` → `collect()` | claims/brief — naturally bounded | Low |
| 17 | `convex/publishing.ts:344` | `v2MigrationRecords` | `by_legacy` → `collect()` → `.some(r => r.userId === userId)` | preview-seed records; filters user in JS | Low |

**What the `by_user_and_campaign` fix covered, and what it missed.** C2 converted all four campaign-scoped `v2Posts` reads — `convex/queue.ts:61`, `convex/draftSet.ts:193`, `convex/cohesion.ts:51`, `convex/cohesion.ts:263` — and a grep for `sourceCampaignId` confirms there are no remaining unconverted sites. The fix was complete *for its stated scope*. What it did not touch is the class of problem one level up: rows 3–6 (the calendar), rows 7–10 (corpora and idea search), and rows 11–12 (the legacy strata). Rows 4 and 8 are the two that will actually break something.

**Schema-vs-usage mismatches.** `v2Posts.by_brand_and_status` (`convex/schema.ts:205`) exists and is never used — `listPosts`/`listCalendarItems` filter those exact fields in JS instead. `v2Posts.by_channel` (`:206`) and `by_scheduled_date` (`:207`) are likewise unused. There is **no `searchIndex` anywhere in the schema**, while two surfaces (`campaigns.searchSessionIdeas`, `ideas.list`) implement substring search by full collect + JS. `v2AuditEvents` has no time-ordered index (`by_brand`/`by_user`/`by_post` only), so any future retention job would itself need a scan.

**Correctness note, not perf:** `convex/queue.ts:262` resolves a post's intent with `by_post` → `.first()` (which yields the *earliest* by `_creationTime`), while `convex/publishing.ts:268` resolves it by sorting on `updatedAt` desc. If a post ever has two intents, the campaign queue and the calendar will disagree about its schedule. Same file, same concept, two answers.

---

## (d) Buffer / LinkedIn wiring — gap analysis

### The premise is stale; correct the record first

The brief states LinkedIn/Buffer submission is unwired and "the UI calls `submitMockProvider` only." That was true as of `plans/2026-07-19-ship-plan.md:15`, which is the document the premise traces to. **It is no longer true at `a7b255d`.** Evidence:

- `convex/bufferLive.ts:55` exports a complete `submit` action: it authenticates (`:33`), checks the gate (`:68`), claims via `internal.publishing.claimBufferSubmission` (`:76`), calls the live adapter (`:99`), and records via `internal.publishing.recordBufferSubmitResult` (`:105`) with a stale-content check.
- `convex/bufferLive.ts:143` exports a matching `cancelOrUnpublish`.
- `components/PersistedPublishingPanel.tsx:410-411` binds both with `useAction`, and `handleSubmit` (`:622`), `handleRetry` (`:657`), and `handleProviderIntent` (`:699`) route LinkedIn to the live path when `bufferLiveEnabled`, falling back to the mock only when `result.liveGateOff` (`:625`).
- `lib/providerAdapters.ts:1055-1170` performs a real Buffer GraphQL `createPost` mutation over HTTP.
- `convex/publishing.ts:1930-2347` implements `claimBufferSubmission`, `recordBufferSubmitResult`, `recordBufferCancelResult`, and `auditBufferSkip` as `internalMutation`s, with an `activeBufferClaimKey` lock persisted on the intent doc (`convex/schema.ts:224`) so concurrent claims serialize.
- `docs/smoke-runs/2026-09-06-buffer-live-proof.md:18-20` records `BUFFER_API_KEY`, `BUFFER_LIVE_SUBMISSION=approved`, and `LIVE_PROVIDER_VALIDATION_APPROVED=true` as **✅ set in Convex prod**.

So the adapter is wired, and the gate is **already open in production**. The gap is different from what was described — and in one respect more urgent.

### What is actually missing

**G1 — The live path has never been executed end to end.** `docs/smoke-runs/2026-09-06-buffer-live-proof.md` is still the unfilled template: the header reads `2026-09-__ (template — fill during run)` and **all ten step results are `☐`**. Combined with the gate being on in prod, this means the first real LinkedIn submission the operator makes *is* the smoke test, with no rollback rehearsed. This is the highest-priority item in this section.

**G2 — Two of four brands can never submit.** `lib/providerAdapters.ts:232-235` maps only `corvo → "corvo-labs-us"` and `lower-db → "the-lower-db"`. `convex/publishing.ts:1688 brandHasBufferLinkedInMapping` hard-codes the same two. `personal` and `freshproof` both have LinkedIn channels seeded (`convex/publishing.ts:91`, `:110`) and will render a live Submit button, then fail with a permanent-failure "unmapped brand" at claim time (`convex/publishing.ts:1716`+, covered by the test at `convex/__tests__/publishing.test.ts:578`). The failure is correct and audited, but the UI gives no advance warning.

**G3 — Nothing ever calls `refreshStatus`, so no post reaches `published`.** `bufferProviderAdapter.refreshStatus` exists (`lib/providerAdapters.ts:1253`) and the status mapper exists (`convex/publishing.ts:1697 mapProviderStateToPostStatus`, which can return `"published"`), but the only callers in the repo are the two one-shot validation scripts (`scripts/buffer-live-validation.mjs:90`, `scripts/zernio-live-validation.mjs:93`). There is **no `convex/crons.ts`** in the repo. A live-submitted LinkedIn post therefore sits at `submitted` forever; the `published` status in `v2PostStatus` (`convex/schema.ts:40`) is unreachable for Buffer-routed channels. ADR 0002's "Ambiguous provider outcomes move to Needs Review before any human-visible retry" also has no mechanism to *resolve* from Needs Review without a refresh.

**G4 — Reddit/Zernio has no Convex action.** `lib/providerAdapters.ts:1323 zernioProviderAdapter` is complete and contract-tested (`lib/__tests__/providerAdapters.test.ts:284`), but there is no `convex/zernioLive.ts` — only `convex/bufferLive.ts` exists. Every Reddit submit falls through to `submitMockProvider` (`components/PersistedPublishingPanel.tsx:646`; the live branch at `:622` is gated on `channelId === "linkedin"`). ADR 0002 routes Reddit through Zernio; the routing table says so (`convex/publishing.ts:120`) and the channel is marked `routable: true` (`:188`), so the UI presents Reddit as submittable when it is mock-only. `docs/smoke-runs/2026-09-06-buffer-live-proof.md:44` records this as a deliberate deferral, which is fine — but the UI does not reflect the deferral.

**G5 — The three live gate flags are undocumented.** `BUFFER_LIVE_SUBMISSION`, `ZERNIO_LIVE_SUBMISSION`, and `LIVE_PROVIDER_VALIDATION_APPROVED` appear nowhere in `.env.local.example` (only `BUFFER_API_KEY`/`ZERNIO_API_KEY` at lines 61-62). They live only in `docs/buffer-api-notes.md:89` and `docs/zernio-api-notes.md:78`. They must be set on the **Convex deployment** (`npx convex env set`), not Vercel, because `convex/bufferLive.ts:20` and `convex/publishing.ts:1664` read `process.env` inside Convex — but ADR 0003's "Environment Ownership" section assigns `BUFFER_API_KEY`/`ZERNIO_API_KEY` to Vercel-style host env. Setting them on Vercel alone would produce a silently-off gate with no diagnostic.

**G6 — Campaign-materialized posts route back through the calendar, by design.** `components/campaigns/ApprovalQueue.tsx:101` tells the operator "Submission still happens in the composer, by you," and the queue only binds `setApproval` (`:67`) and `materializeDraftSet` (`:66`). This is intentional and consistent with ADR 0002, but it means the campaign loop's twelve-draft batch must be submitted one post at a time from the calendar drawer. There is no batch-submit anywhere. Worth naming as a product decision rather than a defect.

### Concrete step list

| # | Step | Effort | Blocking? |
|---|------|--------|-----------|
| 1 | **Execute `docs/smoke-runs/2026-09-06-buffer-live-proof.md` steps 1–10** against the Corvo LinkedIn channel with a `[SMOKE]` prefix. Fill the template. Until this is done, treat LinkedIn as unvalidated-but-armed. | S (1 session) | **Yes — do first** |
| 2 | Add `BUFFER_LIVE_SUBMISSION`, `ZERNIO_LIVE_SUBMISSION`, `LIVE_PROVIDER_VALIDATION_APPROVED` to `.env.local.example` with a comment stating they are **Convex-deployment** env, not Vercel. Amend ADR 0003's Environment Ownership table. | S | No |
| 3 | Surface G2 in the UI: have `bufferLiveSubmissionEnabled` (`convex/publishing.ts:1708`) also return the set of brands with a Buffer channel mapping, and disable/annotate the live Submit button for `personal`/`freshproof` instead of letting it fail at claim time. | S | No |
| 4 | Move `BUFFER_LINKEDIN_CHANNEL_NAME_BY_BRAND` (`lib/providerAdapters.ts:232`) out of source into Convex env or a `v2Channels.socialAccountLabel` lookup — the field already exists (`convex/schema.ts:147`) and is populated at `convex/publishing.ts:185`. Deduplicates against `brandHasBufferLinkedInMapping` (`convex/publishing.ts:1688`). | S | No |
| 5 | Add `convex/crons.ts` with a `refreshBufferStatuses` internal action: query `v2ProviderStates` `by_status` = `"submitted"` (index exists, `convex/schema.ts:248`), call `bufferProviderAdapter.refreshStatus`, patch provider state + post status via `mapProviderStateToPostStatus`. Closes G3 and makes `published` reachable. | M | No, but required before "published" means anything |
| 6 | Add `convex/zernioLive.ts` by copying `convex/bufferLive.ts` (~220 lines) and generalizing `claimBufferSubmission`/`recordBufferSubmitResult` to take a `providerId`. Extend the LinkedIn-only branches at `PersistedPublishingPanel.tsx:622`/`:657`/`:699` to a provider lookup. Leave `ZERNIO_LIVE_SUBMISSION` unset so it stays dark. | M | No — deliberate deferral |
| 7 | Until step 6 lands, make the Reddit Submit button state that it is simulated *before* the click, not after (`PersistedPublishingPanel.tsx:1662` only says so post-hoc). | S | No |
| 8 | Add a `convex-test` for `convex/bufferLive.ts` itself (the action orchestration). `convex/__tests__/publishing.test.ts:385-656` covers the claim/record mutations and `lib/__tests__/providerAdapters.test.ts` covers the adapter, but the action that sequences them — including the `liveGateOff` → mock-fallback branch that the UI depends on — is untested. | S | No |

**Overall effort for a fully live LinkedIn + Reddit path:** steps 1–4 are roughly one focused session (S). Step 5 is a half-day (M). Step 6 is a day including tests (M). Nothing here is L — the hard architectural work is already done and done well.

---

## (e) Things I checked that are sound

- **Internal/public split on the Buffer path.** All eight functions taking a client-shaped `userId: v.string()` argument in `convex/publishing.ts` (`:931`, `:974`, `:1719`, `:1846`, `:1933`, `:2118`, `:2251`, `:2341`) are `internalMutation`/`internalQuery`. The `userId` is always derived from `ctx.auth` in the calling action (`convex/bufferLive.ts:65`, `:158`) and never accepted from a client. `convex/githubPrSync.ts:11` is likewise an `internalAction`. **No public Convex function anywhere trusts a client-supplied `userId`.** This is the thing that most often goes wrong in Convex apps and it is right here.
- **Server/client component split.** Every route under `app/` except `app/legacy/page.tsx` is a server component that does nothing but await `params`/`searchParams` and render a thin `<Shell>` wrapper (`app/page.tsx:14-27`, `app/campaigns/[campaignId]/queue/page.tsx:8-19`). All data access is in client components via `useQuery`/`useMutation`. No accidental client-bundling of server code, no `"use client"` at a layout boundary.
- **Approval-gate invariants.** ADR 0002's rules hold in the code paths that matter: `materializeDraftSet` writes `approvalState: "unapproved"` explicitly (`convex/queue.ts:206`, `:222`) so scheduling never implies approval; the content-vs-fingerprint check appears in both the mock (`convex/publishing.ts:1105`) and live (`convex/bufferLive.ts:132`) submit paths; date-only reschedule preserves approval and is regression-tested.
- **Cohesion-gate freshness.** `convex/queue.ts:122-137` recomputes `draftSetFingerprint` at materialize time and refuses if it differs from the passing run's. A gate result cannot outlive the content it checked. This is a genuinely careful design and the ADR 0006 rationale matches the code.
- **D-17 sensitivity filtering.** `convex/campaigns.ts:198-199` skips `internal-only` and non-`accepted` excerpts before they can reach a prompt, and `convex/queue.ts:160-179` counts (without blocking) unreviewed citations into the materialize audit. Both match ADR 0006 exactly.
- **Mock-acknowledgment as a server artifact.** `convex/mockAck.ts:44` verifies token + user + campaign + expiry server-side; `convex/campaigns.ts:165-174` fails closed. The D-21 design is correctly implemented (the `Math.random` and non-consumption issues in §b7 are refinements, not a defeat of the design).
- **Cross-brand authorization coverage.** `convex/__tests__/publishing.test.ts:142-194` uses `convex-test` `withIdentity` to assert that a corvo-only member is denied `setApproval`, `updateContent`, `reschedule`, and `submitMockProvider` on a `lower-db` post. Nine of twelve Convex test files use `withIdentity`.
- **Server-side re-verification in `/api/publish`.** `app/api/publish/route.ts:34-50` mints a Convex token from the Clerk session, re-fetches the post through `getPostById` (which enforces ownership + brand access), and re-checks `approvalState === "approved"` server-side rather than trusting the client's claim. Required blog metadata is re-validated at `:65-72`.
- **Ops secret handling in `/api/ops/lab-import`.** Hash-then-`timingSafeEqual` comparison (`:44-48`), fail-closed on a missing `CONVEX_DEPLOY_KEY` (`:155-162`) rather than downgrading to a public mutation, and rejection auditing. (Note the inconsistency: `app/api/ops/validate-workflow/route.ts:26` uses a plain `===` comparison for the same secret, and is the one route on the middleware's public list.)
- **Response sanitization.** `sanitizeProviderResponse` redacts `token|secret|key|authorization|cookie` keys before persisting (`convex/publishing.ts:225`), and the Buffer adapter substitutes the literal `"[server-secret-present]"` rather than any credential material (`lib/providerAdapters.ts:1168`). No `NEXT_PUBLIC_` provider credentials anywhere.
- **Shared campaign-shape logic.** `lib/campaignShapes.ts` owns `CAMPAIGN_PRESETS`, `applyPreset`, `countIncompleteSlots`, `isShapeComplete`, and both `convex/shapes.ts:9-15` and `convex/queue.ts:10-13` import it. Citation format is likewise centralized in `lib/campaignGrounding.ts:46/57` and imported by Convex, components, and the queue alike. These are exactly the boundaries §b3 says the provider routing should have followed.
- **Fail-closed production allowlist.** `proxy.ts:131-138` rejects with 503 when `RESONATE_ALLOWED_EMAILS` is unset in production, requires `email_verified` on the session claim before trusting it (`:72-88`), and returns a terminal response rather than redirecting an already-authenticated user into a sign-in loop (`:38-54`). The `log` rollout mode requires an exact opt-in string so a typo cannot disable enforcement (`:34-36`).

### Test architecture — what 698 vitest cases cover, and the three gaps

Covered well: `lib/` pure functions (23 test files — shapes, grounding, cohesion, corpus extraction, provider adapters against a contract helper at `lib/__tests__/helpers/providerAdapterContract.ts`), component rendering and interaction (~25 files including a 1,117-line `PersistedPublishingPanel.test.tsx`), API route handlers (9 files), and the campaign-loop Convex backend via `convex-test` (10 of 12 files in `convex/__tests__` use it, with real identity-scoped authorization assertions).

The three highest-leverage gaps:

1. **`proxy.ts` has zero tests of any kind.** No `proxy.test.ts` exists, and `playwright.config.ts:31` sets `E2E_BYPASS_AUTH` — which `proxy.ts:177-181` uses to replace the entire middleware with a pass-through. So the app's only Next-layer authorization boundary is exercised by neither unit nor E2E tests. The allowlist's trickiest logic (claim-vs-Backend-API email resolution, the `email_verified` requirement, the production fail-closed branch, log-only mode) is all untested. This is also the mechanism that would have caught §b5. **Highest leverage** — `resolvePrimaryEmail` and the decision ladder are pure enough to unit-test in an afternoon.

2. **E2E is nine "boots without crashing" smoke tests.** `e2e/campaign-loop.spec.ts` asserts six routes render; `e2e/dashboard.spec.ts` and `e2e/setup-flow.spec.ts` add one each. No E2E walks a real flow — capture idea → suggest → shape → generate → gate → materialize → approve → submit. The last commit concedes this ("E2E happy-path deferred (no live backend in sandbox)"). Because every layer is tested in isolation with the next layer mocked, a wiring break between them — exactly the class of bug in §b5 and §b9 — is invisible to the whole suite. Second-highest leverage: one end-to-end campaign-loop spec against a seeded dev Convex deployment.

3. **The tested copy of the approval gate is not the copy that runs** (§b4), and the legacy Convex strata have no backend tests at all — there is no `convex-test` file for `posts.ts`, `settings.ts`, `workflow.ts`, `research.ts`, `backfill.ts`, or `v2Migration.ts`, which is precisely the set containing the unauthenticated functions in §b1. Note also that `vitest.config.ts:16-21` excludes `convex/**` from the coverage `include` list entirely, so the 60%-lines threshold measures only `lib`, `components`, `app` — the backend's coverage is unmeasured by construction. Third-highest leverage: add `convex/**` to the coverage include and let the number tell the truth.

# Marketing Director — Revised Proposal (2026-08-06)

**Parent:** [#45](https://github.com/jakebutler/resonate-v2/issues/45)  
**Status:** Draft for Jake's review  
**Author:** Auto/Cursor agent  
**Related:** `plans/2026-07-19-source-grounded-series-spec.md`, `plans/2026-07-19-ship-plan.md`, ADR 0004, ADR 0005, PR [#46](https://github.com/jakebutler/resonate-v2/pull/46)

---

## Executive summary

**Recommendation: schema-first / durable-memory-first**, with series/corpus grounding as the substrate the Marketing Director sits on — not a side quest.

Original #45 Milestone 0 said “docs before schema.” That was right when the product was a greenfield agent UI with undefined objects. It is the wrong foundation now:

1. Two concrete operator journeys (lab notebook → campaign; academic PDF → opinioned posts) need durable Convex objects before any agent team is useful.
2. The source-grounded series spec already designed those objects (`sourceCorpora`, `sourceDocuments`, `sourceExcerpts`, `postSeries`, `seriesEntries`) and proved they feed the existing claim → outline → draft pipeline and the single composer (ADR 0004).
3. Campaign agents that invent content plans without corpus/series/campaign memory will recreate the split-brain ADR 0005 forbids (chat/local as truth).
4. Docs and mockups still matter — but as a **parallel thin review track**, not a gate that blocks the first schema slice.

**Sequencing verdict:** Ship foundation schema + corpus/series materialization into `PersistedPublishingPanel` first. Layer PDF brainstorm + stance next. Put a thin `/campaigns` brief + content-plan handoff on top of that substrate. Defer the full Marketing Director agent team, VOICE.md specialist loops, Mem0, Slack, and analytics until those journeys produce real scheduled-but-unapproved posts.

---

## Schema-first vs docs-first tradeoff

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| **Docs-first (original #45 M0)** | UX alignment before backend; mockup reviewable | Delays operator value; series/corpus already specified elsewhere; agents without schema produce disposable chat | Overturn for this revision |
| **Schema-first (this proposal)** | Unblocks lab-notebook and PDF journeys; Convex remains SoT; Marketing Director later calls real tools | Schema may need one revision after Jake uses journey 1 | **Recommended** |
| **Full agent team first** | Matches #45 demo narrative | Parallel composer risk; no grounding; Fact Drift irony (m13v comment) | Rejected |

**What still happens with docs:** this proposal + child issues replace the large M0 docs package as the review artifact. A Resonate-aligned `/campaigns` mockup refresh can land in parallel with M3–M4, not before M0 schema.

---

## Locked decisions carried forward from #45

These remain **LOCKED** unless Jake overturns them in writing:

| # | Decision |
|---|---|
| L1 | Top-level agent identity is **Marketing Director**; first surface stays campaign/marketing focused. |
| L2 | Route: `/campaigns` (page title: Marketing Director). |
| L3 | Campaigns are **brand-scoped**; cross-brand links must be explicit. |
| L4 | Owned brands: Corvo Labs, FreshProof; the lower dB independent. |
| L5 | Actionable campaign plans require: brand, goal, audience, thesis/description, time window, channels, CTA/offer, success metric, constraints. Thin input → exploratory notes only. |
| L6 | FreshProof primary CTA: **waitlist signup**; Fact Drift audit is secondary. |
| L7 | VOICE.md is brand-level by default; optional founder/person and channel overlays. |
| L8 | Agents may create **scheduled-but-unapproved** posts only after brief approval or explicit **Generate scheduled drafts**. |
| L9 | Reviewer/editor loops automatic by default with bounded stopping conditions (when agent loops exist). |
| L10 | Agents never approve posts or submit to providers by default. |
| L11 | Communication: in-app → Slack → email digest; no Slack/email approvals early. |
| L12 | Resumable multi-day sessions are future work. |
| L13 | No `v2` prefix on **new** table/route/product names (existing `v2*` tables stay). |
| L14 | Customer/market research ≠ content research for publishing (separate artifact families). |
| L15 | Telemetry: investigate existing first; else PostHog. |
| L16 | PioneerAI for inference; quality over cost for the proof. |
| L17 | External memory optional behind adapter; **never** canonical (ADR 0005). |
| L18 | App-local skills under `lib/marketingSkills`. |
| L19 | ~~Docs before schema~~ — **SUPERSEDED** by this proposal (see D1 below). |
| L20 | Static HTML mockup is a starting UX artifact; final UI must match Resonate design system. |

Also locked by ADRs / glossary (not #45-numbered but binding):

- **ADR 0004:** One canonical composer — `PersistedPublishingPanel`.
- **ADR 0005:** Convex is canonical SoT.
- **Schedule ≠ approval.** Provider submission stays gated.
- **Publishing safety:** never approve or submit from agents by default.

---

## New / changed decisions

### D1 — SUPERSEDES #45 locked decision 19 (docs-before-schema)

**LOCKED (Jake 2026-08-06):** Milestone sequencing is **schema-first / durable-memory-first**. Documentation for this revision is this proposal + child issues. Full glossary/tool-contract/mockup package is no longer a gate before the first Convex tables.

**Rationale:** Operator journeys need durable objects; series substrate already specified; agents without memory recreate chat-as-truth.

### D2 — Series / corpus is first-class substrate for Marketing Director

**LOCKED (proposed):** `plans/2026-07-19-source-grounded-series-spec.md` is in-scope for #45 delivery, not backlog adjacent work. Series sits beside Content Plan as an operator-driven planning object; campaigns may optionally own or link a series via `campaignId`.

**Relationship:**

```text
sourceCorpora / excerpts  →  postSeries / seriesEntries
                                    ↓ materializeEntry
                              v2Posts (unapproved) → PersistedPublishingPanel
                                    ↑
campaigns / briefs / content items ──┘  (later: agents call the same materialize path)
```

Build order: **corpus + series materialization before** Marketing Director orchestration.

### D3 — Lab notebook → campaign journey

**LOCKED (proposed):** From a collection of lab-notebook-type documents (git-imported and/or uploaded), the operator can create a whole campaign package: brief fields (filled from thesis + corpus), content plan (series installments), and scheduled-but-unapproved posts handed into the existing calendar/composer.

**Path shape (LOCKED, Jake 2026-08-06):** First ship **corpus → series → materialize posts**; then wrap as a campaign when `/campaigns` exists (link `postSeries.campaignId`). Do not require the full agent team for journey 1. Initial lab-notebook corpus is **markdown-first**.

### D4 — Academic PDF → opinioned posts journey

**LOCKED (Jake 2026-08-06):** Operator ingests an academic paper primarily via **upload** (simpler path; covers paywalled PDFs). Optional URL fetch may be added later for open-access papers only — not required for M3. Operator brainstorms back-and-forth with Resonate; establishes opinions/stance as durable artifacts; uses conversation + paper excerpts as content-research context to create downstream posts (blog + LinkedIn companions) as scheduled-but-unapproved calendar items.

**ASSUMPTION A2:** Paper brainstorm sessions are first-class Convex objects (`paperSessions` + messages + `stanceArtifacts`), not chat-only. Stance artifacts are content-research lineage (L14), not customer/market research.

### D5 — Import paths

**LOCKED (proposed):** Git/CLI import remains the primary path for lab notebooks (series spec §4.1), matching existing operator CLI patterns. **Browser upload** is required for PDF journey and is an allowed second corpus `origin` (`upload`), not deferred indefinitely.

**ASSUMPTION A3:** Lab-notebook multi-file browser upload can land after CLI; PDF single-file upload is in the PDF milestone.

### D6 — Fail closed / mock fabrication

**LOCKED (proposed):** Grounded and campaign-generation routes must not silently fabricate topic-specific content. Follow PR #46 direction: fail closed (503) or require an **explicit mock flag** that surfaces a blocking UI banner. Series/campaign materialization is blocked when `provider === "mock"` unless the operator acknowledges mock mode.

### D7 — Claim bodies in prompts (series review correction)

**LOCKED (proposed):** When corpus excerpts feed claim-map, **full excerpt text** must reach the model (series consolidated review P0). Adapter-only reuse without prompt changes is insufficient.

### D8 — Slice honesty from series consolidated review

**ASSUMPTION A4:** First series vertical slice is markdown-focused corpus (lab notebooks like lower-db samples), not full CSV/ipynb/PDF parsing in the same issue. PDF parsing is a separate milestone (journey 2).

### D9 — Evidence QA at approval (m13v comment)

**ASSUMPTION A5:** Post approval remains a human gate in `PersistedPublishingPanel`. Milestone work must surface **inline claim ↔ excerpt lineage** in the composer for series/paper-derived posts so approval is not a blind yes/no. A hard “block approve if any claim drifted” gate is deferred until Evidence QA agent exists; the UI affordance is not deferred.

### D10 — Thin campaigns before agent team

**LOCKED (Jake 2026-08-06):** `/campaigns` Milestone can start as brief + content plan + generate scheduled drafts **without** the full specialist roster. **Director chat is a fast follow** immediately after that thin ship (still before or at the start of full specialist orchestration). Specialists remain a later milestone that call the same write tools.

### D11 — Published attribution (series O3)

**LOCKED (Jake 2026-08-06, lean):** Published posts keep **prose attribution only** (no mandatory private-corpus appendix of file refs). Do not over-engineer. Overturn later if operators need clickable evidence appendices on public posts.

### D12 — Corpus-native evidence labels

**LOCKED (Jake 2026-08-06):** Add **corpus-native labels** where appropriate (e.g. `experiment-result`, `hypothesis`, `author-judgment`) alongside any reused clinical/research labels — do not force notebook material into clinical taxonomy alone.

### D13 — Journey 1 demo brand

**LOCKED (Jake 2026-08-06):** Journey 1 (lab notebook → campaign) demo brand is **Corvo Labs**.

---

## Explicit ASSUMPTIONS

| ID | Assumption | Rationale | How to overturn |
|---|---|---|---|
| A1 | ~~Lab notebook → campaign ships as corpus→series→posts first~~ → **CONFIRMED LOCKED** (Jake 2026-08-06) | Fastest path to calendar handoff | Require campaign brief object before any materialization |
| A2 | Paper brainstorm + stance are durable Convex objects | ADR 0005; stance must survive reload and feed posts | Keep brainstorm ephemeral until post create (not recommended) |
| A3 | CLI primary for notebooks; **upload primary for PDF** (URL fetch optional/later) | Paywalled papers; simpler than dual-path M3 | Require URL fetch in M3 |
| A4 | Markdown-first corpus parsing in lab-notebook slice → **CONFIRMED** | Real lower-db notebooks are clean markdown | Expand formats in same slice |
| A5 | Composer shows grounding panel; hard claim-recheck at approve deferred | Addresses m13v without blocking ship | Require claim re-validation mutation before `setApproval` |
| A6 | LinkedIn companions in early slices use generate-draft or manual paste until Buffer Phase 3 / companion route | Ship plan Phase 3 still pending | Block series ship on Buffer wiring |
| A7 | Mem0 / external memory deferred until after campaigns create real posts | Canonical Convex first; avoid premature vendor | Pull Mem0 into first campaign milestone |
| A8 | FreshProof Fact Drift launch remains the campaign demo case; Corvo Labs lab-notebook series is the grounding demo case | Two proof cases, different brands | Collapse to one brand for v1 |
| A9 | `campaignId` optional on `postSeries`; series can exist without a campaign | Operator series without marketing orchestration | Force every series under a campaign |
| A10 | Citation URI `corpus://…` and published-post prose attribution (series O3 option a) for private repos | Notebooks are private | Public repo → real links |
| A11 | Sensitivity default `unreviewed`; `internal-only` cannot source claims; materialization warns on unreviewed | Publication is one-way | Advisory-only sensitivity |
| A12 | Child issues below are the execution unit; this doc is the decision record | Agents need pick-up tickets | Expand into full M0 docs package first |

---

## Revised milestone table

| Milestone | Name | Exit criteria | Notes |
|---|---|---|---|
| **M0** | Safety + foundation schema | PR #46 merged or equivalent fail-closed + publish gate in place; Convex tables exist for corpus/series/campaign skeleton + paper/stance stubs; shared post insert helper extracted; glossary terms drafted in this doc | **Schema-first.** Docs parallel, not gating. |
| **M1** | Lab notebook / git corpus import | Operator can dry-run + import a markdown corpus via CLI; secret scan hard-fails; excerpts queryable brand-scoped; sensitivity editable | No full `/series` UI required yet |
| **M2** | Series plan → materialize to composer | Create series pinned to corpus; select excerpts; claim map with full excerpt bodies; plan entries; materialize → scheduled-but-unapproved `v2Posts`; “Send to composer” also on `/research`; mock provider blocks materialization | Journey 1 core |
| **M3** | PDF ingest + paper brainstorm UX | Upload/link PDF → extracted excerpts in corpus or paper-specific docs; brainstorm session UI; messages persisted | Journey 2 start |
| **M4** | Stance capture → durable artifacts | Operator stance/opinions saved as `stanceArtifacts`; usable as context for claim/draft/post generation | Journey 2 middle |
| **M5** | Opinioned posts from paper + stance | Generate blog + LinkedIn companion drafts as scheduled-but-unapproved posts with paper/stance provenance; composer grounding panel | Journey 2 end |
| **M6** | Campaign brief + thin `/campaigns` | Brand-scoped campaigns; required fields; brief approve / Generate scheduled drafts; content plan table; handoff uses same materialize path; lab-notebook→campaign wrap | Thin surface, not full agents |
| **M7** | Marketing Director orchestration | Director + specialists via tools; agentRuns persisted; no approve/submit tools | After M6 |
| **M8** | VOICE.md, reviewer loops, analytics | VOICE.md specialist; skeptical reviewer/editor loops; PostHog events; analyst/metrics later | Honest late sequence |

**Parallel (non-blocking):** Resonate-aligned mockup refresh for `/campaigns`; Buffer LinkedIn submission (ship-plan Phase 3); Pioneer key verification.

---

## Object graph update

```text
Brand
  → sourceCorpora (git-path | upload)
      → sourceDocuments
      → sourceExcerpts          ← content research substrate
  → postSeries
      → seriesEntries → v2Posts (+ intents, provider state, audit)
      → optional campaignId
  → paperSessions
      → paperSessionMessages
      → stanceArtifacts         ← operator opinions (content-research lineage)
      → optional corpusId / documentIds (PDF excerpts)
  → Campaign
      → Campaign Brief
          → Strategy / Positioning / Assumptions / Measurement Plan
          → VOICE.md / voiceProfiles
          → Content Plan
              → Captured Ideas
              → customerResearchArtifacts     ← market research (separate)
              → Content Research Briefs / claim maps / outlines / drafts
              → campaignContentItems
              → postSeries (optional link) / Posts
              → Publishing Intents / Provider State / Attempts / Audit
          → Metric Snapshots / Analyst Readouts (later)
          → marketingDecisionRecords / strategicLearnings (later)
  → agentRuns (later)
```

**New vs #45 original graph:** `sourceCorpora*`, `postSeries*`, `paperSessions*`, `stanceArtifacts`. Campaign graph otherwise preserved. External memory adapters remain optional and non-canonical.

### Proposed table names (no `v2` prefix)

| Table | Role |
|---|---|
| `sourceCorpora` | Immutable corpus snapshot metadata |
| `sourceDocuments` | Per-file manifest |
| `sourceExcerpts` | Citable text + line ranges + sensitivity |
| `postSeries` | Thesis-driven plan pinned to a corpus |
| `seriesEntries` | Per installment×channel plan row → optional `postId` |
| `campaigns` | Brand-scoped campaign shell |
| `campaignBriefs` | Required strategy fields + approval state |
| `campaignContentItems` | Plan rows that may link series entries or posts |
| `paperSessions` | PDF/paper brainstorm container |
| `paperSessionMessages` | Durable conversation turns |
| `stanceArtifacts` | Operator opinions/stance with source pointers |
| `voiceProfiles` | Later (M8) |
| `agentRuns` | Later (M7) |
| `customerResearchArtifacts` | Later; never mixed into corpus excerpts |

Optional fields on `v2Posts`: `sourceSeriesId`, `sourceSeriesEntryId`, `sourceCampaignId`, `sourcePaperSessionId` (all optional; no migration pain).

---

## How the two new user journeys map to milestones / issues

### Journey 1 — Lab notebook → campaign

```text
CLI import corpus (M1)
  → pin series + select excerpts + claims + plan (M2)
  → materialize scheduled-but-unapproved posts (M2)
  → wrap / attach campaign brief + content plan (M6)
  → refine/approve/publish in PersistedPublishingPanel (existing)
```

**Issues:** Foundation schema → Corpus import → Series materialize → Campaign thin surface.

### Journey 2 — Academic PDF → opinioned posts

```text
Upload/link PDF → excerpts (M3)
  → brainstorm session (M3)
  → capture stance artifacts (M4)
  → generate posts with paper + stance context (M5)
  → calendar/composer handoff (existing)
```

Optional later: attach resulting posts to a campaign (M6).

---

## Relationship: Series substrate → Campaigns / Marketing Director

| Layer | Builds first? | Why |
|---|---|---|
| Corpus + excerpts | Yes | Evidence substrate; Evidence QA agent needs this |
| Series + materialize | Yes | Closes research→composer dead end; proves schedule≠approval for automation |
| Paper + stance | Next | Second ingestion shape; opinion lineage |
| Thin `/campaigns` | After substrate | Orchestrates packages; calls same materialize tools |
| Marketing Director agents | Last among core | Tools need real objects to mutate |
| VOICE / reviewers / analytics | After agents or thin campaigns prove value | Quality loops and measurement |

**How #45 sits on series without rework** (from series spec §9.4, affirmed here):

1. Optional `campaignId` on `postSeries`.
2. Content Strategist / Ops Publisher call `saveSeriesPlan` / `materializeEntry` (or shared helper).
3. Evidence / Claim QA Reviewer reads `sourceExcerpts` + claim maps — the hardest agent becomes tractable.
4. No parallel composer; no parallel publishing path.

---

## Non-goals / deferred

Do not remove without explicit product decision:

- Autonomously publish / approve / submit from agents.
- Second composer or chat-only campaign storage.
- External memory as SoT; multi-vendor memory at once.
- Full workflow-worker architecture before core journeys work.
- Every channel in v1 (blog + LinkedIn companions first; X/Reddit/YouTube planning-only).
- CRM/CDP, generic PM tool, standalone BI.
- Slack/email approval actions.
- Resumable multi-day autonomous sessions.
- Embedding/vector retrieval on corpora (manual selection first).
- Server-side git clone of private repos.
- Wholesale import of external marketing-skills repos.
- Hard claim-revalidation mutation at `setApproval` (UI lineage first — A5).
- Mem0 in M0–M2 (A7).

---

## Decisions from Jake's review (2026-08-06)

| # | Question | Decision |
|---|---|---|
| 1 | Schema-first (D1)? | **Yes** — confirmed. |
| 2 | Series materialization + markdown-first lab notebooks (A1/A4)? | **Yes** — confirmed. |
| 3 | PDF source for M3? | **Whichever is simpler; prefer upload.** URL fetch will not cover paywalled papers. Upload is the M3 path; URL fetch optional later. |
| 4 | Published attribution (O3)? | **Prose attribution only** for now — do not over-engineer. Open to revisit. |
| 5 | Evidence labels? | **Add corpus-native labels** where appropriate. |
| 6 | M6 without Director chat? | **Yes for first `/campaigns` ship**, with **Director chat as a fast follow**. |
| 7 | Journey 1 demo brand? | **Corvo Labs**. |

Follow-ups for child issues: update #52 (upload-first PDF), #55/#56 (Director chat fast-follow after thin M6), #49/#51 (corpus-native labels + Corvo Labs demo fixture).

### Open — agent runtime (new)

**Q8:** Resonate has no agent framework today (see below). When should we adopt Mastra / LangChain / similar for M7?

**Recommendation recorded for Jake:** defer framework choice until M6 substrate exists; for M0–M6 keep route/Convex patterns. Revisit at M7 kickoff with a short spike (Mastra vs Vercel AI SDK tool loops vs thin custom) — do not pull LangChain as default.

---

## Child issues

See also the tracking comment on [#45](https://github.com/jakebutler/resonate-v2/issues/45).

| # | Title | Milestone |
|---|---|---|
| [#49](https://github.com/jakebutler/resonate-v2/issues/49) | M0: Foundation schema for corpus, series, campaigns, and paper/stance stubs | M0 |
| [#50](https://github.com/jakebutler/resonate-v2/issues/50) | M1: Lab notebook / git corpus import (CLI + Convex) | M1 |
| [#51](https://github.com/jakebutler/resonate-v2/issues/51) | M2: Series plan → materialize scheduled-but-unapproved posts into composer | M2 |
| [#52](https://github.com/jakebutler/resonate-v2/issues/52) | M3: PDF ingest + paper brainstorm session UX | M3 |
| [#53](https://github.com/jakebutler/resonate-v2/issues/53) | M4: Opinion/stance capture from paper brainstorm → durable artifacts | M4 |
| [#54](https://github.com/jakebutler/resonate-v2/issues/54) | M5: Paper + stance → scheduled-but-unapproved opinioned posts | M5 |
| [#55](https://github.com/jakebutler/resonate-v2/issues/55) | M6: Campaign brief + thin `/campaigns` surface (lab-notebook → campaign wrap) | M6 |
| [#56](https://github.com/jakebutler/resonate-v2/issues/56) | M7: Marketing Director orchestration + specialist agents via tools | M7 |
| [#57](https://github.com/jakebutler/resonate-v2/issues/57) | M8: VOICE.md, reviewer/editor loops, and analytics instrumentation | M8 |

**Journey mapping:** Lab notebook → campaign = #50 → #51 → #55. Academic PDF → opinioned posts = #52 → #53 → #54 (optional campaign attach via #55).

---

## References

- [#45](https://github.com/jakebutler/resonate-v2/issues/45) — original PRD
- `plans/2026-07-19-source-grounded-series-spec.md` — series/corpus substrate (+ consolidated review + notebook addendum)
- `plans/2026-07-19-ship-plan.md` — production ship phases; Buffer still a build slice
- [PR #46](https://github.com/jakebutler/resonate-v2/pull/46) — allowlist, publish approval gate, fail-closed AI routes
- ADR 0004 — single composer
- ADR 0005 — Convex SoT
- `docs/glossary.md` — schedule ≠ approval; research vocabulary
)

# Resonate Campaign Loop — Product Spec

**Date:** 2026-09-06
**Status:** Draft for Jake's review — prototype-validated
**Supersedes:** [#45](https://github.com/jakebutler/resonate-v2/issues/45) (Marketing Director PRD) as the campaign product definition
**Delivered under:** wayfinder map [#61](https://github.com/jakebutler/resonate-v2/issues/61); closes [#69](https://github.com/jakebutler/resonate-v2/issues/69)
**Priors:** [#58 revised proposal](2026-08-06-revised-proposal.md) (schema-first sequencing, L-decisions), prototypes [#66](https://github.com/jakebutler/resonate-v2/issues/66) / [#67](https://github.com/jakebutler/resonate-v2/issues/67) / [#68](https://github.com/jakebutler/resonate-v2/issues/68), fixtures [#65](https://github.com/jakebutler/resonate-v2/issues/65)

---

## 1. Summary

Resonate's campaign product is a **human-driven core loop** that turns source material into a cohesive batch of drafts in the existing composer/calendar:

```
source (paper upload | lab folder CLI)
  → brand corpus (immutable versions, citable excerpts)
  → campaign session (ideas citing excerpts, working set)
  → campaign shape (numbered slots: channel × media type × role)
  → draft set (placeholders generated as one set)
  → review passes (cohesion gate · SEO/AEO surface · humanizer surface)
  → materialize (scheduled-but-unapproved posts, approval queue on the calendar)
```

It is **not** an agent product yet. The Marketing Director orchestration, VOICE.md, reviewer/editor skill loops, analytics, Slack/email, and resumable sessions are all **deferred** (§8). This spec defines the loop Jake validated by reacting to three throwaway prototypes; every UX decision below traces to that record, not invention.

## 2. Scope

**In scope (buildable from this spec):**
- Brand corpus ingest, both journeys (document upload; lab-folder CLI), immutable corpus versions
- Campaign session: ideas with excerpt citations, working-set membership
- Campaign shape: presets, slots, publishing sequence
- Draft set: set-level placeholder generation, gated mock AI
- Review passes: cohesion gate (blocking, auto-resolving), SEO/AEO and humanizer placeholder surfaces
- Materialization: scheduled-but-unapproved posts + calendar approval queue with inline review

**Out of scope (deferred, §8):** agent orchestration of any kind, VOICE.md/voice profiles, reviewer/editor loops, analytics/telemetry, external memory, Slack/email, resumable sessions, real skill packs for SEO-AEO/humanizer.

**Standing safety rules (unchanged, binding):** schedule ≠ approval. Nothing auto-approves. Nothing submits to providers from the campaign. Cohesion gate blocks materialization. Provider submission remains behind the existing approval-gated, audited path (PRs #46/#60 semantics). Grounded generation fails closed; mock provider blocks materialization without explicit operator acknowledgment.

## 3. Locked decisions (consolidated)

Carried from #45 (L-numbers) and the wayfinder map (#61 D-numbers), refined by prototype feedback (FP):

| # | Decision |
|---|---|
| D-1 | Campaigns are **brand-scoped** (Corvo Labs, FreshProof owned; the lower dB independent). Cross-brand briefs are explicit links. (#45 L3/L4) |
| D-2 | Primary surface: **`/campaigns`**. "Marketing Director" naming is **deferred** with the agent layer. (#61) |
| D-3 | **Campaign creation is title-only** (light confirm). Goal + audience are captured on the Propose-shape step and ride into the brief. Remaining brief fields (window, CTA/offer, metric, constraints) are progressive — required only when the agent layer exists (FP #66 pass 1, answered prompt 1). |
| D-4 | **Ideas only.** Opinions, insights, thoughts are Idea flavors — never a separate Stance type. (#61; retires #45's stance artifacts) |
| D-5 | Ideas ↔ campaigns are **many-to-many**. Accepting into a campaign makes it campaign-primary; the idea stays discoverable in research with a soft "in campaign" hint. Joining from another campaign links without moving. Rejection is **soft and reversible**. (FP #66) |
| D-6 | **Every suggested idea cites excerpts** (`corpus://…#excerpt-N`). Citation chips are compact with hover/click reveal. |
| D-7 | **Slot ↔ membership is one-way**: linking an idea to a slot never removes it from the working set; removing from the working set detaches it from slots. |
| D-8 | **Campaign shape** = durable plan of slots: channel × media type × role, optional title/angle, linked idea, **publishing sequence (1 → n)**. The shape owns sequence; the **calendar owns schedule** (dates/times). Terminology: "publishing sequence" vs "publishing schedule" — replaces #63's "narrative order". (FP #68/#66) |
| D-9 | Roles: **pillar / hook / satellite / cta / recap**. Media types: **post / article / essay / script**. Channel renders as **icon identity only** (simpleicons), format as media type — LinkedIn supports both post and article. (#63 + FP) |
| D-10 | Presets **Seed (3) / Standard (5) / Deep (7)** with Corvo default compositions. **Switching presets preserves operator edits** — slots matched by role + channel; unmatched slots fill from preset; working set untouched. (FP) |
| D-11 | **Empty slot = incomplete; blocks shape acceptance** and blocks materialization. Confirmed correct behavior. (FP, Jake-locked) |
| D-12 | Draft placeholders are generated **as a set** (one pass over the shape), visibly placeholder-grade with bracketed tokens. |
| D-13 | **Cohesion gate blocks materialization.** Checks: exactly one pillar; exactly one CTA; no repeated framing openers; satellites reference the pillar claim (source: EXP-020). Violations **auto-resolve** where mechanical (add CTA slot; regenerate duplicated opener) with explanatory helper notes — no manual fix buttons. (FP #68; EXP-020) |
| D-14 | SEO/AEO and humanizer are **placeholder review surfaces** in this phase — no skill packs. Bounded editor loops come with the agent layer (#45 L9). |
| D-15 | Materialized posts are **scheduled-but-unapproved**. The calendar surface is an **approval queue**: expandable rows, inline review/approve for posts; long-form (article) routes to the composer. Approving auto-opens the **next unapproved draft in publishing sequence**. Approve ≠ submit — sending stays in the composer under existing gates. (FP #68) |
| D-16 | **Excerpts are complete semantic units** (one or more whole thoughts/facts/arguments) — never raw chunks. Review affordances: accept / split / merge / fix. Correction-feedback capture covers segmentation errors, not just unusable extracts. (FP, Jake-locked direction) |
| D-17 | Ingest → **brand corpus** first, campaign attachment separate. One ingest = one **immutable corpus version**. Sensitivity per excerpt, default **unreviewed**; `internal-only` cannot source public claims; materialization warns on unreviewed. (#64, #58 A11) |
| D-18 | Two ingest journeys: **document** (in-app upload happy path: excerpt review, hard-block on unusable extract, Flag & fix correction capture) and **lab folder** (CLI happy path: dry-run, secret scan hard-fails, unsupported files skip with dirty warning). (+#64) |
| D-19 | **Affordance principle:** solid fills = primary actions only. Informational chips/pills use soft tints + regular-weight text, never button styling. Proximity rule for search + results. No native select styling. (FP #66 pass 2 — design-system rule, applies repo-wide) |
| D-20 | Naming: clean names, no `v2` prefix on new tables/routes/product language (#45 L13). Prototype numbering (#66/#67/#68) is wayfinder bookkeeping, not product naming. |
| D-21 | Models: **PioneerAI** for inference when AI lands; until then generation runs behind the gated mock and fails closed (#45 L16, #58 D6). |

## 4. Journeys

### Journey A — Document / paper (in-app)

1. Upload PDF/URL/paste → extraction → **excerpt review**: numbered excerpts (`#1`), provenance as plain text, sensitivity footer control per excerpt (inactive while unchecked), unusable extracts hard-blocked with Flag & fix correction capture.
2. Save → **corpus version v1 (immutable)** on the brand.
3. Continue to campaign session (§5).

### Journey B — Lab folder (CLI)

1. `resonate corpus import <folder> --brand <brand> --dry-run`: file-by-file scan (md/txt/json/csv accepted; unsupported skip + dirty warning; secret scan hard-fails the import).
2. Import → corpus version. Post-import excerpt review with the same controls (sensitivity editable, checked items saved).
3. Continue to campaign session.

### Campaign session (shared)

Start with title-only confirm → session workbench: corpus excerpts panel (numbered, provenance), suggested ideas (fake AI until Pioneer lands; flavors + citations), research-inbox search (one-offs with soft hints), working set with chips + sticky toast + already-in markers.

### Shape

Goal/audience check-in → preset picker (Seed/Standard/Deep) → numbered slot cards (role chip, channel icon + media type, pencil-edit title/angle, linked-idea picker, sequence movers) → legend explains roles. Acceptance blocked while any slot is incomplete.

### Draft set & review passes

Generate as a set → placeholder drafts with bracketed tokens, inline unapproved badges. Cohesion gate auto-resolves mechanical violations with notes and blocks materialize otherwise. SEO/AEO (answerable questions, extractable answers) and humanizer (bot-likelihood) render as placeholder surfaces.

### Materialize → calendar

Batch lands as scheduled-but-unapproved through the existing materialize path (`persistedPublishingPanel` semantics). Calendar rows: role badge, UNAPPROVED → APPROVED, Review ▾ → inline copy + Approve; long-form routes to composer; sequence-aware next-draft flow; fully-approved end state ("ready to schedule — nothing submits automatically").

## 5. Data model (directional, clean names)

New tables (Convex, no `v2` prefix). Existing tables mostly gain optional provenance fields.

```
corpora            brandId, origin(upload|cli|paste), version, createdAt, status
corpusDocuments    corpusId, name, kind(md|pdf|json|csv), meta
corpusExcerpts     corpusId, documentId, seq, text, provenance, sensitivity, labels, reviewState
campaigns          brandId, title, status, corpusIds
campaignBriefs     campaignId, goal?, audience?, window?, cta?, metric?, constraints?   (progressive)
campaignIdeas      campaignId, ideaId, primary, addedAt        (many-to-many join)
campaignShapes     campaignId, preset, status(proposed|accepted)
campaignSlots      shapeId, seq, channel, mediaType, role, title?, angle?, ideaId?
materializations   campaignId, shapeId, mode(mock|live), createdAt
cohesionRuns       materializationId, checks, autoFixLog
```

Existing `v2Posts` gains optional provenance: `sourceCampaignId`, `sourceSlotId`, `sourceExcerptIds`. Existing `ideas` gain soft campaign-hint fields. Audit events unchanged — campaign actions reuse the existing audit trail. External memory stays non-canonical behind an adapter (#45 L17, ADR 0005) and is not in this phase.

## 6. Implementation milestones (replace M0–M8)

| Milestone | Scope | Exit criteria |
|---|---|---|
| **C1 Foundation** | Tables above (schema-first, per #58 D1); fail-closed grounding; shared insert helper | Schema deployed; mock-gated generation refuses unacknowledged mock; unit tests |
| **C2 Corpus ingest — document** | Upload → extract → excerpt review → corpus v1 | Jake uploads a real paper on prod; unusable extract blocks; correction captured |
| **C3 Campaign session** | Title-only create; suggested ideas (gated mock AI) with citations; working set; inbox search | Session survives reload; membership rules (D5/D7) enforced |
| **C4 Shape** | Presets, slots, edit, sequence, accept-blocks-on-incomplete | Preset switch preserves edits; accept blocked while incomplete |
| **C5 Draft set** | Set-level mock generation; placeholder tokens; inline badges | Batch materializes to drafts, all unapproved |
| **C6 Review passes** | Cohesion gate (auto-resolve + block); SEO/AEO + humanizer placeholder surfaces | Gate blocks on seeded violations; auto-fix notes render |
| **C7 Calendar approval queue** | Materialize path; expandable rows; approve + next-draft flow; long-form → composer | Full loop demo on prod with real corpus, zero jargon |
| **C8 Lab journey** | CLI dry-run/import; skip+warn; secret hard-fail | Real lower-db-style folder imports clean; `.ipynb` skips with warning |

Each milestone is one PR-sized slice in the #34-style HITL tradition: ship, use on prod, record.

## 7. M0–M8 disposition (settles #58's parked milestones)

| Old | Disposition | Where it lands |
|---|---|---|
| M0 Foundation schema | **Superseded** | C1 (revised object model; corpus/shapes/slots replace series tables) |
| M1 Lab notebook import | **Absorbed** | C8 (unchanged in spirit; #64 rituals) |
| M2 Series plan → materialize | **Superseded** | Campaign shapes + slots replace postSeries/seriesEntries |
| M3 PDF ingest + paper brainstorm | **Absorbed & reshaped** | C2 (upload path); "brainstorm session" becomes the campaign session |
| M4 Stance capture | **Retired** | Ideas-only rule (D-4); stance artifacts never separate |
| M5 Opinioned posts from stance | **Retired** | Covered by the general draft set |
| M6 Campaign brief + thin /campaigns | **Absorbed** | C3–C4 (title-first + progressive brief) |
| M7 Marketing Director orchestration | **Deferred** (parked, not retired) | Backlog milestone A1 — after C1–C8 produce real scheduled posts |
| M8 VOICE.md, reviewer loops, analytics | **Deferred** (parked) | Backlog milestone A2+ — same trigger |

The #58 sequencing recommendation (**schema-first**) is retained and honored by C1. Its paper/stance journey framing is superseded by the ideas-only loop.

## 8. Deferred backlog (not dead)

1. **Agent layer (A1):** Marketing Director + specialists via tools; agentRuns; brief-gated generation (L5's full-field requirement transfers here); VOICE.md (A2); reviewer/editor bounded loops; analytics/PostHog; Slack/email digests. Trigger: after C1–C8 ship and real posts flow.
2. **Skill packs:** real SEO-AEO extraction and humanizer loops replace the placeholder surfaces.
3. **Resumable campaign sessions** (#45 L12).

## 9. Open questions (need Jake's call, non-blocking for C1)

1. **CTA / preset tension:** Standard preset has no CTA; the gate requires exactly one. Prototype auto-adds with a note. Alternatives: Standard composition gains a CTA slot; or gate warns instead of blocks. *(Recommendation: keep auto-add.)*
2. **Excerpt review on the CLI path:** keep the post-import review step (as prototyped) or auto-import + review later?
3. **Richness → shape AI scoring:** intentionally soft until Pioneer is wired.
4. **Composer drawer on calendar rows:** prototype links out; how deep should the in-calendar drawer go?
5. **Inline edit scope:** placeholder copy edit-in-place on the calendar vs composer-only editing.

## 10. Prototype evidence

| Prototype | Journey/leg | Record |
|---|---|---|
| [#66](https://github.com/jakebutler/resonate-v2/issues/66) · `prototypes/66-paper-to-shape/` | paper → ideas → shape | 3 feedback passes on the issue (excerpt granularity, metadata redesign, affordances) |
| [#67](https://github.com/jakebutler/resonate-v2/issues/67) · `prototypes/67-lab-corpus-to-shape/` | lab corpus → ideas → shape | CLI dry-run UX; cross-campaign continuity |
| [#68](https://github.com/jakebutler/resonate-v2/issues/68) · `prototypes/68-shape-accept-placeholders/` | accept → placeholders → calendar | approval queue; cohesion gate; auto-fix |
| [#65](https://github.com/jakebutler/resonate-v2/issues/65) · `prototypes/fixtures/corvo/` | fixtures | ReAct paper + synthetic lab notebook (sanitized) |

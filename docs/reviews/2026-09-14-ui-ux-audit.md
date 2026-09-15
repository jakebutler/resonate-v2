# UI/UX Audit — Campaign Loop Surfaces

**Date:** 2026-09-14 · **Commit:** `68c66b6` (main) · **Scope:** `components/campaigns/*`, `app/campaigns/*`, corpus→calendar flow end to end
**Inputs:** docs/campaigns/2026-09-06-campaign-loop-spec.md (D-1…D-21), ADR 0006, ADR 0007, docs/spec.md
**Method:** read-only code audit; every finding below was verified against component/query source with file:line evidence. No speculative findings.

## (a) Verdict

The campaign loop is genuinely walkable end to end — ingest → corpus review → campaign session → shape → draft set → review passes → materialize → approval queue — and the large majority of the D-1…D-21 decisions are implemented faithfully, including the two ADR settlements (pre-save split/merge, server-minted mock-ack tokens). The three material gaps are: **(1)** the UI half of ADR 0006 §2 was never built — `materializeDraftSet` computes and returns `unreviewedExcerptCount` but no component reads it, so the "warn at the moment of action" contract exists only in the audit log; **(2)** a non-mechanical cohesion-gate failure strands the operator — the drafts surface is read-only and the queue only links the composer for long-form, so "resolve the failures" has no destination; **(3)** state coverage is uneven: two false-empty flashes during loading, three surfaces with no empty state, two fire-and-forget mutations with no error path, no `app/error.tsx` anywhere, and missing double-submit guards on accept/preset/approve. Accessibility is better than the chip-and-color stereotype suggests (nearly every status carries text, expanders are real buttons with `aria-expanded`, dialogs use Radix), but preset/ingest-tab active states are color-only, one "disabled" control is mouse-only, and approving a draft destroys the focused button.

## (b) Findings

### Spec / flow

**F1 · DECISION — D-17 / ADR 0006 §2: the materialize-time unreviewed warning is not surfaced.**
`materializeDraftSet` resolves citations, counts unreviewed ones, returns `unreviewedExcerptCount` (convex/queue.ts:160-179, 243-247) and writes it into the audit event (convex/queue.ts:230-241). ADR 0006 says the count is returned "so the UI can surface the warning at the moment of action." No UI consumer exists: `ApprovalQueue.handleAddToCalendar` reads only `result.materialized` / `result.draftCount` (components/campaigns/ApprovalQueue.tsx:78-92), and a repo-wide grep for `unreviewedExcerptCount` finds no component usage. The warning loop is also unclosable from the queue: the sensitivity fix surface (`CorpusExcerptReview`) is reachable only by expanding a corpus row on the Campaigns home (components/campaigns/CampaignsHome.tsx:157-161) — nothing on /drafts or /queue links there.
**Recommendation:** when `unreviewedExcerptCount > 0`, render a persistent warning banner (not just the 4.2 s toast) on the queue after materialize, with a link to the corpus review surface. Small, but it changes what the operator sees at the decision moment — flag for Jake since it adds UI the ADR only implies.

**F2 · DECISION — D-13: non-mechanical gate failures have no remediation path.**
The gate correctly blocks materialize (convex/queue.ts:103-107) and re-verifies freshness via fingerprint (convex/queue.ts:118-137). Mechanical violations auto-fix with notes (rendered at components/campaigns/ReviewPassesPanel.tsx:157-177), per D-13. But a failing "satellites reference the pillar claim" check cannot auto-fix, and the failure toast says "resolve the failures to add the batch to the calendar" (ReviewPassesPanel.tsx:77) with nowhere to resolve them: `DraftSetView` draft cards are read-only (components/campaigns/DraftSetView.tsx:193-236, no edit affordances), and the composer is linked only from queue rows for long-form *after* materialization (ApprovalQueue.tsx:264-268). The operator is stuck between a blocking gate and an uneditable batch.
**Recommendation:** product call needed — either allow composer editing of un-materialized drafts (deep link `/?postId=`), or have blocking checks link to the specific draft/slot they fail on.

**F3 · QUICK-WIN — /queue before generation is a dead end with a guaranteed-fail button.**
With no drafts, `getCampaignQueue` returns `totalCount: 0, materialized: false` (convex/queue.ts:283-291); ApprovalQueue renders no empty state (the `queue-list` div renders nothing, ApprovalQueue.tsx:197-290) and the "Add batch to calendar" button is enabled (`disabled={busy || view.materialized}`, ApprovalQueue.tsx:153-162). Clicking it always throws "Cohesion gate is blocking…" because no run can exist (convex/queue.ts:103-107, check runs before the drafts-exists check at :114-116). The notice text says "run it on the drafts page" (ApprovalQueue.tsx:171-175) but is not a link.
**Recommendation:** when `totalCount === 0`, hide the materialize button and show "No draft set yet — generate one" linking to `/campaigns/[id]/drafts`.

**F4 · QUICK-WIN — Generate is clickable without an accepted shape.**
`generateDraftSet` fails closed with "Accept a complete shape before generating the draft set." (convex/draftSet.ts:44-52), but `DraftSetView`'s Generate button is only disabled by `generating || Boolean(view.materialization)` (DraftSetView.tsx:136-146) — `getDraftSet` doesn't return shape status (DraftSetView.tsx:31-35), so the client can't pre-gate. The flow invites a click that can only produce an error toast.
**Recommendation:** add shape acceptance status to `getDraftSet`; disable Generate with the same hint text until accepted.

**F5 · QUICK-WIN — approved short-form posts dead-end.**
An expanded approved non-long-form queue row shows only "✓ Approved — … Submission still happens in the composer, by you." with no link (ApprovalQueue.tsx:269-273); the composer deep link exists only for long-form (ApprovalQueue.tsx:264-268). The calendar supports `/?postId=` deep-linking (app/page.tsx:14-19; components/PersistedPublishingPanel.tsx:347-350, 487-489) but the queue never uses it.
**Recommendation:** add an "Open on calendar ↗" link (`/?postId={entry.postId}`) to approved rows.

**F6 · QUICK-WIN — "Regenerate (coming soon)" is a permanently disabled control.**
After generation the primary-position button becomes a disabled "Regenerate (coming soon)" (DraftSetView.tsx:136-146). Regeneration is not in D-10/D-12 scope; a disabled mock button in the primary slot invites retry-clicks.
**Recommendation:** replace with a muted text note ("one set per shape — regenerate arrives with live generation") or drop it.

**F7 · QUICK-WIN — session excerpt panel silently truncates at 12 excerpts per corpus.**
`entry.excerpts.slice(0, 12)` with no count or expander (components/campaigns/CampaignSession.tsx:388-398). A citation chip for excerpt #15 resolves and displays its text on hover, but the panel shows no indication that excerpts beyond #12 exist — the operator can't see what the ideas are grounded in.
**Recommendation:** show "showing 12 of N — view all on Campaigns home" footer, or an expand control.

**F8 · QUICK-WIN — false empty states during initial load.**
- Campaigns list renders "No campaigns yet for Corvo." while `listCampaigns` is loading (`campaigns ?? []` → length 0 → empty-state branch; CampaignsHome.tsx:51-61, 220-224).
- Research-inbox renders "No one-off ideas match yet." while `searchSessionIdeas` is loading (CampaignSession.tsx:91-94, 493-498).
**Recommendation:** gate both empty states on `!== undefined` and show a muted loading row.

**F9 · QUICK-WIN — fire-and-forget mutations with no error/pending handling.**
- `CorpusExcerptReview`: both `updateExcerptReview` calls are `void`-ed with no `.catch` (components/campaigns/CorpusExcerptReview.tsx:80-84, 101-106) — a failure is an unhandled rejection; the select/checkbox visually snap back via refetch with no message, and there's no pending state.
- `ExcerptReviewList.captureCorrection`: `await recordCorrection(...)` with no try/catch (components/campaigns/ExcerptReviewList.tsx:209-223); on failure the "Flag & fix" click silently does nothing.
**Recommendation:** wrap both in try/catch → inline `role="alert"` error; add pending state on the row.

**F10 · QUICK-WIN — missing double-submit guards.**
Guarded (busy flag + disabled): generate (DraftSetView.tsx:67, 139, 167), materialize (ApprovalQueue.tsx:70, 157), suggest (CampaignSession.tsx:79, 417, 437), attach corpus (CampaignSession.tsx:101, 374), save corpus (IngestDocumentFlow.tsx:118, 298), start campaign (StartCampaignDialog.tsx:33, 85). **Not guarded:**
- `handleAccept` — no busy flag; Accept button disabled only by completeness (CampaignShapeBuilder.tsx:124-134, 489-496).
- `handleSwitchPreset` — no guard; double-click runs `proposeShape` twice (delete + reinsert all slots; CampaignShapeBuilder.tsx:112-122, 208).
- `approveAndAdvance` — no per-row guard; double-click double-fires `setApproval` and double-toasts (ApprovalQueue.tsx:94-124, 275-282).
**Recommendation:** add `busy` state to all three; disable the trigger while pending.

**F11 · QUICK-WIN — brief goal/audience can be set but never cleared, and the inputs never resync.**
`saveBriefField` returns early on empty trim (CampaignShapeBuilder.tsx:136-145), so a typo'd goal is permanent; inputs are uncontrolled `defaultValue` (CampaignShapeBuilder.tsx:184-198) so a successful save doesn't re-render the canonical value either.
**Recommendation:** send cleared values through (server permitting) or add an explicit clear affordance; key the inputs on `view.brief` updates.

### Accessibility

Note on scope: **the shape builder contains no dnd-kit drag handles.** Sequence reordering uses ▲/▼ buttons with `aria-label="Move slot up"/"Move slot down"` (CampaignShapeBuilder.tsx:289-323). `@dnd-kit` is installed but only used by `components/kibo-ui/kanban/index.tsx`, consumed by the legacy WorkflowBoard — not by any campaign surface. Keyboard reordering is therefore already available (good), with one flaw below.

**F12 · DECISION — active-state signaling is color-only on preset cards and ingest tabs.**
Preset "cards" are buttons whose selected state is conveyed solely by an orange border/inset shadow — no `aria-pressed`/`aria-checked`, no non-color cue (CampaignShapeBuilder.tsx:204-217). The ingest source tabs (Upload/Paste/Link) likewise render selection purely via `pillActive` vs `pillIdle` tint, with no `role="tab"`/`aria-selected` (IngestDocumentFlow.tsx:318-330). Contrast with the brand switcher, which does it correctly (`role="tablist"` + `role="tab"` + `aria-selected`, CampaignsHome.tsx:73-89 — though it lacks tabpanel association and arrow-key handling).
**Recommendation:** add `aria-pressed` (preset cards, toggle semantics) and `role="tab"`/`aria-selected` (ingest tabs) — cheap and unambiguous; hence QUICK-WIN in implementation, but listed here because the pattern should be standardized repo-wide.

**F13 · QUICK-WIN — fake-disabled sensitivity select blocks mouse but not keyboard.**
The per-excerpt sensitivity control is "deactivated" by wrapping it in `<span className="pointer-events-none opacity-45">` when the excerpt is unchecked (ExcerptReviewList.tsx:296-324). Pointer users are blocked; keyboard users can still Tab to the select and change it — the D-17 "inactive while unchecked" rule (spec Journey A step 1) is unenforced for the keyboard path, and the visual 45 % opacity state is not conveyed to AT.
**Recommendation:** pass `disabled` to the `Select`/`SelectTrigger` instead.

**F14 · QUICK-WIN — humanizer band is color-only.**
The bot-likelihood bar is red for `elevated`, green otherwise, plus a numeric score — the `band` string itself is never rendered (ReviewPassesPanel.tsx:227-240). Color-blind users get only the number, which doesn't say whether it's bad.
**Recommendation:** render the band as text ("elevated" / "typical") next to the score.

**F15 · QUICK-WIN — approving a draft destroys the focused button.**
In the expanded queue row, "Approve draft" is a button that is replaced by a plain `<span>` once `approvalState === "approved"` (ApprovalQueue.tsx:269-283). The click that triggers `approveAndAdvance` leaves focus on an element that unmounts → focus resets to `<body>`, and the auto-advance expands + scrolls to the next row without moving focus there either (ApprovalQueue.tsx:105-124). Keyboard/SR users are dumped.
**Recommendation:** after approval, move focus to the next row's expander button (it's already tracked via `nextRowRef`); keep an aria-live announcement (the toast already has `role="status"`).

**F16 · QUICK-WIN — unlabeled form controls.**
- Paste textarea: placeholder only, no label/`aria-label` (IngestDocumentFlow.tsx:376-381).
- Link URL input: placeholder only (IngestDocumentFlow.tsx:395-400).
- Flag & fix correction textarea: no label or `aria-label` at all (ExcerptReviewList.tsx:403-414).
Everything else audited associates labels correctly (`aria-label` on checkboxes/selects, `htmlFor` on the brief fields — CampaignShapeBuilder.tsx:181-198; ExcerptReviewList.tsx:264, 313, 370).
**Recommendation:** add `aria-label`s matching the placeholder copy.

**F17 · Verified-ok items (no action).**
- Queue/corpus expanders are real `<button>`s with `aria-expanded` (ApprovalQueue.tsx:209-214; CampaignsHome.tsx:136-156); status/approval chips are non-interactive spans carrying text + soft tint, consistent with D-19 — not faux buttons.
- Dialog focus trapping: `StartCampaignDialog` uses the Radix-based `components/ui/dialog.tsx` (trapping, Esc, restore focus handled by Radix). The mock-mode "confirms" in CampaignSession (429-445) and DraftSetView (156-175) are inline panels, not dialogs — no focus move or Esc, acceptable at this size but worth revisiting if they grow.
- CitationChip is keyboard-operable (real button, `aria-expanded`, click toggles; CitationChip.tsx:16-36). Minor gaps: tooltip reveals on `onMouseEnter` but not `onFocus`, and there's no Esc-to-dismiss.
- Cohesion check rows pair ✓/! glyph *and* text label, so pass/fail isn't color-only (ReviewPassesPanel.tsx:143-170); gate status chip carries "passing"/"blocking" text (ReviewPassesPanel.tsx:112-124).
- Sequence movers: keyboard-reachable, but the two `aria-label`s are identical across all rows ("Move slot up") — include the slot number ("Move slot 2 up").

### State coverage matrix (query surfaces)

| Surface | Query | Loading | Empty | Error |
|---|---|---|---|---|
| Campaigns home · campaigns | `campaigns.listCampaigns` | ✗ (false empty flash, F8) | ✓ (CampaignsHome.tsx:220-224) | ✗ |
| Campaigns home · corpora | `corpora.listCorpora` | (blank — acceptable) | ✓ (CampaignsHome.tsx:164-168) | ✗ |
| Campaigns home · corpus detail | `corpora.getCorpus` | ✓ (CorpusExcerptReview.tsx:50-52) | ✗ (empty list renders nothing, :64-116) | ✓-ish null (:53-55) |
| Session | `campaigns.getCampaignSession` | ✓ (CampaignSession.tsx:210-216) | ✓ per panel (:382-387, 516-522) | ✓ null (:218-227) |
| Session · inbox | `campaigns.searchSessionIdeas` | ✗ (false empty flash, F8) | ✓ (CampaignSession.tsx:494-498) | ✗ |
| Shape | `shapes.getCampaignShape` | ✓ (CampaignShapeBuilder.tsx:89-95) | ✓ (:266-270) | ✓ null (:96-105) |
| Draft set | `draftSet.getDraftSet` | ✓ (DraftSetView.tsx:100-106) | ✓ (:183-191) | ✓ null (:107-116) |
| Review passes | `cohesion.getReviewPasses` | ✓ (ReviewPassesPanel.tsx:87-91) | ✗ for SEO/AEO + humanizer lists when empty (:195-243) | n/a (renders null :93-95) |
| Approval queue | `queue.getCampaignQueue` | ✓ (ApprovalQueue.tsx:126-132) | ✗ (F3) | ✓ null (:133-142) |

**Error states:** no `app/error.tsx`, `app/global-error.tsx`, or `app/campaigns/error.tsx` exists (verified), and the only error boundary in the app wraps the home calendar (`PublishingPanelErrorBoundary`, app/page.tsx:23-25). Any Convex query rejection on a campaign surface hits Next's default crash screen. **Optimistic updates:** none are used anywhere in the loop — every mutation awaits and relies on query refetch — so there are no optimistic-rollback paths to audit; the gap is the missing catch/pending handling (F9), not rollback.

### Flow walk (corpus → calendar) — where users strand

1. Ingest on home → save → toast + StartCampaignDialog auto-opens (CampaignsHome.tsx:117-123) ✓ best affordance in the loop.
2. Session: attach-corpus row appears only while attachable corpora exist (CampaignSession.tsx:347-381); with zero brand corpora the empty state *says* "ingest a document on the Campaigns home" but doesn't link (:382-387). Minor.
3. Session → shape → accept (blocked while incomplete, client :491 + server convex/shapes.ts:311-318) → "Go to draft set" ✓ (CampaignShapeBuilder.tsx:484-497).
4. Drafts: F4 (generate clickable pre-acceptance); after generation the only forward path is the "Approval queue" link (DraftSetView.tsx:125-131) ✓.
5. Review passes: mechanical failures auto-fix with notes ✓; **non-mechanical failures strand (F2)**.
6. Materialize from queue: gate-not-run error sends the operator back to the drafts page by prose only (convex/queue.ts:105, ApprovalQueue.tsx:171-175) — consider a Run-gate affordance here (fold into F3's fix).
7. **Unreviewed warning: never shown (F1)** — the promised at-the-moment-of-action loop terminates in an audit log row.
8. Approval: auto-advance + sequence banner + fully-approved end state all present ✓ (ApprovalQueue.tsx:105-124, 177-195), modulo the focus loss (F15); approved short posts dead-end (F5).
9. Calendar (`/`): campaign posts appear (they're `v2Posts` with `status: "scheduled"`, convex/queue.ts:220-227, surfaced via `listCalendarItems` convex/publishing.ts:601-645) and submission is correctly approval-gated (PersistedPublishingPanel.tsx:745, 1384). But the calendar carries no campaign provenance — `sourceCampaignId` is written (convex/draftSet.ts:132) yet never rendered anywhere in PersistedPublishingPanel (grep: zero matches) — so materialized batches are indistinguishable from hand-made posts, and there's no path from calendar post back to its campaign queue. DECISION: decide whether D-15's "the calendar surface is an approval queue" is satisfied by the campaign-scoped /queue page (current implementation) or whether the calendar needs campaign badges/links.

## (c) D-1…D-21 adherence table

| # | Decision (abbrev) | Status | Notes (evidence) |
|---|---|---|---|
| D-1 | Brand-scoped campaigns | Implemented | Brand tabs filter list (CampaignsHome.tsx:58-61, 73-89); `createCampaign({brandId})` (StartCampaignDialog.tsx:40-43). Cross-brand brief links n/a (agent layer deferred). |
| D-2 | `/campaigns` primary surface; no "Marketing Director" | Implemented | Shell nav includes campaigns (components/shell/Shell.tsx:44-46); grep finds no "Marketing Director" copy in app/components. |
| D-3 | Title-only creation; goal/audience on Propose-shape | Implemented | StartCampaignDialog title-only (:58-73); brief card on shape step (CampaignShapeBuilder.tsx:179-200). Caveat: fields can't be cleared (F11). |
| D-4 | Ideas only (flavors, no Stance) | Implemented | Flavors opinion/insight/thought only (CampaignSession.tsx:62-66); no stance artifacts in campaign surfaces (grep). |
| D-5 | Many-to-many + soft "in campaign" hint (per ADR 0007 Option B) | Implemented | Quiet static text, first campaign + "+N more", full list in `title` (CampaignSession.tsx:253-261); "linked — nothing moved" toast (:188-192); soft reversible rejection + Undo (:450-478). |
| D-6 | Every suggested idea cites excerpts; compact chips | Implemented | CitationChip with hover/click reveal (CitationChip.tsx); unresolvable citation falls back to "Excerpt text unavailable." (CampaignSession.tsx:272-283). Minor: no onFocus reveal (F17). |
| D-7 | Slot ↔ membership one-way | Implemented | Server detach on remove (CampaignSession.tsx:203-207 toast); copy both surfaces (:543-547; CampaignShapeBuilder.tsx:454-457). |
| D-8 | Shape owns sequence, calendar owns schedule; terminology | Implemented | "publishing sequence"/"schedule" copy (CampaignShapeBuilder.tsx:172-177, 262-263, 467-471); `#n in publishing sequence` (DraftSetView.tsx:215-217). |
| D-9 | Roles/media types/channels per spec | Implemented | pillar/hook/satellite/cta/recap; post/article/essay/script; LinkedIn post+article (lib/campaignShapes.ts:45-80); channel icon + label (CampaignShapeBuilder.tsx:338-342). |
| D-10 | Presets Seed/Standard/Deep; switch preserves edits | Implemented | Presets 3/5/7 (lib/campaignShapes.ts:45-80); edits inherited by role+channel match (convex/shapes.ts:101-114); working set untouched (no campaignIdeas writes in proposeShape). |
| D-11 | Empty slot blocks accept and materialize | Implemented | Client disable (CampaignShapeBuilder.tsx:489-491); server re-check at accept (convex/shapes.ts:311-318) and at materialize (convex/queue.ts:139-148). |
| D-12 | Drafts generated as one set, placeholder tokens | Implemented | Single `composeDraftSet` pass; token-missing generation refused (convex/draftSet.ts:96-106); tokens highlighted (DraftSetView.tsx:37-53). |
| D-13 | Gate blocks materialize; mechanical auto-fix with notes | Partial | Blocking + fingerprint freshness + auto-fix notes all correct (convex/queue.ts:103-137; ReviewPassesPanel.tsx:140-186). Deviation: no remediation path for non-mechanical failures (F2). |
| D-14 | SEO/AEO + humanizer placeholder surfaces | Implemented | Explicitly labeled placeholders (ReviewPassesPanel.tsx:188-245). Minor: empty-list states missing (matrix). |
| D-15 | Scheduled-but-unapproved; queue with inline approve; long-form → composer; auto-advance; approve ≠ submit | Partial | All mechanics present (ApprovalQueue.tsx:94-124, 252-286; unapproved insert convex/queue.ts:206, 220-227; submission gated PersistedPublishingPanel.tsx:745, 1384). Deviations: calendar shows no campaign provenance/queue link (flow walk step 9); focus destroyed on approve (F15); approved short posts dead-end (F5). |
| D-16 | Excerpt split/merge pre-save only (per ADR 0007) | Implemented | `editable` flag only on ingest (IngestDocumentFlow.tsx:272-284; absent in CorpusExcerptReview); blank-line split (ExcerptReviewList.tsx:134-155); consecutive-only merge with inline refusal (:162-184, 454-458); index remap (:87-132); provenance/document inheritance (IngestDocumentFlow.tsx:57-88). |
| D-17 | Corpus-first ingest; immutable versions; sensitivity default unreviewed; internal-only never quoted; materialize warns on unreviewed | Partial | Attach separate (CampaignSession.tsx:111-126); default unreviewed (ExcerptReviewList.tsx:45, 300); internal-only/non-accepted skipped (convex/campaigns.ts:196-199); count computed + audited (convex/queue.ts:160-179, 230-241). Deviation: **UI never surfaces the warning (F1)** — the ADR's stated purpose. |
| D-18 | Two ingest journeys; hard-block unusable + Flag & fix; lab CLI | Implemented | Document journey with disabled unusable checkboxes, exclusion from save, Flag & fix capture (ExcerptReviewList.tsx:262-269, 326-345, 397-432; IngestDocumentFlow.tsx:222-253); lab journey is the CLI API route (app/api/ops/lab-import/route.ts) per the CLI-only decision; post-import review via CorpusExcerptReview. |
| D-19 | Solid fills = primary only; chips soft-tint; proximity; no native select styling | Implemented | All chips are soft tints + regular weight (tokens.ts:14-15; role/sensitivity/status chips); primary/accent solids reserved for actions; Radix Select everywhere. Deviation: active-state color-only on preset cards/ingest tabs (F12) — signaling, not affordance styling. |
| D-20 | Clean naming, no v2 prefix | Implemented | Routes `/campaigns/*`, no "v2" in product copy (grep: only an SVG path false-positive). |
| D-21 | Gated mock, fails closed, server-issued ack | Implemented | Server-minted tokens (convex/mockAck.ts:17-45), verified server-side (convex/draftSet.ts:30-42); UI mints then submits (CampaignSession.tsx:156-179; DraftSetView.tsx:75-98) with double-submit guards. |

**Totals:** 17 implemented · 4 partial (D-13, D-15, D-17, and D-19 counted as implemented with a flagged deviation — so formally 18 implemented / 3 partial).

**Top quick wins by leverage:** F1 (surface the unreviewed warning), F3+F4 (queue/drafts preconditions), F9 (mutation error handling), F13+F16 (a11y mechanics), F15 (approve focus).
**Product calls needed:** F2 (gate-failure remediation), the D-15 calendar-provenance question, and whether F1's banner deserves a permanent place on the queue.

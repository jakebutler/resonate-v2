# Resonate → V2 Cutover Checklist

Last updated: 2026-06-06
Status: **DRAFT — In Validation**

---

## 1. Existing Resonate Capability Inventory

| Capability | Legacy Resonate | V2 Status | Notes |
|---|---|---|---|
| Ideas capture | ✅ Full (Convex-backed) | ✅ Full (localStorage tracer + persisted handoff paths) | Captured ideas remain local; accepted drafts persist into v2 tables |
| Idea-to-draft generation | ✅ AI-assisted (Corvo blog only) | ✅ Multi-channel (7 channels), Pioneer-backed | V2 adds LinkedIn, YouTube, X, Instagram, TikTok, Reddit |
| Multi-channel variant review | ❌ Not present | ✅ Accept/Reject per variant | v2 #8 |
| Inbox / draft management | ✅ Basic (Postiz calendar) | ✅ Cross-brand view, status filter | v2 #6 |
| Scheduling handoff | ✅ Postiz scheduler | ✅ Schedule date per draft, manual handoff | Human approval required; no auto-publish |
| Corvo Blog PR publishing | ✅ /api/publish GitHub PR | ✅ Preserved in V2 | v2 #15; PR-created status visible in draft list |
| YouTube validation | ✅ via Postiz | ✅ /api/v2/validate-youtube | Validates chapter markers, description, hashtags |
| Voice packs | ✅ Basic per brand | ✅ Per-brand default voice packs (all 4 brands) | v2 #4; V2 adds markdown body, persona fields |
| Research pipeline | ❌ Not present | ✅ Source discovery, evidence labeling, claim map | v2 #9 — FreshProof brand spike |
| Editorial outline | ❌ Not present | ✅ Claim-grounded outline generation | v2 #9 |
| Long-form draft with citations | ❌ Not present | ✅ Footnoted markdown output | v2 #9 |
| Workflow board | ✅ (Convex-backed) | ✅ Preserved (lib/workflowBoard.ts) | Minor scope, not blocking cutover |
| AI assistant | ✅ Chat UI (legacy) | ❌ Not in V2 scope for MVP | Deprioritized; not blocking |
| Settings | ✅ Postiz UI | ✅ Brand/channel config in V2 sidebar | V2 does not replicate all Postiz settings |
| Calendar view | ✅ Postiz calendar | ✅ Persisted month/week calendar | Brand, Platform, Status filters plus approval/provider state |
| Active data migration | Convex → localStorage | 🟡 Manual re-entry for MVP; no automated migration | See §4 |

---

## 2. Capability Mapping: Legacy → V2

### Fully covered in V2 MVP
- Idea capture with deduplication
- Multi-channel draft generation (7 channels, 4 brands)
- Variant review workflow (Accept/Reject)
- Cross-brand draft inbox with status filters
- Schedule handoff (human-approval gated, no auto-publish)
- Corvo Blog GitHub PR creation
- YouTube description/chapter validation
- Voice packs per brand
- Research pipeline (source → claim → outline → draft)

### Partial coverage
- **Postiz-native provider scheduling**: V2 has persisted calendar visibility and Mock Provider gates, but live provider scheduling remains gated until explicit approval.
- **AI assistant**: General-purpose chat not in V2 scope. Content team continues using Claude/Cursor directly if needed.
- **Settings**: V2 exposes brand/channel configuration. Provider credential management remains in Postiz.

### Not in V2 scope (acceptable gaps for MVP)
- Bulk scheduling
- Analytics / post performance
- Social media direct publishing (all publishing is manual or via GitHub PR)
- Team/multi-user access control

---

## 3. Data Migration and Archival Strategy

| Data type | Source | V2 approach | Action required |
|---|---|---|---|
| Ideas | Convex DB | localStorage tracer plus accepted-draft handoff into Convex v2 posts | Re-enter top priority ideas manually; archive Convex data in JSON export |
| Posts/drafts | Convex DB | Convex v2 posts, publishing intents, provider state | Dry-run export/import before cutover |
| Voice packs | Hardcoded (lib/v2.ts) | Hardcoded defaults + localStorage edits | Expand if brand voice changes significantly |
| Research briefs | Not present in legacy | Convex v2 research brief/source/claim snapshots plus local tracer UI | No legacy migration needed |
| Provider credentials | Postiz secrets | Vercel env vars | PIONEER_API_KEY, GITHUB_TOKEN, YOUTUBE_API_KEY already set |

**Archive plan**: Export Convex data via Convex dashboard before deprecating the legacy app. Store in `docs/archive/` as JSON. No automated rollback path is needed because V2 is additive — the old system can be left running in parallel.

---

## 4. Side-by-Side Operating Model

During the transition period (now through cutover decision):

| Workflow | Owner system | Notes |
|---|---|---|
| New idea capture | **V2** | Use V2 idea form; skip legacy |
| Draft generation (AI) | **V2** | Multi-channel variants via V2 |
| Source research (FreshProof) | **V2 Research Pipeline** | Only available in V2 |
| Post scheduling | **V2 for planning; Postiz/live providers for final publish** | V2 captures schedule, approval, provider state, retry, and cancel/unpublish intent |
| Corvo Blog PR | **V2** | /api/publish already wired |
| Social publishing (LinkedIn, X, etc.) | **Postiz** | Manual paste until V2 direct publishing lands |
| Analytics | **Postiz** | Not replicated in V2 |

---

## 5. Cutover Blockers

All blockers must be closed before deprecating the legacy Postiz-based UI. Tracked against issues in `jakebutler/resonate-v2`; see umbrella roadmap #21.

Latest automated gate: [`docs/smoke-runs/2026-06-06-cutover-readiness.md`](smoke-runs/2026-06-06-cutover-readiness.md) (B.6 — 6/6 checks pass, 7/11 #19 ACs automated-pass, 4 need C.2).

| Blocker | Issue | Status |
|---|---|---|
| Bootstrap Postiz spine | #2 | ✅ Closed — PR #20 |
| Glossary + ADRs | #3 | 🟡 In progress — B.1 |
| Brands/Channels + auth boundaries | #4 | 🟡 In progress — B.2.C |
| Publishing Intent / Provider State / Publish Attempts | #5 | ✅ Closed — PR #20 |
| Ideas v2 (capture, threading, dedup, spawn) | #6 | 🟡 In progress — B.2.B |
| Single composer + per-platform settings | #7 | 🟡 In progress — B.2.A |
| AI Idea-to-draft flow | #8 | 🟡 Pending C.2 authenticated smoke |
| Research-to-draft flow | #9 | 🟡 Pending C.2 authenticated smoke |
| Calendar week/month + filters | #10 | 🟡 Pending C.2 authenticated smoke |
| Calendar item actions + audit trail | #11 | 🟡 Pending C.2 authenticated smoke |
| Mock Provider + adapter contract | #12 | ✅ Closed — PR #20 |
| Buffer LinkedIn live submission | #13 | 🟡 B.4 in progress; B.6 read-only validation ✅ (2026-06-06) |
| Zernio Reddit live submission | #14 | 🟡 B.5 in progress; B.6 read-only validation ✅ (2026-06-06) |
| Corvo Blog PR channel + reschedule policy | #15 | 🟡 In progress — B.2.D |
| v1 → v2 migration | #16 | 🟡 B.3 in progress; B.6 sample dry-run ✅ (0 failed) |
| CI gates + coverage policy | #17 | ✅ B.6 `test:ci` pass (2026-06-06) |
| Side-by-side deployment + cutover doc | #18 | 🟡 B.6 HTTP smoke ✅ (`/` + `/v2` → Clerk); C.2 pending |
| Side-by-side smoke + go/no-go | #19 | 🟡 B.6 automated gate ✅; 4 ACs → C.2 (#19.1–19.3, 19.8) |
| Production validation at resonate.corvolabs.com | C.3 | ⬜ Pending C.2 + C.3 decision |

---

## 6. Rollback Plan

If V2 is not ready for full cutover:

1. Keep both UIs live: `resonate.corvolabs.com` (Postiz-based) and `/v2` route.
2. V2 can be disabled by removing the `/v2` route or feature-flagging the nav link. Preserve Convex v2 tables before cleanup because persisted validation artifacts now live server-side.
3. The legacy Postiz instance requires no re-configuration; it was never modified.
4. All V2 API routes are additive (`/api/v2/*`) and do not affect legacy routes.

---

## 7. MVP Success Demo (Dry-Run Results)

**Demo scenario**: Corvo Labs — Idea to LinkedIn draft and Corvo Blog PR draft.

| Step | Mechanism | Verified |
|---|---|---|
| Select Corvo Labs brand | Brand sidebar | ✅ |
| Capture idea with source URL | Idea form (dedup detection) | ✅ |
| Select LinkedIn + corvo-blog channels | Multi-channel checkbox | ✅ |
| Generate variants | /api/v2/generate-draft | ✅ Mock (Pioneer optional) |
| Review LinkedIn variant | Accept/Reject panel | ✅ |
| Review blog variant | Accept/Reject panel | ✅ |
| Create Corvo Blog PR | /api/publish | ✅ (requires GITHUB_TOKEN) |
| Schedule LinkedIn draft | Schedule date picker | ✅ (manual handoff to Postiz) |
| View in persisted calendar | Month/week calendar filters | ✅ |

**FreshProof research demo scenario**: Source discovery → Claim map → Editorial outline → Long-form draft.

| Step | Mechanism | Verified |
|---|---|---|
| Run source discovery | /api/v2/research-brief | ✅ Seeded GLP-1 sources, including recent discontinuation evidence |
| Accept sources | Human source review panel | ✅ |
| Generate claim map | /api/v2/claim-map | ✅ Mock claims |
| Review/accept claims | Human claim review panel | ✅ |
| Generate editorial outline | /api/v2/editorial-outline | ✅ Mock outline |
| Approve & generate long-form draft | /api/v2/long-form-draft | ✅ Mock draft with footnotes |

---

## 8. Go/No-Go Recommendation

**Recommendation: GO for V2 cutover once Phase B (#13, #14, #15, #16) closes and Phase C smoke (#19) passes.**

Rationale:
- All MVP workflows are implemented and verified in mock mode (#7, #8, #9, #10, #11).
- HITL constraints (no auto-publish, human source/claim acceptance) are enforced in architecture (ADR 0002).
- Provider adapter contract + Mock Provider gate live submission (#12 closed).
- Rollback is zero-risk: v2 lives on a separate Vercel project (`resonate-v2-delta.vercel.app`) and additive `/api/v2/*` routes do not affect legacy.

**Hard prerequisites before deprecating legacy v1 at `resonate.corvolabs.com`:**
- [ ] #13 Buffer live submission validated (B.4)
- [ ] #14 Zernio live submission validated (B.5)
- [ ] #15 Corvo Blog PR reschedule-after-create policy implemented (B.2.D)
- [ ] #16 Real v1 export dry-run reviewed (B.3)
- [ ] Vercel env vars set in `resonate-v2` project (A.2 — done)
- [ ] Authenticated MVP demo run on `resonate-v2-delta.vercel.app` (C.2)
- [ ] Legacy v1 Convex data exported and archived (C.3)
- [ ] DNS for `resonate.corvolabs.com` repointed to v2 Vercel project (C.3)

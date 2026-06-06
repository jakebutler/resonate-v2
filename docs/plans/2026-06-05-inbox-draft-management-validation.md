# Inbox, Response, and Draft Management Validation

**Issue:** #51
**Date:** 2026-06-05
**Scope:** Validate what Postiz provides off-the-shelf for inbox, response, approval, and draft management against the validated channels and MVP brands.

---

## Validated Channels Tested

From #41, the validated channels in the self-hosted Postiz fork are:

| Brand | Channel | Status |
|---|---|---|
| Corvo Labs | Corvo Labs Blog (GitHub PR) | Connected and tested |
| Corvo Labs | YouTube | Placeholder validated |
| Personal / lower-dB / FreshProof | All channels | Manual-post placeholders |

Real provider connections for LinkedIn, X, Instagram, TikTok, and Reddit are blocked by developer app access requirements documented in #39.

---

## How Ideas-Generated Drafts Appear in Draft Management

With issue #49 complete, the flow from Idea to published Post is:

1. **Idea captured** in the Ideas inbox (status: `inbox`)
2. **Variants generated** via the multi-channel draft generation UI
3. **User accepts** a variant → creates a `V2Post` with `status: "draft"` linked back to the source Idea via `ideaId` and `linkedPostIds`
4. **Draft visible** in the Drafts and Publishing Handoff section, with:
   - Channel label (LinkedIn, Corvo Labs Blog, YouTube, etc.)
   - "From idea: [idea title]" backlink
   - Status badge (Draft / Scheduled / PR Created)
5. **Channel-specific publishing actions** complete the handoff:
   - Corvo Blog → Create GitHub PR → status becomes `pr-created`
   - YouTube → Validate placeholder → status becomes `scheduled`
   - Other channels → Date picker + Schedule button → status becomes `scheduled`

**Gap:** The v2 in-app draft management does not connect to Postiz's own post queue. Postiz-managed posts live in the Postiz database; the v2 app's posts live in localStorage. This is acceptable for MVP — the two systems are in parallel, and the production Postiz fork handles its own post state.

---

## Draft and Scheduled-Post Management Across Brands

The cross-brand draft view (added in this slice) shows all posts across all four brand workspaces in a single list with an "All brands" toggle and status filter. Tested:

- **Corvo Labs + FreshProof** in the same view confirms the brand label appears per post
- Status filter (Draft / Scheduled / PR Created) narrows the list correctly
- "From idea" backlink is preserved across brands

---

## Postiz Off-the-Shelf Inbox / Response Workflow

In vanilla self-hosted Postiz, the Inbox provides:

- **Mentions and replies** from connected platforms (requires live OAuth)
- **Comment threads** per post
- **Direct message routing** (platform-dependent)
- **Team assignment** for responses (Postiz Pro feature, not in community edition)

**Tested state for Corvo Labs and validated channels:**
- YouTube: Postiz inbox cannot receive YouTube comments without a live OAuth connection. Placeholder channel is not monitored.
- Corvo Blog: No inbox surface — GitHub PR workflow is the review mechanism.

---

## Approval and Review Workflow

Postiz community edition provides:
- Post scheduling with manual approval gate (you must click publish or set a future date)
- Draft state visible in the Postiz calendar and post list
- No formal approval workflow or role-based review queue — all authenticated users can publish

**For the v2 app:**
- Approval is enforced by the Accept/Reject step in the variant review panel (#49)
- AI never auto-publishes — human must accept a variant, then explicitly schedule or trigger publishing
- This matches the PRD's HITL requirement

---

## Gap Classification

| Feature | Postiz Off-the-Shelf | Gap Severity |
|---|---|---|
| Draft post management | Available; posts have draft/scheduled/published states | acceptable |
| Cross-brand unified calendar | Available in Postiz's calendar view (all orgs shown if shared workspace) | acceptable |
| Inbox for mentions/replies | Requires live OAuth per platform | acceptable (no live OAuth yet) |
| Formal approval workflow | Not in community edition | v1.1 |
| Team review queue | Not in community edition | later |
| Custom CRM / contact tracking | Not provided | later — not needed for MVP |
| Idea-to-post link visible in Postiz | Not natively — lives in our custom v2 state | v1.1 (when custom module is integrated into Postiz fork) |

**Blockers for MVP replacement:** None. The gaps above do not block replacing Resonate. The MVP success demo (Corvo Labs Idea → LinkedIn draft + Corvo Blog PR) works end-to-end.

---

## Unified Cross-Brand View

Postiz's calendar does show posts across all workspaces attached to one Postiz instance. In our self-hosted fork:

- All four brands share one Postiz instance
- The Postiz calendar can display posts from all brands simultaneously
- Filtering by workspace (brand) is available in the Postiz sidebar

**In the v2 in-app draft view:** Added in this slice via the "All brands" toggle and status filter. This satisfies the acceptance criterion for cross-brand visibility without requiring Postiz calendar integration at MVP.

---

## Recommendation

No custom inbox or CRM layer is needed for MVP. Postiz's built-in draft/schedule workflow is sufficient. The primary gap (Idea-to-post link not surfaced in Postiz natively) is a v1.1 concern that will be addressed when the custom Ideas module is merged into the Postiz fork.

**Next:** #55 (migration and cutover checklist) can proceed. #52 (research editorial pipeline spike) is independent and proceeds in parallel.

# Prototype #68 — shape accept → cohesive placeholders

Throwaway interactive prototype for [wayfinder ticket #68](https://github.com/jakebutler/resonate-v2/issues/68), the final leg of the campaign loop under map [#61](https://github.com/jakebutler/resonate-v2/issues/61). Continues directly from [#66](https://github.com/jakebutler/resonate-v2/issues/66)'s accepted shape. **Not production code** — fake AI, placeholder copy, nothing saved or submitted anywhere.

## Open it

```
open prototypes/68-shape-accept-placeholders/index.html
```

Works from `file://` (plain inline JS only).

## The flow

1. **Shape accepted** — recap of the 5-slot Standard shape from #66 (role chips, channel icons, media types), **numbered in publishing sequence (1 → n)**. One button: **Generate draft set**.
2. **Draft set** — placeholders generated **as a set**, one pass over the whole shape. Copy is visibly placeholder-grade: bracketed tokens (`[THESIS: …]`, `[EVIDENCE: …]`) mark what the real skill pack would fill. Each card carries a single inline `unapproved` badge — no status sidebar.
3. **Review passes** — three set-level surfaces:
   - **Cohesion gate** (can block) — the EXP-020 checklist: exactly one pillar, exactly one CTA, no repeated framing openers, satellites reference the pillar claim. Two violations are seeded and **auto-resolved** (no manual clicks): the CTA is added and the duplicated opener regenerated, each with helper text noting it was "created automatically on the second attempt". Auto-fixes surface a real preset-vs-gate tension for the spec. The gate blocks materialize until clean.
   - **SEO/AEO pass** — placeholder surface only: answerable questions + extractable answers per draft. No skill pack wired.
   - **Humanizer pass** — placeholder bot-likelihood meter per draft; in the real product this is a bounded editor loop (#45 L9).
4. **Calendar** — the batch materialized through the existing path as an **expandable, reviewable list**. Each row has a clear **Review ▾** CTA; expanding shows the placeholder copy with **Approve draft** inline (long-form articles point to the composer instead). Approving flips the badge and auto-opens the **next draft in publishing sequence** ("2 of 6 approved · next: …"), so the campaign reads as a queue, not a dead end. When all are approved: "ready to schedule — nothing submits automatically." Schedule ≠ approval throughout.

## Decisions exercised

| Decision | Where |
|---|---|
| Accept shape → batch draft / scheduled-but-unapproved; never auto-approve/submit | Stages 1, 4 (map decision 9) |
| Cohesive/SEO/humanizer = product stage + placeholder UX, skill impl later | Stage 3 (map decision 10) |
| Cohesion gate semantics from EXP-020 (one pillar, one CTA, unique openers, satellite grounding) | Stage 3 (#64 lab fixture) |
| Set-level generation, not per-post | Stage 2 |
| Schedule ≠ approval | Stage 4 |

## A real spec tension surfaced

The **Standard preset composition (pillar + hook + 2 satellites + recap) contains no CTA**, but the cohesion gate requires exactly one. The prototype resolves it with an *Add CTA slot* fix — the spec (#69) must decide: do presets include a CTA, does the gate warn instead of block on missing CTA, or does the operator always close the gap manually?

## Feedback prompts (also in-app at the end)

1. Does "generate as a set" (vs per-post) read clearly in the output?
2. Is the cohesion gate worth its blocking power — and does auto-resolution (with helper notes) feel right vs manual fixes?
3. Are the SEO/AEO and humanizer placeholder surfaces enough to react to, or skippable until the skill pack exists?
4. Does the inline review → approve → next-draft queue flow match how you'd actually clear a campaign batch?
5. Anything missing before the #69 spec rewrite?

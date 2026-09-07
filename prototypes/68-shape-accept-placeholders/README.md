# Prototype #68 — shape accept → cohesive placeholders

Throwaway interactive prototype for [wayfinder ticket #68](https://github.com/jakebutler/resonate-v2/issues/68), the final leg of the campaign loop under map [#61](https://github.com/jakebutler/resonate-v2/issues/61). Continues directly from [#66](https://github.com/jakebutler/resonate-v2/issues/66)'s accepted shape. **Not production code** — fake AI, placeholder copy, nothing saved or submitted anywhere.

## Open it

```
open prototypes/68-shape-accept-placeholders/index.html
```

Works from `file://` (plain inline JS only).

## The flow

1. **Shape accepted** — recap of the 5-slot Standard shape from #66 (role chips, channel icons, media types). One button: **Generate draft set**.
2. **Draft set** — placeholders generated **as a set**, one pass over the whole shape. Copy is visibly placeholder-grade: bracketed tokens (`[THESIS: …]`, `[EVIDENCE: …]`) mark what the real skill pack would fill. Every draft shows `approval: unapproved · provider: — (gated)`.
3. **Review passes** — three set-level surfaces:
   - **Cohesion gate** (can block) — the EXP-020 checklist: exactly one pillar, exactly one CTA, no repeated framing openers, satellites reference the pillar claim. Two violations are seeded: the **Standard composition ships without a CTA** (fix: *Add CTA slot* — surfacing a real preset-vs-gate tension for the spec) and a **duplicate framing opener** between the hook and a satellite (fix: *Regenerate opener*). The gate blocks materialize until both resolve.
   - **SEO/AEO pass** — placeholder surface only: answerable questions + extractable answers per draft. No skill pack wired.
   - **Humanizer pass** — placeholder bot-likelihood meter per draft; in the real product this is a bounded editor loop (#45 L9).
4. **Calendar** — the batch materialized through the existing path: a week list where every row wears an **UNAPPROVED** badge and a lock. Schedule ≠ approval: dates are placeholder placements, approval happens per post in the composer, and nothing submits to providers from the campaign.

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
2. Is the cohesion gate worth its blocking power — and does the add-CTA fix feel right?
3. Are the SEO/AEO and humanizer placeholder surfaces enough to react to, or skippable until the skill pack exists?
4. Is the calendar handoff legible as "scheduled-but-unapproved" — or do you want the composer drawer in this prototype too?
5. Anything missing before the #69 spec rewrite?

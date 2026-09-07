# Prototype #67 — Corvo lab corpus → ideas → shape

Throwaway interactive prototype for [wayfinder ticket #67](https://github.com/jakebutler/resonate-v2/issues/67), sibling to [#66](https://github.com/jakebutler/resonate-v2/issues/66) under the campaign-assistant map ([#61](https://github.com/jakebutler/resonate-v2/issues/61)). **Not production code** — fake CLI/AI, scripted content, nothing saved anywhere.

## Open it

```
open prototypes/67-lab-corpus-to-shape/index.html
```

Works from `file://` (plain inline JS only).

## What differs from #66 (the paper path)

Only the source journey changes — campaign session and shape stages are identical on purpose, so the two prototypes can be compared directly:

1. **CLI dry-run ingest (#64):** the stage-1 screen is a terminal card — `resonate corpus import … --dry-run` scanning the real `../fixtures/corvo/lab-notebook/` folder: 7/8 files accepted (md/json/csv), `board-sync-scratch.ipynb` **skipped with a dirty warning**, secret scan reporting 0 findings (the scan **hard-fails** on any finding), sensitivity default `unreviewed`.
2. **Semantic excerpt units:** candidates come from dated notebook entries with `experiment-result` / `hypothesis` provenance (EXP-014 … EXP-020), per the excerpt-granularity direction recorded on #66.
3. **Lab-flavored ideas:** opinions/insights/thoughts grounded in experiment results — approval-gate telemetry, trace-to-eval promotion, gates-beat-prompt-roulette, review-comment conversion, and the cohesion-gate hypothesis. One idea is "already in" the #66 paper-path campaign (many-to-many continuity).
4. **No unusable-extract case:** the document-path "Flag & fix" ritual is deliberately absent here — the lab journey's failure modes are skip-and-warn + secret hard-fail, per #64.

Stages 2–4 (working set, presets, publishing sequence, block-on-incomplete, accept → #68 stub) are shared mechanics; see `../66-paper-to-shape/README.md` for the full decision mapping.

## Feedback prompts

1. Does the CLI dry-run read as trustworthy? Enough detail, or too much?
2. Should the CLI path get an excerpt-review step at all, or is auto-import with post-hoc review more honest to the ritual?
3. Do the lab-derived ideas feel like the same *kind* of thing as the paper-derived ones (they should — all are Ideas)?
4. Is the cross-campaign "already in" continuity (idea shared with the #66 campaign) legible?
5. Anything in the lab journey missing before #68?

## What's faked

- The CLI itself, extraction, AI suggestions, shape proposal (all pre-scripted)
- Persistence (state dies on reload)
- Content is the synthetic fixture at `../fixtures/corvo/lab-notebook/` — no real experiment data

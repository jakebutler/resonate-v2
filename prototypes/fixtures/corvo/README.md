# Corvo Labs proof fixtures (wayfinder #65)

Inputs for the campaign-shape prototype tickets — **not** production import
material and **not** the prototypes themselves:

- **Paper path** — feeds "Prototype: Corvo paper → ideas → shape" (#66)
- **Lab path** — feeds "Prototype: Corvo lab corpus → ideas → shape" (#67)

Both paths end at campaign shape → accept → cohesive placeholders (#68), per
the wayfinder map (#61).

## Contents

| Path | What it is | Used by |
|---|---|---|
| `paper/react-synergizing-reasoning-acting-2210.03629.pdf` | Real public paper: *ReAct: Synergizing Reasoning and Acting in Language Models* (Yao et al., arXiv:2210.03629), 33 pages | #66 |
| `lab-notebook/` | Synthetic lab-notebook folder, Corvo Labs–themed (see below) | #67 |

### Lab notebook folder

Clean markdown-first corpus per the ingest rituals locked in #64
(md/txt/json/optional csv; skip others with a dirty warning). Five dated
entries with `type` front-matter (`experiment-result`, `hypothesis`), plus:

- `experiments.json` — structured experiment index mirroring the entries
- `eval-runs.csv` — eval run summaries matching the notebook results
- `board-sync-scratch.ipynb` — **deliberately unsupported** format; a dry-run
  should skip it and emit a dirty warning

The entries span four distinct themes (eval harnesses, approval-gate
telemetry, worktree observability, review-to-eval conversion) plus one open
hypothesis about set-level cohesion, so different campaign-shape presets
(#63: seed/standard/deep; pillar/satellite/hook/cta/recap) should compose the
same corpus into noticeably different shapes.

## Sensitivity notes

- The paper is a public arXiv document; no restrictions beyond its license.
- Everything in `lab-notebook/` is **fully synthetic**, authored for these
  prototypes. It contains no real experiment data, no personal data, and no
  credentials. Do not "enrich" it with real internal material without a
  sanitization pass.
- All entries carry the `unreviewed` sensitivity default from #64 by intent —
  prototypes should not assume reviewed status.

## Integrity

SHA-256 checksums (regenerate with `shasum -a 256`):

```
react-synergizing-reasoning-acting-2210.03629.pdf  f285b0971ae4a790e402fb93966bed3adde2cf0a04977d08b2b40d6ab0cace69
2026-04-14-eval-harness-v0.md  f40d7d0667592d12962b9e4782a8210935aa0345c1c53f030273ad572c8038c4
2026-04-21-approval-gate-telemetry.md  7b3f96a3ddf3c12b3fcc763be1024e16d3f30c800e1121c6c6bcd4e262996795
2026-05-05-worktree-observability.md  9899d53d7dd882c98c2ad5859f338167e6918250881a586bc455e2211b8a2503
2026-05-12-hitl-review-loop.md  376d7074fe455a7049eeb357cb03621dbf982210c8d565aff036516b32aaaa97
2026-05-26-cohesion-gate.md  2a1da69342b830065a9f94839d2f64a281b8644b3a12964b32f2ba9ef6203227
board-sync-scratch.ipynb  1add90dce20ba643c65a7c80f47e58db7c965dbed4ad36f11e25ff02205f1faf
eval-runs.csv  ab7db98948c69c8a900691ec14234557d589bf1be06c8a58f6a4f33a09beb79b
experiments.json  4beff4d8e0cf9d57991c6094e565f1a7f9443741db3fbf4223659265870b6a75
```

## Location is provisional

#61 left prototype hosting unresolved (static HTML vs app route vs other).
If that decision lands somewhere else, move this directory wholesale and
update the paths recorded on #65.

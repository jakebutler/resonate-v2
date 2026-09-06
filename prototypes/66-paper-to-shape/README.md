# Prototype #66 — Corvo paper → ideas → shape

Throwaway interactive prototype for [wayfinder ticket #66](https://github.com/jakebutler/resonate-v2/issues/66), under the campaign-assistant map ([#61](https://github.com/jakebutler/resonate-v2/issues/61)). **Not production code** — fake AI, scripted content, nothing saved or submitted anywhere.

## Open it

No build, no server, no dependencies:

```
open prototypes/66-paper-to-shape/index.html
```

Works from `file://` (plain inline JS only). Best viewed ≥1000px wide.

## The flow

1. **Ingest paper** — the ReAct paper fixture "uploads" and "extracts" automatically. Review excerpts, flip sensitivity, and try **Flag & fix** on the deliberately mangled Table 2 extract: unusable extracts are hard-blocked from saving and corrections are captured as parser feedback (#64). Saving creates **corpus v1 (immutable)** on the Corvo Labs brand corpus.
2. **Campaign session** — title-only light confirm starts the campaign (#62). Fake AI suggests ideas (Opinion / Insight / Thought flavors — never a Stance type), each citing `corpus://` excerpts. Accept ideas into the working set (sticky toast), including one already in another campaign (many-to-many). Search the research inbox for one-offs with soft used-hints.
3. **Propose shape** — pick a preset (**Seed 3 / Standard 5 / Deep 7 slots**, Corvo default compositions, #63). Slots are channel × format × role with editable title/angle and linked ideas. Reorder = **narrative order, not a publish schedule**. Any slot without a linked idea is **incomplete and blocks accepting** (#62: empty = incomplete, block materialize).
4. **Accept** — ends at the handoff boundary: scheduled-but-unapproved posts via the existing materialize path. Cohesive placeholders / SEO / humanizer are stubbed as **prototype #68**.

## Locked decisions exercised

| Decision | Where |
|---|---|
| Ingest → brand corpus first; immutable version; unusable extract hard-block + correction capture | Stage 1 (#64) |
| Start campaign = title-only light confirm | Stage 2 (#62) |
| Ideas only — Opinion/Insight/Thought flavors citing excerpts | Stage 2 (map decision 5) |
| Hybrid membership: campaign-primary chips, sticky toast, already-in marked, one-offs stay with soft hint | Stage 2 (#62) |
| Slot → membership one-way | Stage 2/3 (#62) |
| Shape = slots (channel × format × role), presets Seed/Standard/Deep, narrative order ≠ publish schedule | Stage 3 (#63) |
| Empty slot = incomplete, blocks materialize | Stage 3 (#62) |
| Accept → scheduled-but-unapproved only; never auto-approve/submit | Stage 4 (map decision 9) |
| Cohesive/SEO/humanizer as placeholder stage | Stage 4 stub (#68) |
| Proof brand Corvo Labs only; "Marketing Director" title deferred | Header (map decisions 6, 11) |

## What's faked

- PDF extraction, AI idea suggestions, AI shape proposal (all pre-scripted)
- The other campaign ("Fact Drift launch") and research-inbox one-offs
- Corpus versioning, persistence (state dies on reload — the page is the state)

Real ReAct excerpts are quoted from the public paper fixture at
`../fixtures/corvo/paper/react-synergizing-reasoning-acting-2210.03629.pdf`.

## Feedback prompts (also shown in-app at the end)

1. Does the title-only campaign confirm feel right, or do you want a goal/audience check this early?
2. Do excerpt citations make ideas feel trustworthy — or is it noise at this stage?
3. Are the Seed / Standard / Deep compositions close to what you'd actually run for Corvo?
4. Is "narrative order ≠ publish schedule" clear enough in the slot list?
5. Does blocking accept on incomplete slots feel safe, or should it warn instead?
6. Anything missing before this hands off to #68 (placeholders + cohesion)?

## Sibling prototype

- #67 (lab corpus path) reuses the same session/shape stages with the `../fixtures/corvo/lab-notebook/` corpus and the CLI/skip-and-warn ingest story.

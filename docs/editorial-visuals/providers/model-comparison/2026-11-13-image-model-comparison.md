# Image model comparison — gpt-image-1-mini vs gpt-image-1.5 vs gpt-image-2

Compared 2026-11-13 (UTC). Input to the packet-pin decision (`todo_1hiRgArw`, branch `test/image-model-comparison`, base `release/feature-verification-20261113-200812`).

## Method

- The reviewed packet's exact two-call functional sequence was run once per model: one `generate` call (both references as ordered `image[]` inputs) followed by one `edit` call bound to the verified 1536×1024 generated parent (ordered inputs: generated parent, raven identity, paper style).
- Prompts, settings, reference order, and input images were byte-identical across models: the base packet's verbatim generation and edit prompts, `n=1`, `size=1536x1024`, `quality=medium`, `output_format=png`, `background=opaque`, `stream=false`, multipart `POST /v1/images/edits`. `input_fidelity` was omitted for all three models: `lib/visualProviders.ts` only configures it for GPT Image 1 routes, and holding it out keeps the three runs comparable.
- References were sha256-verified against the packet pins immediately before dispatch: `raven-character-sheet.png` (`0900adbe…`) and `article-04.png` (`fca4cce7…`).
- Direct OpenAI API on the provisioned `OPENAI_API_KEY` (the key provisioned via the dev deployment gate path, precious-mole-481). This was a side-by-side comparison run outside the gated packet harness; the qualification packet and its hash chain were not modified, and nothing here qualifies a route.
- Hard cap $0.25 per call, enforced from the provider-reported usage; one sequence per model, no retries. Every call completed on its first attempt; no cap or error stop was hit.
- Latency is wall-clock from request dispatch to response received, measured client-side. Cost is computed from the provider-reported usage tokens at each model's published synchronous Standard rates (per 1M tokens), not from an invoice.

## Per-model results

Latency in ms (client-measured; provider `openai-processing-ms` in parentheses). Cost in USD from provider-reported usage at each model's published Standard rates.

| Model | Call | Latency | Usage (in: text/img, out: img/text) | Cost | Output sha256 (first 12) |
| --- | --- | --- | --- | --- | --- |
| gpt-image-1-mini | generate | 16,302 (15,702) | 1,751 / 2,902; 1,568 / 0 | $0.023301 | `ffbc9f6e21ea` |
| gpt-image-1-mini | edit | 15,186 (15,012) | 96 / 4,438; 1,568 / 0 | $0.023831 | `5901686c0053` |
| gpt-image-1.5 | generate | 17,891 (17,616) | 1,803 / 646; 1,568 / 477 | $0.079623 | `5806ed6dcc76` |
| gpt-image-1.5 | edit | 17,787 (17,100) | 174 / 969; 1,568 / 452 | $0.073262 | `8c9f2660dc6b` |
| gpt-image-2 | generate | 31,001 (30,771) | 1,751 / 2,902; 1,372 / 0 | $0.073131 | `4bf899949028` |
| gpt-image-2 | edit | 28,993 (28,808) | 96 / 4,438; 1,372 / 0 | $0.077144 | `f5c9ad08c405` |

Sequence totals (both calls): mini **$0.047132**, 1.5 **$0.152885**, image-2 **$0.150275**. Grand total for the run: **$0.350292**. Every call was under the $0.25 cap; the most expensive single call was 1.5's generate at $0.0796.

Rates used (USD per 1M tokens, synchronous Standard; verified 2026-11-13 from developers.openai.com/api/docs/pricing.md, cross-checked against `docs/editorial-visuals/providers/contracts.md` — the mini and image-2 rows match the repo table exactly):

| Model | Text input | Image input | Image output |
| --- | ---: | ---: | ---: |
| gpt-image-1-mini | 2.00 | 2.50 | 8.00 |
| gpt-image-1.5 | 5.00 | 8.00 | 32.00 |
| gpt-image-2 | 5.00 | 8.00 | 30.00 |

Request IDs: mini `req_3095b90106…` / `req_7fcd9568bb…`; 1.5 `req_fccb171fe9…` / `req_1f08984aa2…`; image-2 `req_840aaee612…` / `req_a9c94ab253…` (generate / edit). All returned HTTP 200 on the first attempt.

## API differences observed

- **Input-token accounting is not comparable across models.** mini and image-2 reported identical input token counts for identical requests (generate: 1,751 text + 2,902 image; edit: 96 text + 4,438 image). 1.5 reported far fewer (generate: 1,803 text + **646** image; edit: 174 text + **969** image). The 646 and 969 figures exactly match the documented GPT Image 1 input-token formula in `functional-first-packet.json` (`documented_image_input_tokens: generation 646, edit_with_1536x1024_parent 969`) — 1.5 bills image inputs per that tile rule, while mini and image-2 report several times more image-input tokens for the same bytes. Cost projections built on the documented token formula will understate mini and image-2 and match 1.5.
- **1.5 bills text output tokens; the others did not.** 1.5's usage includes `output_tokens_details.text_tokens` (477 generate, 452 edit) on top of 1,568 image-output tokens — consistent with the model rewriting the prompt. The runner did not retain response bodies, so the rewrite text itself is not confirmed; the billing difference is. mini and image-2 reported pure image output (1,568 and 1,372 image tokens respectively, 0 text).
- **Output token counts differ at equal settings.** image-2 emitted 1,372 image-output tokens per call versus mini's 1,568 for the same 1536×1024 PNG — image-2 bills fewer output tokens, which partly offsets its higher per-token rate.
- **Identical request contract worked for all three.** The same multipart edits-endpoint shape, field set, and ordered `image[]` parts were accepted unchanged; no model required model-specific fields. (mini is the only one of the three that supports `input_fidelity`; sending it would have been an uncontrolled variable, so it was omitted.)

## Qualitative style fidelity

Judged against the two approved references: the character sheet (crisp cut-paper raven, layered matte feathers, slate-teal beak, off-white eyes) and `article-04.png` (tactile matte-paper construction, visible paper tooth, restrained contact shadows, neutral off-white ground, quiet whimsy).

- **gpt-image-1-mini** — Weakest fidelity. Smooth, molded 3D-render surfaces rather than visibly cut paper; feathers and car body lack layering and paper tooth. Prompt misses: only two monitors (three specified, with named contents); the raven wears plain trousers with a belt rather than the charcoal technical jumpsuit with copper sleeve stripes; no electronic sensor apparatus, cables, or wheel restraints; the car's interior and rig detail are sparse. Composition is readable and the palette is roughly on-palette, but the character reads generic rather than the approved raven.
- **gpt-image-1.5** — Strong scene fidelity, softer style. Hits nearly every prompt element: three monitors with approximately the specified contents, jumpsuit with copper sleeve stripes and utility pocket, inspection printout, sensor mast over the front bodywork, rear wheel module, routed cables and coiled lead, copper restraints, tan seats, tool board with orange-handled screwdriver, plant in a copper-brown pot. However, the texture reads as felt/fuzzy craft rather than crisp cut paper — edges are soft, deckling and paper tooth are absent — and the raven's upward gaze at the middle screen is not clearly established (head is level, facing the car).
- **gpt-image-2** — Closest to both references. Crisp hand-cut edges with occasional deckling, visible layered paper construction, broad overlapping feather and object layers, restrained contact shadows — the same tactile cut-paper language as the references. All three monitors carry approximately the specified graphics (car profile + bars + wheel diagram; twin gauge arcs + teal/copper curves; waveform + axle schematic), the full electronic apparatus, restraints, and the copper adjustment handwheel, and the raven's head is raised toward the monitors.

### Edit-call preservation (shorten the handwheel grip; everything else unchanged)

- **mini** — Poor preservation. Beyond the grip, the edit visibly re-staged the scene: the sensor-less rig simplified further, environment elements dropped (plant, cabinet), and the car lost detail. A sequence that needs a localized edit cannot rely on mini.
- **1.5** — Good preservation: the edit output is near-identical to its generate output, with the change confined to the handwheel area. Caveat: neither 1.5 output shows a prominent copper adjustment handwheel, so the specific grip edit is hard to verify — the model under-realized that element in the first place.
- **image-2** — Good preservation with the clearest target: the handwheel with projecting grip is present in both outputs, the grip reads slightly shorter after the edit, and the rest of the dense scene (monitors, sensors, cables, restraints) is unchanged.

## Evidence

Six PNGs, this directory:

- `generate-gpt-image-1-mini.png`, `edit-gpt-image-1-mini.png`
- `generate-gpt-image-1.5.png`, `edit-gpt-image-1.5.png`
- `generate-gpt-image-2.png`, `edit-gpt-image-2.png`

## Reading for the pin decision

**gpt-image-2 is the quality pick**: best style fidelity to the references, best edit preservation, ~$0.150 per two-call sequence and ~60 s per sequence — roughly 3.2× mini's cost and 1.7× its latency, and about equal in cost to 1.5 (which bills ~4× image-2's image-input rate, offset by far fewer reported input tokens).

**gpt-image-1.5 is the middle option**: nearly the same scene completeness as image-2 at the same sequence cost, ~40% faster, but a felt-like rather than cut-paper texture and an unverified handwheel edit target. This run found no cost advantage over image-2 at medium quality; 1.5's case rests on latency and any quality-tier pricing differences not exercised here.

**gpt-image-1-mini is the budget pick**: $0.047 and ~31 s per sequence, functional on both endpoints, but it misses multiple named scene elements, drifts from the cut-paper style, and its edit pass degraded the scene. Viable only if cost dominates quality.

These numbers are single-sample observations — one sequence per model, no repetitions — so latency and cost carry no confidence intervals. The token-accounting asymmetry above is the finding most likely to matter beyond this run: per-sequence cost ranking may differ at other quality tiers, and input-token billing for mini and image-2 should be expected to exceed the documented-tile formula.

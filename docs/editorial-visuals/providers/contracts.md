# Editorial visual provider contracts

Research checked 2026-09-30. V01 remains unqualified. V04 now includes a Node HTTP executor and a trusted Convex route/quote bridge under offline integration testing; no live routes are configured by default. No paid call, credential creation, or publication has occurred.

| Route | Canonical identity | API model ID | Reference generation / local edits |
| --- | --- | --- | --- |
| DigitalOcean | `gpt-image-2` | `openai-gpt-image-2` | Unverified; keep disabled |
| OpenAI | `gpt-image-2` | `gpt-image-2-2026-04-21` | Documented, awaiting actual receipt qualification |
| OpenAI functional check | `gpt-image-1-mini` | `gpt-image-1-mini` | Documented, low quality and low input fidelity; awaiting actual receipt qualification |
| OpenAI bounded functional candidate | `gpt-image-1` | `gpt-image-1` | Named low-fidelity input formula documented; awaiting reviewed total quote and actual receipt |

Historical seed model IDs remain `null`. The direct OpenAI dated snapshot is `gpt-image-2-2026-04-21`. A newer recommended model is a separate selection; this work retains GPT Image 2. [OpenAI model record](https://developers.openai.com/api/docs/models/gpt-image-2), [DO catalogue](https://docs.digitalocean.com/products/inference/details/models/).

## DigitalOcean

The catalogue publishes a 16,384 maximum output-token count and leaves the input context window unpublished. The serverless image contract documents JSON POST `/v1/images/generations` at `https://inference.do-ai.run`, with model, prompt, `n`, quality, size, output format, and optional compression/background/streaming. Its examples and size descriptions still name GPT Image 1. They describe landscape/portrait sizes `1536x1024` and `1024x1536`, PNG/WebP/JPEG, base64 output, possible revised prompt, and an optional usage object. The page contains no image-edit endpoint or ordered image-reference schema. Generic OpenAI compatibility does not establish either capability. [DO serverless reference](https://docs.digitalocean.com/products/inference/reference/api/serverless-inference/).

No requests probe guessed DO `/images/edits`, reference fields, file upload behavior, or remote session state. A future adapter needs the exact provider contract and receipts before enabling them.

## Direct OpenAI

Reference-based new compositions use the Images edits endpoint. Multipart supports ordered `image[]` parts; the current JSON contract also accepts `images` entries with data URLs or uploaded file IDs, up to 16 inputs. Selected-parent bytes come first for edits; identity and style references follow. These are local request context, including after a provider transition. [Images edit API](https://developers.openai.com/api/reference/resources/images/methods/edit).

Use explicit `n=1`, `quality=medium`, `size=1536x1024`, `output_format=png`, `background=opaque`, `stream=false` for the prepared packet. Omit `input_fidelity` for GPT Image 2: the model always uses high fidelity. Custom dimensions obey the documented multiple-of-16, aspect-ratio, pixel, and edge limits; this initial adapter deliberately accepts only the common enumerated sizes pending qualification. Master cropping/export remains downstream. [Image prompting settings](https://developers.openai.com/api/docs/guides/image-prompting), [generation guide](https://developers.openai.com/api/docs/guides/image-generation).

GPT Image output is base64 bytes. The API reference's shared usage type still describes GPT Image 1, while the guide recommends measuring response usage. Treat exact GPT Image 2 usage availability as pending observation. Missing or malformed usage stays `null`, never zero. Retain provider rewrites when available and free of recognized credential material; do not require a rewrite to finish.

## Cost and admission

| USD per million uncached tokens | Text input | Image input | Image output |
| --- | ---: | ---: | ---: |
| DO GPT Image 2 | 5 | 8 | 30 |
| Direct OpenAI GPT Image 2 | 5 | 8 | 30 |
| Direct OpenAI GPT Image 1 Mini | 2 | 2.50 | 8 |
| Direct OpenAI GPT Image 1 | 5 | 10 | 40 |

These are synchronous Standard rates. The previously recorded OpenAI 2.50/4/15 values were Batch rates, caused by flattened pricing tabs; they must not be used for synchronous requests. [DO pricing](https://docs.digitalocean.com/products/inference/details/pricing/), [OpenAI pricing with tab labels](https://developers.openai.com/api/docs/pricing.md), [Mini model pricing](https://developers.openai.com/api/docs/models/gpt-image-1-mini). Cached discounts are not assumed. Mini low-quality 1536×1024 output is listed at about $0.006, excluding inputs; Image 2 medium output is about $0.041. These output estimates are not total billing maxima.

DO's published output ceiling would bound output alone at $0.49152 per image at $30/M; it does not bound total charges. The edit prompt limit is 32,000 characters, not the combined input-token ceiling. Image-input token rules on the vision guide explicitly apply to GPT Image 1; GPT Image 2's precise hard input bound was not found. A UTF-8 byte count of a short text-only prompt is measurable, but assuming a particular tokenizer plus fixed provider rewrite/overhead is not a published billable-input bound. [GPT Image input-token scope](https://developers.openai.com/api/docs/guides/images-vision).

Consequently the pure `quoteVisualProviderCost` has no built-in maximum. The trusted server bridge can admit only a reviewed positive maximum bound to the exact request; no such live packet has been registered yet. The contract accepts a reliable conservative bound including every chargeable input; it does not require a formally published combined context ceiling or exact tokenizer. The coordinator reserves before dispatch in its sole spend ledger, with atomic brand and cumulative provider holds in the runtime. DO/OpenAI caps remain separate and cumulative. Account credits and key presence grant no route authority.

Jake's later instruction sets the qualification order: first a cheaper functional generation and selected-parent edit, then Image 2 output-quality checks. GPT Image 1 low quality/low input fidelity is the prepared bounded functional candidate because its named input-token rules cover the exact references and parent; Mini support remains available but its named input accounting is unresolved. GPT Image 1 low landscape output is about $0.016. All direct calls consume the same original $5 OpenAI allowance. No new billed text experiment, cap reset, or human image approval is granted.

## Pure adapter API

`lib/visualProviders.ts` has no imports, Node runtime, environment access, credentials, default fetch, or retry loop. It is usable from the Convex pure module layer.

- `selectVisualProviderRoute(request, routes)` preserves canonical model identity, prefers DO, checks operation/references/count/size/format, and refuses uncertain prior outcomes. Offline selection accepts only speculative fixtures with no receipts. An operator qualification probe is a distinct trusted mode with no fabricated capability receipts; ordinary live selection requires observed receipts. Neither mode is client authority.
- `await prepareVisualProviderRequest(input, routes)` retains the exact prompt, revision pins, ordered IDs/roles/storage IDs/hashes/bytes, selected parent and feedback. It snapshots and hashes actual bounded bytes with WebCrypto and checks their declared PNG/JPEG/WebP magic. Server storage authorization remains a required trusted boundary; this function cannot prove ownership. Reference roles are identity, style or composition, in the explicit profile order. Edit parents must be first and use edit-parent; generation rejects a parent, and duplicate provenance is rejected. Default edit model continuity is enforced; a human-selected `modelOverride` deliberately permits a model change.
- `executeVisualProviderRequest(prepared)` always returns blocked while the quote is unknown. It has no claim or transport callback contract and invokes nothing, including when legacy callers pass an extra context object. No self-declared offline mode can dispatch.
- `await interpretVisualProviderResponse(prepared, claim, response)` is pure response interpretation without admission, transport, credentials or retries. Tests supply speculative literal responses. It rechecks input byte hashes, all transport settings and the full canonical request SHA256 against the separately retained claim checksum, operation/parent/role/duplicate invariants, rejects forged offline qualification, retains mismatched claim IDs as uncertain, checks a 20 MiB output bound and file magic, and preserves observed usage. Every receipt explicitly says `qualifiesRoute:false`; an interpreted response is not qualification or storage authorization.
- `calculateVisualUsageCost(provider, usage, model)` uses synchronous Standard rates and remains a usage-derived estimate, not an invoice or a maximum.

Receipts include operation/mode/canonical identity, copied article/profile/lesson revision pins, edit feedback SHA256, typed submitted settings and request SHA256, parent model and explicit model override context, attempt/claim/lineage IDs, reserved maximum, prompt SHA256, ordered input SHA256/roles/storage IDs, parent version ID, output SHA256, HTTP status, usage, configured API identity and narrowly accepted provider-reported model/request ID. Live interpretation remains uncertain while the reliable quote is unknown; caller maximum values never grant admission. Unknown usage stays null. Reported model mismatches, non-2xx status, incomplete outputs and invalid bytes remain uncertain. Raw headers, response trees, URLs and errors are omitted. Rewrites containing common credential shapes, URLs or long opaque tokens are omitted; this is a conservative filter, not proof that arbitrary prose contains no private information. A downstream decoder still validates full image structure, dimensions and exported pixels; magic checks are protocol checks only.

`hashVisualProviderRequest` hashes transport, ordered image provenance, attempt/lineage/operation/mode, provider/API/canonical model, parent ID/model, override, revision pins and feedback hash with sorted object keys. It is a content checksum, not authority. Interpreter synchronously snapshots request bytes/metadata and claim values before awaits, and requires a separate durable claim.requestSha256 to match. Empty revision pins and invalid model/feedback lineage are rejected even when a fixture is consistently rehashed. The coordinator must resolve that claim independently from storage; copying a caller's digest into a claim is not validation.

`convex/visualProviderActions.ts` supplies the actual authenticated execution boundary: resolve owned pinned storage bytes, prepare and hash the request, select trusted server metadata, issue a bound quote, atomically reserve and claim, dispatch once through `lib/visualProviderRuntime.ts`, decode/store the returned image and complete the durable attempt. Missing key/quote/contract blocks before HTTP. Ambiguous post-dispatch failures retain holds. The initial operator probe is restricted to its exact attempt, operator and reviewed packet; publication rejects probe provenance even after image approval. Receipt strings and client mode labels cannot qualify routes. These changes require their own independent review; predecessor adapter approval does not cover the new executor.

## Prepared qualification packet

`qualification-packet.json` preserves article 8's selected workshop scene and its untested reconstructed-prompt provenance. Reference 1 is the approved raven sheet; reference 2 is article 4's approved paper/lighting example. Both hashes were checked against the seed. Portable file names and hashes identify assets; local absolute paths remain only in the private seed manifest. The local edit shortens only the adjustment-handwheel grip and explicitly preserves the story. The edit parent remains a placeholder until the generation's actual bytes/hash/storage record exist.

Regenerate locally with `python3 scripts/visual-provider-qualification-packet.py --seed-dir <seed-directory> --output docs/editorial-visuals/providers/qualification-packet.json`. This command has no network or credential access and never writes the spend ledger.

Next: finish the public-action/composer integration proofs, independently review the changed trust boundary, then resolve the narrow live input-charge bound and secure scoped key access. Execute the cheaper functional pair first under the existing cap, reconcile each receipt, then evaluate Image 2 quality with the remaining allowance. Sanitized real receipts replace speculative fixture assumptions. Jake's identity/style/readability/edit-preservation judgment remains separate from engineering qualification.

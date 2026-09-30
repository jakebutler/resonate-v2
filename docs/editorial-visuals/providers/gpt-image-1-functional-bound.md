# GPT Image 1 functional qualification reservation

Reviewed 2026-09-30 19:26 UTC. This is an independent documentation and arithmetic assessment, not executor approval or permission to dispatch. No paid request, account/credential inspection, configuration change, or source/Git mutation was performed.

**Conclusion:** Yes. The explicitly named GPT Image 1 low-fidelity image rule supports a conservative, inexpensive functional generation-plus-edit route with the supplied exact images. Reserve **$0.25 per call, $0.50 for the two-call sequence**, subject to the request guards below and the existing shared ledger having at least $0.50 remaining. This is a conservative engineering maximum for documented billable components under those guards; it is not an OpenAI-enforced spend ceiling or a published combined context limit.

## Sources and scope

- [Images and vision — GPT Image inputs](https://developers.openai.com/api/docs/guides/images-vision#GPT-Image-model-inputs): GPT Image 1 explicitly uses the tile calculation with shortest side 512; low input fidelity costs 65 base image tokens plus 129 per tile. The general procedure first fits within 2048×2048. These rules are named for GPT Image 1, so they are not being transferred to mini or Image 2.
- [GPT Image 1 model record](https://developers.openai.com/api/docs/models/gpt-image-1): uncached input text $5/M tokens, input images $10/M, output images $40/M; low 1536×1024 output is listed at approximately $0.016. Caching discounts are ignored.
- [Image generation — earlier models and costs](https://developers.openai.com/api/docs/guides/image-generation): the prior-model output table specifies 400 output tokens for low-quality 1536×1024; costs include text input, image input, and image output. Streaming partial images add charges. Responses usage can include a separate mainline model, so this assessment uses the direct Images API.
- [Images edit API](https://developers.openai.com/api/reference/resources/images/methods/edit): supports GPT Image 1, multiple image inputs, low fidelity/quality, requested landscape size, one output, and usage details splitting text and image inputs. Use this endpoint for both reference-based creation and the subsequent edit.
- [Counting tokens](https://developers.openai.com/api/docs/guides/token-counting): local tokenization and character heuristics are not complete multimodal request accounting; structural input can add tokens. The documented counting endpoint uses the Responses input format and does not provide a named GPT Image 1 Images-API tokenizer guarantee.
- [Deprecations](https://developers.openai.com/api/docs/deprecations): GPT Image 1 shutdown is scheduled for **October 23, 2026**. It is therefore a temporary functional route as of this assessment; actual account/model availability is unverified. An unavailable model must stop before dispatch, not silently fall back.
- [Current pricing](https://developers.openai.com/api/docs/pricing): its current image table omits this older model. The named model record and earlier-model guide agree on the applicable rates; omission is not evidence of a different price.

## Exact image calculation

Supplied input dimensions are task metadata, not independently decoded here. Execution must verify them against the already approved original bytes. No local resampling or reference replacement is proposed.

| Input | Original dimensions | Dimensions after documented scaling, approximately | 512 tiles | Low-fidelity image tokens |
|---|---:|---:|---:|---:|
| Approved reference 1 | 1448×1086 | 683×512 | 2 | 323 |
| Approved reference 2 | 1672×941 | 910×512 | 2 | 323 |
| Selected generated parent | 1536×1024 | 768×512 | 2 | 323 |

All originals fit the initial 2048 limit. Rounding the scaled long edge up does not change the two-tile result. Creation uses the two references: **646 image-input tokens, $0.00646**. Edit uses the selected parent first and both references: **969 image-input tokens, $0.00969**. The output is 400 tokens × $40/M = **$0.016** each.

## Text assumption and reservation headroom

The supplied original packet prompt is **9,045 UTF-8 bytes**. A deliberately conservative plaintext allowance assumes up to one ordinary text token per UTF-8 byte, giving 9,045 tokens and $0.045225. This is an explicit byte-level tokenizer engineering assumption, not a published GPT Image 1 tokenizer/context guarantee. It avoids the usual English four-characters-per-token heuristic. The actual Images API prompt must be counted as UTF-8 bytes in full, including any edit feedback; image bytes must remain image fields, not textual/base64 prompt material.

For reservation, increase the text allowance to **16,384 tokens** (7,339 beyond the byte allowance), round each image input up from 323 to **512 tokens**, and increase output allowance from 400 to **1,024 tokens**. These are chosen charge allowances, not invented provider limits.

| Reserved documented component | Creation | Edit |
|---|---:|---:|
| Text: 16,384 × $5/M | $0.08192 | $0.08192 |
| Images: 2 or 3 × 512 × $10/M | $0.01024 | $0.01536 |
| Output: 1,024 × $40/M | $0.04096 | $0.04096 |
| Conservative subtotal | **$0.13312** | **$0.13824** |
| Ledger reservation, rounded further up | **$0.25** | **$0.25** |

Using the byte assumption without additional headroom, the documented components total $0.067685 for creation and $0.070915 for edit if each total prompt is at most 9,045 bytes. The $0.25 reservation exceeds the larger padded subtotal by $0.11176. No documented billable component of this guarded direct request remains unpriced. The exact tokenizer mapping and any model-specific envelope token count are not published in the sources consulted; the explicit text and final monetary headroom cover them conservatively rather than claiming a formal bound from absent documentation. Unexpected billed usage must be retained and reconciled; it must not authorize an automatic retry.

## Required execution binding

Pin model `gpt-image-1`, `input_fidelity: low`, `quality: low`, `size: 1536x1024`, `n: 1`, `output_format: png`, and non-streaming direct Images edits. Do not add Responses planning, extra outputs, partial images, masks, automatic quality/fidelity/model selection, or fallback dispatch under this quote.

Before each call, bind the exact prompt, ordered image hashes, decoded dimensions, endpoint, parameters, and request count to the durable approval/quote/reservation. Require total prompt bytes ≤9,045 for this calculation; if edit feedback makes it larger, recompute the text allowance and quote before dispatch. Reject changed/extra images or dimensions. For the second call, verify the exact selected immutable first-call output is 1536×1024 and place that parent first.

The existing contract requires reservation before dispatch, all chargeable usage included, uncertain dispatch retained against its reservation, no blind retries, and cumulative OpenAI spending ≤$5. Preserve prior ledger consumption; the two-call plan fits only when at least $0.50 is actually available. Reconcile returned usage using the published rates and record estimates separately when usage is absent.

This resolves the narrow cheaper-model functional admission question. It neither qualifies Image 2 input accounting nor approves the later quality call, aesthetics, executor behavior, deployment, or publication. Those require their own bound and existing acceptance gates.


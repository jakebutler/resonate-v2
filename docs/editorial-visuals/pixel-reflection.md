# Approved-image pixel reflection

V07 reflection uses the actual selected, human-approved final export pixels together with the exact approved article, full original inputs, ordered immutable version inputs/provider rewrites, and feedback. The public action remains `visualTextActions.executeTextAttempt({attemptId})`; the approval mutation schedules the same trusted executor only for a newly queued reflection after feedback. Initial approvals and duplicate approvals retain their existing behavior.

The Node action resolves the owned current reflection context, reads its exact approved export storage ID, verifies SHA-256 and byte count, and natively decodes one WebP image at exactly 1600×900, below 150,000 bytes. It does not crop, resize, substitute, summarize, or dispatch on missing/corrupt/stale bytes. The Chat Completions user message contains full canonical text context followed by one exact `data:image/webp;base64,...` image with the route's explicit `low` or `high` detail. A decoder verifies the request's actual data URI again immediately before the single HTTP call. Redirects remain errors; ambiguous transport preserves the reservation and cannot automatically retry.

## Trusted admission and accounting

Existing text-only route records remain schema-compatible for planning. They do not qualify reflection. The additive optional `vision` route contract requires:

- `protocol: "chat-completions-image-url"` and exact `detail`;
- positive reviewed `maxImageBytes` below 150,000 and `maxImageInputTokens`;
- `maxRequestBytes` covering the entire serialized text-plus-base64 body, capped at 500,000;
- separate vision `capabilityReceiptIds`, `tokenBoundReceiptId`, and `priceReceiptId`.

These are trusted internal evidence ingestion fields, never public client arguments. A receipt ID or credential by itself supplies no operational qualification: the coordinator must independently review the real fixed provider/model/protocol, 1600×900 WebP support, selected detail, tokenizer bound, prices, and usage schema before ingesting an actual route. There are no newly registered production routes or claimed real model capabilities/prices in this slice. All test records are explicitly fictional contract doubles.

`maxInputTokens` must cover `maxInputBytes + maxMessageOverheadTokens + vision.maxImageInputTokens`, and `contextWindowTokens` must cover that entire input maximum plus `maxOutputTokens`. The reviewed input price must conservatively cover every billable text and image input token; the separate vision price receipt must establish that the provider's aggregate prompt usage includes those billable image tokens. Reservation uses the full input-plus-output maximum. Returned prompt/output tokens settle as estimated usage at the reviewed rates. Text/vision consumes the existing shared brand/month aggregate and never the separately capped image-generation allowance. No text/vision experiment is authorized by image spend caps.

## Exact request proof and compatibility

Queries/mutations cannot read image blobs or natively decode them. They rederive current approval, complete ordered lineage, final presentation, storage metadata/hash and an approved image identity `{storageId,sha256,bytes,width,height,contentType}`. The quote SHA-256 commits to the exact canonical request with only the image data URL replaced by that complete identity. The action verifies the actual bytes against the identity, emits canonical base64, and the dispatcher hashes/decodes those bytes independently before transport. The claim atomically returns the current context and image identity; both must match the prepared quote. This binds the exact immutable bytes without storing base64 in a quote or asking a mutation to trust client-provided pixels. Full contextual text, model, detail, message structure, output schema and token limit remain in the hash. Planning body/hash behavior remains unchanged.

The editorial-visual text/vision executor uses the dedicated server binding `OPENAI_TEXT_API_KEY`; it does not use the image bridge binding `OPENAI_API_KEY`. Existing planning and other chat routes retain their own credential behavior and are outside this executor contract. Cortex retains its existing `CORTEX_API_KEY` behavior, subject to independent text/vision route qualification. No environment or credential change was made by this implementation.

Absent routes, a missing dedicated credential, unsupported vision, or a denied budget leaves reflection queued and preserves human hero approval/publication eligibility. Old reflection records and captured context are not rewritten. Claimed uncertainty and late-receipt settlement retain the existing recovery rules. Successful reflection persists an untested candidate and immutable post-scoped lessons; profile changes remain proposals, and no image reproduction or publication occurs automatically.

Offline evidence: public pixel tracer RED→GREEN, invalid/missing/stale export and text-only route/key guards, whole vision reservation and no retry, duplicate public action one-call proof, metadata/body hash equivalence, and tampered data URI/extra input denial. These checks are implementation evidence, not independent review, provider qualification, human aesthetic approval, or release authorization.

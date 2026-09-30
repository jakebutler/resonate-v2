# Evidence-bound informational figures

This slice implements deterministic, offline figure planning and persisted review for an owned saved Corvo blog post. It makes no provider or research calls. It does not qualify a general text planner, a live deployment, publication, or human aesthetic approval.

## Evidence and opportunity boundary

`attachEvidence` accepts UTF-8 Markdown, plain text, or CSV contents up to 64 KiB. File names and logical keys are bounded and safe; clients cannot attach storage IDs, arbitrary paths, approval provenance, or another post's source. Sources are immutable versions with exact contents, SHA-256, parse errors, and original row/span locators. Replacement changes only the current source pointer; old versions remain readable through an owned-post query. Equal imports reuse the same version. At most 16 attachments can belong to one post.

The current article is snapshotted separately, up to 200,000 UTF-8 bytes. This constrained planner considers explicit tables already in that article. It never adds research, guesses quantities or units, invents causal relationships, or infers chronology from prose. Unsupported or unstructured prose honestly yields zero candidates. `data` attachments are retained for human inspection and do not independently create candidates or supply missing article facts. Attached prose remains readable evidence, but its claims are not automatically converted into diagrams. A broader qualified planner remains an acceptance gap.

Supported table headers are case-insensitive, in the exact listed order. Every cell's original source text is preserved. A final nonblank `citation` column is required for numeric rows and optional for other families. Public attribution uses only these exact citation strings, never internal filenames; diagrams without citations attribute the article’s explicit relations, interactions or dates. Citations do not trigger network requests. Markdown tables must use literal unescaped pipes and terminate at a blank line or EOF. A malformed/nonblank continuation rejects the complete table rather than silently dropping later rows. Cells must be plain exact text: inline Markdown, HTML tags and entities are rejected instead of being interpreted differently from SVG text. Bare carriage returns are unsupported; LF and CRLF remain exact. Diagram citation columns must be all filled or all blank, never partially attributed. Markdown tables must use literal unescaped pipes; indented/fenced code, comments and HTML blocks are excluded conservatively. Fence closers must have the original marker character, at least its run length, and no info string. CSV supports single-line quoted cells and doubled quotes. Multiline quoted CSV and malformed cells produce visible errors.

| Family | Required columns | Validation |
|---|---|---|
| Bars | `label,value,unit,population,denominator,citation` | 2–12 rows, explicit decimal values, unique labels, one exact unit/population/denominator. |
| Lines | `date,value,unit,population,denominator,citation` | Numeric rules plus valid ISO dates in strict source chronology. Horizontal spacing uses the actual date intervals. |
| Flow | `from,to,relation` | Explicit directed relations, 1–12 rows, up to 8 distinct nodes, no repeated relationships. |
| Sequence | `order,from,to,message` | Explicit positive strictly increasing order, up to 6 participants and 12 messages. No automatic sorting. |
| Timeline | `date,event` | 2–12 events with valid ISO dates in strict source chronology. The event list conveys chronological order, not causal relations or proportional elapsed time. |

Numeric denominators must be nonblank. Count or N/A wording is permitted only if explicitly supplied by the source; no denominator is inferred. All supported blog numeric figures additionally require an attached claim-trace table with exactly matching columns and rows. Mixed units, populations, denominators, unsupported series, or an unmatched claim trace block factual rendering. Bound non-article sources require their exact reviewed head ID, hash and revision. Replacing that head invalidates all bound figures and final approval even when the represented facts are unchanged; the editor must explicitly remove and replan/review against the new version. Equal imports still reuse the original head. The supported contract is deliberately narrower than arbitrary historical claim-trace formats.

Each plan contains 0–3 actual candidates across the entire catalogue. Accepted figures consume that shared limit. Reruns preserve inserted figures and omit duplicate representations both against active figures and within the new plan, before applying the shared limit. Semantic edits search all validated source tables by exact representation, including tables beyond the three initial proposals; no automatic insertion or selection occurs. Reasons explain rejected opportunities. Plans, sources, candidate revisions, data/presentation signatures, SVG bytes, SVG hashes, and renderer version persist in additive tables.

## Rendering and current-evidence checks

`FigureSpec` is a constrained five-family specification containing columns, rows, exact article and claim-trace bindings, source-derived title/caption/alt/source note, a strict hex palette, and an explicit insertion anchor. No raw SVG or code is accepted. The fixed `resonate-svg-v3` renderer emits only fixed SVG elements and attributes, XML-escaped text, and bounded numeric geometry. It emits no HTML, CSS, scripts, event attributes, network-active URLs, images, or fonts. The standard SVG namespace is an identifier, not a fetch. Labels use short visible forms with full accessible text; mobile visual quality still needs served-browser review.

`figureSignatures` canonicalizes object keys and preserves all array ordering. The data signature covers family, columns, rows, and exact evidence source IDs/text; the presentation signature covers the data signature, renderer version, presentation, and placement. Original source hashes are stored on immutable source versions. Bindings use UTF-16 code-unit offsets and 1-based rows; archive SHA-256 covers the UTF-8 bytes. Candidate validation verifies original archive hashes and exact span strings, then locates a unique complete parsed table context in current sources and reparses the full table to confirm values, labels, units, populations, denominators, ordering, and relationships. Source spans are locators, not meaning-preservation heuristics. An unrelated copy change can shift offsets without invalidating unchanged represented evidence. Repeated headers or rows in distinct tables are permitted. Ambiguous duplicate complete tables, changed relevant rows, or changed table context fail validation.

SVGs must be embedded as `img` resources, preserving separate document namespaces for their accessibility IDs. The native preview and publication exporter must independently render the bound specification with `figureSignatures`, compare all signatures and SVG/hash/renderer version, and use the newly rendered SVG. Stored or client-supplied SVG alone is insufficient. The backend performs this re-render before acceptance and publication snapshots. The UI integration and publisher re-render are coordinator delivery boundaries.

## Public APIs and article insertion

All public APIs require an owned post plus brand access. Writes allow only owner/editor roles. Guessed source/candidate IDs are resolved only after the owning post is authorized; viewer configuration, attachment, planning, and review writes fail closed.

| API | Result |
|---|---|
| `attachEvidence` / `getSource` | Import/replace exact source version; independently reload an authorized historical version. |
| `planFigures` | `{planId,candidateIds,reasons}` containing actual persisted SVG candidates, up to the shared limit. |
| `getWorkspace` / `getCandidate` | Reload current source heads, latest plan, selected/inserted candidates and review state; inspect immutable historical candidates. |
| `acceptCandidate` | Requires exact candidate ID and expected data/presentation signatures, current evidence, and a unique explicit insertion anchor. Inserts image token, caption, and source note into persisted article content. |
| `declineCandidate` | Declines an unused proposal; article bytes remain unchanged. Inserted figures require explicit removal. |
| `editCandidate` | Requires reviewed signatures; optional rows, palette, or anchor. Semantic row edits must match exact current article/claim-trace evidence. An empty or signature-identical edit returns the selected candidate unchanged without approval/history churn. Palette or data edits create immutable revisions and require a fresh acceptance. Caption/title/alt/source text cannot introduce new claims. |
| `moveFigure` | Requires reviewed signatures and a unique new anchor; creates an immutable placement revision, explicitly moves the selected inserted figure, and clears final approval. |
| `removeFigure` | Explicitly removes the selected inserted block and clears final approval while preserving candidate/source history. |
| `getPublicationFigures` | Current accepted bound SVG/spec/hash/renderer/signatures, stable token, exact post content hash/fingerprint, accepting actor/time, and pinned/current evidence IDs/hashes/revisions. |
| `getReviewHistory` | Up to 64 latest append-only, owned-post review events. Older events remain persisted. |

The stable internal Markdown image URL is `resonate-figure://<candidateId>`. There are no HTML insertion comments. The coordinator rewrites this token to the exported deterministic SVG asset path. The accepted block includes caption and source attribution and must occur exactly once immediately after its unique whole-line (or contiguous whole-lines) approved anchor. Anchors must be outside table/list/code/comment/HTML structures and end before a blank line or EOF. The same exported article structure mask governs parsing and placement, including processing instructions, declarations and CDATA. Acceptance/move validate their own post-insertion placement and every active sibling’s evidence and placement atomically. Removal also validates every active sibling; it may preserve a sibling already quarantined as needs-review when that sibling was already invalid before deleting only the trusted selected envelope. That exception grants no approval and permits several figures invalidated by one source replacement to be removed individually. Shared active anchors and placements that disturb another accepted figure are rejected. Move/remove strip the inserted newline envelope, so an unchanged source article round-trips exactly. A fully manually deleted block/token can be explicitly reinserted or detached without restoring its old bytes; remaining partial/duplicate tokens require explicit article cleanup first. Unknown, duplicate, unapproved, bare, malformed or case-variant internal protocols fail the final gate. `figureArticleTokens` is the shared canonical token parser. Figure prose escapes Markdown block/inline markers and MDX braces/angle brackets; `buildFigureMarkdownBlock(candidateId,spec)` is shared with the publisher, avoiding alt/caption/source divergence. Accepted figure edits, moves, removals, and represented evidence replacement clear final post/intent approval. Declined or unused proposals do not block final approval. New plans supersede their prior unused proposals; declined/removed/superseded states cannot be silently revived by edit or acceptance. Each accept/decline/edit/move/remove/supersede/invalidation records a separate immutable review event with status, candidate signatures, actor (null for automatic invalidation), reason and article hash.

Pure publisher helpers: `assertFigureCurrentArticle(spec,content)` verifies a unique complete current article table with exact binding strings/canonical rows without requiring shifted archived offsets or unavailable trace bytes; original source hash/span auditing remains server-owned. `assertFigureInsertionAnchor(content,anchor)` validates structure/uniqueness and returns the exclusive anchor end. `buildFigureMarkdownBlock` returns the exact literal image/caption/source block. `figureArticleTokens` rejects malformed protocols.

Coordinator hooks: `assertCurrentFigures(ctx,post)` verifies every inserted revision and returns accepted candidate documents; `buildPublicationFigures(ctx,post)` returns deterministic publication envelopes; `onFigureArticleChange(ctx,post,newContent)` invalidates affected figures on article edits. Publishing must call the gate at final approval and again at publication snapshot generation, and call the article-change hook for persisted content edits. Publication envelopes and the full article/title/comment snapshot must be produced in one Convex transaction (the coordinator uses a single publication query). Each envelope includes `postId`, `postContentSha256`, derived `postContentFingerprint`, `acceptedBy`, `acceptedAt`, and `evidenceSources` containing pinned `sourceId/sha256/revision/purpose` plus `currentSourceId/currentSha256/currentRevision`. For live article content not yet archived exactly, current article ID/revision are null and its current hash still equals the exact body hash. Trace current versions are resolved, owned and hash verified. Export must independently verify the body hash against the same exact snapshot. No external publication is performed by these APIs.

## Offline receipts and remaining boundaries

| Behavior | RED | GREEN |
|---|---|---|
| Honest zero unsupported prose | 03:47:24 missing library | 03:48:44 one test |
| Exact numeric article/claim-trace candidate | 03:49:31 returned zero | 03:52:03 two tests |
| Combined catalogue and explicit order | 03:52:58 returned zero | 03:53:50 three tests |
| Safe deterministic rendering/current evidence | 03:55:11 validator absent | 03:58:37 four tests |
| Immutable owned sources/reload/auth | 03:59:58 missing backend | 04:01:14 public test |
| Actual persisted SVG proposals | 04:03:04 planner absent | 04:05:03 two public tests |
| Explicit accept/decline/insertion | 04:06:40 review absent; canonical serialization repaired | 04:10:41 seven combined tests |
| Represented source edits clear approval | 04:12:19 post still approved | 04:13:44 eight combined tests |
| Immutable edit/move/remove history | 04:15:50 editor absent | 04:18:32 nine combined tests |
| Fenced examples cannot become diagrams | 04:20:31 fabricated opportunity from code example | 04:21:05 ten combined tests |
| Explicit numeric denominator required | 04:21:56 missing denominator rendered | 04:21:57 narrow test passed |
| Rerun preserves accepted/omits duplicate | 04:23:40 repeated bars proposed | 04:23:41 narrow test passed |
| Reload edited unused proposal | 04:28:37 superseded original resurfaced | 04:28:38 thirteen combined tests passed |

At 04:21:05 all ten then-existing tests passed. Scoped ESLint and the repository production typecheck passed. These tests use offline Convex fixtures and never call a provider, publish, deploy, or modify image masters. Final complete-slice receipts follow after UI wiring.

At 04:28:38 all thirteen backend/library tests passed, including selected revision reload, all five constrained families, explicit source denominators, and accepted representation preservation on rerun. Source/figure state indexes remain bounded, including `by_root_candidate` for selected edit history. No vectors are stored in `_storage`, so no figure storage URL bypass is introduced.

V09–V12 remain incomplete until the canonical saved composer, native SVG preview, attachment errors/reload, review controls, independent publisher re-render/token rewrite, final approval integration, served-browser desktop/mobile rendering, and export round-trip are verified. Human aesthetic/readability judgment, live deployment behavior, and generalized unstructured claim-trace/planner inference remain unqualified. Zero candidates for unsupported prose is intentional.

## Static review repair receipts (2026-09-30 local time)

| Behavior | RED | GREEN |
|---|---|---|
| Manual block deletion recovery | 04:51:01 previous block lookup threw | 04:51:40 public recovery test |
| Self/sibling/partial-line placement | 04:52:30 unsafe acceptance resolved | 04:53:22 two placement/recovery tests |
| Indented/comments/HTML/fence examples | 04:54:01 fabricated opportunity | 04:54:49 parser test |
| Repeated headers / limit after validation | 04:55:31 valid table deemed ambiguous | 04:56:18 seventeen combined tests |
| Explicit public numeric source | 04:56:52 missing citation rendered | 04:58:16 eighteen combined tests; malformed fixture delimiter corrected |
| Exact snapshot/provenance manifest | 04:59:34 proof fields absent | 05:00:51 public manifest test |
| Superseded proposal / immutable decisions | 05:02:08 prior proposal remained acceptable | 05:03:56 public history test |
| Unicode-safe visible labels | 05:04:44 lone surrogate in SVG | 05:04:58 renderer test |

At 05:05:55 all 22 library/backend tests passed offline. Added coverage includes owned/foreign/viewer API access, unknown and duplicate tokens, represented article edits through publishing, source provenance, exact remove round-trip, and immutable decision history. Scoped ESLint passed with zero warnings at 05:06. The exact model R1 static review required these repairs; repaired hashes require a fresh integrated review. These receipts qualify implemented behavior only, not live deployment, aesthetic review, or publication.

## Second-review and publication alignment receipts

| Behavior | RED | GREEN |
|---|---|---|
| F1 full table rejection on unsupported continuation | 05:22:12 public planner silently truncated rows | 05:22:25 public malformed-middle-row test |
| F2 structural anchors / current sibling evidence | 05:25:17 unsafe row anchor accepted | 05:27:55 public atomic placement/evidence test |
| F3 complete diagram citations | 05:28:32 partial attribution accepted | 05:28:47 three-family citation test |
| F4 plain-cell truth | 05:31:06 HTML cell became literal SVG fact | 05:31:44 markup/control/escaping tests |
| F4 literal source-derived caption blocks | 05:32:18 tilde population broke body parse | 05:32:31 six block-marker public cases |
| F5 no-op edit preserves approval/history | 05:33:30 duplicate revision created | 05:33:44 public no-op test |
| F9 dedupe and all-table semantic edits | 05:35:32 duplicate formatting consumed slot | 05:35:57 public fourth-table edit test |
| Publication strict reviewed source revision | 05:40:41 equivalent new trace stayed approved | 05:42:23 public two-figure invalidation/recovery test |
| Publication malformed protocol consistency | 05:43:14 bare token passed | 05:43:55 public protocol variants test |

At 05:46:01 all 42 owned library/backend/UI tests passed offline (14 library, 19 backend, 9 UI). F7 processing-instruction/declaration/CDATA exclusions and shared current-body/MDX block proof are covered. F8 exact source body retention is coordinator-owned and confirmed in the snapshot/publication proof contract; no automatic source archive or approval migration occurs here. Code-point truncation retains full accessible text; advanced grapheme-aware shortening remains optional and unqualified. The repaired static review must be re-run against new hashes; tests do not establish aesthetic or live qualification.

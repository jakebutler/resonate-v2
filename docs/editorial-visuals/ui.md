# Saved-post editorial visual panel

`components/EditorialVisualPanel.tsx` exports `EditorialVisualPanel({ postId, brandId, savedContentChanged?, savedPostContext? })`. `savedPostContext` is the actual saved `{ title, blogSlug?, channelId }`, supplied by the composer; it is used only to gate the exact article-7 exception controls. The coordinator mounts the panel inside the existing saved post composer. Its inner component is keyed by brand and post so a composer change cannot carry another post's local instructions, feedback, review, error or operation keys.

## Server source of truth and explicit actions

The panel subscribes through the actual `convex/react` hooks to `visualWorkflow.get`, `visualProfiles.getProfile`, and, for Corvo, `visualProfiles.getSeedStatus`. It never schedules a mutation/action in an effect. Durable queued, running or uncertain image/planning attempts prevent another request; reflection activity does not prevent working on a new candidate. A synchronous in-flight guard prevents double clicks. Each explicit plan, generation or edit creates a `crypto.randomUUID()` operation key; a rejected save retains that key for the same inputs. Successful saves wait for durable query state. Reloaded activity comes from Convex.

| Interaction | API | Reviewed or pinned context |
| --- | --- | --- |
| Plan visuals | `visualWorkflow.requestPlan` | Saved post and operation key |
| Select or refine scene | `visualWorkflow.selectScene` | Plan ID, scene index, optional complete seven-field scene |
| Generate this concept | `visualWorkflow.requestGeneration` | Post, operation key, exact viewed article signature, plan ID, scene index and refined-scene signature, optional additional production instructions, separate model/provider overrides |
| Select image version | `visualWorkflow.selectVersion` | Post and immutable version ID |
| Edit selected version | `visualWorkflow.requestEdit` | The same viewed article/scene CAS fields plus `expectedParentVersionId`, explicit feedback and optional separate model/provider overrides; blank overrides keep the parent route |
| Prepare final hero crop | `visualExports.prepareHero` | Selected version and optional in-bounds integer source-pixel rectangle; new versions default to proportional center crop |
| Approve hero | `visualWorkflow.approveHero` | Selected version, descriptive human alt text, exact stored export hash, `stableInputSignature(exportMetadata)`, current loaded article signature |
| Confirm relevance | `visualWorkflow.confirmRelevance` | Selected version and current loaded article signature |
| Cancel queued request | `visualWorkflow.cancelQueuedAttempt` | Durable queued attempt ID; never offered for running/uncertain attempts |
| Save owner budget | `visualWorkflow.setMonthlyBudget` | Explicit nonnegative USD input converted exactly to integer micros |
| Save brand visual profile | `visualProfiles.saveRevision` | Draft-base revision CAS, all guidance, ordered reference bindings and exact unchanged route; intentional provider/model changes start unqualified |
| Upload reference | `visualProfiles.uploadReference` | Explicit selected PNG/JPEG/WebP, file metadata, bytes; result `{ referenceId }` is bound only by a subsequent profile save |
| Read applicable article-7 exception | `visualProfiles.resolveForPost` | Owned saved post; subscribed only when supplied saved context matches the exact Corvo article-7 title, slug and blog channel |
| Apply approved article-7 exception | `visualProfiles.applyCorvoArticle7Exception` | Explicit human action, imported seed, post, current exception CAS and viewed saved title/slug/channel; backend rechecks that exact context and unique exact slug |
| Save authored article-7 guidance | `visualProfiles.setPostException` | Post, current exception CAS, viewed saved title/slug/channel and explicit bounded authored guidance |

Three full scene cards render only for a complete plan with exactly three nonempty scenes. Subject, metaphor, visible action, reveal, article connection and exact article passage remain visible. Refine saves all scene fields. Selecting/refining waits for matching saved query state before generation; a dirty scene draft disables generation. An unmatched scene selection expires after ten seconds even if another session supersedes its target before the exact readback renders. Version changes also wait for saved selection before edit, relevance confirmation or hero approval, with the same ten-second expiry if the exact version receipt never renders. Each recovery notice asks the user to reload and inspect the current saved selection before acting again; its timer releases only the local selection wait and never retries a mutation. Local profile drafts remain intact. A subsequent explicit request still pins the currently viewed article, scene and edit-parent CAS fields. Selection markers clear as soon as their matching readback arrives; a later plan or server-side version selection cannot reactivate an old marker. Matched receipts cancel their recovery timers, and a still-running mutation retains its independent in-flight guard.

The inspector keeps production instructions, model and provider separate. It displays the selected version's actual submitted prompt and a selected scene preview. Production instructions are appended by the backend to the saved scene and pinned guidance. Both generation and edit send `expectedArticleSignature`, `expectedPlanId`, `expectedSceneIndex`, and `expectedRefinedSceneSignature = stableInputSignature(state.refinedScene ?? null)`; edit also sends the displayed `expectedParentVersionId`. All these fields participate in the operation-key signature. The backend rejects a concurrent change rather than choosing a different scene or parent for the human.

New planning, generation and edit controls are disabled for every current production route, including a missing route, because no production qualification setter or reliable maximum exists. This prevents planning from creating a new required hero state for a post that cannot generate one. The sole exception is an explicitly configured local offline rehearsal: the existing `localFixtureTokenUrl` gate must accept development runtime, `NEXT_PUBLIC_E2E_BYPASS_AUTH=1`, exact local Convex `http://127.0.0.1:3210`, exact token URL `http://127.0.0.1:3969/token`, and no Vercel environment; the brand route and effective image route/overrides must each use provider and model `offline-fixture`. Selecting an OpenAI/DO override leaves the image request disabled and explains qualification pending. Existing version selection, crop export, relevance, human review and queued cancellation retain their own saved-state checks and remain available independently of route qualification. The UI gate never grants quote or dispatch authority; the backend owns reference provenance, routing, capability checks, reservations, claims and dispatch.

## Stored bytes and human review

Source and final export previews use only authorized `url`/`exportUrl` projections from `visualWorkflow.get`. The action's returned temporary result is not used as an approval preview. A native image renders the stored asset directly, avoiding a second image optimizer rendition. Approval requires stored metadata of exactly 1600 × 900, format `webp`, a positive integer byte count below 150,000, the actual export image to load, human alt text of 5–1000 characters and an explicit review checkbox. The summary displays the actual stored format and exact byte count. Noncompliant exports show an explanation and cannot be approved. The review component resets when version, export hash, URL, export metadata or loaded article signature changes. An image load failure or rejected preparation disables approval.

The approval payload binds the byte hash, crop/presentation metadata and current loaded article. A changed crop with identical bytes still clears local review and sends a new metadata signature. Relevance warnings show the server's reason and require a separate explicit confirmation. Unsaved article edits disable visual requests and approval. Human approval in these tests is a mocked interaction; no real asset was approved.

Manual crop controls display the actual source dimensions and accept whole-pixel left/top/width/height with positive size and all edges inside the source. A rectangle draft that differs from the stored export disables approval until its matching presentation is prepared and reviewed. The export action remains authoritative for source decoding, orientation, immutable source hash, crop bounds and output bytes. The rectangle is proportionally resized with center cover to the final 16:9 format; it never stretches the source.

Profile setup supports art direction, named hex palette, mascot/composition/text/chart guidance, ordered identity/style/composition reference bindings, explicit reference uploads, and separate configured provider/model. Move-up/down, role and remove-binding controls edit the local ordered draft, which is persisted only by an explicit revision save. Removing a binding retains the owned uploaded reference record. Backend permissions enforce owner-only route and budget changes. Empty profiles start with empty guidance and no invented palette or dollar default. Corvo archive status reflects only returned verified/imported facts; historical model identity stays unknown. Reflection candidates are shown as untested and profile proposals await human review. The reflection view explicitly states that its advice grants no human approval.

Profile and exception editors stay mounted on an external revision change. Their guidance, ordered bindings and uploaded-but-unbound reference names remain in the local draft; a conflict notice blocks further writes until the user explicitly reloads. Reload replaces the local draft with the currently saved revision and clears only local binding/upload selections, never an owned stored reference. The exact mutation-returned revision identity allows an own-save readback to advance the CAS base without a false external conflict. A waiting own-save receipt also offers an explicit reload control for inspection.

Current profile validators permit only `qualification: "unqualified"` and require a route value on every save. Therefore guidance-only saves send the exact unchanged stored route; deliberately changed provider/model values create a new unqualified route. The banner displays the actual stored qualification. Supporting future qualified revisions with guidance-only route omission requires a reviewed backend validator/API migration and a real qualification setter; the UI does not invent either.

The exact article-7 editor shows the saved title, slug and channel; it appears only for `What Corvo Labs learned building an AI editorial workflow`, `what-corvo-labs-learned-building-an-ai-editorial-workflow`, Corvo and `corvo-blog`. Approved photographic-hand application requires actual imported status and an explicit click. Both clicked writes include `expectedPostContext` with the viewed saved title/slug/channel, allowing the backend to reject concurrent association changes. Authored guidance is a separate explicit post-specific revision whose provenance remains authored. Unsaved article changes disable both writes. No archival exception is silently applied to another post.

The archive panel provides the existing guarded CLI commands because approved local master bytes are absent from the served bundle. The first command is dry-run verification of every fixed manifest hash; applying requires an explicit destination and authenticated JWT through `RESONATE_VISUAL_IMPORT_TOKEN` in the command environment. No token value is shown or passed through CLI arguments, and no command is automatically executed by the UI. Operators inspect saved status before retrying.

## Behavioral TDD evidence

All tests replace Convex hook boundaries with inert doubles; they make no provider, storage or network calls. Each row was one failing public behavior followed by its minimum passing implementation, before proceeding to the next row. Times are Vitest local start receipts on 2026-09-30.

| Behavior | RED | GREEN |
| --- | --- | --- |
| Explicit planning and UUID | 03:10:35 | 03:11:39 |
| Duplicate clicks, reload pending state and unsaved edits | 03:37:16 | 03:37:54 |
| Rejected save retries same key; successful save waits | 03:38:32 | 03:39:03 |
| Exactly three complete cards and persistent selection | 03:40:10 | 03:41:09 |
| Full refinement before explicit generation; distinct inspector fields | 03:42:05 | 03:43:33 |
| Version selection and explicit parent edit | 03:44:24 | 03:46:09 |
| Durable activity, spend/reservation/limit and queued cancellation | 03:47:11 | 03:48:15 |
| Stored export preview and exact human approval | 03:58:42 | 03:59:51 |
| Explicit article relevance confirmation | 04:00:33 | 04:00:55 |
| Profile revision CAS and ordered reference preservation | 04:02:02 | 04:03:37 |
| Explicit upload and empty profile setup | 04:04:46 | 04:06:06 |
| Actual archive status and explicit budget | 04:07:08 | 04:08:11 |
| Exact export metadata signature and same-hash changed-crop reset | 04:25:32 | 04:26:12 |
| Await saved scene selection before generation | 04:27:12 | 04:28:03 |
| Reset local state when switching saved posts | 04:28:40 | 04:28:54 |
| Submitted parent prompt and deliberate edit route override | 04:29:33 | 04:30:07 |
| Untested reflection candidate and human profile proposals | 04:31:31 | 04:31:58 |
| Manual crop bounds and review of matching saved presentation | 04:39:08 | 04:40:56 |
| Explicit reference reorder, role and binding removal | 04:41:37 | 04:42:28 |
| Guarded local verification and authenticated seed import guidance | 04:43:36 | 04:44:06 |
| Exact saved article-7 exception controls and revision CAS | 04:46:51 | 04:48:01 |
| Viewed saved-title/slug/channel pin on both exception writes | 04:51:09 | 04:51:49 |

The review repair cycles below use UTC times on 2026-09-30 (subtract seven hours for the local Vitest start times). Each failing behavioral test was followed by its minimum passing repair before the next cycle.

| Review repair | RED | GREEN |
| --- | --- | --- |
| F2: one-shot scene selection readback before later plan | 12:46:58 | 12:47:22 |
| F2: one-shot version selection readback before server auto-selection | 12:53:18 | 12:53:32 |
| F3: exact viewed article/scene/refinement/parent CAS | 12:54:11 | 12:55:05 |
| F6: compliant hero metadata, actual format and exact bytes | 12:56:41 | 12:57:07 |
| F8: preserve profile draft across external revision | 12:58:48 | 13:00:16 |
| F8: preserve exception draft across external revision | 13:01:01 | 13:02:35 |
| Production unqualified/missing-route request entry gate | 13:04:45 | 13:06:13 |
| UI-R2-F1: skipped exact scene readback, bounded expiry, preserved draft and current viewed CAS | 13:46:02 | 13:46:40 |
| Reflection explicitly grants no human approval | 13:47:00 | 13:47:20 |
| UI-R2-F1: skipped exact version readback, bounded expiry and current viewed edit-parent CAS | 13:50:06 | 13:50:36 |

Additional targeted regressions passed for exact fixture overrides, uncertain outcomes with no cancellation, image preview errors, alt bounds, export rejection, own-save profile acknowledgement, uploaded-but-unbound draft retention, invalid upload type/size and the eight-binding cap, failed uploads with no automatic retry, and invalid budgets. F9 is handled within the current unqualified-only schema as described above; a hypothetical qualified row is not fabricated to bypass that validator.

The preceding UI candidate passed all 88 tests at 13:27:38 UTC: 37 hero tests, 15 figure tests and 36 composer tests. The coordinator corrected the separate PR-status assertion to match the current payload containing `postId`; the old figure receipt-union type error is resolved.

The independent Sol xhigh `ui-sol-r2/review.json` receipt returned `CHANGES_REQUIRED` for UI-R2-F1, proving a skipped exact scene readback could leave the selection wait indefinitely active. The bounded repair above covers both scene and version receipts. At 13:51:28 UTC, the current hero suite passed all 39 tests; the parallel scoped hero ESLint and declared `npm run typecheck` (`tsconfig.typecheck.json`) also exited successfully. The earlier three-suite receipt predates this repair. Current exact-hash independent review remains the coordinator's next step. These checks and reflection advice grant no paid qualification or human approval.

## Remaining boundaries

The UI supports numeric source-pixel crop selection, with no drag-to-crop overlay. Fixed-manifest archive import remains a guarded local CLI with status and exact command instructions. Reference thumbnail inspection is not included. Profile proposals can be reviewed and manually entered in the guidance editor; they are never applied automatically.

`resolveForPost` omits a stale seeded exception after its saved association changes, so the UI cannot safely discover that excluded latest exception's CAS ID to overwrite it. This existing API limitation was reported to the coordinator; the panel fails the mutation rather than guessing an ID or fabricating context authority. The prior concurrent-context limitation was closed by the coordinator's `expectedPostContext` API addition and consumed by both panel writes.

The coordinator still owns served-browser verification, exact independent review, publication/export integration and release checks. Current production planning, generation and edit entry points remain disabled behind unqualified routes and conservative cost admission. Real hero quality, crop readability, descriptive alt text and final approval remain human decisions. These offline tests grant no live dispatch, human approval or release authority.

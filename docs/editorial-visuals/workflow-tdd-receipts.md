# Workflow RED/GREEN receipts

All runs were local/offline in the managed coordinator worktree. Commands used zero paid requests. Tests exercise public mutations/queries with internal trusted provider doubles for receipts and storage completion. Fixtures are labeled offline, and user approvals are simulated authenticated test actions only.

Each row was introduced as one failing behavior, then implemented before adding the next behavior. `npx vitest run convex/__tests__/visualWorkflow.test.ts` was the repeated targeted command; library behaviors used `npx vitest run lib/__tests__/visualWorkflow.test.ts`.

| Time (2026-09-30 PDT) | Behavior | RED receipt | GREEN receipt |
|---|---|---|---|
| 02:40:58 / 02:41:25 | Ownership/brand planning | Missing visualWorkflow module, expected Post not found | 1/1 passed |
| 02:41:59 / 02:42:29 | Three article-bound distinct scenes | Missing validator module | Both suites 2/2 passed |
| 02:45:04 / 02:45:39 | Conservative article-change classification | classifyArticleChange is not a function | Library 2/2 passed |
| 02:46:30 / 02:48:34 | Durable planning/idempotency | Missing get query | Planning/idempotency passed before next budget RED |
| 02:48:34 / 02:50:21 | Atomic monthly reservation, claim once, uncertainty | Missing setMonthlyBudget | Convex 3/3 passed |
| 02:51:30 / 02:52:58 | Complete/incomplete plan and selected refinement | Missing completePlan | Convex 4/4 passed |
| 02:54:23 / 02:57:05 | Stored images and correct selected edit parent/model | Missing requestGeneration, then storage fixture content-type mismatch | Both suites 7/7 passed; typecheck passed |
| 02:59:22 / 03:01:30 | Prepared export approval/relevance | Missing approveHero | Both suites 8/8 passed; typecheck passed |
| 03:03:09 / 03:04:26 | Reflection trigger/idempotency/budget deferral | Expected one reflection, received zero | Convex 7/7 passed |
| 03:05:31 / 03:09:13 | Reflection persistence/scoped retrieval | Missing completeReflection, then unresolved lessons empty | Both suites 10/10 passed after profile worker wired retrieval |
| 03:10:08 / 03:10:52 | Stale crop preview hash | Unexpected expectedExportHash validator field | Both suites 11/11 passed |
| 03:11:15 / 03:11:42 | First plan enters final approval gate | Expected non-null visual state, received null | Convex 10/10 passed |
| 03:12:42 / 03:13:17 | Selected asset/alt clears final approval | Approval remained approved after changed alt | Both suites 13/13 passed; typecheck passed |
| 03:15:58 / 03:16:28 | Queued cancellation/uncertainty retention | Missing cancelQueuedAttempt | Convex 12/12 passed |
| 03:17:12 / 03:20:56 | Actual prompt includes pinned guidance | Prompt lacked Narrative raven scenes | Both suites 15/15 passed; typecheck passed |
| 03:22:28 / 03:23:05 | Edit model scope | Old model-specific lesson remained in prompt | Convex 14/14 passed |
| 03:23:28 / 03:23:43 | Edit after explicit relevance confirmation | Edit still rejected after confirmation | Both suites 17/17 passed; typecheck passed |
| 03:25:22 / 03:26:05 | Reviewed relevance context | Unexpected expectedArticleSignature validator field | Convex 16/16 passed |
| 03:26:31 / 03:26:55 | Reviewed article context at asset approval | Unexpected expectedArticleSignature validator field | Both suites 19/19 passed; scoped lint and typecheck passed |

Some early tracer RED receipts are missing interfaces rather than a later behavioral regression. The meaningful assertion failures (duplicate stories, reflection absence, final approval preservation, missing guidance/model leakage, and confirmation blocking) are retained above. Convex-test 0.0.53 uses base64 storage digests and omits storage content type; live Convex uses hex digests/optional content type. Storage verification handles the documented optional field and both equivalent digest encodings.

Last verified commands at 03:26:55:

```sh
npx vitest run convex/__tests__/visualWorkflow.test.ts lib/__tests__/visualWorkflow.test.ts
npx eslint convex/visualWorkflow.ts convex/visualWorkflowTables.ts convex/__tests__/visualWorkflow.test.ts lib/visualWorkflow.ts lib/__tests__/visualWorkflow.test.ts
npm run typecheck
```

Results: 19 tests passed, scoped lint without warnings/errors, full configured typecheck passed. The coordinator owns broader validation, independent review, local Convex push receipts, publication export optimization, UI/browser verification, and all release side effects.

## Independent-review repair receipts

The first exact-code Opus review requested changes. Each behavior below was introduced as one public-interface failure before its minimal implementation. Test-fixture setup/return-validator mistakes were corrected before counting a meaningful RED.

| RED / GREEN (2026-09-30 PDT) | Behavioral assertion failure | Result |
|---|---|---|
| 03:45:17 / 03:45:57 | New planning action key admitted after uncertain planning | Running/uncertain stage guard |
| 03:46:50 / 03:47:11 | Model-requested broad lesson retrieved by another post | All reflected lessons default to exact post |
| 03:47:44 / 03:48:07 | Identical export rerun changed reviewed storage object | Retained original export ID and approval |
| 03:53:50 / 03:55:42 | Free-form asserted pricing provenance admitted | Stored exact-input-bound quote only; live fail closed |
| 03:56:52 / 03:57:28 | Stale reflection claimed | Pre-dispatch cancellation and reservation release |
| 03:57:53 / 03:58:12 | Late stale charged reflection threw away reconciliation | Failed charged outcome retained; no lessons |
| 03:58:51 / 03:59:23 | Published post planning silently reset lifecycle | Separate publishing transition required |
| 03:59:52 / 04:00:26 | Four older approved intents survived newest-ten invalidation | All approved intents atomically cleared and audited |
| 04:01:09 / 04:01:48 | Emoji input passed character limit despite oversized UTF-8 serialization | Input/document byte bounds |
| 04:02:32 / 04:04:17 | Long feedback reflection rolled back valid hero approval | Durable bounded input and full-context deferral |
| 04:05:43 / 04:06:38 | Admission continued after charged cost exceeded reserved maximum | Honest overrun ledger and owner review gate |
| 04:08:12 / 04:09:06 | Changed owned reference hash dispatched | Exact pin/ordered bytes rechecked before claim |
| 04:09:26 / 04:10:01 | Markdown paragraph/heading merges classified as spelling edits | Newline structure preserved |
| 04:10:21 / 04:10:55 | Oversized refinement persisted | Scene field/envelope bounds |
| 04:11:40 / 04:12:07 | Already-bound raw blob reused for another completion | Existing asset ownership denied |
| 04:13:32 / 04:13:46 | Actual planning prompt omitted current lesson key/revision/scope | Explicit current guidance projection; poison archived evidence excluded |
| 04:17:05 / 04:17:35 | Exact reviewed article collapsed into normalized signature | Exact review and relevance signatures separated |
| 04:19:15 / 04:20:39 | Changed same-hash crop caused reflection key/input collision | Exact export/presentation/article lineage idempotency |
| 04:22:57 / 04:23:30 | Same-hash stale presentation approved | Required reviewed metadata signature |
| 04:25:51 / 04:26:52 | Snapshot returned 13 potentially large versions | Bounded snapshot and ten-version history pagination |
| 04:29:24 / 04:31:27 | Code identifier rename classified as spelling correction | Code context receives conservative review |
| 04:32:49 / 04:33:12 | Large legacy lineage traversed beyond safe read frontier | Durable read-limit deferral and continuation parent |

Additional regression coverage verifies uncertain reflection reservations survive a newly approved lineage and fabricated stored live qualification remains rejected. These were tests of already implemented guards, not claimed new RED/GREEN cycles.

Final frozen verification at 04:33:12–04:33:21: **43 tests passed** (39 Convex public-interface tests plus four pure library tests), scoped ESLint had zero warnings/errors, full `tsconfig.typecheck.json` typecheck passed. No paid request, worker database mutation, publication, commit, push, or deployment occurred.

Frozen SHA-256:

```text
a1abdbe365ce51b7cf593e7ae6b16b1d2e77274e55c1b44743d78dd845746cd7  convex/visualWorkflow.ts
78f5bd2ad2120aaac8f0329fd0179c2eab4b9925ff419bd1f01a2e7969719310  convex/visualWorkflowTables.ts
8a0bb5cd58759e4a481d5d659e1b48f0847169ca99f8736b450f56c6d0b38d3d  convex/__tests__/visualWorkflow.test.ts
575d63fe1ffc33c45f1d19bfdbbc65861ce7746a1afad8147b0d40d8a3c78f89  lib/visualWorkflow.ts
737c58e0f17bc1ad707a172f3c7be44930b9f68a80386efa7907fe9b1d9a46c7  lib/__tests__/visualWorkflow.test.ts
```


## Second-review repairs and R3 freeze

The second exact-code Opus review requested changes in failure-path reconciliation and freshness. Ordinary tests remain in-process/offline with no paid requests or worker database writes. The fixture quote gate has no NODE_ENV bypass; test-cost quotes are separately labeled offline-contract, inserted through the trusted test boundary only, and rejected whenever deployed system URLs are present.

| RED / GREEN (2026-09-30 PDT) | Behavioral RED | Repair |
|---|---|---|
| 04:44:39 / 04:46:08 | NODE_ENV=test admitted a nonlocal/nonfictional/nonzero fixture quote | Every exact loopback/actor/provider/model/zero clause is required |
| 04:47:32 / 04:48:37 | Reserved work threw after viewer downgrade/removal/publication/context change | Pre-dispatch cancellation releases reservation and active image slot |
| 04:50:14 / 04:50:42 | Brand owner could not cancel another author's undispatched published-post reservation | Release-only owner recovery preserves article lifecycle |
| 04:51:57 / 04:53:03 | Missing owner uncertain reconciliation API | Exact state-bound owner attestation records usage/audit without claimKey or redispatch |
| 04:59:06 / 04:59:37 | Charged completion threw on >512 approved intents | Cost and output retained; selection deferred, single bounded intent read |
| 05:00:11 / 05:00:43 | Stale-cancelled reflection suppressed identical reapproval forever | Only queued/running/uncertain/completed reflection deduplicates |
| 05:01:26 / 05:01:44 | Internal export helper accepted spoofed actor argument | Native-action identity rederived; publication includes approval actor/time |
| 05:02:42 / 05:04:31 | Legacy missing/truncated/root-mismatched/byte-mismatched reflection admitted | Complete bounded context checked before reserve/claim and returned atomically with claim |
| 05:06:38 / 05:07:05 | Late edit replaced a newer explicit version selection | Queue-time selected parent checked before auto-selection |
| 05:08:08 / 05:08:40 | Legacy reserved edit claimed during active generation | Shared image lane plus exact active attempt required |
| 05:09:03 / 05:09:15 | Link target/URL/HTML typo normalized into copy-edit | Exact markup/URL guard |
| 05:10:01 / 05:10:55 | Original author instructions and earlier feedback disappeared from edits | Immutable root directions and ordered feedback retained |
| 05:15:01 / 05:15:47 | Read-limit deferral exposed a foreign lineage cursor | Ownership checked before continuation-bound classification |
| 05:18:22 / 05:18:49 | Another actor's unbound uploaded blob became a completed output | Registered upload owner/brand checked; existing cost reconciles independently |

The initial 04:58:48 charged-completion run exposed an invalid test fixture (missing publishing-intent contentFingerprint), corrected before the meaningful 04:59:06 RED. Additional GREEN-only regression coverage verifies duplicate completePlan/completeImage/failAttempt receipts reject changed outcomes and settle once, completeImage/failAttempt reconcile uncertain attempts, copy edits cancel exact-context planning/generation/edit reservations, all 129 approved intents invalidate atomically, and reflection context includes exact presentation and alt. These existing-behavior coverage additions are not claimed as new RED cycles.

The oversized aggregate-reflection regression uses twelve bounded individual feedback rounds. Preserving ordered feedback means a request exceeding the 200,000-byte input limit rejects before it enters the workflow; a valid selected hero's oversized aggregate reflection remains durably deferred without rolling back approval.

R3 freeze verification at **05:19:56–05:20 PDT**: **60 tests passed** (54 Convex public-interface tests plus six pure library tests), scoped ESLint had zero warnings/errors, full `tsconfig.typecheck.json` typecheck passed. Commands match the previously recorded workflow test/lint/typecheck commands. No paid call, worker database mutation, publication, deployment, commit, or push occurred.

Frozen R3 SHA-256 (replaces the earlier R2 candidate hashes):

```text
79972e8a902310d0ebc04974432e9e403e9eeb3764405c2d1e313b365a4bb241  convex/visualWorkflow.ts
0ff48cd2b98333e3c4848fe54e2c0b3ca7b4f6a0da659b6b13add223cc1f4dee  convex/visualWorkflowTables.ts
b891afa06ecbcb39537fc28edd98dc1818fb62bf8d8ece6c38f9673fd68b3276  convex/__tests__/visualWorkflow.test.ts
2f959a020eba32760ff48f9b9e6d908c7b7fb3f7a603096c7e5b09c9c2843906  lib/visualWorkflow.ts
1812325f2922ce0a27af2ad2392c697756944d07033790a54c01b3cfa8225c32  lib/__tests__/visualWorkflow.test.ts
```

Code and tests remain frozen pending the coordinator's exact-code R3 review. This local verification grants no release, provider, publication, or human aesthetic qualification.

## Third-review repairs and R4 freeze

The exact Opus 5.5 R3 receipt requested changes for orphaned running work, stale alt at reflection completion, late usage after owner attestation, image selection races, and oversized reflection inputs. Each new behavior below had a meaningful failing assertion before its repair. Tests remain ordinary offline Convex-test calls with no paid requests or worker database writes.

| RED / GREEN (2026-09-30 PDT) | Behavioral RED | Repair |
|---|---|---|
| 05:34:23 / 05:35:06 | Owner had no way to recover a running dispatch after a lost claim/receipt | Fifteen-minute lease, exact updatedAt, audited owner transition to uncertain; reservation retained, no redispatch |
| 05:35:40 / 05:37:13 | Running reflection completed after approved alt changed | Completion-time alt freshness; charge retained, no lessons |
| 05:38:24 / 05:39:55 | Provider receipt after owner attestation rejected without recording its charge | Separate exact-once late receipt/delta, honest overrun and owner review gate, no selectable version |
| 05:41:21 / 05:42:36 | Late generation selected after author changed scene/refinement | Exact queue-time plan/index/refinement selection check; queued cancellation |
| 05:45:10 / 05:45:43 | Reflection input above 200,000 bytes rolled back hero approval | Small durable deferred input with immutable article/lineage references |
| 05:47:22 / 05:48:38 | Generation/edit queued against a selection the author had not viewed | Required exact article/plan/index/refinement proof and edit-parent version before queue side effects |
| 05:50:55 / 05:51:18 | Charged completion selected after author lost edit permission | Usage/bytes retained independently; current authorization required for selection |
| 05:52:31 / 05:52:59 | Older version's stale queued reflection retained its reservation | Post-wide bounded release-only cleanup at approval |
| 05:55:24 / 05:55:37 | Exporting a nonselected version cleared current final approval | Only selected hero changes invalidate final post approval |
| 05:56:07 / 05:56:30 | Missing retained export blob could not be restored without invalidating review | Identical verified replacement bytes rebind with audit and preserve human approval |
| 05:57:02 / 05:57:23 | Uppercase source/export digests accepted | Canonical lowercase SHA-256 required |
| 05:58:08 / 05:58:36 | Publication snapshot lacked actual bound provider qualification | Exact completed attempt/quote provenance, provider/model, qualification, approval actor/time in manifest |
| 06:14:56 / 06:16:26 | Revisited exact completed approval duplicated reflection after nine newer presentations | Optional SHA-256 approval signature/index with full stored context comparison |

The publication-provenance check exposed an inaccurate historical-lineage test fixture: copied terminal versions borrowed another attempt's receipt. The fixture was corrected to carry its own bounded terminal input, completed offline-contract attempt and exact stored quote. The legacy lineage read-limit test passed at 06:06:16; this fixture correction is not claimed as an additional backend RED/GREEN repair.

GREEN-only coverage, without invented RED receipts:

- At 06:08:30, every local-fixture clause except deployed loopback URLs passed under NODE_ENV=test; both registry and stored-quote admission rejected the remote-shaped fixture.
- At 06:09:17, actual stored quote input/stage/bound-evidence mismatches and changed pinned provider/model rejected admission. The older free-form-argument assertion is explicitly only validator coverage.
- At 06:11:25, fifteen already-reserved planning/generation/reflection cases released at reserve time after viewer downgrade, removal, protected publication, substantive article changes, or pinned reference hash changes. No claim was created.
- At 06:12:05, a viewer-demoted request author could release their own queued work; a removed author and unrelated editor could not.
- At 06:12:49, export reads/recording rejected viewer, published, submitted, and PR-created contexts, retaining existing approved bytes. Native Node prepareHero action deletion/error behavior remains coordinator-owned.
- At 06:17:36, ten historical queued reservations released through an initial eight-row approval transaction and bounded scheduled continuation. The maintenance mutation never claims or dispatches work.

Completion reuses the already-read approval-intent scan for invalidation; contextBytes uses the identical canonical UTF-8 encoding at capture and verification. The optional reflection approval signature/index is additive. Older records lacking the signature retain the bounded recent-history fallback; no migration or old-row rewrite was performed.

R4 freeze verification at **06:20:56–06:21 PDT**: **78 tests passed** (72 Convex interface tests plus six pure library tests); scoped ESLint with `--max-warnings 0`, full `tsconfig.typecheck.json` typecheck, and `git diff --check` passed.

```sh
npx vitest run convex/__tests__/visualWorkflow.test.ts lib/__tests__/visualWorkflow.test.ts
npx eslint convex/visualWorkflow.ts convex/visualWorkflowTables.ts convex/__tests__/visualWorkflow.test.ts lib/visualWorkflow.ts lib/__tests__/visualWorkflow.test.ts --max-warnings 0
npx tsc --noEmit -p tsconfig.typecheck.json
git diff --check
```

Frozen R4 SHA-256 (replaces the R3 candidate):

```text
b4390517e268e5bd9e167ea24709690d29fbea7d2f3ea7e694a09b2b4e6864bf  convex/visualWorkflow.ts
bfbd0c47e00b266242fc993f5140d71c7edb06acd1c4450742d3357a32a8dff4  convex/visualWorkflowTables.ts
81658a7030cf967c66acf2b28a0e8e61464eeec84e444dccb842ea07ff67cfd4  convex/__tests__/visualWorkflow.test.ts
2f959a020eba32760ff48f9b9e6d908c7b7fb3f7a603096c7e5b09c9c2843906  lib/visualWorkflow.ts
1812325f2922ce0a27af2ad2392c697756944d07033790a54c01b3cfa8225c32  lib/__tests__/visualWorkflow.test.ts
```

Code/tests remain frozen for the coordinator's exact-code R4 review. Live routes still fail closed; no dispatcher or reliable production cost bound exists. Durable oversized reflections remain deferred. Ordinary tests and local fictional patterns provide no live provider, release, publication, or human aesthetic qualification. No worker paid call, database mutation, deployment, publication, commit, or push occurred.

## Bounded reflection-completeness repair and R5 freeze

The coordinator requested one bounded delta after the independent R4 reviewer noted that reflection context retained only the root input and each version's prompt/feedback, omitting each edit's full submitted envelope and retained provider rewrite. Ownership for this delta was restricted to workflow backend/test and these workflow docs; no table, schema, generated, profile, provider, or root file changed.

| RED / GREEN (2026-09-30 PDT) | Behavioral RED | Repair |
|---|---|---|
| 06:55:41 / 06:56:01 | Internal reflection claim returned undefined full input envelopes for all three distinct immutable versions | Ordered context includes each version's exact full input plus retained revisedPrompt; originalInput remains explicit |

The test queues and completes one generation and two edits through the existing trusted offline boundary, preserving an owned reference, different explicit provider/model overrides, distinct parents and feedback, and separate retained provider rewrites. After explicit fictional fixture approval it inspects the internal claim's exact context, comparing each full envelope and rewrite with the corresponding immutable stored version. No model, provider, network, or live database call was made.

Full workflow verification at **06:56:21–06:57 PDT**: **79 tests passed** (73 Convex interface tests plus six pure library tests), scoped workflow backend/test ESLint with `--max-warnings 0`, full configured typecheck, and `git diff --check` passed. Existing oversized context/input and 4 MB legacy lineage tests continue to prove durable deferral without losing valid hero approval. Existing reflection records were not rewritten; captured context byte-count mismatches fail closed before dispatch.

```sh
npx vitest run convex/__tests__/visualWorkflow.test.ts lib/__tests__/visualWorkflow.test.ts
npx eslint convex/visualWorkflow.ts convex/__tests__/visualWorkflow.test.ts --max-warnings 0
npx tsc --noEmit -p tsconfig.typecheck.json
git diff --check
```

Frozen R5 SHA-256:

```text
bae24cc688500c38e582480b65f68a69c3c37b0b04ee2e693d1c7a4d6e13ccf3  convex/visualWorkflow.ts
76d1e7f67a111aec075b57d0ad72ecacf355cb7d1fba1d5273447668701fedb2  convex/__tests__/visualWorkflow.test.ts
```

Unchanged R4 companion hashes:

```text
bfbd0c47e00b266242fc993f5140d71c7edb06acd1c4450742d3357a32a8dff4  convex/visualWorkflowTables.ts
2f959a020eba32760ff48f9b9e6d908c7b7fb3f7a603096c7e5b09c9c2843906  lib/visualWorkflow.ts
1812325f2922ce0a27af2ad2392c697756944d07033790a54c01b3cfa8225c32  lib/__tests__/visualWorkflow.test.ts
```

R5 code/tests/docs remain frozen for independent delta review. Live dispatch and production qualification remain paused. No worker paid call, live database mutation, deployment, publication, commit, or push occurred.

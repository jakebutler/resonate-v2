# Offline provider TDD receipts

Base: `b8b6e44baab1d728f6a2267e043acc64b03bec66`, branch `feat/editorial-visual-generation`. Command throughout: `npx vitest run lib/__tests__/visualProviders.test.ts` in the task worktree. Each row added one public behavior test, observed RED, then the minimum GREEN. Test doubles are speculative, not live receipt fixtures. All runs made zero network calls.

Times below are command-local clock readings from the tool transcript on 2026-09-30; durations are not qualification evidence.

| Behavior | RED receipt | GREEN receipt |
| --- | --- | --- |
| Documented model disabled | 02:41:46, 1 failed; `Visual route qualification has not been implemented` | 02:41:58, 1 passed |
| Reference capability gap / doubles unqualified | 02:42:36, expected `ok:true`, received false | 02:43:26, 2 passed |
| Uncertain outcome blocks fallback | 02:43:50, expected reconciliation, received route | 02:44:04, 3 passed |
| Selected edit-parent input / model / prompt pins | 02:45:24, preparation export missing | 02:46:18, 4 passed |
| Missing parent blocks edit | 02:46:48, expected rejection; none thrown | 02:47:00, 5 passed |
| Internal admission denial prevents dispatch | 02:47:53, executor export missing | 02:48:17, 6 passed |
| Bytes, observed usage, allowlisted receipt | 02:49:12, expected completed; received blocked | 02:50:04, 7 passed |
| Interrupted transport retains claim / no retry | 02:50:29, uncaught fixture timeout | 02:50:42, 8 passed |
| Unknown hard charge bound blocks live | 02:51:16, cost quote export missing | 02:51:32, 9 passed |
| Mismatched claim prevents dispatch | 02:52:04, dispatched undefined fixture response | 02:52:21, 10 passed |
| Empty nominal success remains uncertain | 02:52:45, incorrectly completed empty image list | 02:52:57, 11 passed |
| HTTP failure cannot complete | 02:53:40, incorrectly completed HTTP503 | 02:53:53, 12 passed |
| Undecodable bytes retain uncertain claim | 02:55:30, uncaught invalid bytes | 02:55:51, 13 passed |
| Credential-bearing provider rewrite omitted | 02:56:16, raw fixture rewrite exposed | 02:56:32, 14 passed |
| Actual retained reference bytes required | 02:56:58, named empty input accepted | 02:57:12, 15 passed |
| Separate full input/output provider costs | 02:57:43, cost-calculation export missing | 02:58:05, 16 passed |
| DO reference wire contract cannot be guessed | 03:03:38, accepted an asserted flag as a wire contract | 03:03:57, 17 passed |

The initial missing-module run at 02:41:27 failed before discovering tests; it is not the behavioral RED receipt. Production admission, ownership, concurrent reservation, duplicate claim, storage persistence and human visual approval are separate integration responsibilities. No mock qualifies a provider.

Scoped ESLint and repository `npm run typecheck` passed at the integration state inspected at 03:02. The final focused suite passed 17/17 at 03:03:57. Coordinator owns broad suite/build/release checks because other workers continue editing shared integration files.

## Exact review remediation, 2026-09-30

Each row was one failing public behavior followed by minimum green, using `npx vitest run lib/__tests__/visualProviders.test.ts -t '<behavior>'`. Times are the displayed local Vitest start times. No network/image/text provider calls occurred.

| Behavior | RED | GREEN |
| --- | --- | --- |
| Cannot dispatch arbitrary offline callback | 03:17:00, completed instead of blocked | 03:17:21, 1 pass |
| Offline route only speculative/no receipts | 03:18:16, selected live receipt | 03:18:30, 2 pass |
| Retain mismatched claim | 03:19:54, completed instead of uncertain | 03:20:10, full 17 pass |
| Explicit edit modelOverride | 03:20:37, implicit override accepted | 03:20:54, full 18 pass |
| Operation/role/duplicates/composition | 03:21:38, generation parent accepted | 03:22:01, full 19 pass |
| Input MIME signature/bounds | 03:22:38, arbitrary bytes accepted | 03:23:03, full 20 pass |
| Actual input digest | 03:23:36, mismatched hash accepted | 03:24:04, 1 pass; async API refactor full 21 pass 03:24:42 |
| Output signature/bounds/HTTP integer | 03:25:36, arbitrary output completed | 03:26:14, 1 pass; full 22 pass 03:26:28 |
| Receipt claim/lineage/prompt/input/output hashes | 03:27:16, fields missing | 03:28:18, full 23 pass |
| Provider-reported model mismatch | 03:28:58, mismatch completed | 03:29:13, full 24 pass |
| Credential/opaque rewrite metadata | 03:29:58, sk_live rewrite retained | 03:30:24, full 25 pass |
| Substituted prepared bytes/forged qualification | 03:31:05, substituted bytes completed | 03:31:49, full 26 pass |

Existing-guard regression coverage then added without implementation changes: all mode combinations/forged route callbacks, HTTP400, extra images, empty attempt and prepare-level uncertainty. Full suite 27/27 passed at 03:33:08 (14 ms tests, 931 ms total). These are behavioral regression checks of existing guards, not claimed fresh RED cycles. Typecheck passed before final docs; final verification/hashes are supplied separately by the worker. No review approval is inferred from these green checks.

## Second review remediation

| Behavior | RED | GREEN |
| --- | --- | --- |
| Forged transport fields/parent/roles/provenance | 03:49:47, completed despite different model | 03:50:43, full 28 pass |
| Edit receipt operation/revisions/feedback/settings/override | 03:51:25, lineage fields missing | 03:51:56, full 29 pass |
| Conflicting model and modelOverride | 03:52:18, promise resolved | 03:52:31, full 30 pass |
| Non-string request ID | 03:52:55, array copied into receipt | 03:53:10, full 31 pass |
| Live interpreter with unknown bound | 03:53:26, completed | 03:53:40, full 32 pass |
| Relative seed asset paths + UTF-8 | Local Python fixture RED FileNotFoundError identity.png | Same temporary fixture GREEN `relative manifest + UTF8 fixture: PASS` |

Final regression backfill (no new implementation): production snapshot/default offline rejection, positive JPEG/WebP and short WebP, copied caller bytes, valid-but-mutated quality. Full 33/33 pass at 03:56:05, tests16ms/total955ms. Scoped ESLint and npm run typecheck passed. No paid calls or ledger changes.

## Third review remediation

| Behavior | RED | GREEN |
| --- | --- | --- |
| Full canonical request versus separate claim hash | 04:10:28, substituted pins completed | 04:11:39, full 34 pass |
| Consistently hashed edit model/feedback invariants | 04:13:08, implicit changed parent model completed | 04:13:28, full 35 pass |
| Snapshot across interpreter awaits | 04:14:12, caller mutation changed result to uncertain | 04:14:59, full 36 pass |
| Nonempty revision pins in both boundaries | 04:15:40, empty article revision accepted | 04:16:00, full 37 pass |

Final37/37 provider test pass at04:16:00, tests20ms/total476ms; scoped ESLint clean. Committed Python regression (`python3 scripts/visual-provider-qualification-packet.test.py`) passes1 test with relative+absolute subcases and UTF8. Real seed generator reverified both approved input hashes without network/keys/ledger writes. Shared npm typecheck passed after correcting the UI upload action's actual {referenceId} return shape.

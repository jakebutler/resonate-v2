# Visual profile and seed backend contract

Implementation scope: V02 persistence, owned bytes, trusted Corvo seed, exact post exceptions, and V07 scoped lesson retrieval. The canonical composer UI and the workflow budget ledger are separate coordinator-owned integrations. No model route is qualified by this feature.

## Persistence

`visualProfileTables` exports six additive tables. `v2VisualProfiles` holds only the active revision pointer. Guidance, reference bindings, provider/model defaults, post exceptions, and lessons retain immutable revision IDs. References retain storage IDs, server-calculated SHA-256 hashes, byte lengths, MIME types, upload ownership, and approval/source provenance. The seed archive retains the original source document and all seed JSON. No historical model ID or exact submitted request is fabricated.

Ordered `referenceBindings` assign each owned reference its job: `identity`, `style`, or `composition`. The seed's default pair is the raven sheet followed by article 4 for paper and lighting. The remaining approved examples stay available as owned seed assets. Article 7 is not the general style reference.

## Public interfaces

All interfaces are in `convex/visualProfiles.ts` and have argument/return validators.

| Interface | Contract |
|---|---|
| `getProfile` | Owner/editor; optional historical `profileRevisionId`; returns revision and ordered owned reference documents, or null. Viewer access is denied consistently for active and historical reads. |
| `saveRevision` | Owner/editor; expected active revision; full guidance, ordered bindings, nullable default route. Equal saves return the same ID. Stale conflicting saves fail. Only owners change the default route. |
| `uploadReference` | Owner/editor; accepts actual PNG/JPEG/WebP bytes, safe file name, MIME type, and brand. At most 5 MiB; hash and storage metadata checked server-side. No client storage ID or approval metadata is accepted. |
| `getReference` | Reference ID; owner/editor authorization before detailed uploader provenance and URL resolution. Raw storage IDs fail validation. |
| `uploadSeedAsset` | Corvo owner/editor; fixed asset key and actual PNG bytes. Exact manifest hash is required before historical provenance is assigned. |
| `importCorvoSeed` | Corvo owner/editor; all 16 verified source records required. Transactionally imports archive and ten observed lessons. A current profile is preserved; a new profile uses current guidance. `seededProfile=false` explicitly distinguishes a preserved authored revision from seed-produced guidance. Repeated imports return the original import receipt. |
| `getSeedStatus` / `getSeedArchive` | Brand-scoped seed-status metadata remains available to viewers. Full historical archives, including absolute source paths, require owner/editor; all archived bytes are hash checked. Unknown historical model and untested reproduction status remain explicit. |
| `setPostException` / `getPostException` | Owned saved blog post and brand access; writes require owner/editor and mandatory `expectedPostContext: {title, blogSlug?, channelId}` matching the currently saved post. Revisions are immutable and use expected-current conflict checks. |
| `applyCorvoArticle7Exception` | Imported seed and mandatory viewed context; exact manifest title `What Corvo Labs learned building an AI editorial workflow`, exact article 7 slug and `corvo-blog` channel required. There must be exactly one post with that slug in Corvo. The immutable exception records title and slug; both resolvers recheck brand, title, slug, channel and uniqueness at read time. Latest resolution omits a changed/ambiguous association, and exact-pin replay rejects it. |
| `retrieveLessons` | Brand/role scope, scene tags, exact known provider/model scope, and optional owned post. Up to five results. All candidate keys in a complete history of at most 512 brand/role rows are considered; a bounded 513th-row probe rejects overflow. Each key's highest revision is loaded through its revision index, and duplicate highest revisions fail closed even across roles. Seed imports reject existing seed lesson keys instead of creating collisions. |
| `resolveForPost` | Owner/editor and own saved blog post; optional pinned profile revision; returns immutable profile/reference/exception/lesson IDs and documents. Defaults lesson role to image generator; no scene tags means only exact-post lessons can match. |
| `resolveFromPin` | Owner/editor, own saved blog post and complete `visualProfilePinValidator`; hydrates exactly the supplied immutable profile, ordered references, exception, and lessons. Rejects mismatched reference bindings, foreign-brand/post IDs, and invalid seed associations. No new lesson or exception selection. |

`resolveVisualProfileForPost(ctx,userId,postId,options)` selects inputs for a new operation. Its ordered `references` include `{referenceId,storageId,role,sha256,reference}`. Passing only `profileRevisionId` pins profile guidance while selecting current applicable lessons and exception. For exact inspection or replay, persist the complete `visualProfilePinValidator` and use `resolveVisualProfileFromPin(ctx,userId,postId,pin)` or public `resolveFromPin`; later revisions do not change those inputs. Both paths require an owned saved `corvo-blog` post. This product slice's publication destination is the Corvo blog; other destinations remain unsupported rather than silently guessed.

Complete pins are an inspection/replay contract, not authority for new generation. The workflow must create pins server-side from `resolveVisualProfileForPost` for its exact operation role, scene and provider/model, persisting those returned IDs with the operation in the same mutation. It must never accept caller-built pins for dispatch. Historical inspection intentionally retains original lesson and authored exception revisions, even when newer revisions or current model routes differ. References must still exactly match the pinned revision's ordered bindings, and every included row must belong to the authorized brand/post. Historical lesson evidence excerpts remain audit data: model prompt assembly must project only lesson `title` and `instruction`, never serialize full lesson documents, source excerpts, manifest paths, raw final-direction archives or uploader subjects. The separately reviewed workflow owns that prompt projection and trusted pin creation.

The importer validates any supplied `--url` during preflight, including dry runs. Destinations must be canonical `https://<deployment>.convex.cloud`/`.convex.site` origins or exact `http://localhost`, `http://127.0.0.1` or `http://[::1]` loopback origins, with an optional valid loopback port. Credentials, non-root paths, query strings and fragments are rejected. The Convex client's server logger is disabled. Failure diagnostics use fixed stage names and allowlisted messages; raw exceptions, authorization headers and JWT values are never printed. Applying the article-7 exception additionally requires `--article-7-post-id` and `--article-7-title` equal to the manifest title; the importer sends that exact title, slug and channel as required context.

Guidance limits: art direction is required and at most 12,000 characters; other guidance strings at most 4,000; palette has 1–12 named six-digit hex colors; up to eight unique ordered reference IDs. Default provider/model identifiers are separate, nonblank, trimmed strings; qualification is always explicitly `unqualified` here. No monthly dollar amount is inferred. The workflow owner supplies budget storage and admission.

Internal reflection completion may insert immutable `v2VisualLessons` only after its separately verified approved lineage. `provenance=reflection`, `validation=untested`, `oneShotValidation=not_tested`, and `changesBrandProfile=false` retain the learning boundary. Known-model lessons require exact model scope; uncertain one-post prop/palette/count observations must remain post-specific. This module does not generate text or approve proposed profile changes.

Writes use an explicit owner/editor allow-list. Generic post exceptions are labelled **authored**, not historically approved. Seeded observations remain observations; there is no `replayed` validation state without a separately designed replay-evidence contract. Historical source/final-direction archives are explicitly `archiveOnly=true` and never direct model input. Their exact original bytes, including historical QA/handoff content, remain preserved and integrity checked. Source-only hero-chart wording does not attribute the separately authorized informational-figure PRD policy to Jake's historical hero selection.

## R4 cross-endpoint detail repair

The independent `profiles-sol-r4` review reproduced viewer access to restricted reference provenance and storage detail through `getProfile`, despite direct `getReference` denial. A public regression now checks active and historical `getProfile`, `resolveForPost`, and `resolveFromPin` on a viewer-owned saved post, followed by successful owner/editor detail reads and exact-pin replay. It failed at 14:11:58 UTC on 2026-09-30 because the viewer received reference storage detail, and passed at 14:12:30 UTC after owner/editor guards were added to those three public query handlers. The trusted workflow resolver helpers remain unchanged; their callers still own operation authorization and server-generated pin creation.

No public reference-detail endpoint in this module remains available to viewers. `getSeedStatus` retains approved low-risk hash/import metadata and reference IDs, without uploader subjects, raw storage IDs or bearer URLs. The common storage/bearer-URL guard is separately coordinator-owned in `visualStorageAccess.ts`; this repair does not claim that separate gate or change global membership/bootstrap policy.

At 14:13:57 UTC, the profile/library/workflow/hero-panel command passed 142 offline tests across four files, with the single source-master test intentionally skipped. Scoped ESLint passed with zero warnings, and the repository production typecheck passed. No schema, importer, workflow/helper, storage guard, UI, provider, figure or publication files were changed by this repair.

## R4 review repairs

The `profiles-r3-complete` review was static. These repairs were verified through offline public interfaces on 2026-09-30; times below are UTC.

| Behavior | RED | GREEN |
|---|---|---|
| Mandatory viewed context / exact manifest article-7 title | 13:24:31 omitted context wrote a revision | 13:25:11 public test passed |
| Older seeded key after 140 newer history rows | 13:27:24 seeded key silently disappeared | 13:27:42 public test passed |
| Complete 512-row history / explicit overflow rejection | 13:28:15 row 513 was silently selected | 13:28:31 public test passed |
| Duplicate highest revision across roles | 13:29:11 arrival order chose a row | 13:29:29 public test passed |
| Later duplicate slug / mismatched exception brand at resolution | 13:30:17 seeded exception remained applicable | 13:31:20 public test passed |
| Full archive owner/editor access / viewer status metadata | 13:34:41 viewer received the full archive | 13:34:57 public test passed |
| Importer destination preflight and safe failures | 13:36:08 unrelated HTTPS host passed dry run | 13:39:36 public CLI test passed |
| Existing seed lesson key collision | 13:41:45 importer created duplicate revision 1 | 13:42:01 public test passed |
| Detailed reference provenance/URL owner/editor access | 13:42:52 viewer received a URL | 13:43:04 public test passed |

At 13:45:40, 29 profile/library tests passed with the actual-master test intentionally skipped. At 13:46:06, all 30 passed with the source-directory environment variable, including all 16 actual master uploads, repeated seed import and exact article-7 context binding. The ordinary suite includes canonical cloud/site and HTTP loopback origins, credential/query/fragment/path/host rejection, and fixed error messages that omit synthetic JWT/header values. Scoped ESLint and the production typecheck passed. The importer dry run verified the same 16 images and 35,192,584 bytes without network calls or writes. Full Convex/test diagnostics outside this slice remain coordinator-owned. No fixture observation is live provider qualification or human image approval.

The uploaded-blob recovery boundary is unchanged: failed or uncertain registration outcomes retain bytes, and only a confirmed duplicate receipt permits deleting the newly unused copy. This follows the user contract rather than the static review's cleanup suggestion. No cleanup, deployment, provider call, publication, commit or push was performed.

## Earlier review repair receipts

The review was static; all repair receipts below are offline public tests, not deployment or provider qualification.

| Behavior | RED | GREEN |
|---|---|---|
| Source-only seeded chart/composition wording | 03:30:14 source did not contain attributed policy | 03:30:39 two library tests passed |
| Always-on UTF-8 source and JSON archive integrity | 03:31:04 verifier absent | 03:31:52 three library tests passed |
| Exact full-pin replay / foreign IDs | 03:32:49 `resolveFromPin` absent | 03:33:38 public test passed |
| Highest lesson revision after backfill / exact post scope | 03:34:29 revision 1 replaced revision 2 | 03:34:46 public test passed |
| Seed article 7 rename/slug invalidation and uniqueness | 03:35:57 renamed post inherited seeded exception | 03:36:50 public test passed |
| Preserved authored profile / archive-only receipt | 03:37:59 `seededProfile` absent | 03:38:33 public test passed |

At 03:40:44 the library/profile suite passed 19 tests with the actual-master integration intentionally skipped. Regression tests cover viewer denial on upload, seed upload/import, and both exception writers, plus empty/oversized/mismatched/unsupported image bytes and unsafe file names. Schema membership roles are explicitly owner/editor/viewer, so a malformed new role cannot be inserted through the current schema; the explicit allow-list also fails closed if that schema is widened later. The coordinator owns the pre-existing membership helper's duplicate-row behavior and legacy/unclaimed storage ownership migration.

At 03:43:41 the same command with `CORVO_VISUAL_SEED_SOURCE_DIRECTORY` passed all 20 tests, including all 16 real master uploads and idempotent import. Scoped ESLint passed with zero warnings; `npx tsc --noEmit -p tsconfig.typecheck.json` passed. Original manifest/lessons/final-directions/source JSON remained byte unchanged. These are offline receipts; live Convex storage metadata and browser reload remain unqualified.

## Validation receipts

All commands ran offline in the isolated feature worktree; no paid/image/text provider requests or live deployment writes were performed by this worker.

| Behavior | RED receipt | GREEN receipt |
|---|---|---|
| Saved revision / independent query | 02:42:38 `Could not find module visualProfiles` | 02:45:45 one passed |
| Cross-brand reference / viewer denial | 02:46:33 promise unexpectedly resolved | 02:46:47 two passed |
| Owned saved-post resolution | 02:47:27 missing `resolveForPost` | 02:48:24 three passed |
| Stored bytes/hash / raw storage rejection / dedupe | 02:49:20 missing `uploadReference`; storage harness digest encoding repaired | 02:52:13 four passed |
| Immutable historical guidance / duplicate saves / route owner | 02:54:02 retry failed expected revision check | 02:54:29 five passed |
| Approved bytes cannot be substituted | 02:55:53 missing `uploadSeedAsset` | 02:57:13 six passed |
| Missing source assets block import | 02:58:42 missing importer; isolated next cycle | 02:59:39 seven passed, source test disabled until next cycle |
| Actual source byte import / repeat / preserved provenance | 02:59:40 completion absent | 03:02:21 all eight passed with source env |
| Scoped resolver lessons | 03:04:00 empty lessons mismatched relevant set | 03:04:13 eight passed, local source check skipped |
| Exact post exception / historical exception revision | 03:05:09 missing `setPostException` | 03:05:53 nine passed, local source check skipped |
| Trusted article 7 association / later guidance survives repeat | 03:06:45 missing seed exception binding | 03:07:24 all ten passed with source env |
| Bounded profile input validation | 03:09:01 missing validation function | 03:09:41 profile and library tests passed |
| Accurate absent seed status / brand access | 03:10:05 missing `getSeedStatus` | 03:10:36 ten passed, local source check skipped |

Actual source integration command (replace the portable placeholder with the local master-image directory):

```sh
CORVO_VISUAL_SEED_SOURCE_DIRECTORY=/path/to/corvo-content-drafts/images npx vitest run convex/__tests__/visualProfiles.test.ts lib/__tests__/visualProfile.test.ts convex/__tests__/visualWorkflow.test.ts
```

At 03:12:26 this command passed all 22 tests across the three files, including all eleven profile API behaviors. Without the source env, the one actual-master test is intentionally skipped; ordinary tests need no workstation source files.

At 03:20:20 the final profile check passed all eleven API tests plus the library test. The simultaneously edited workflow suite had a new failing test for including pinned profile guidance in its actual prompts; its author was notified. That shared suite is not claimed green by this worker.

`node scripts/import-visual-seed.mjs --source-directory /path/to/corvo-content-drafts/images` verified 16 unchanged images totaling 35,192,584 bytes in dry-run mode. It performed no imports. `npx tsc --noEmit -p tsconfig.typecheck.json` passed. Scoped ESLint passed without warnings. Full `npx tsc --noEmit` remains failing in existing tests elsewhere; the latest filtered output has no errors in this worker's files.

The offline storage harness returns base64 SHA-256 and omits optional MIME metadata, while live Convex documents specify hex SHA-256 and optional MIME metadata. The implementation compares the digest in either encoding and checks MIME when present. Live deployment validation belongs to the coordinator.

## Remaining acceptance boundaries

V02 is not fully complete until the canonical composer profile/seed controls, configured budget, authenticated import, browser reload, and served UI have been verified. All approved source bytes have exercised the backend through offline Convex storage, but this worker has not populated a live deployment. Route qualification and human asset approvals remain separate. V07 reflection triggering, budget deferral, actual text-model completion, and profile proposal approval belong to the workflow integration, not this retrieval foundation.

Failed/uncertain source-record mutations preserve their uploaded bytes because automatic deletion could invalidate a committed reference. Confirmed duplicate uploads delete only their new unused copy. Unclaimed bytes may require a future authorized cleanup; no background retries or cleanup were added.

The legacy `v2Storage.getFileUrl` previously allowed any authenticated caller to ask for any raw storage ID. The coordinator owns the guard for known visual reference bytes, using `v2VisualReferences.by_storageId`; this worker did not alter legacy APIs.

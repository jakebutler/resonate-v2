# Disposable local reader rehearsal

`scripts/export-local-visual-fixture.mjs` prepares the real publication helper's MDX, WebP and deterministic SVG files for one fictional saved post. The coordinator alone runs its database read, output write and browser verification. This rehearsal does not qualify an image provider, prove aesthetic quality or publish an article.

## Exact scope

- Post `nd77g7q41hws09ge4zbp1epe4x8fc3wy`, title `LOCAL FIXTURE — Editorial visual rehearsal`, author `visual-rehearsal-only`, brand `corvo`, channel `corvo-blog`.
- Reader checkout `/Volumes/rexy/GitHub/codex-worktrees/resonate-visual-reader-current/corvo-labs-dot-com`, detached at `c4be2ee4d11fb5e5ee2c36c239aa497a2e2c4c33`.
- Output MDX `corvo-labs-enhanced/content/blog/2026-09-30-local-fixture-editorial-visual-rehearsal.mdx`.
- Output assets only `corvo-labs-enhanced/public/images/blog/2026-09-30-local-fixture-editorial-visual-rehearsal/hero.webp` and `figure-<candidateId>.svg`.
- Local reader URL: <http://127.0.0.1:3172/blog/2026-09-30-local-fixture-editorial-visual-rehearsal>.

The saved post must already be final-approved locally. Its exact hero must already have a persisted approval by the fictional engineering author. An apply run also requires at least one accepted figure from that author. The harness does not create those decisions, change post status or schedule anything. `status: "published"` exists only in the disposable prepared MDX so the reader exercises its normal article path.

The body must begin with `READER_CONTENT_BASELINE`: the explicit fictional fixture revision with its duplicate H1 removed in the composer and saved before export. The publication helper preserves the exact saved body; this harness performs no title or prose normalization. Added evidence table rows are allowed; every other nonblank added line must explicitly contain the word `fictional`. HTML, executable MDX, remote links and unbound figure placeholders are rejected. Standard accepted figure blocks are separately verified and removed before checking these additions. Numeric figures still require the backend's explicit claim trace and citation evidence.

## Commands

Run from the Resonate editorial visuals worktree:

```sh
node scripts/export-local-visual-fixture.mjs --self-test
```

This test uses CPU-generated fixture bytes and the actual TypeScript publication helper bundled in memory with the existing esbuild installation. It performs no network request, database read or reader checkout write.

The coordinator's read-only preparation command is:

```sh
node scripts/export-local-visual-fixture.mjs --post-id nd77g7q41hws09ge4zbp1epe4x8fc3wy
```

After inspecting its prepared path, byte-count and SHA-256 summary, the coordinator can write the same guarded output:

```sh
node scripts/export-local-visual-fixture.mjs --post-id nd77g7q41hws09ge4zbp1epe4x8fc3wy --apply
```

Each invocation independently reads one current publication snapshot; the apply command validates that snapshot again. The existing local anonymous Convex instance and ephemeral fixture issuer must be running. The target verifier must identify `anonymous-agent` at `http://127.0.0.1:3210`; the issuer is `http://127.0.0.1:3969`, scoped to the existing `http://127.0.0.1:3170` rehearsal origin. The token remains in memory and expires after 120 seconds. No token, credential value, raw server error or asset URL is printed or saved.

## Proof and output handling

One authorized `publishing:getPostForPublication` query supplies the post, approved hero and accepted figure envelopes. Hero provider/model must both be exactly `offline-fixture`, its qualification must be `offline-fixture`, and its server quote provenance must identify the local offline fixture. Missing provenance blocks the run; it is never inferred. The harness fetches only that approved hero's local storage URL, verifies exact bytes against the server SHA-256, and checks the fixed WebP presentation. The actual publication helper independently decodes and validates those bytes. The final-approved post must match the full `blogEditorialFingerprint`, including saved blog metadata and Draft intent; its hero article signature separately binds title and body. Every figure must bind the exact post ID, current body SHA-256 and text content fingerprint, fictional acceptance actor, original/current evidence versions, deterministic renderer version, data and presentation signatures, exact SVG bytes, alt, caption and source note. The harness replays article evidence against the snapshot body; raw claim-trace sources remain verified by the authoritative server query and are not fetched in a second query. It uses the shared `buildFigureMarkdownBlock` and current `resonate-svg-v4` renderer, including the helper's exact anchor, caption and source-note checks.

The publication bundle fixes GitHub configuration to inert local constants and rejects fetch calls. This script alone calls the pure `prepareBlogPublication(params, {allowFixture: true})` preparation path. Ordinary preparation defaults to rejecting fixture provenance, and production `createBlogPostPR` exposes no fixture option. No GitHub client, provider, mutation, action, PR, remote repository or release path is called. The allowed local query transport rejects any second snapshot request and any other function, target or method.

Output preflight rejects tracked changes, unrelated untracked files, a branch checkout, changed HEAD, symlink ancestors, hardlinked output, traversal paths, duplicate paths and oversized/noncanonical bytes. All files are checked before a write. Assets are written before the MDX, using exclusive creation; identical existing fixture files are verified and skipped. Different existing files block the run. Every file is hashed after write and the checkout is rechecked. A partial failure leaves local evidence in place for coordinator inspection; there is no automatic retry, deletion or overwrite.

## Offline verification receipts

All times below are UTC on 2026-09-30. Each new guard was tested through its exported public behavior, observed failing, then minimally implemented before the next guard.

| Behavior | RED | GREEN |
| --- | --- | --- |
| Exact fictional post and persisted hero approval | 12:05:08 | 12:05:28 |
| Guarded prepared output paths | 12:06:08 | 12:06:29 |
| Article proof and actual publication preparation | 12:08:49 | 12:09:51 |
| Full figure proof and deterministic SVG export | 12:12:31 | 12:15:35 |
| Pinned detached reader checkout | 12:17:38 | 12:18:06 |
| Fixed command arguments | 12:18:57 | 12:19:19 |
| Exact local read-only transport | 12:19:59 | 12:20:48 |
| Symlink and output filesystem guard | 12:21:59 | 12:22:35 |
| Bounded binary plan, assets before MDX | 12:23:32 | 12:24:02 |
| New explicit fixture provenance/helper option | 12:48:12 | 12:49:16 |
| Shared literal figure Markdown placement | 12:51:02 | 12:51:24 |

The complete offline self-test passed after transport and writer wiring at 12:27:38 and after the final helper/provenance integration at 12:51:24. The latter includes a negative test proving the helper's production default rejects the fixture. `node --check` and scoped ESLint also passed. These checks do not exercise the live local database read, real reader checkout write or browser rendering; the coordinator owns those separate receipts. No paid call, human asset approval or live publication was performed by the harness implementer.

## Current article contract integration

The original reader checkout and its earlier receipts remain intact. The current rehearsal uses a separate detached checkout and port, dated canonical asset directory, explicitly saved H1-free fictional prose and saved blog metadata. The disposable MDX retains those author, excerpt, category and tag values; its local-only visible status and fixed route date are the documented reader fixture override. Approval freshness is verified against the complete article fingerprint, while figure binding keeps its distinct title/body fingerprint. A changed author, excerpt, category, tags or publication intent invalidates the approved snapshot before preparation. Ordinary provider qualification, production status and human aesthetic approval remain separate gates.

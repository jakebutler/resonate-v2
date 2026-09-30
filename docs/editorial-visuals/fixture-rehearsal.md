# Local persisted-browser visual rehearsal

This harness is a fictional engineering fixture, not a provider receipt, live route qualification, or human aesthetic approval. It must run only after coordinator review against the existing anonymous local deployment. The worker wrote these scripts and ran syntax/offline self-tests only; the coordinator owns all actual process and data mutations.

## Fixed target and authentication

The only accepted backend is `http://127.0.0.1:3210`, with `.env.local` deployment `anonymous:anonymous-agent` and actual `/instance_name` response `anonymous-agent`. Scripts reject cloud/remote/prod hosts, alternate ports, deployment flags, deploy keys, and self-hosted URL overrides before issuing auth, importing references, or touching data. Redirects are rejected. No custom deployment/URL arguments exist.

The issuer listens only at `127.0.0.1:3969`. It creates an ephemeral RSA key in memory, exposes OIDC discovery/JWKS, and issues RS256 tokens only for subject `visual-rehearsal-only`, audience `convex`, with 120-second lifetime. `/token` rechecks the actual backend each time. Keys/JWTs are not written or logged. Browser CORS permits only `http://127.0.0.1:3170`; no wildcard is used. Origin-less loopback CLI/backend discovery requests are permitted, while hostile Host/Origin values are denied.

The normal `convex/auth.config.ts` reads `CLERK_JWT_ISSUER_DOMAIN`; the coordinator configures the local issuer domain separately and does not change the auth schema. Local browser auth is an explicit loopback-only development fixture. Public calls use `ConvexHttpClient.setAuth` with the short-lived token in memory.

Internal completions use the existing anonymous local Convex CLI admin authority, without `--identity` impersonation, which does not expose internal functions. The CLI reads its ignored local credentials; the harness never copies, prints, or supplies a deployment key. It verifies the target before every allowlisted internal operation. This is not a production admin or provider execution path.

The backend additionally requires these exact fixture environment values, configured by the coordinator:

```text
RESONATE_VISUAL_FIXTURE_MODE=local-offline
RESONATE_VISUAL_FIXTURE_DEPLOYMENT=anonymous-agent
RESONATE_VISUAL_FIXTURE_CONVEX_URL=http://127.0.0.1:3210
CONVEX_SITE_URL=http://127.0.0.1:3211
```

Quotes must use fictional actor `visual-rehearsal-only`, provider/model `offline-fixture`, and zero micros. All quotes have `offline-fixture` qualification; there is no live-provider enablement environment branch.

## Commands

Run from the managed repository root. These are coordinator-only execution instructions, not evidence that the worker ran them.

```sh
node scripts/visual-fixture-issuer.mjs --self-test
node scripts/visual-fixture-rehearsal.mjs --self-test
node scripts/visual-fixture-issuer.mjs --check
node scripts/visual-fixture-issuer.mjs --serve
```

In another terminal, initialize fictional data. The optional seed flag invokes the existing hash-verified importer for all 16 original Corvo masters only on this exact local target; no text/image provider is called.

```sh
node scripts/visual-fixture-rehearsal.mjs init
# Optional approved coordinator variant:
node scripts/visual-fixture-rehearsal.mjs init --import-seed
```

The initializer creates/reuses exactly one saved Corvo blog post titled **LOCAL FIXTURE — Editorial visual rehearsal**, verifies the fictional content/owner/brand, preserves configured profile guidance and ordered seed references, and selects an explicitly unqualified `offline-fixture` route with monthly budget zero. It prints the actual composer URL `http://127.0.0.1:3170/?postId=<fixture-id>`.

Use the actual composer to click Plan, then complete its one queued fixture attempt:

```sh
node scripts/visual-fixture-rehearsal.mjs status --post-id <fixture-id>
node scripts/visual-fixture-rehearsal.mjs complete-plan --post-id <fixture-id> --attempt-id <queued-id>
```

Reload the browser, choose/refine one of the three fictional article-bound stories, click Generate, and complete that queue:

```sh
node scripts/visual-fixture-rehearsal.mjs complete-generation --post-id <fixture-id> --attempt-id <queued-id>
```

The helper registers an input-bound zero-cost fixture quote, reserves atomically, claims once before storage work, generates bounded deterministic PNG bytes using Sharp, uploads them to the fixed backend storage endpoint, and completes with the actual SHA-256/size metadata. The image is visibly labeled LOCAL OFFLINE FIXTURE / NO MODEL QUALIFICATION. Provider/model remain `offline-fixture`; no DO/OpenAI receipt is forged.

Click Edit in the actual composer with explicit feedback; complete the queued edit. The backend's stored selected parent and ordered feedback/pins remain authoritative.

```sh
node scripts/visual-fixture-rehearsal.mjs complete-edit --post-id <fixture-id> --attempt-id <queued-id>
```

Use the actual `prepareHero` action to exercise stored-source optimization/export. The coordinator may review and click the explicit fictional pattern's asset approval for lifecycle validation only. The script never invokes approval, confirms relevance, or claims a real human's aesthetic decision. The ledger records the fixture actor, exact article/export/presentation review, and fictional receipt provenance.

After an explicit fixture approval of an edited lineage, optionally complete its queued reflection:

```sh
node scripts/visual-fixture-rehearsal.mjs complete-reflection --post-id <fixture-id> --attempt-id <queued-id>
node scripts/visual-fixture-rehearsal.mjs status --post-id <fixture-id>
```

The resulting candidate remains **untested**. Lessons are fictional, post-scoped, and model-scoped to `offline-fixture`; profile changes remain proposals. Repeating a completion on running/completed/uncertain state does not dispatch again. A completion/storage interruption marks uncertainty when possible and stops, requiring durable-state inspection. There is no automatic retry.

## Expected state and limits

Expected progression is queued → running → completed, saved three-scene plan → selected/refined scene → stored raw generation → stored selected-parent edit → exact 1600×900 WebP export under 150 KB → explicit fixture actor approval → queued/completed untested reflection. Shared reserved/actual cost remains zero. Reloading the composer must preserve IDs, bytes, pins, feedback lineage, and selected version.

Scripts reject non-fictional posts, mismatched ownership/content, ambiguous multiple queued attempts, or any image route other than `offline-fixture`. Public request costs and trusted completion receipts cannot be supplied through the composer. Fixtures do not qualify provider reference support, pricing upper bounds, real image quality, human editorial approval, or production publication. No publication/GitHub mutation, paid request, cloud credentials, or deployment operation is part of this harness. Offline export transport/reader inspection remains the coordinator's separate boundary.

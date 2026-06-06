# resonate-v2

Greenfield Resonate v2 MVP for validating a Postiz-backed publishing workflow against Resonate v1.

## MVP Shape

Resonate v2 starts from the tracked Resonate v1 Next/Convex implementation so the replacement surfaces are immediately comparable: Ideas, kanban workflow, AI drafting, calendar, blog PR publishing, and migration fixtures. The v2-specific work adds a Postiz-compatible domain spine around Brands, Channels, Publishing Intent, Provider State, Publish Attempts, and provider adapters.

The repo does not vendor the full Postiz monorepo in this first pass. The upstream Postiz baseline and future direct OAuth path remain documented so the MVP can move toward self-hosted Postiz services once validation proves the replacement workflow.

## Target Brands And Channels

- Personal
- Corvo Labs
- the lower dB
- FreshProof

MVP validation channels:

- LinkedIn through Buffer
- Reddit through Zernio
- Corvo Blog through GitHub PRs

Planning-only channels can exist without being routable. Unroutable channels must appear in planning/calendar filters but cannot submit.

## Local Development

Prerequisites:

- Node.js 20+ for this Next/Convex validation shell.
- npm, using the committed `package-lock.json`.
- Convex project for persisted local/runtime data.
- Clerk project for authenticated app routes.

Install and run:

```bash
npm install
npm run dev
```

Run Convex in another terminal when exercising persisted app screens:

```bash
npx convex dev
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:ci
npm run build
```

## Runtime Services

Current MVP validation shell:

- Next.js app and API routes on Vercel or local `next dev`.
- Convex for app persistence and auth-scoped functions.
- Clerk for auth.
- GitHub API for Corvo Blog PR creation, server-side only.
- PioneerAI/Corvo Cortex for drafting and research, server-side only.

Postiz service target for later direct-OAuth/runtime parity:

- Postiz frontend/backend/orchestrator as a separate container-capable service.
- Postgres.
- Redis.
- Temporal or the selected scheduler equivalent.
- Persistent local or S3/R2-compatible storage.

See [docs/adr/0001-postiz-spine.md](docs/adr/0001-postiz-spine.md).
See [docs/adr/0003-deployment-runtime.md](docs/adr/0003-deployment-runtime.md) for the selected Vercel/Convex validation lane and future Postiz service lane.

## Safety Gates

- Scheduling is not approval.
- Scheduled but unapproved posts remain visible but cannot submit.
- Content edits clear approval.
- Date-only schedule edits preserve approval.
- Live Buffer/Zernio social posting remains unavailable until explicit submission/cancel semantics are implemented and approved. Read-only provider connection validation and Corvo Blog PR creation may run only after explicit human approval.
- Provider credentials stay server-side only and must not use `NEXT_PUBLIC_` prefixes.

## Environment

Copy `.env.local.example` to `.env.local` and fill values from local or host secret scope.

```bash
cp .env.local.example .env.local
```

Do not commit real provider keys, GitHub tokens, AI keys, auth secrets, cookies, exported env dumps, screenshots containing secrets, or provider responses that include secret material.

## Documentation

- [docs/spec.md](docs/spec.md): Resonate v1 parity reference copied from the current control app.
- [docs/glossary.md](docs/glossary.md): stable Resonate v2 terms for brands, channels, intents, provider state, research artifacts, and approval gates.
- [docs/adr/0001-postiz-spine.md](docs/adr/0001-postiz-spine.md): Postiz spine and upstream-sync decision.
- [docs/adr/0002-provider-routing-and-approval.md](docs/adr/0002-provider-routing-and-approval.md): provider routing, approval, and secret handling.
- [docs/adr/0003-deployment-runtime.md](docs/adr/0003-deployment-runtime.md): MVP deployment runtime and future Postiz service lane.
- [docs/live-provider-validation.md](docs/live-provider-validation.md): sanitized proof for the first approved Buffer, Zernio, and Corvo Blog live validation pass.
- [docs/cutover-checklist.md](docs/cutover-checklist.md): cutover validation checklist carried forward from v1.

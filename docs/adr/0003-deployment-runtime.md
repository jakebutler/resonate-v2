# ADR 0003: Deployment Runtime For Resonate v2 MVP

Date: 2026-06-06

## Status

Accepted for MVP validation.

## Context

Resonate v2 needs to validate parity against Resonate v1 while preserving a path to Postiz direct OAuth, provider scheduling, and future custom workflow modules. The current codebase is a Next.js app with Convex, Clerk, Vercel-friendly API routes, and a Postiz-compatible domain spine. Upstream Postiz remains a larger service stack with Postgres, Redis, Temporal, persistent storage, and container assumptions.

The user is comfortable with Vercel and Convex, and open to separate hosted services when the full Postiz service path requires them.

## Decision

Use a two-lane deployment model.

### Lane 1: Resonate v2 Validation Shell

Deploy this repository as the primary MVP validation shell:

- Next.js on Vercel.
- Convex for app persistence, including v2 Brands, Channels, Posts, Publishing Intents, Provider State, Publish Attempts, audit events, research briefs, sources, claim maps, and claims.
- Clerk for authentication.
- Vercel/host environment variables for server-side GitHub, PioneerAI, Cortex, Buffer, and Zernio credentials.
- Mock Provider as the required no-publish validation provider for social submissions. Approved live provider validation may call read-only provider account/channel APIs; live social posting remains separate work.

This lane is enough to validate v1/v2 workflow parity, schedule visibility, approval gates, research-to-draft behavior, auditability, and provider adapter contracts.

### Lane 2: Postiz-Compatible Service Runtime

Do not deploy the full upstream Postiz stack inside the Vercel app. When direct OAuth, provider-owned scheduling, inboxes, or native Postiz provider behavior become required, deploy a sibling Postiz fork/service on a container-capable host.

That service needs explicit runtime support for:

- Postgres.
- Redis.
- Temporal or the selected scheduler equivalent.
- Persistent uploads/storage, preferably S3/R2-compatible in production.
- Provider OAuth callback URLs.
- Internal service URLs separate from public frontend URLs.

Recommended hosting class: a container-capable platform such as Railway, Render, Fly.io, AWS ECS/App Runner, or a small VPS with managed Postgres/Redis. Vercel can continue to host the validation shell and route to the service through DNS/reverse proxy once the Postiz path is ready.

## Routing

Initial production routing:

- `resonate.corvolabs.com`: current production Resonate app.
- `resonate.corvolabs.com/v2`: this Resonate v2 validation shell while MVP validation is active.

Side-by-side validation may also use a separate Vercel project that deploys this v2 repository while v1 remains on the existing production project. Once the v2 MVP passes cutover smoke, `resonate.corvolabs.com` can be repointed to deploy from the v2 repo/project instead of keeping v2 under a path route.

Future routing:

- Keep this validation shell available until the Postiz service proves the same MVP workflows.
- Route `/v2/*` to the Postiz service only after side-by-side smoke tests pass and rollback is defined.
- Preserve an easy rollback to the validation shell or maintenance page if the Postiz service is unhealthy.

## Environment Ownership

This repository owns:

- `NEXT_PUBLIC_CONVEX_URL`
- Clerk env vars
- `PIONEER_API_KEY`
- `PIONEER_DRAFT_MODEL`
- `CORTEX_API_KEY`
- `CORTEX_BASE_URL`
- GitHub PR publishing env vars
- `BUFFER_API_KEY` and `ZERNIO_API_KEY` once live validation is approved

The future Postiz service owns:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `NEXT_PUBLIC_BACKEND_URL`
- `BACKEND_INTERNAL_URL`
- storage/upload env vars
- provider OAuth client IDs/secrets

Do not duplicate provider secrets into client-exposed variables. Do not commit env dumps.

## Consequences

- The MVP can continue shipping on the existing Vercel/Convex path without waiting for container infrastructure.
- Convex remains the authoritative MVP data store for validation artifacts created by this repository.
- The Postiz service can be introduced only when its runtime burden is justified by direct OAuth, scheduler, or provider-inbox needs.
- Provider adapter tests and Mock Provider behavior in this repository become the acceptance contract for any later Postiz service implementation.

## Validation Gates

Before using this lane for production validation:

1. `npm run lint`
2. `npm run test:ci`
3. `npm run build`
4. `npx convex deploy` only after Convex secrets are present and CI verification passes.
5. `/v2` smoke with auth enabled in a preview or production environment.
6. Mock Provider proof for scheduled-but-unapproved blocks, approval submission, retry, ambiguous outcomes, and cancel/unpublish intent.
7. Read-only provider validation for Buffer/Zernio can be run only with explicit approval and sanitized output, as recorded in `docs/live-provider-validation.md`.

Before routing `/v2/*` to a Postiz service:

1. Postiz service health check passes.
2. Postgres, Redis, Temporal/scheduler, and storage backups are configured.
3. Provider OAuth callbacks are configured for the final domain.
4. Side-by-side smoke passes against the same scenario list as `docs/cutover-checklist.md`.
5. Rollback path is tested.

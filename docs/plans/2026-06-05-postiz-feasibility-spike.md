# Postiz Feasibility Spike

Issue: [#39](https://github.com/jakebutler/resonate/issues/39)

Date: 2026-06-05

## Executive Decision

Proceed with the Postiz rebuild, treating Postiz as a separate self-hosted application/fork for the first implementation phase. The current `/v2` Resonate workflow is useful as a tracer and production proof for the Corvo Labs idea-to-blog path, but it is not a replacement for running and customizing Postiz itself.

The lowest-risk path is:

1. Keep legacy Resonate running.
2. Keep the current `/v2` tracer available for production workflow validation.
3. Keep the vanilla Postiz runtime runbook close to upstream Docker Compose.
4. Fork/customize Postiz after the first custom channel and idea-to-draft flow are scoped against the running app.
5. Integrate the Corvo Labs Blog channel as a custom channel from day one because it is not a native Postiz provider.

## Upstream Snapshot

- Repository: `https://github.com/gitroomhq/postiz-app.git`
- Local clone: `/Volumes/rexy/GitHub/postiz-app`
- Inspected commit: `826d07d2`
- License: AGPL-3.0
- Declared package manager: `pnpm@10.6.1`
- Declared Node engine: `>=22.12.0 <23.0.0`

Local machine status:

- Current `node --version`: `v24.4.1`
- Node 22 available via `~/.nvm/versions/node/v22.22.3`.
- `pnpm --version`: `10.6.1`
- `docker` and `docker compose` are now available via Homebrew.
- Local Docker runtime: Colima on QEMU with Docker runtime, `4` CPUs, `6GiB` memory, and `60GiB` disk.
- Colima/Lima storage was moved under `/Volumes/rexy/GitHub/.runtime` via local symlinks so the Docker VM and image layers do not consume the small system data volume.
- Explicit Colima mounts were required for both `/Users/jacobbutler` and `/Volumes/rexy`.
- `pnpm install --frozen-lockfile` completed successfully under Node `v22.22.3` in `30m 40.8s`.
- Prisma Client generation completed during postinstall.
- pnpm reported ignored build scripts for native/tooling packages such as Prisma, Sharp, Canvas, SWC, Sentry, and esbuild; this may need explicit `pnpm approve-builds` handling before a full local app run.
- Homebrew also installed `qemu` because Colima's default VZ driver rejected the external raw disk attachment after a forced reset.

That means vanilla Postiz has now been cloned, source-inspected, dependency-installed under the required Node major version, and run locally through the upstream Docker Compose stack.

## Runtime Proof

Local production-compose run:

- Command: `docker compose -f docker-compose.yaml -f docker-compose.local-runtime.yml up -d`
- URL: `http://localhost:4007`
- Upstream app image: `ghcr.io/gitroomhq/postiz-app:latest`
- Local-only override:
  - `NOT_SECURED=true` for localhost HTTP cookies.
  - Temporal dynamic config mounted from a host path Docker can read.

Validated services:

- `postiz`: running on `0.0.0.0:4007->5000/tcp`.
- `postiz-postgres`: running and healthy.
- `postiz-redis`: running and healthy.
- `temporal`: running with `7233` exposed.
- `temporal-postgresql`: running.
- `temporal-elasticsearch`: running.
- `temporal-admin-tools`: running.
- `temporal-ui`: running on `8080`.
- `spotlight`: running and healthy.

Validated app behavior:

- `GET http://localhost:4007/auth` returned `200 OK` and rendered the Postiz Register page.
- `GET http://localhost:4007/api/auth/can-register` returned `200 OK` with `{"register":true}`.
- `POST http://localhost:4007/api/auth/register` returned `200 OK`, set an `auth` cookie, and returned `{"register":true}`.
- Authenticated `GET http://localhost:4007/` redirected to `/launches`, proving the local session was accepted.
- Direct Postgres verification found the created user and organization:
  - User: `codex-postiz-20260605023601@example.com`, `activated=true`.
  - Organization: `Corvo Labs Local Proof`.

Runtime caveats:

- The first Colima attempt used the default VZ driver. It could boot Docker, but bind mounts from `/Volumes/rexy` appeared empty inside containers, which caused Temporal to fail because `development-sql.yaml` was missing in the container.
- Recreating Colima with `--vm-type qemu --mount /Users/jacobbutler:w --mount /Volumes/rexy:w` fixed the bind-mount issue.
- QEMU is slower than VZ for image extraction, but it produced the reliable runtime proof needed for this spike.
- The upstream Postiz clone has a local-only untracked `docker-compose.local-runtime.yml` used for this proof; it should not be treated as a project commit until we decide the production deployment shape.

## Architecture Observed

Postiz is a larger monorepo than Resonate:

- `apps/frontend`: Next.js frontend.
- `apps/backend`: NestJS backend.
- `apps/orchestrator`: scheduling/orchestration runtime.
- `apps/extension`: browser extension.
- `apps/sdk`: `@postiz/node` SDK.
- `libraries/nestjs-libraries`: integrations, Prisma database code, DTOs, provider logic.
- `libraries/react-shared-libraries`: shared frontend code.
- `libraries/helpers`: shared helpers.

The production Docker compose stack includes:

- `postiz`: `ghcr.io/gitroomhq/postiz-app:latest`, exposed as `4007:5000`.
- `postiz-postgres`: PostgreSQL 17.
- `postiz-redis`: Redis 7.2.
- Temporal stack:
  - `temporal`
  - `temporal-postgresql`
  - `temporal-elasticsearch`
  - Temporal admin/UI support services later in the compose file.
- Optional Sentry Spotlight container.
- Local upload volume at `/uploads`.

This is not a simple route-level embed into the current Next/Convex/Clerk Resonate app. It should be deployed as its own app/service, then bridged into the `resonate.corvolabs.com/v2/*` routing model once the operational shape is clear.

## Required Runtime And Env

Postiz `.env.example` requires:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `NEXT_PUBLIC_BACKEND_URL`
- `BACKEND_INTERNAL_URL`

Storage can start with local files:

- `STORAGE_PROVIDER=local`
- `UPLOAD_DIRECTORY`
- `NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY`

Cloudflare R2 variables are present in the template and may become necessary for production-grade media/avatar persistence:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_ACCESS_KEY`
- `CLOUDFLARE_SECRET_ACCESS_KEY`
- `CLOUDFLARE_BUCKETNAME`
- `CLOUDFLARE_BUCKET_URL`
- `CLOUDFLARE_REGION`

Relevant social provider env vars:

- `X_URL`
- `X_API_KEY`
- `X_API_SECRET`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `YOUTUBE_CLIENT_ID`
- `YOUTUBE_CLIENT_SECRET`
- `TIKTOK_CLIENT_ID`
- `TIKTOK_CLIENT_SECRET`

Postiz also has `OPENAI_API_KEY` for native AI features. For this project, any custom inference work should use PioneerAI, not OpenAI directly, unless we intentionally keep an upstream Postiz AI feature as-is behind configuration.

## Provider Matrix

Target brands and channels:

| Channel | Needed by | Upstream provider found | Validation status | Blocker / note |
| --- | --- | --- | --- | --- |
| Corvo Labs Blog via GitHub PR | Corvo Labs | No | Production tracer validated | Must be custom from day one. Current Resonate `/api/publish` already opens Corvo Labs blog PRs. |
| YouTube | the lower dB, FreshProof, MVP demo | Yes: `youtube` | Placeholder validation passed in Resonate `/v2`; upstream source inspected | Needs Google OAuth client, redirect URL, and one `.mp4` media attachment. Strong first real platform candidate. |
| Instagram | the lower dB | Yes: `instagram`, `instagram-standalone` | Source inspected only | Facebook Business provider requires Instagram business account connected to Facebook Page. Needs Meta app and scopes. |
| X | Corvo Labs, the lower dB, FreshProof | Yes: `x` | Source inspected only | Needs X developer access and `X_API_KEY` / `X_API_SECRET`. Access level and paid/API constraints are unknown. |
| LinkedIn personal | Personal | Yes: `linkedin` | Source inspected only | Needs LinkedIn app and posting scopes. Approval/access likely determines feasibility. |
| LinkedIn Page | Corvo Labs, the lower dB, FreshProof | Yes: `linkedin-page` | Source inspected only | Needs organization admin access and LinkedIn app scopes. Likely approval-sensitive. |
| Reddit | the lower dB, FreshProof | Yes: `reddit` | Source inspected only | Needs Reddit app credentials. Provider supports submit/read/identity/flair and permanent refresh. |
| TikTok | the lower dB | Yes: `tiktok` | Source inspected only | Needs TikTok app credentials/scopes and media validation. No current dev-app experience. |

## Provider Evidence

Provider registration is centralized in `libraries/nestjs-libraries/src/integrations/integration.manager.ts`. The `socialIntegrationList` includes X, LinkedIn, LinkedIn Page, Reddit, Instagram, YouTube, TikTok, and many additional providers.

YouTube:

- File: `libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts`
- Identifier: `youtube`
- Env: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- Redirect: `${FRONTEND_URL}/integrations/social/youtube`
- Scopes include YouTube upload and analytics scopes.
- Validity requires exactly one media attachment and the path must include `mp4`.

Instagram:

- File: `libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts`
- Identifier: `instagram`
- Name: `Instagram (Facebook Business)`
- Tooltip says the Instagram account must be business and connected to a Facebook page.
- Validity requires media, max 10 carousel attachments, and stricter trial reel constraints.

X:

- File: `libraries/nestjs-libraries/src/integrations/social/x.provider.ts`
- Identifier: `x`
- Env: `X_API_KEY`, `X_API_SECRET`, plus optional `X_URL`.
- Max concurrency is 1.
- Length is 280 by default, 4000 for premium/verified settings.

LinkedIn:

- Files:
  - `libraries/nestjs-libraries/src/integrations/social/linkedin.provider.ts`
  - `libraries/nestjs-libraries/src/integrations/social/linkedin.page.provider.ts`
- Identifiers: `linkedin`, `linkedin-page`
- Env: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- Scopes include `w_member_social`, organization admin, and organization social scopes.
- LinkedIn Page has a between-steps company/page selection flow.

Reddit:

- File: `libraries/nestjs-libraries/src/integrations/social/reddit.provider.ts`
- Identifier: `reddit`
- Env: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- Scopes: `read`, `identity`, `submit`, `flair`
- Redirect: `${FRONTEND_URL}/integrations/social/reddit`
- Max concurrency is 1.

TikTok:

- File: `libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts`
- Identifier: `tiktok`
- Env: `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`
- Scopes include `video.publish`, `video.upload`, and user profile/stat scopes.
- Requires media and has validation for video versus multi-image posts.

## Extension Points

Promising customization seams:

- Provider classes under `libraries/nestjs-libraries/src/integrations/social/*`.
- Provider registry in `libraries/nestjs-libraries/src/integrations/integration.manager.ts`.
- Provider DTOs under `libraries/nestjs-libraries/src/dtos/posts/providers-settings/*`.
- Public API and SDK:
  - `@postiz/node`
  - Methods include `post`, `postList`, `upload`, `integrations`, and `deletePost`.
- Backend modules in `apps/backend`.
- Frontend integration and post composer surfaces in `apps/frontend`.
- Orchestration/scheduling behavior in `apps/orchestrator` and Temporal-backed services.

Likely custom modules:

- Corvo Labs Blog provider that creates GitHub PRs instead of posting directly.
- Idea primitive and idea-to-draft promotion flow.
- Voice pack management and brand/workspace defaults.
- PioneerAI inference adapter for custom writing/research workflows.
- Research agent and editorial agent pipeline for deeper, claim-heavy posts.
- FreshProof-style claim validation gates for high-rigor content.
- Unified brand/workspace calendar, if upstream Postiz supports a clean extension point.

## Deployment Recommendation

Use a staged architecture:

1. Keep the existing Resonate app in place.
2. Keep the current `/v2` tracer on Vercel for production workflow validation.
3. Run upstream Postiz as a separate self-hosted service first. Local proof now supports this direction.
4. Once vanilla Postiz is proven, decide between:
   - Reverse proxying `resonate.corvolabs.com/v2/*` to a Postiz service.
   - Keeping a sibling Postiz fork repo and integrating through API/SDK.
   - Vendoring Postiz into a monorepo only if routing/deployment pressure justifies it.

The current recommendation is a sibling fork or sibling service first. Vendoring the full Postiz monorepo into the current Resonate repo is likely to create unnecessary deployment and dependency coupling before the cutover is proven.

## MVP Demo Recommendation

First feasible MVP demo should be:

- Corvo Labs idea.
- PioneerAI-assisted draft generation.
- Corvo Labs Blog GitHub PR creation.
- One scheduled social/video channel, with YouTube as the strongest first candidate.

This matches the production tracer proof already achieved while leaving room to replace the tracer shell with real Postiz once vanilla runtime is validated.

## Remaining Acceptance Gaps

This spike completed vanilla runtime and account-creation proof. Remaining gaps are now integration and customization gaps, not basic runtime feasibility gaps.

Open gaps:

- No real provider OAuth flow has been completed.
- Provider attempts are source-code and env-feasibility inspections only, except the Resonate placeholder YouTube validation.
- A production deployment target has not been selected.
- The production reverse proxy/routing plan for `resonate.corvolabs.com/v2/*` has not been implemented.
- The Postiz fork strategy and upstream cherry-pick/update workflow still need to be written down.

Known local blockers:

- Use Node 22.x for all Postiz work because upstream requires `>=22.12.0 <23.0.0`.
- If using local Colima/Docker, keep the QEMU VM profile and explicit mounts, or re-test VZ before relying on `/Volumes/rexy` bind mounts.
- Decide whether to run `pnpm approve-builds` for ignored native/tooling package build scripts before first app run.
- Supply actual dev app credentials for at least YouTube.

## Next Validation Commands

Recommended next runbook:

```bash
cd /Volumes/rexy/GitHub/postiz-app

# Ensure Node 22.x, not Node 24.x.
node --version

# Install dependencies.
pnpm install

# Start required dev services if Docker is available.
pnpm run dev:docker

# Copy .env.example to .env and set local URLs/secrets.
cp .env.example .env

# Run the app.
pnpm run dev
```

Alternative all-in-one container run:

```bash
cd /Volumes/rexy/GitHub/postiz-app
docker compose -f docker-compose.yaml -f docker-compose.local-runtime.yml up -d
```

Expected local production-compose URL:

```text
http://localhost:4007
```

## Issue Status

Issue #39 now has enough evidence to close once the GitHub issue is updated with this runtime proof. The follow-on work should move to the open implementation issues for production deployment, fork maintenance, real provider OAuth, the Corvo Labs Blog custom channel, and the idea-to-draft customization layer.

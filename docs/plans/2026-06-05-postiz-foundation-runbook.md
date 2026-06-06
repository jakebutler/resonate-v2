# Postiz Rebuild Foundation Runbook

Issue: [#40](https://github.com/jakebutler/resonate/issues/40)

Date: 2026-06-05

## Decision

Use a dedicated customized Postiz fork/service for the Postiz-based Resonate rebuild, while keeping this `jakebutler/resonate` repository as the transition control plane, issue tracker, and legacy Resonate application until cutover.

Chosen shape:

- Legacy Resonate remains deployed and functional on Vercel.
- The current Resonate `/v2` tracer remains useful for production workflow validation until the real Postiz service is ready.
- Customized Postiz lives in the sibling fork `jakebutler/resonate-postiz`.
- The sibling Postiz service should eventually be routed under `resonate.corvolabs.com/v2/*`.
- Do not vendor the full Postiz monorepo into this Next/Convex/Clerk application unless deployment constraints force that later.

Rationale:

- Postiz is a full monorepo with its own Next frontend, Nest backend, Temporal orchestration, Postgres, Redis, Elasticsearch, and container deployment assumptions.
- Vendoring it into the current Resonate repository would couple two application stacks before replacement confidence exists.
- A sibling fork keeps upstream Postiz updates easier to cherry-pick/test while preserving legacy Resonate as a fallback.
- This repository can still own PRDs, issue tracking, production tracer validation, and the eventual reverse-proxy/cutover work.

## Current Local Working Checkouts

Resonate control repo:

```text
/Volumes/rexy/GitHub/resonate
```

Upstream Postiz checkout used for feasibility:

```text
/Volumes/rexy/GitHub/postiz-app
```

Current local remotes:

```text
origin   https://github.com/jakebutler/resonate-postiz.git
upstream https://github.com/gitroomhq/postiz-app.git
```

Current local Postiz runtime facts:

- Upstream commit inspected: `gitroomhq/postiz-app@826d07d2`.
- Dependency install succeeded under Node `v22.22.3`.
- Docker runtime proof succeeded with Colima/QEMU.
- Local runtime URL: `http://localhost:4007`.
- Temporal UI URL: `http://localhost:8080`.
- Runtime storage: `/Volumes/rexy/GitHub/.runtime`.
- Local-only override in the Postiz checkout: `docker-compose.local-runtime.yml`.

The local override is intentionally untracked in the upstream Postiz checkout until the production fork/deploy shape is chosen.

## Local Runtime Commands

Use Node 22 for source-level Postiz work:

```bash
cd /Volumes/rexy/GitHub/postiz-app
source ~/.nvm/nvm.sh
nvm use 22.22.3
pnpm install --frozen-lockfile
```

Use Colima/QEMU for the local Docker stack:

```bash
mkdir -p /Volumes/rexy/GitHub/.runtime/colima /Volumes/rexy/GitHub/.runtime/lima
ln -sfn /Volumes/rexy/GitHub/.runtime/colima ~/.colima
ln -sfn /Volumes/rexy/GitHub/.runtime/lima ~/.lima

colima start \
  --cpu 4 \
  --memory 6 \
  --disk 60 \
  --runtime docker \
  --vm-type qemu \
  --mount /Users/jacobbutler:w \
  --mount /Volumes/rexy:w
```

Run Postiz:

```bash
cd /Volumes/rexy/GitHub/postiz-app
docker compose -f docker-compose.yaml -f docker-compose.local-runtime.yml up -d
docker compose -f docker-compose.yaml -f docker-compose.local-runtime.yml ps -a
```

Stop Postiz without deleting volumes:

```bash
cd /Volumes/rexy/GitHub/postiz-app
docker compose -f docker-compose.yaml -f docker-compose.local-runtime.yml down
```

## Local Runtime Override

The feasibility run used this local-only override:

```yaml
services:
  postiz:
    environment:
      NOT_SECURED: "true"
  temporal:
    environment:
      - DYNAMIC_CONFIG_FILE_PATH=/etc/temporal/config/dynamicconfig/development-sql.yaml
    volumes:
      - /Users/jacobbutler/.colima-postiz-dynamicconfig:/etc/temporal/config/dynamicconfig
```

Why:

- `NOT_SECURED=true` lets localhost HTTP registration cookies work.
- The Temporal dynamic-config override was useful while debugging VZ bind-mount behavior.
- With QEMU and explicit `/Volumes/rexy` mounts, the upstream `./dynamicconfig` bind mount is visible inside containers; keep the override only if it remains useful for repeatability.

## Side-By-Side Deployment Plan

Initial side-by-side state:

- `resonate.corvolabs.com`: legacy Resonate remains the production app.
- `resonate.corvolabs.com/v2`: current tracer remains available until the real Postiz service replaces it.
- Postiz fork/service runs independently with its own database, Redis, Temporal, storage, and provider secrets.

Target routing:

- Route `resonate.corvolabs.com/v2/*` to the Postiz service once it can support the MVP workflow.
- Keep legacy routes untouched during the transition.
- Preserve the ability to roll `/v2/*` back to the tracer or a maintenance page if Postiz is unhealthy.

Recommended first deploy target:

- Use a container-capable host that supports Docker Compose or an equivalent multi-service deployment.
- Keep Postgres, Redis, Temporal, and persistent uploads/backups explicit.
- Avoid trying to deploy full Postiz directly into the current Vercel-only Resonate app.

## Environment And Secrets

Do not commit runtime secrets to repository files.

Core Postiz secrets/env:

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `FRONTEND_URL`
- `NEXT_PUBLIC_BACKEND_URL`
- `BACKEND_INTERNAL_URL`
- storage provider variables for local or R2/S3-compatible storage

Provider credentials to track per brand/channel:

- YouTube: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`
- Instagram/Meta: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- X: `X_API_KEY`, `X_API_SECRET`, optional `X_URL`
- LinkedIn: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`
- Reddit: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- TikTok: `TIKTOK_CLIENT_ID`, `TIKTOK_CLIENT_SECRET`
- Corvo Labs Blog channel: GitHub app/token with PR-only permissions to the Corvo Labs site repository

AI/inference:

- Custom AI work should use PioneerAI as the configured provider for this project.
- Keep the API key in Vercel/host secrets or process environment.
- Do not write the key into checked-in files, docs, logs, or test fixtures.
- Native upstream Postiz AI features may need separate review before enabling, because upstream expects `OPENAI_API_KEY`.

## Upstream Monitoring And Sync

Track upstream:

```bash
cd /Volumes/rexy/GitHub/postiz-app
git remote -v
git fetch origin
git log --oneline --decorate --max-count=20 origin/main
```

Recommended fork workflow:

1. Keep `upstream` pointing at `gitroomhq/postiz-app`.
2. Keep `origin` pointing at `jakebutler/resonate-postiz`.
3. Develop custom work on feature branches with `codex/` prefix.
4. Regularly fetch upstream and compare:

```bash
git fetch upstream
git log --oneline HEAD..upstream/main
git diff --stat HEAD..upstream/main
```

5. Cherry-pick or merge upstream updates into an integration branch first.
6. Run the smoke checklist before merging upstream updates into the custom main branch.
7. Reject or defer upstream updates that break custom modules, provider contracts, or migration safety.

Suggested branch naming:

- `main`: custom fork stable branch.
- `upstream-main`: optional mirror branch of upstream `main`.
- `codex/postiz-ideas-*`: Ideas custom module work.
- `codex/postiz-blog-channel-*`: Corvo Labs Blog custom channel work.
- `codex/postiz-ai-*`: PioneerAI/voice/drafting work.
- `codex/sync-upstream-YYYY-MM-DD`: upstream update test branches.

## Customization Boundary

Prefer additive customization where possible.

Change Postiz core when:

- A new provider/channel must register in Postiz's provider manager.
- A new Post/Idea relationship must participate in normal scheduling or draft surfaces.
- Auth/workspace boundaries need to enforce hard brand separation.
- The frontend needs native navigation/surfaces for Ideas, voice packs, or custom channels.

Add custom modules when:

- The feature is domain-specific to Resonate, Corvo Labs, FreshProof, or lower dB.
- The workflow can live behind new routes, services, tables, or provider classes.
- The code can consume Postiz APIs/SDK rather than patching scheduler internals.

Leave off-the-shelf when:

- Postiz already handles drafts, calendar, media upload, provider auth, inbox, or scheduling adequately.
- A gap is nice-to-have rather than a replacement blocker.
- Configuration or provider credentials are the real blocker, not product behavior.

Expected custom modules:

- Ideas primitive and Ideas inbox.
- Idea-to-draft relationships.
- Markdown voice packs.
- PioneerAI inference adapter and draft-only safety boundary.
- Corvo Labs Blog GitHub PR channel.
- Research/editorial pipeline and FreshProof-style claim validation.

## Smoke Checklist

Run this after local runtime changes, upstream updates, and deploy changes:

1. `docker compose ... ps -a` shows Postiz, Postgres, Redis, Temporal, Temporal dependencies, and Spotlight running.
2. `GET /auth` returns `200 OK`.
3. `GET /api/auth/can-register` returns `{"register":true}` or the expected locked registration response for the target environment.
4. Existing login works or a local placeholder account can register.
5. Authenticated root redirects into the app, such as `/launches`.
6. Postgres contains the expected user and organization/workspace records.
7. A simple draft can be created in the UI or API.
8. A scheduled/draft list or calendar surface can show the draft.
9. Provider registry still includes the MVP target providers.
10. Corvo Labs Blog custom channel still creates or updates a PR once that module exists.
11. AI drafting remains draft-only and cannot publish/schedule without explicit user action.
12. Logs do not print provider secrets, PioneerAI keys, GitHub tokens, auth cookies, or prompt payloads beyond safe debug metadata.

## Naming

Use names that make the transition explicit:

- Issue tracker / legacy app: `resonate`
- Postiz custom service/fork: `resonate-postiz`
- Local runtime directory: `/Volumes/rexy/GitHub/postiz-app`
- Production route: `resonate.corvolabs.com/v2/*`

## Remaining Follow-Ups

- Choose the first hosted/container deployment target.
- Decide whether `/v2/*` reverse proxying should happen at DNS/edge/proxy, in Vercel rewrites, or in a separate gateway.
- Turn the smoke checklist into an executable script once the custom fork exists.
- Decide which local override file, if any, belongs in the fork for developer convenience.

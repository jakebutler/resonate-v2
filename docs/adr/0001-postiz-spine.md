# ADR 0001: Postiz-Compatible Spine Without Vendoring Postiz

Date: 2026-06-06

## Status

Accepted for the MVP validation phase.

## Context

Issue #1 requires a greenfield Resonate v2 MVP that can validate replacement functionality against Resonate v1 while preserving a path to Postiz scheduling, providers, composer/calendar patterns, and future direct OAuth connections.

The current Resonate v1 app already contains the validation surfaces that matter for parity: Ideas, kanban workflow, AI/research flows, calendar, blog PR publishing, and migration-worthy Convex data. Prior Postiz feasibility work proved Postiz is a larger monorepo/runtime with Next frontend, Nest backend, Temporal, Postgres, Redis, Elasticsearch, and storage assumptions.

## Decision

Use the tracked Resonate v1 app as the runnable validation shell for this repo, then add a Postiz-compatible domain spine in owned code:

- Brand/workspace.
- Channel and Platform.
- Provider routing.
- Publishing Intent.
- Provider State.
- Publish Attempt.
- Provider adapter contract and Mock Provider.

Do not vendor the full Postiz monorepo into this repository for the MVP validation pass. Keep Postiz as a future self-hosted service/fork option and document the upstream baseline separately.

## Upstream Baseline

The prior inspected Postiz baseline was:

- Repository: `gitroomhq/postiz-app`.
- Local checkout used for feasibility: `/Volumes/rexy/GitHub/postiz-app`.
- Commit inspected during the previous feasibility run: `826d07d2`.
- Package manager: `pnpm@10.6.1`.
- Node engine observed: `>=22.12.0 <23.0.0`.

Refresh this baseline before any direct Postiz source import or fork sync work.

## Consequences

- Resonate v2 is runnable locally immediately through the existing Next/Convex stack.
- The v2 MVP can validate user-facing parity before adopting full Postiz deployment complexity.
- Provider and scheduler code must be written behind explicit contracts so it can later map onto Postiz providers, integrations, or direct OAuth.
- Upstream sync remains a documented operational step, not an implicit package update.
- If the MVP later moves to a Postiz fork/service, this repo's domain types and behavior tests become the contract that the fork must satisfy.

## Upstream Sync Process

When direct Postiz integration begins:

1. Fetch the upstream Postiz repository.
2. Record the upstream commit in this ADR or a successor ADR.
3. Compare provider, scheduler, composer, calendar, and integration APIs against the v2 domain contract.
4. Port additive custom modules first.
5. Run the no-publish Mock Provider tests before any real provider validation.
6. Keep live provider submissions manually gated.

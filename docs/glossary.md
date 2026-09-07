# Resonate v2 Glossary

Date: 2026-06-06

This glossary keeps the MVP language stable while Resonate v2 is validated against Resonate v1 and future Postiz-backed runtime options.

## Reviewable-Parity Rework (locked 2026-06-06)

These decisions govern the rework that gets v2 into a state where it can be fairly evaluated
against v1. They supersede earlier "cutover complete" framing.

- **System of record.** Convex is the single source of truth for ideas, draft variants, and posts.
  Browser `localStorage` is retired for anything but transient unsaved form input. See ADR 0005.
- **Onboarding.** Brand/channel provisioning happens automatically for a signed-in user. The word
  "seed"/"seed workspace" is internal only and must not appear in the UI. The end-user term for a
  publishing workspace is **Brand**.
- **UI language.** Internal domain terms ("Persisted MVP Spine", "Publishing Intent", "Provider
  State", "Mock Provider") must not be surfaced as primary UI copy. The calendar surface is
  labeled **"Publishing calendar."** Schedule/status use plain words. Simulation controls are
  hidden behind a dev/test mode by default.
- **Social posting vs. authentication.** For the review pass, social posting (LinkedIn via Buffer,
  Reddit via Zernio) is **simulated**, but **authentication/connection to the real social accounts
  must be validated** as part of this pass (read-only account/health checks against live Buffer
  and Zernio). Corvo Blog publishing via GitHub PR remains real.
- **Blog images.** Corvo Blog hero images support **both upload and URL** as authorable per-post
  fields; no hardcoded placeholder image.
- **Scope deferred to post-MVP.** The workflow/kanban board and voice packs are **out of scope**
  for the reviewable-parity pass.
- **Real data.** The user's actual v1 ideas are imported into v2 so evaluation uses real content,
  not seeds.
- **Definition of reviewable.** A written evaluation script runs end-to-end on
  `resonate.corvolabs.com/v2` (capture idea → generate/edit draft → schedule → Blog PR real /
  social validated+simulated → see on calendar → delete) with zero jargon, zero crashes, and full
  persistence.

## Core Scope

### Resonate v1

The current control application in `/Volumes/rexy/GitHub/resonate`. It is the functional baseline for Ideas, drafting, calendar visibility, workflow board behavior, blog PR publishing, and migration fixtures.

### Resonate v2

The validation application in this repository. It starts from the tracked v1 app for parity, then adds a Postiz-compatible domain spine around multi-brand publishing, provider state, research artifacts, and approval gates.

### Postiz-Compatible Spine

The owned Resonate v2 domain model that can later map to Postiz providers, integrations, scheduling, or direct OAuth. It does not mean the full upstream Postiz monorepo is vendored into this repository.

### Postiz Service

A future sibling service or fork of upstream Postiz. It may own provider OAuth, scheduling workers, provider inboxes, and provider-specific publishing once the v2 MVP proves the workflow.

## Workspace Model

### Brand

An owned publishing workspace such as Personal, Corvo Labs, the lower dB, or FreshProof. Brand boundaries determine visibility, channel configuration, research ownership, and authorization checks.

### Channel

A brand-scoped publishing destination, such as Corvo Blog, LinkedIn, Reddit, YouTube, X, Instagram, or TikTok. Channels can exist for planning even when they are not routable.

### Platform

The destination family behind a channel. For MVP purposes, `channelId` and `platformId` are usually the same, except that provider routing may treat a channel specially, such as Corvo Blog routing through GitHub PRs.

### Routable Channel

A channel that has an approved provider route for submission. MVP routable examples are LinkedIn through Buffer, Reddit through Zernio, and Corvo Blog through GitHub PR creation. Unroutable channels can appear in calendars and filters but cannot submit.

## Publishing Model

### Publishing Intent

The user's desired publishing plan: Brand, Channel, Platform, schedule date/time, timezone, approval state, and source links to Ideas or research artifacts. Intent is Resonate-owned and can exist before provider submission.

### Provider State

The current known state from an external provider, PR channel, or Mock Provider. Provider State records outcomes such as not submitted, submitted, published, needs review, failed, unavailable, or cancel intent recorded.

### Publish Attempt

A single submission attempt snapshot. Attempts record provider, sanitized request/response summary, retry count, and idempotency key. Attempts must not store provider credentials or unsanitized secret-bearing responses.

### Mock Provider

The no-publish provider used for MVP validation. It simulates success, retryable failure, permanent failure, ambiguous outcome, published, and unavailable without calling live Buffer, Zernio, GitHub publishing, or Postiz provider APIs.

### Cancel/Unpublish Intent

A Resonate-owned action that records the user's intent to cancel or unpublish provider work. It creates an audit/provider-state marker but does not silently mutate external provider artifacts.

## Approval Rules

### Schedule

The desired date/time for publication. A schedule is not approval.

### Approval

An explicit state change that permits a scheduled item to become eligible for provider submission. Content edits clear approval. Date-only schedule edits preserve approval.

### Needs Review

A state for ambiguous provider outcomes or policy-sensitive artifacts that require human review before retrying, publishing, or relying on the result.

## Research Model

### Research Brief

A brand-owned research request containing topic, audience, thesis, depth, risk level, target outputs, provider, and source snapshots.

### Source Snapshot

A persisted record of a candidate source returned by source discovery. Source snapshots preserve title, URL, evidence label, relevance/use case metadata, and reviewer status.

### Claim Map

A persisted set of candidate claims generated from accepted sources. Claim maps are review artifacts, not truth assertions.

### Claim Review

Human review status for each candidate claim. Accepted claims can feed outlines and drafts; unsupported, too-risky, out-of-scope, or needs-revision claims should not be used directly in drafts.

## Provider Routing

### Buffer

The planned live provider route for LinkedIn once explicitly approved.

### Zernio

The planned live provider route for Reddit once explicitly approved.

### GitHub PR Provider

The Corvo Blog route that creates a pull request against `jakebutler/corvo-labs-dot-com`. Live validation remains gated by explicit approval and repository access.

### Direct OAuth

A later path where Resonate/Postiz can connect directly to providers instead of delegating through Buffer or Zernio. MVP behavior should keep provider contracts clean enough to support this later path.

## Safety Terms

### Server-Side Secret

A credential read only in server, worker, Convex, or host secret scope. Provider credentials must not use `NEXT_PUBLIC_`, appear in client payloads, fixtures, screenshots, audit events, provider states, or docs.

### Explicit Live-Provider Approval

The user's manual go-ahead to call real provider APIs. Until this is granted for a provider, all validation must remain behind Mock Provider behavior.

## Campaign Loop Terms (locked 2026-09-06, wayfinder #61/#69)

Defined by `docs/campaigns/2026-09-06-campaign-loop-spec.md`. These are product terms; no `v2` prefix.

- **Brand corpus.** Brand-scoped collection of immutable corpus versions shared across campaigns. Ingest lands here first; campaign attachment is separate.
- **Corpus version.** One immutable snapshot produced by a single ingest (document upload or CLI import). Never mutated after save.
- **Excerpt.** A complete semantic unit (one or more whole thoughts/facts/arguments) inside a corpus version, with provenance, sensitivity (default `unreviewed`), and a stable number. Never a raw chunk. Cited by ideas as `corpus://…#excerpt-N`.
- **Campaign.** Brand-scoped arc from source material to published batch. Created title-only; goal/audience arrive at the shape step.
- **Idea flavors.** Opinion / Insight / Thought. There is no separate Stance type.
- **Working set.** The ideas accepted into a campaign (campaign-primary). Many-to-many with campaigns; slot membership is one-way.
- **Campaign shape.** The durable slot plan accepted by the operator: numbered slots in publishing sequence.
- **Slot.** One planned item in a shape: channel × media type × role, optional title/angle, linked idea. Roles: pillar / hook / satellite / cta / recap. Media types: post / article / essay / script.
- **Publishing sequence vs publishing schedule.** The shape fixes sequence (1 → n); the calendar owns schedule (dates/times).
- **Draft set.** Placeholders generated as one set from an accepted shape; every draft is scheduled-but-unapproved.
- **Cohesion gate.** Blocking set-level check before materialization: exactly one pillar, exactly one CTA, no repeated framing openers, satellites reference the pillar claim. Mechanical violations auto-resolve with explanatory notes.
- **Approval queue.** The calendar presentation of materialized drafts: expandable rows, inline approve for posts, composer routing for long-form, sequence-aware next-draft flow. Approve ≠ submit.

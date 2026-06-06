# ADR 0002: Provider Routing, Approval, And Secret Handling

Date: 2026-06-06

## Status

Accepted.

## Decision

Resonate v2 separates user intent from provider outcomes.

- Publishing Intent records Brand, Channel, Platform, schedule, timezone, approval state, and source Idea/research links.
- Provider State records what the external provider or PR channel reported.
- Publish Attempts record provider used, submission snapshot, sanitized response, retry count, and an idempotency key.

Provider routing for MVP validation:

- LinkedIn routes through Buffer.
- Reddit routes through Zernio.
- Corvo Blog routes through GitHub PR creation against `jakebutler/corvo-labs-dot-com`.
- Other target platforms can exist for planning/filtering, but unroutable Channels cannot submit.

## Approval Rules

- A schedule is not an approval.
- Scheduled but unapproved posts can exist and appear on the calendar.
- Scheduled but unapproved posts are not eligible for provider submission.
- Content changes clear approval and return the post to Draft.
- Date-only schedule changes preserve approval.
- Ambiguous provider outcomes move to Needs Review before any human-visible retry action.
- Cancel/unpublish intent records Resonate-owned intent and does not silently mutate external provider artifacts.

## Provider Validation

Buffer, Zernio, and GitHub-provider validation must stay behind Mock Provider behavior until explicit human approval is given for live submission.

`lib/v2ProviderAdapters.ts` defines the provider adapter contract used for this gate:

- `validateConnection`
- `submit`
- `recordCancelOrUnpublishIntent`
- `refreshStatus`
- response sanitization
- retry/permanent/ambiguous error classification

Buffer and Zernio adapters may confirm server-side credential presence and explicit approval state, but they must not perform live HTTP submission until the corresponding provider validation is approved and the endpoint behavior is manually verified.

Mock Provider must simulate:

- success
- retryable failure
- permanent failure
- ambiguous outcome
- published
- unavailable

## Secret Handling

- Provider credentials are read server-side or worker-side only.
- Provider credentials must not use client-exposed prefixes such as `NEXT_PUBLIC_`.
- Provider credentials must not be committed, logged, serialized to client payloads, included in fixtures, screenshots, or provider state.
- If a Postiz compatibility sentinel is needed, use only a non-secret literal such as `external-provider-managed`.

# Zernio API Notes (B.5 spike)

Date: 2026-06-06  
Sources: [Zernio Reddit API](https://zernio.com/reddit-api), [Zernio social posting API](https://zernio.com/social-media-api)

## Endpoint

- Base URL: `https://zernio.com/api/v1`
- Auth: `Authorization: Bearer <ZERNIO_API_KEY>`
- JSON request/response bodies

## Read path (already wired)

- `GET /accounts?platform=reddit` lists connected Reddit accounts.
- `GET /accounts/health?platform=reddit` returns token/permission health.

Live validation found healthy Reddit account `the_lower_db` (see `docs/live-provider-validation.md`).

## Write path (B.5)

### Schedule a Reddit post

```http
POST /posts
Content-Type: application/json
Authorization: Bearer <ZERNIO_API_KEY>
```

Required body fields for queue-only validation:

| field | value |
| --- | --- |
| `content` | Post body |
| `title` | Reddit post title |
| `scheduledFor` | ISO-8601 UTC timestamp |
| `timezone` | IANA timezone for schedule context |
| `platforms[0].platform` | `reddit` |
| `platforms[0].accountId` | Zernio account id for brand's Reddit account |
| `platforms[0].platformSpecificData.subreddit` | Target subreddit without `r/` prefix |

Do **not** use `publishNow` for validation. Prefer `scheduledFor` at least 24 hours out.

### Cancel / delete

```http
DELETE /posts/{id}
```

### Refresh status

```http
GET /posts/{id}
```

Observed status values in docs/marketing copy: `scheduled`, `pending`, `published`, `failed`, `cancelled`, `removed`, moderation-queue states.

## Brand → account mapping (MVP)

| v2 brand | Zernio Reddit `username` |
| --- | --- |
| `lower-db` | `the_lower_db` |

Resolve full `accountId` at runtime via the accounts query; never hardcode provider IDs in repo fixtures.

## Validation subreddit

| purpose | subreddit |
| --- | --- |
| B.5 live validation | `testingground4bots` (`r/testingground4bots`) |

Override with `ZERNIO_VALIDATION_SUBREDDIT` in server env if the sandbox subreddit is rejected.

## Gating

| gate | env / flag |
| --- | --- |
| Read-only validation | `liveProviderValidationApproved: true` (runtime flag) |
| Live HTTP submission | `ZERNIO_LIVE_SUBMISSION=approved` (server env) |

Human-gated retry remains unchanged (A.1.2): no automatic retries; explicit Retry action only.

## Reddit failure classification

| signal | attempt status | provider state |
| --- | --- | --- |
| Rate limits (`429`, "rate limit") | `retryable-failure` | `failed` |
| Moderation / automod / subreddit rules | `permanent-failure` | `needs-review` |
| Removed / missing post | `ambiguous` | `needs-review` |
| Suspended / banned account | `unavailable` | `unavailable` |

## Risks

- `publishNow` would post immediately — validation must use `scheduledFor`.
- If `POST /posts` succeeds but response parsing fails, treat as `ambiguous` and require human review before retry.
- Account lookup failure should be `permanent-failure` (misconfiguration), not retryable.
- Subreddit rejection or mod-queue holds should surface as `needs-review`, not silent success.

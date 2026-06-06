# Buffer API Notes (B.4 spike)

Date: 2026-06-06  
Sources: [Buffer API reference](https://developers.buffer.com/reference.html), [create scheduled post example](https://developers.buffer.com/examples/create-scheduled-post.html)

## Endpoint

- Single GraphQL endpoint: `POST https://api.buffer.com`
- Auth: `Authorization: Bearer <BUFFER_API_KEY>`
- Body: `{ "query": "...", "variables": { ... } }`
- GraphQL errors and mutation union errors both return HTTP 200; inspect `errors` and `... on MutationError`.

## Read path (already wired)

- `account { id name organizations { id name } }`
- `channels(input: { organizationId }) { id name displayName service isQueuePaused }`

Corvo production validation found LinkedIn channels `corvo-labs-us` and `the-lower-db` (see `docs/live-provider-validation.md`).

## Write path (B.4)

### Schedule a post

```graphql
mutation BufferCreatePost($input: CreatePostInput!) {
  createPost(input: $input) {
    ... on PostActionSuccess {
      post { id status dueAt shareMode }
    }
    ... on MutationError {
      message
    }
  }
}
```

Required `CreatePostInput` fields for queue-only validation:

| field | value |
| --- | --- |
| `channelId` | Buffer channel id for brand's LinkedIn account |
| `text` | Post body |
| `schedulingType` | `automatic` |
| `mode` | `customScheduled` |
| `dueAt` | ISO-8601 UTC timestamp |

Do **not** use `shareNow` for validation. Prefer `customScheduled` at least 24 hours out.

### Cancel / delete

```graphql
mutation BufferDeletePost($id: PostId!) {
  deletePost(input: { id: $id }) {
    ... on DeletePostSuccess { id }
    ... on MutationError { message }
  }
}
```

### Refresh status

```graphql
query BufferPost($id: PostId!) {
  post(input: { id: $id }) {
    id
    status
    dueAt
    shareMode
  }
}
```

`PostStatus` values observed in docs: `draft`, `needs_approval`, `scheduled`, `sending`, `sent`, `error`.

## Brand → channel mapping (MVP)

| v2 brand | Buffer channel `name` |
| --- | --- |
| `corvo` | `corvo-labs-us` |
| `lower-db` | `the-lower-db` |

Resolve full `channelId` at runtime via the channels query; never hardcode provider IDs in repo fixtures.

## Gating

| gate | env / flag |
| --- | --- |
| Read-only validation | `liveProviderValidationApproved: true` (runtime flag) |
| Live HTTP submission | `BUFFER_LIVE_SUBMISSION=approved` (server env) |

Human-gated retry remains unchanged (A.1.2): no automatic retries; explicit Retry action only.

## Risks

- `shareNow` would publish immediately — validation must use `customScheduled`.
- If `createPost` succeeds but response parsing fails, treat as `ambiguous` and require human review before retry.
- Channel lookup failure should be `permanent-failure` (misconfiguration), not retryable.

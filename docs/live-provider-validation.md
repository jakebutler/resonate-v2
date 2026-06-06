# Live Provider Validation

Date: 2026-06-06

This document records the first approved live validation pass for the MVP provider routes. It intentionally excludes API keys, access tokens, full provider IDs, and any raw secret-bearing responses.

## Approval Boundary

The user approved live GitHub PR creation and live provider validation on 2026-06-06. Posting to social platforms is still a separate product behavior from read-only connection validation. Buffer and Zernio validation in `lib/v2ProviderAdapters.ts` performs read-only account/channel checks; social post creation remains unavailable until the submission payload and cancellation semantics are explicitly implemented and tested.

## Buffer LinkedIn

Source docs:

- Buffer authentication uses `Authorization: Bearer` against `https://api.buffer.com`.
- Buffer's current API is GraphQL; organizations are read from `account.organizations`, and channels are read via `channels(input: { organizationId })`.

Validation command shape:

```bash
# Reads BUFFER_API_KEY from server/local secret scope only.
POST https://api.buffer.com
query { account { id name organizations { id name } } }

POST https://api.buffer.com
query BufferChannels($organizationId: OrganizationId!) {
  channels(input: { organizationId: $organizationId }) {
    id
    name
    displayName
    service
    isQueuePaused
  }
}
```

Sanitized result:

```json
{
  "accountOk": true,
  "accountStatus": 200,
  "account": {
    "id": "6a23...5386",
    "name": "butler.jake"
  },
  "organizationsCount": 1,
  "linkedinChannels": [
    {
      "id": "6a23...d409",
      "name": "corvo-labs-us",
      "displayName": "Corvo Labs",
      "service": "linkedin",
      "isQueuePaused": false
    },
    {
      "id": "6a23...d40a",
      "name": "the-lower-db",
      "displayName": "the lower dB",
      "service": "linkedin",
      "isQueuePaused": false
    }
  ]
}
```

Conclusion: Buffer authentication is valid and both Corvo Labs and the lower dB LinkedIn channels are connected and active.

## Zernio Reddit

Source docs:

- Zernio uses API key authentication as `Authorization: Bearer <token>`.
- `GET /api/v1/accounts?platform=reddit` lists connected Reddit accounts.
- `GET /api/v1/accounts/health?platform=reddit` returns token/permission health.

Validation command shape:

```bash
# Reads ZERNIO_API_KEY from server/local secret scope only.
GET https://zernio.com/api/v1/accounts?platform=reddit
GET https://zernio.com/api/v1/accounts/health?platform=reddit
```

Sanitized result:

```json
{
  "accountsStatus": 200,
  "accountsOk": true,
  "redditAccountCount": 1,
  "redditAccounts": [
    {
      "id": "6a23...c01d",
      "platform": "reddit",
      "username": "the_lower_db",
      "displayName": "the_lower_db",
      "profileUrl": "https://reddit.com/user/the_lower_db",
      "isActive": true,
      "profile": {
        "id": "6a23...ac46",
        "name": "Default"
      }
    }
  ],
  "healthStatus": 200,
  "healthOk": true,
  "redditHealth": [
    {
      "accountId": "6a23...c01d",
      "platform": "reddit",
      "username": "the_lower_db",
      "displayName": "the_lower_db",
      "status": "healthy",
      "issues": []
    }
  ]
}
```

Conclusion: Zernio authentication is valid and the lower dB Reddit account is connected, active, and healthy.

### B.5 live submission cycle (2026-06-06)

Gated by `ZERNIO_LIVE_SUBMISSION=approved`. Validation script: `scripts/zernio-live-validation.mjs`.

Sanitized result:

```json
{
  "ok": true,
  "account": "the_lower_db",
  "subreddit": "testingground4bots",
  "scheduledFor": "2026-06-07T18:48:00.000Z",
  "providerPostId": "6a24...dac3",
  "refreshedStatus": "scheduled",
  "cancelled": true
}
```

Conclusion: Zernio can schedule a Reddit post to `r/testingground4bots` for `the_lower_db`, refresh status, and cancel the scheduled post without publishing immediately.

## Corvo Blog GitHub PR

Validation route:

```bash
POST http://localhost:3000/api/publish
```

Environment:

- `E2E_BYPASS_AUTH=1 npm run dev`
- `GITHUB_TOKEN`, `BLOG_REPO_OWNER`, `BLOG_REPO_NAME`, and `BLOG_CONTENT_PATH` read from local secret scope.

Sanitized result:

```json
{
  "prUrl": "https://github.com/jakebutler/corvo-labs-dot-com/pull/53",
  "branchName": "resonate/blog-post-2026-06-20-resonate-v2-github-pr-validation-2026-06-06",
  "sanitizedResponse": {
    "repo": "jakebutler/corvo-labs-dot-com",
    "number": 53,
    "state": "open",
    "scheduleTrigger": "pr-body",
    "scheduledDate": "2026-06-20",
    "scheduledTime": "09:00",
    "timezone": "America/Los_Angeles"
  }
}
```

Verified with `gh pr view` and `gh pr diff`:

- PR: https://github.com/jakebutler/corvo-labs-dot-com/pull/53
- Base: `main`
- File: `corvo-labs-enhanced/content/blog/2026-06-20-resonate-v2-github-pr-validation-2026-06-06.mdx`
- Frontmatter includes `date`, `scheduledTime`, `timezone`, `status: "draft"`, hero image metadata, category, tags, and description.
- PR body records schedule trigger and human-review intent.

Conclusion: The Corvo Blog route can authenticate with GitHub, write MDX into the real blog repo, and create a reviewable PR without auto-publishing.

## Buffer LinkedIn live submission (B.4)

Date: 2026-06-06

Gate: `BUFFER_LIVE_SUBMISSION=approved` (server env) plus `liveProviderValidationApproved: true` at runtime.

Validation command:

```bash
BUFFER_LIVE_SUBMISSION=approved npx tsx scripts/buffer-live-validation.mjs
```

Cycle:

1. Read-only `validateConnection` against Corvo Labs LinkedIn (`corvo-labs-us`).
2. `createPost` with `mode: customScheduled` ~24 hours out.
3. `post` query refresh (`status: scheduled`).
4. `deletePost` cancel before publish.

Sanitized result:

```json
{
  "ok": true,
  "channel": "corvo-labs-us",
  "dueAt": "2026-06-07T18:45:00.000Z",
  "providerPostId": "6a24...fe5f",
  "refreshedStatus": "scheduled",
  "cancelled": true
}
```

Conclusion: Buffer live schedule → refresh → cancel works for Corvo Labs LinkedIn when the submission gate is explicitly approved.

Note: `resonate-v2` Vercel production currently has a placeholder `BUFFER_API_KEY` (length 2). Copy the production-scope key into the v2 Vercel project before relying on deployed live submission.

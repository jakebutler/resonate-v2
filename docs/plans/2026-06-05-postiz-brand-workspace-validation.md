# Postiz Brand Workspace Validation

Issue: [#41](https://github.com/jakebutler/resonate/issues/41)

Date: 2026-06-05

## Status

Partially validated. Do not close #41 yet.

The local Postiz runtime can create hard-separated brand organizations for the target brands. Real connected-channel validation is blocked because provider credentials/dev apps are still placeholders.

## Local Runtime

Runtime used:

```text
/Volumes/rexy/GitHub/postiz-app
http://localhost:4007
```

Stack status:

- Postiz app: running.
- Postgres: running and healthy.
- Redis: running and healthy.
- Temporal: running.
- Temporal UI/admin dependencies: running.

## Brand Organizations Created

Created separate local owner accounts and organizations through the normal Postiz registration API:

| Brand | Local owner email | Postiz role | Org API visibility |
| --- | --- | --- | --- |
| Personal | `codex-personal-20260605024128@example.com` | `SUPERADMIN` | Owner sees only `Personal` |
| Corvo Labs | `codex-corvo-labs-20260605024130@example.com` | `SUPERADMIN` | Owner sees only `Corvo Labs` |
| the lower dB | `codex-the-lower-db-20260605024131@example.com` | `SUPERADMIN` | Owner sees only `the lower dB` |
| FreshProof | `codex-freshproof-20260605024132@example.com` | `SUPERADMIN` | Owner sees only `FreshProof` |

Validation evidence:

- `POST /api/auth/register` returned `200 OK` and `{"register":true}` for each brand.
- `GET /api/user/self` returned distinct `orgId` values for each brand owner.
- `GET /api/user/organizations` returned exactly one organization for each brand owner.
- Direct Postgres verification found all four organizations with owner role `SUPERADMIN` and activated local users.

## Hard-Separation Notes

Postiz's current separation model is organization-based:

- `Organization` stores the brand/workspace entity.
- `UserOrganization` links users to organizations and roles.
- Request org context is resolved from the user's available organizations and optional `showorg` cookie/header.
- Integration rows are scoped by `organizationId`.
- Post rows are scoped by `organizationId`.

For the MVP, each brand can be treated as a separate Postiz organization. This matches the "hard-separated" requirement better than trying to model brands as tags, groups, or loose metadata.

## Channel Validation

Current connected integrations:

| Brand | Connected integrations |
| --- | ---: |
| Personal | 0 |
| Corvo Labs | 0 |
| the lower dB | 0 |
| FreshProof | 0 |

This is expected with placeholder credentials.

Provider OAuth URL behavior from the Corvo Labs organization:

| Provider | Local API result | Meaning |
| --- | --- | --- |
| YouTube | OAuth URL generated with blank `client_id` | Provider code path exists, but Google credentials are missing. |
| Instagram | Facebook OAuth URL generated with blank `client_id` | Provider code path exists, but Meta credentials/account setup are missing. |
| X | `{"err":true}` | Provider cannot generate auth URL with current config; X credentials/access required. |
| LinkedIn | OAuth URL generated with blank `client_id` | Provider code path exists, but LinkedIn credentials/scopes are missing. |
| LinkedIn Page | OAuth URL generated with blank `client_id` | Provider code path exists, but LinkedIn org/page credentials/scopes are missing. |
| Reddit | OAuth URL generated with blank `client_id` | Provider code path exists, but Reddit app credentials are missing. |
| TikTok | OAuth URL generated with blank `client_key` | Provider code path exists, but TikTok credentials/scopes are missing. |

No real OAuth flow was completed.

## Blocked Acceptance Criteria

The following #41 criteria remain blocked:

- Separate connected channels per brand.
- Create or schedule a simple post in at least one validated real channel.
- Validate brand-specific calendar context with real connected channels.
- Document credential ownership per brand using actual credentials/dev apps.
- Validate unified cross-brand calendar behavior with real multi-brand scheduled posts.

Primary blocker:

- No real provider credentials/dev apps are available in the local Postiz runtime.

Most direct unblocker:

- Configure YouTube credentials first, because YouTube remains the strongest first real provider candidate.

## Recommended Next Step

Use #41's next implementation pass to connect YouTube for one brand, preferably Corvo Labs or FreshProof, because:

- The YouTube provider exists upstream.
- The provider can generate an OAuth URL once `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` are configured.
- YouTube was already chosen as the easiest first real channel to validate.

Once YouTube OAuth is complete:

1. Connect the YouTube channel under one brand.
2. Confirm `GET /api/integrations/list` returns that integration only for the owning brand.
3. Create a draft/scheduled test post with one valid `.mp4` attachment.
4. Confirm the post is scoped to the owning organization.
5. Re-check whether a useful unified calendar exists off-the-shelf.

## Conclusion

The organization/workspace foundation is valid: Postiz can model Personal, Corvo Labs, the lower dB, and FreshProof as hard-separated organizations.

#41 should remain open until at least one real provider is connected and a draft or scheduled post is created through the normal Postiz channel flow.

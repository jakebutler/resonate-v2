# V2 Resonate Ops Runbook

Last updated: 2026-06-06

---

## 1. Local Development

### Prerequisites
- Node.js 20+
- `pnpm` (preferred) or `npm`
- A `.env.local` file at the repo root (see §5 Secrets)

### Start local dev server
```bash
pnpm dev
# or
npm run dev
```

App runs at `http://localhost:3000`. V2 app is at `/v2`.

`E2E_BYPASS_AUTH=1` skips Clerk provider hydration for local/E2E browser smoke
tests, even when `.env.local` contains production-domain Clerk browser keys.
Persisted Convex data still requires either a local seeded deployment or a valid
Convex identity; use a properly authenticated Vercel preview for full
persisted-data smoke.

### Run tests
```bash
npx vitest run         # all tests, once
npx vitest             # watch mode
```

### Run type checking
```bash
npm run typecheck
```

---

## 2. Deploy and Update

### Vercel auto-deploy
Pushes to `main` trigger automatic deployment to `resonate.corvolabs.com` via Vercel.
No manual deploy step required.

### Side-by-side v2 validation project
Before cutover, v2 may also run as a separate Vercel project deployed from this repository while v1 remains attached to the existing production project. Keep v2 preview/production environment variables in Vercel secret scope, run the post-deploy smoke below with real auth, and only repoint `resonate.corvolabs.com` to the v2 repo/project after the cutover checklist passes.

### Manual deploy trigger
```bash
# From the Vercel dashboard: Deployments → Redeploy latest
# Or via CLI (requires vercel CLI installed):
vercel --prod
```

### Upstream Postiz update testing
When upgrading the Postiz fork dependency:
1. Check the Postiz changelog for breaking changes to routes or API contracts.
2. Run `npx vitest run` — all API route tests must remain green.
3. Smoke-test `/v2` locally: ideas, variant generation, source review, claim map, outline, draft.
4. Deploy to Vercel preview branch before merging to main.

---

## 3. Incident Recovery

### Draft generation fails (no AI output)
- Check `PIONEER_API_KEY` is set in Vercel environment variables.
- All `/api/v2/*` routes fall back to deterministic mock when the key is missing or the request fails. The `warning` field in the response indicates fallback mode.
- Confirm the model name via `PIONEER_DRAFT_MODEL` env var (defaults to `claude-opus-4-7`).

### Corvo Blog PR creation fails
- Check `GITHUB_TOKEN` is set and has `repo` scope.
- Check `/api/publish` logs in Vercel Functions log.
- Confirm the target repo and branch in `lib/github.ts` or env overrides. The validated default target is `jakebutler/corvo-labs-dot-com` on `main`.
- Confirm schedule metadata is present in the generated MDX frontmatter and PR body. Resonate records scheduled date, optional time, timezone, and schedule trigger, but it does not auto-merge or silently mutate existing PRs.
- Live validation proof is recorded in `docs/live-provider-validation.md`; the first approved route test created PR #53 in `jakebutler/corvo-labs-dot-com`.

### Buffer or Zernio validation fails
- Check `BUFFER_API_KEY` and `ZERNIO_API_KEY` are set in local/server/Vercel secret scope for the environment being tested.
- Buffer validation is read-only and calls `https://api.buffer.com` with GraphQL `account` and `channels(input: { organizationId })` queries.
- Zernio validation is read-only and calls `https://zernio.com/api/v1/accounts?platform=reddit` plus `/accounts/health?platform=reddit`.
- Do not print provider keys or raw provider responses. Store only sanitized IDs and account/channel health summaries.
- Social post creation through Buffer/Zernio is intentionally unavailable until submission, cancel/unpublish, idempotency, and status refresh behavior are implemented and tested.

### YouTube validation fails
- Check `YOUTUBE_API_KEY` is set.
- `/api/v2/validate-youtube` returns descriptive error objects; check the `error` field in the response.

### localStorage state is corrupt or lost
- V2 stores all workspace state in browser localStorage under key `resonate:v2:workspace`.
- To reset: open browser DevTools → Application → Local Storage → delete the key.
- The app will reinitialize with `DEFAULT_V2_STATE` on next load.
- No server-side state is affected.

---

## 4. Backup and Restore

### What to back up
- V2 local tracer state uses browser localStorage under `resonate:v2:workspace`.
- V2 persisted MVP spine data lives in Convex: Brands, Channels, Posts, Publishing Intents, Provider State, Publish Attempts, audit events, research briefs, sources, claim maps, and claims.
- Voice pack customizations in the current tracer still live in browser localStorage.
- Legacy Convex tables should be exported separately before deprecating v1.

### Restore procedure
- For localStorage: copy the JSON value from one browser and paste it into another via DevTools.
- For Convex: export/import via Convex tooling or dashboard for the active deployment. Validate brand memberships before exposing restored v2 records to users.

---

## 5. Secrets Handling

### Required environment variables

| Variable | Purpose | Where to set |
|---|---|---|
| `PIONEER_API_KEY` | PioneerAI / LLM access for all /api/v2 AI routes | Vercel env vars (production + preview) |
| `PIONEER_DRAFT_MODEL` | Model override (default: `claude-opus-4-7`) | Vercel env vars (optional) |
| `GITHUB_TOKEN` | Corvo Blog PR creation via /api/publish | Vercel env vars |
| `BLOG_REPO_OWNER` | Optional Corvo Blog repo owner override; defaults to `jakebutler` | Vercel env vars |
| `BLOG_REPO_NAME` | Optional Corvo Blog repo name override; defaults to `corvo-labs-dot-com` | Vercel env vars |
| `BLOG_CONTENT_PATH` | Optional MDX destination override | Vercel env vars |
| `BUFFER_API_KEY` | Read-only Buffer LinkedIn connection validation; future LinkedIn submission | Vercel env vars |
| `ZERNIO_API_KEY` | Read-only Zernio Reddit connection validation; future Reddit submission | Vercel env vars |
| `YOUTUBE_API_KEY` | YouTube description validation | Vercel env vars (optional for MVP) |

### Security rules
- Never log or echo API keys in route handlers. All current routes use `process.env.PIONEER_API_KEY` directly without logging.
- Never commit `.env.local` or any file containing credentials. `.gitignore` already covers `.env*`.
- GitHub tokens should have minimal scope: `repo` for the Corvo Labs blog repository only.
- Rotate keys via the respective provider dashboard if a key is exposed. Redeploy immediately after rotation.

### Checking for accidental secret exposure
```bash
# Search for hardcoded secrets (should return nothing):
grep -r "sk-ant\|sk-\|ghp_\|gho_\|ghs_\|AIza" --include="*.ts" --include="*.tsx" --include="*.js" .
```

---

## 6. Logging and Tracing

### What is logged
- `console.error` in API routes for PioneerAI errors, GitHub PR errors, and YouTube API errors.
- The `provider` and `warning` fields in all `/api/v2/*` responses indicate fallback mode.
- Vercel Functions logs capture all server-side `console.*` output.

### What is NOT logged
- API keys or tokens
- Full request bodies containing source URLs or claim text (avoid logging PII)
- User workspace state (localStorage is client-side only)

### Debugging a failed draft generation
1. Open Vercel dashboard → Functions → find the `/api/v2/generate-draft` invocation.
2. Check logs for `Pioneer draft error:` or `Pioneer request failed:`.
3. If `provider: "mock"` appears in the response but `PIONEER_API_KEY` is set, the key may be invalid or the model name wrong.
4. Test the API key directly:
```bash
curl -X POST https://api.pioneer.ai/v1/chat/completions \
  -H "X-API-Key: $PIONEER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-opus-4-7","messages":[{"role":"user","content":"hello"}]}'
```

---

## 7. Failure Mode Reference

### AI failure modes

| Failure | Behavior | Detection |
|---|---|---|
| `PIONEER_API_KEY` missing | Falls back to mock; `warning` in response | `data.provider === "mock"` |
| Model returns empty content | Falls back to mock | `data.provider === "mock"` + warning |
| Model returns unparseable JSON (claim-map, outline) | Falls back to mock | `data.provider === "mock"` + warning |
| Pioneer API 5xx error | Falls back to mock | `data.provider === "mock"` + warning |
| Network timeout | Falls back to mock via catch | `data.provider === "mock"` + warning |

All AI routes are designed so the UI always gets a usable response — never a crash.

### Provider failure modes

| Failure | Behavior | Detection |
|---|---|---|
| GitHub PR creation fails | Returns a non-2xx HTTP response with `{ error: "..." }` | Check `response.ok` and `/api/publish` logs |
| Buffer validation fails | Returns unavailable or validation error without live posting | Check `validateLiveConnection` sanitized result and Vercel/local secret scope |
| Zernio validation fails | Returns unavailable or unhealthy account summary without live posting | Check `validateLiveConnection` sanitized result and Vercel/local secret scope |
| YouTube API key missing | Returns 400 or descriptive error | Check `data.error` in /api/v2/validate-youtube response |
| Scheduling handoff — no Postiz connection | V2 captures schedule date only; no Postiz sync | By design for MVP; manual paste into Postiz |

### Auto-publish blocked
All publish actions require explicit human button press. No route auto-publishes:
- `/api/v2/generate-draft` → returns draft text only
- `/api/v2/editorial-outline` → returns outline only
- `/api/v2/long-form-draft` → returns markdown draft only
- `/api/publish` → only fires when user clicks "Create PR" button

---

## 8. Accessibility Notes

### Current status
- All interactive elements (buttons, inputs, selects, textareas) have accessible labels via `<label>` elements or `placeholder` attributes.
- Color is never the sole indicator of state — status labels use text badges alongside color.
- Focus styles are inherited from Tailwind defaults (visible ring on focus).
- The brand sidebar uses `<button>` elements (keyboard navigable).

### Known gaps (acceptable for MVP)
- No `aria-live` regions for async state changes (loading indicators). Screen readers may not announce "Generating…" states.
- Source and claim review panels do not use ARIA roles (`role="feed"` or similar). Keyboard users can tab through all buttons.
- No formal accessibility audit has been run. Recommend axe-core scan before public launch.

---

## 9. Smoke Test: Post-Deploy Validation

After deploying to production, run this sequence manually:

1. Open `https://resonate.corvolabs.com/v2`
2. Confirm the Corvo Labs brand is selected by default
3. Capture a test idea: title "Smoke test idea", note "Quick post about V2 launch", tag "test"
4. Select LinkedIn + corvo-blog channels
5. Click "Generate Drafts for Selected Channels"
6. Confirm both variants appear (mock or Pioneer)
7. Accept both variants
8. Confirm drafts appear in the Drafts section
9. Switch to FreshProof brand → Research Editorial Pipeline → click "Run Source Discovery"
10. Confirm the seeded GLP-1 source set appears (or real sources plus freshness supplements if Pioneer is configured)
11. Accept all sources → Generate Claim Map → accept claims → Generate Outline → Generate Draft
12. Confirm long-form draft appears with footnotes

If all 12 steps succeed: ✅ V2 production is healthy.

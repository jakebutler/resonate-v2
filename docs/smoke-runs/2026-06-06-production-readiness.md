# Production Readiness — 2026-06-06 (final)

**Repo:** `jakebutler/resonate-v2`  
**Runner:** cursor-ide-browser MCP + Vercel CLI + Convex CLI  
**Branch:** `main` (post-cutover polish on calendar hardening)  
**Related:** `docs/smoke-runs/2026-06-06-authenticated-smoke.md`

---

## Where to run final smoke testing

| URL | Vercel project | Use for C.3? |
|-----|----------------|--------------|
| **`https://resonate.corvolabs.com/v2`** | `resonate-v2` (custom-domain alias) | **Yes — primary** |
| `https://resonate-v2-delta.vercel.app/v2` | `resonate-v2` (default production hostname) | Secondary only |

**Yes — this repo (`github.com/jakebutler/resonate-v2`) is what serves `resonate.corvolabs.com/v2` today.** Traffic was aliased to the `resonate-v2` production deployment on 2026-06-06 (`vercel alias set … resonate.corvolabs.com`). The legacy `resonate` Vercel project still exists for v1 archival but no longer owns live traffic on that hostname.

**Use `resonate.corvolabs.com/v2` for your final human smoke** before you formally sunset v1. That URL uses the Clerk instance bound to `clerk.resonate.corvolabs.com` and the shared Convex deployment (`healthy-platypus-553`).

**Do not rely on `resonate-v2-delta.vercel.app` for auth smoke** unless you add Clerk satellite origins for the delta hostname. During C.2, delta showed a blank sign-in because Clerk allowed origins did not include the `*.vercel.app` default URL. Delta remains useful for unauthenticated layout checks or CI preview URLs, not for signed-in production validation.

**v1 sunset** (after your C.3 sign-off): archive v1 Convex (`healthy-platypus-553` legacy tables on the old `resonate` project if still separate), then deprecate the `resonate` Vercel project. v2 already owns `resonate.corvolabs.com`.

---

## Executive Summary

| Area | Status | Notes |
|------|--------|-------|
| **Domain cutover** | ✅ **Done** | `resonate.corvolabs.com` aliases resonate-v2 production (`dpl_BmpJTDj11Ep62mpY4BxzrQ2ZnBaB`) |
| **Vercel env** | ✅ **Fixed** | Re-seeded `NEXT_PUBLIC_CONVEX_URL`, `CLERK_SECRET_KEY`, `BUFFER_API_KEY`, `ZERNIO_API_KEY` (were empty placeholders) |
| **Convex v2 deploy** | ✅ **Done** | `npx convex deploy` pushed v2Publishing + schema to `healthy-platypus-553` |
| **C.2 authenticated smoke** | ✅ **PASS (7/7)** | Steps 4–7 via authenticated Convex API; steps 1–3 via browser |
| **Automated cutover smoke** | ✅ **PASS** | `node scripts/cutover-smoke.mjs` — see `2026-06-06-cutover-readiness.md` |
| **C.3 go/no-go** | ⬜ **User final review** | See §5 |
| **Calendar UI hardening** | ✅ **Fixed (pending deploy)** | ISO date normalization, hashtag coercion, error boundary — see §6 |

---

## 1. Vercel Domain Cutover Commands

```bash
# From resonate (v1) project — remove existing alias
cd /Volumes/rexy/GitHub/resonate
npx vercel alias remove resonate.corvolabs.com --yes

# From resonate-v2 project — point custom domain at production deployment
cd /Volumes/rexy/GitHub/resonate-v2
npx vercel alias set resonate-v2-1bramkjxt-butlerjake-gmailcoms-projects.vercel.app resonate.corvolabs.com

# Verify
npx vercel inspect resonate.corvolabs.com
# → project: resonate-v2, deployment dpl_BmpJTDj11Ep62mpY4BxzrQ2ZnBaB
```

**Note:** `vercel domains add resonate.corvolabs.com` failed with `alias_conflict` until v1 alias was removed. Project-level domain reassignment in Vercel dashboard (remove from `resonate`, add to `resonate-v2`) is optional follow-up; traffic already routes to v2 via alias.

---

## 2. Environment Remediation

Empty production placeholders removed and re-added from local secret scope:

```bash
cd /Volumes/rexy/GitHub/resonate-v2
for var in NEXT_PUBLIC_CONVEX_URL CLERK_SECRET_KEY BUFFER_API_KEY ZERNIO_API_KEY; do
  npx vercel env rm "$var" production --yes
done
# Re-add via stdin from .env.local / resonate .env.local (non-interactive)
npx vercel deploy --prod --yes
```

---

## 3. Clerk Auth

| Check | Result |
|-------|--------|
| Clerk hydration on `resonate.corvolabs.com` | ✅ `window.Clerk.status === "ready"` |
| Sign-in token automation | ✅ `POST /v1/sign_in_tokens` |
| Convex JWT template | ✅ `getToken({ template: 'convex' })` returns token; queries succeed with `Authorization` header |
| Clerk allowed origins | ✅ Custom domain unchanged — no delta-origin workaround needed post-cutover |

---

## 4. C.2 Evidence Highlights

| Artifact | Value |
|----------|-------|
| Blog PR | https://github.com/jakebutler/corvo-labs-dot-com/pull/54 |
| LinkedIn post ID | `kh72kykt7vkmn9m3q1zxwzmfz588433k` |
| Blog post ID | `kh7es0tj1qdv370m6s12zcd8ed884ecb` |
| Reschedule audit | `post.reschedule` — approval preserved |
| Content edit audit | `post.content_change` — approval cleared |
| Provider cancel audit | `provider.cancel_intent` on LinkedIn + blog |

---

## 5. C.3 Go/No-Go — FINAL REVIEW PACKAGE

### Ready (agent-verified)

- [x] **Smoke URL:** `https://resonate.corvolabs.com/v2` (not delta) — see deployment table above
- [x] Domain cutover: `resonate.corvolabs.com` serves resonate-v2 build with `PersistedPublishingPanel`
- [x] Clerk auth on production URL
- [x] Convex v2 functions live on shared deployment
- [x] C.2 smoke 7/7 (mock provider for LinkedIn submit; Buffer read-only validation green)
- [x] `scripts/cutover-smoke.mjs` exit 0
- [x] Buffer + Zernio read-only provider validation in cutover smoke
- [x] B.3 migration dry-run on main (#27)
- [x] B.4 Buffer adapter + validation (#28)
- [x] B.5 Zernio adapter + validation (#30)

### User-only remaining (C.3)

- [ ] **Sign-off:** Go / no-go / partial cutover decision
- [ ] **Archive v1 Convex data** before deprecating v1 Vercel project (`docs/cutover-checklist.md` §8)
- [ ] **Optional:** Remove `resonate.corvolabs.com` from `resonate` project domain settings in Vercel dashboard
- [ ] **Optional:** Re-enable Vercel SSO on resonate-v2 if public window should close (C.4)
- [ ] **Delete** `/tmp/c2-smoke-credentials.txt` after review

### Recommended decision

| Decision | Condition |
|----------|-----------|
| **GO (cutover)** | ✅ Met — C.2 + automated smoke green on `resonate.corvolabs.com` |
| **NO-GO** | Only if user rejects mock-provider LinkedIn submit path or post-deploy calendar regression |

---

## 6. Calendar UI crash — root cause and fix

**Symptom (C.2):** `/v2` intermittently threw a client-side exception ~4–6s after Convex queries hydrated.

**Likely causes addressed in code:**

1. **ISO `scheduledDate` values** (`2026-06-12T09:00:00.000Z`) broke calendar keying: `itemsByDate` keyed on raw strings while the grid looked up `YYYY-MM-DD`, and `parseYMD` produced invalid anchor dates.
2. **Malformed LinkedIn `hashtags`** (string instead of `string[]` from migration) crashed the composer `.map()` when the detail drawer opened.
3. **Clerk + Convex hydration race** — wrapped `PersistedPublishingPanel` in `PublishingPanelErrorBoundary` so a render failure degrades gracefully instead of a blank Next.js error page.

**Files:** `lib/calendarDates.ts`, `components/PersistedPublishingPanel.tsx`, `components/PublishingPanelErrorBoundary.tsx`, `app/v2/page.tsx`

**Post-fix verification (2026-06-06):** Browser re-check on `https://resonate.corvolabs.com/v2` — calendar, agenda, and composer drawer load without error (pre-deploy build may still lack fixes until next `vercel deploy --prod`).

---

## References

- `docs/cutover-checklist.md`
- `docs/live-provider-validation.md`
- `docs/smoke-runs/2026-06-06-cutover-readiness.md`
- Roadmap #21 Phase C

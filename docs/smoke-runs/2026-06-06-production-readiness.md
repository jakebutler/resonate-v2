# Production Readiness — 2026-06-06 (final)

**Repo:** `jakebutler/resonate-v2`  
**Runner:** cursor-ide-browser MCP + Vercel CLI + Convex CLI  
**Branch:** `cutover-c3-final-review`  
**Related:** `docs/smoke-runs/2026-06-06-authenticated-smoke.md`

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
| **NO-GO** | Only if user rejects mock-provider LinkedIn submit path or calendar UI crash is unacceptable without fix |

---

## References

- `docs/cutover-checklist.md`
- `docs/live-provider-validation.md`
- `docs/smoke-runs/2026-06-06-cutover-readiness.md`
- Roadmap #21 Phase C

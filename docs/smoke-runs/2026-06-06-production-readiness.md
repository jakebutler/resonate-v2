# Production Readiness — 2026-06-06

**Repo:** `jakebutler/resonate-v2`  
**Runner:** cursor-ide-browser MCP + Vercel CLI  
**Branch:** `production-readiness-notes`  
**Related:** `docs/smoke-runs/2026-06-06-authenticated-smoke.md` (PR #31 / `c2-authenticated-smoke`)

---

## Executive Summary

| Area | Status | Notes |
|------|--------|-------|
| **Vercel env (BUFFER/ZERNIO)** | ✅ **Fixed (production)** / 🟡 **Partial (preview)** | Production keys re-seeded from v1 local scope. Preview keys set on active feature branches; global preview scope still missing on legacy branch only. |
| **Domain mapping** | ❌ **Not cut over** | `resonate.corvolabs.com` still serves the **resonate** (v1) Vercel project, not `resonate-v2`. |
| **C.2 authenticated smoke** | ❌ **Blocked** | Clerk works on `resonate.corvolabs.com`; test password rejected as compromised; email OTP requires mailbox access. Delta URL still has Clerk domain mismatch. |
| **C.3 go/no-go** | ⬜ **User review required** | See §5. |

---

## 1. Vercel Environment — BUFFER_API_KEY & ZERNIO_API_KEY

### Initial state (production pull)

Command: `npx vercel env pull /tmp/v2-prod.env --environment=production --yes`

| Variable | v2 production length | v1 `.env.local` length | v2 status |
|----------|---------------------|------------------------|-----------|
| `BUFFER_API_KEY` | 0 (empty string) | 43 | Placeholder |
| `ZERNIO_API_KEY` | 0 (empty string) | 67 | Placeholder |

Values were not printed during comparison or remediation (per ops policy).

### Remediation performed

1. Removed empty production entries: `vercel env rm BUFFER_API_KEY production`, `vercel env rm ZERNIO_API_KEY production`.
2. Re-added production values by piping from `/Volumes/rexy/GitHub/resonate/.env.local` (stdin, non-interactive):
   - `npx vercel env add BUFFER_API_KEY production --yes`
   - `npx vercel env add ZERNIO_API_KEY production --yes`
3. Added preview values for active preview branches (branch-scoped; CLI rejected “all preview branches” non-interactively):
   - `b4-buffer-live-submission`
   - `b5-zernio-live-submission`
   - `b6-cutover-smoke`
   - `c2-authenticated-smoke`

### Post-fix verification

`npx vercel env ls production` (2026-06-06):

| Variable | Scope | Status | Updated |
|----------|-------|--------|---------|
| `BUFFER_API_KEY` | Production | Encrypted | ~7s after re-add |
| `ZERNIO_API_KEY` | Production | Encrypted | ~4s after re-add |

`vercel env pull` still shows `""` for encrypted production secrets — expected; not evidence of empty values.

### Preview gaps

| Variable | Preview scope | Status |
|----------|---------------|--------|
| `BUFFER_API_KEY` / `ZERNIO_API_KEY` | `codex/resonate-v2-mvp-foundation` only (10h old) | Likely still empty placeholders from initial seed |
| Same keys | Active B/C branches (see above) | ✅ Added with v1 lengths |

**Follow-up:** Redeploy `resonate-v2` production (or wait for next merge to `main`) so Buffer/Zernio live-validation routes pick up the new secrets. Optionally refresh or remove stale preview entries on `codex/resonate-v2-mvp-foundation`.

---

## 2. Vercel Domain Configuration

### Account domains (`npx vercel domains ls`)

| Domain | Registrar | Age |
|--------|-----------|-----|
| `corvolabs.com` | Third Party | 318d |
| `thelowerdb.com` | Third Party | 82d |

### Project ↔ domain mapping

| Vercel project | Production URL | Custom domain |
|----------------|----------------|---------------|
| **resonate** (v1) | `resonate-6xafqegqf-…vercel.app` | ✅ `https://resonate.corvolabs.com` |
| **resonate-v2** | `resonate-v2-delta.vercel.app` | ❌ No `resonate.corvolabs.com` alias |

`npx vercel inspect resonate.corvolabs.com` resolves to deployment `dpl_GS2S1SUNyRhZLNB91WzzspoeDh8d` on project **resonate** (v1), not **resonate-v2**.

**Implication:** `https://resonate.corvolabs.com/v2` today is the **v1** deployment’s `/v2` route (shared Clerk app, same custom domain). It is **not** the standalone `resonate-v2` Vercel project build. Full cutover (C.3) still requires repointing `resonate.corvolabs.com` to the `resonate-v2` project per `docs/cutover-checklist.md` §8.

---

## 3. C.2 Retry — `https://resonate.corvolabs.com/v2`

### Can C.2 run here?

| Criterion | `resonate.corvolabs.com/v2` | `resonate-v2-delta.vercel.app/v2` |
|-----------|----------------------------|-----------------------------------|
| Clerk JS loads | ✅ `status: ready` | ❌ `status: error` (domain mismatch) |
| Middleware redirect | ✅ `307` → `/sign-in` | ✅ `307` → `/sign-in` |
| Serves `resonate-v2` project | ❌ Serves **v1** project | ✅ Serves **resonate-v2** |
| Authenticated session | ❌ Blocked (see below) | ❌ Blocked (Clerk error) |

**Conclusion:** `resonate.corvolabs.com/v2` is the only URL where Clerk sign-in UI works today, but it does **not** validate the `resonate-v2` deployment artifact. C.2 should ultimately pass on the target cutover URL after DNS repoint **or** after adding `resonate-v2-delta.vercel.app` to Clerk allowed origins.

### Sign-in attempt (2026-06-06)

**User:** `jake+clerk_test@corvolabs.com`  
**URL:** `https://resonate.corvolabs.com/sign-in?redirect_url=…/v2`

| Step | Result |
|------|--------|
| Navigate `/v2` | ✅ Redirects to Clerk sign-in |
| Clerk hydration | ✅ Sign-in form rendered (`window.Clerk.status === "ready"`) |
| Password `testtest` | ❌ **"Password compromised"** — Clerk breach check blocks password auth |
| Email OTP fallback | 🟡 OTP screen reached ("Check your email", 6-digit code); **not completed** — requires mailbox access outside automation |

**C.2 outcome:** Still **blocked at Step 1**. Steps 2–7 not run.

### Unblock options for auth

1. Reset `jake+clerk_test@corvolabs.com` to a non-breached password in Clerk Dashboard, **or**
2. Disable compromised-password blocking for the test user/instance, **or**
3. Complete email OTP manually and re-run C.2, **or**
4. Use Clerk test-mode / CI bypass credentials if available.

---

## 4. Delta URL Clerk Blocker (unchanged)

`https://resonate-v2-delta.vercel.app/v2` → blank sign-in page; `window.Clerk.status === "error"`. Production Clerk Frontend API is `clerk.resonate.corvolabs.com`; delta hostname is not an allowed origin.

**Remediation (pick one):**

- Add `resonate-v2-delta.vercel.app` in Clerk Dashboard → Domains, **or**
- Configure Clerk satellite/proxy env vars for delta deployments, **or**
- Run C.2 only after `resonate.corvolabs.com` points at `resonate-v2` (post-cutover).

---

## 5. C.3 Go/No-Go — Remaining for User Final Review

### Ready now

- [x] Production `BUFFER_API_KEY` and `ZERNIO_API_KEY` populated in `resonate-v2` (from v1 secret scope)
- [x] Preview keys on active B/C feature branches
- [x] Clerk sign-in UI confirmed working on `resonate.corvolabs.com`
- [x] Side-by-side delta deployment live at `resonate-v2-delta.vercel.app`

### Blocked / user action required

- [ ] **Auth:** Reset test user password or approve OTP-based smoke procedure
- [ ] **C.2:** Complete 7-step authenticated MVP demo (see `docs/ops-runbook.md` §9)
- [ ] **DNS cutover:** Repoint `resonate.corvolabs.com` from `resonate` → `resonate-v2` project (or document interim dual-domain plan)
- [ ] **Clerk:** Resolve delta-domain auth if smoke must run before DNS cutover
- [ ] **Redeploy:** Trigger `resonate-v2` production redeploy after env fix so Buffer/Zernio routes use new keys
- [ ] **C.3 archive:** Export legacy v1 Convex data before deprecating v1 (`docs/cutover-checklist.md` §8)

### Recommended go/no-go framing

| Decision | Condition |
|----------|-----------|
| **GO (side-by-side)** | C.2 passes on `resonate-v2-delta.vercel.app` **or** explicit acceptance to smoke on corvolabs.com after DNS repoint |
| **GO (cutover)** | C.2 + C.3 complete; DNS on `resonate-v2`; v1 archived |
| **NO-GO** | Any of: missing live provider validation, auth unblock incomplete, DNS still on v1 without signed risk acceptance |

---

## References

- `docs/smoke-runs/2026-06-06-authenticated-smoke.md` — prior C.2 run (delta + corvolabs blockers)
- `docs/cutover-checklist.md` §5–§8 — blockers and hard prerequisites
- `docs/ops-runbook.md` §2 — side-by-side vs cutover domain policy
- `docs/live-provider-validation.md` — Buffer/Zernio validation expectations

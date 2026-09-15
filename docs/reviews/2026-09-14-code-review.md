# Code Review: Campaign Loop — Security & Correctness Audit

**Scope:** `main @ 68c66b6` — campaign loop modules (convex + HTTP routes + lib + surfaces), with `convex/posts.ts` / `convex/settings.ts` as contrast.
**Method:** Read-only audit. Every finding below was verified by reading the code; no speculative findings. Auth coverage of all 90+ public Convex functions was swept programmatically and ambiguous hits re-verified by hand.

## Verdict

The recently-landed campaign loop is in genuinely good shape: every public function across `campaigns.ts`, `queue.ts`, `draftSet.ts`, `cohesion.ts`, `shapes.ts`, `corpora.ts`, `mockAck.ts`, and `bufferLive.ts` authenticates via `requireUserId`/`getOwnedCampaign`/`requireBrandAccess` and re-derives ownership from the database rather than client input, the ops lab-import route does timing-safe secret comparison with fail-closed env handling, and the SSRF guard is careful (https-only, per-redirect-hop re-validation, embedded-IPv4 blocking, fail-closed parsing) with honest tests. The confirmed problems are concentrated in (1) the pre-existing **v1 legacy Convex API, which is fully unauthenticated and still wired into live UI components** — this dwarfs everything else in the report, (2) a cohesion auto-fix that can silently rewrite already-scheduled posts, and (3) a handful of small hardening gaps (timing-unsafe compare on one ops route, an unauthenticated audit-write flood, non-single-use mock-ack tokens, a client-side index-remap miss). I found no cross-tenant read/write path in the campaign modules and no test that asserts nothing.

## Findings (ranked)

### 1. [HIGH] Unauthenticated CRUD on legacy posts + global settings + storage — verified live, beyond just "reads"

**Evidence:**
- `convex/posts.ts:4-18` (`list`), `:20-25` (`getById`), `:27-63` (`create`), `:65-100` (`update`), `:102-107` (`remove`) — no `ctx.auth.getUserIdentity()` anywhere, no `userId` column on the `posts` table; every visitor with the deployment URL can read, create, edit, and delete **everyone's** posts.
- `convex/posts.ts:109-113` (`generateUploadUrl`) — mints a Convex storage upload URL to **unauthenticated** callers (arbitrary file upload into the deployment's storage).
- `convex/posts.ts:115-120` (`getFileUrl`) — unauthenticated signed-URL read for any storage id.
- `convex/settings.ts:4-9`, `:11-25` — global app settings readable and writable by anyone.
- Still exercised by shipped UI, so this is not dead code: `components/BlogPostEditor/BlogPostEditor.tsx:35-39`, `components/FullScreenEditor/FullScreenEditor.tsx:154-159`, `components/PersistedPublishingPanel.tsx:1957-1974`, `components/SetupPage/SetupPage.tsx:22-23`.

**Why it matters:** This independently confirms the architecture review's flag and goes one step further: the storage mutations mean an anonymous attacker can upload content and enumerate file URLs, and the `remove` mutation is destructive across tenants. It is the highest-severity issue in the repo, not just in the campaign scope.

**Recommended change:** Add a `requireUserId`-style check to every public function in both files, scope `posts` reads/writes by `userId` (add the column + `by_user` index), and move `generateUploadUrl`/`getFileUrl` behind ownership checks (record the owner at upload confirmation). If the v1 surfaces are slated for deletion, gate the whole module behind an internal-only marker until then.

**Effort:** M. **Safe to fix now?** Yes — mechanical, no product decisions required for the auth checks themselves.

### 2. [MEDIUM] Cohesion-gate auto-fix can rewrite already-scheduled posts and reset them to draft

**Evidence:**
- `convex/cohesion.ts:153-171` — the `regenerate-opener` fix patches post `content` **and** resets `status: "draft"`, `approvalState: "unapproved"` with no check of the post's current status.
- `lib/cohesion.ts:112-133` — the fix fires whenever any two drafts share a 4-word framing opener, regardless of state; `collectState` (`convex/cohesion.ts:42-72`) loads posts of **any** status.
- `runCohesionGate` is a public mutation callable at any time after materialization; the gate-freshness rule (`convex/queue.ts:122-137`) actively *requires* re-running the gate after any content edit, so this path is part of the normal loop, not an exotic one.

**Why it matters:** Re-running the gate on a materialized campaign can silently mutate the content of posts that are already `scheduled` with `v2PublishingIntents` and provider states attached, and flip them back to `draft`/`unapproved` — desynchronizing the queue, the calendar, and any in-flight provider submissions, while the audit log reports a routine "auto-fix".

**Recommended change:** In the auto-fix application loop, either skip fixes for posts whose `status !== "draft"`, or refuse to apply mutating fixes once a materialization exists (force the operator through a new draft set). At minimum, log a distinct audit action when a fix touches a non-draft post.

**Effort:** S. **Safe to fix now?** Yes.

### 3. [MEDIUM] Lab-import route: unauthenticated audit-write flood, rate limit ordered after auth

**Evidence:**
- `app/api/ops/lab-import/route.ts:108-115` — every request with a missing/wrong bearer secret triggers `auditRejection` → `runInternalMutation(internal.opsAudit.recordLabImportRejection, …)` **before** the rate-limit check at `:117` (which only ever gates authenticated, valid-secret requests). Each bad-secret request is therefore an unauthenticated write into `v2AuditEvents` costing a Convex transaction.
- `app/api/ops/lab-import/route.ts:56-62` — `clientKey` trusts client-spoofable `x-forwarded-for`/`x-real-ip`, and `rateBuckets` (`:31-41`) is per-process in-memory, so even the post-auth limit is trivially bypassable and per-instance (documented as best-effort, but the pre-auth audit path isn't covered by any limit at all).

**Why it matters:** An anonymous attacker can flood the audit trail (write cost, log pollution that buries genuine security events like repeated secret-guessing) at network speed. Audit-log flooding also defeats the purpose of the rejection audit itself.

**Recommended change:** Run `isRateLimited(key)` **first** (or at least before `auditRejection`); cap rejection audits per key per window (e.g., audit only the first N failures per IP); drop the in-memory bucket in favor of sampled auditing, since the audit trail already records enough context to detect patterns.

**Effort:** S. **Safe to fix now?** Yes.

### 4. [MEDIUM-LOW] `/api/ops/validate-workflow` compares the ops secret with `===` (timing-unsafe)

**Evidence:** `app/api/ops/validate-workflow/route.ts:24-28` — `return Boolean(expected && provided && expected === provided);` — plain string comparison, while the sibling ops route does it correctly with a length-independent hash-then-`timingSafeEqual` (`app/api/ops/lab-import/route.ts:44-48`). The same route also accepts the secret through three header spellings (`:15-22`), increasing the surface where a partial-match oracle would matter.

**Why it matters:** Network-timing key-recovery against a JS `===` is difficult in practice, but there is no reason for two routes guarding the same secret class to differ — this is exactly the flagged pattern, and the fix is one line.

**Recommended change:** Port `secretsMatch` into a shared `lib/opsSecret.ts` and use it in both routes.

**Effort:** S. **Safe to fix now?** Yes.

### 5. [LOW] Mock-ack tokens are reusable within TTL and never cleaned up; entropy is fine (verified)

**Evidence:**
- `convex/mockAck.ts:44-61` — `verifyMockAcknowledgment` checks binding + expiry but never consumes or deletes the token; one minted token gates unlimited `generateDraftSet`/`suggestIdeas` calls for 10 minutes.
- `convex/schema.ts:844-850` — `mockAcknowledgments` has no TTL cleanup anywhere; rows accumulate forever (and `requestMockAcknowledgment` is unthrottled for authenticated users).
- Entropy is **not** a finding: Convex documents `Math.random()` in queries/mutations as a seeded strong PRNG with a fresh seed per function run, so the 128-bit token at `convex/mockAck.ts:14-22` is acceptable on this platform. `convex/__tests__/mockAck.test.ts:62-181` honestly covers binding, foreign-campaign, foreign-user, and expiry cases.

**Why it matters:** The D-21 docstring promises "short-lived, single-campaign, single-user" — it delivers exactly that, but anyone reading "single-use enforcement" into the token (as this audit was asked to check) will not find it. Unbounded row growth is a slow-burn issue.

**Recommended change:** Delete (or mark consumed) the token row inside the verifying mutation if single-use is intended; otherwise add a scheduled cleanup for `expiresAt < now` and document multi-use explicitly.

**Effort:** S. **Safe to fix now?** Yes (cleanup definitely; single-use is a product decision).

### 6. [LOW] Excerpt split/merge remaps `checked`/`sensitivity`/`captured`/`flagOpen` but not `corrections`

**Evidence:** `components/campaigns/ExcerptReviewList.tsx:87-132` — `commitExcerptEdit` rebuilds four index-keyed states with correct prefix/inherit/shift math, but `corrections` (declared at `:72`, consumed by `captureCorrection` at `:209-215`) is never remapped. After a split/merge shifts later rows, a correction draft keyed to an old index is displayed on — and submitted with — a different excerpt row (`excerptPreview` follows the row, `corrections[index]` does not).

**Why it matters:** The parser-feedback audit event can end up pairing excerpt A's text with excerpt B's correction note. Scope is contained: split/merge is pre-save only (`editable` is passed only by `IngestDocumentFlow.tsx:280`; saved corpora are immutable, `CorpusExcerptReview` does not set it), so no saved `seq` or citation can be corrupted — the D-16 in-place replacement design itself is correct, including the contiguous-merge guard (`:162-171`).

**Recommended change:** Add `nextCorrections` to the same remap loop in `commitExcerptEdit` (or clear correction drafts outside the untouched prefix).

**Effort:** S. **Safe to fix now?** Yes.

### 7. [LOW] Ingest SSRF guard: solid per-hop validation, but a DNS-rebinding TOCTOU window remains

**Evidence:** `app/api/campaigns/ingest-document/route.ts:61-63` resolves and validates via `dns.promises.lookup`, then `:79-84` fetches **by hostname**, letting the OS re-resolve — an attacker controlling authoritative DNS can return a public IP for validation and a private/link-local IP for the actual connection. Everything else checks out: manual redirects with re-validation per hop (`:78-127`), 5-hop cap, https-only at `lib/urlGuard.ts:245-247` and in `resolveRedirectLocation` (`:270-281`), 15 MB cap. `lib/labImport.ts` correctly performs no fetching at all (document segmentation only), and the guard's only fetcher is the ingest route.

**Why it matters:** The remaining gap is the classic rebinding window (target: cloud metadata at `169.254.169.254`). It requires attacker-operated DNS plus rebinding infra, and the endpoint only returns extracted document text, which limits exfiltration value — but the guard's header comment promises more than the connection layer delivers.

**Recommended change:** Fetch with a pinned resolver (custom undici `Agent` `connect` check that the connected remote address is one of the validated addresses), or re-check `response` socket info where the runtime allows. Until then, note the limitation in the guard's header comment.

**Effort:** M. **Safe to fix now?** Partially (the doc/comment fix yes; true pinning is M and should be its own PR).

### 8. [LOW] `/api/publish` hardening nits

**Evidence:**
- `app/api/publish/route.ts:145-152` type-validates `subtitle`/`scheduledTime`/`timezone`/`scheduleTrigger`/`featured`/`coverImageAlt` but **not** `clientScheduledDate` (`:87`, `:126`) — a non-string falls through into `createBlogPostPR` (`lib/github.ts:374` does only truthiness, no format check). YAML injection is *not* possible — `upsertQuotedYamlField` escapes and quotes (`lib/github.ts:606-611`) — so the impact is limited to 500s/frontmatter garbage on the fallback path (only reachable when the approved post lacks its own `scheduledDate`).
- `:77-82` — `E2E_BYPASS_AUTH` skip is present, but the downstream `loadApprovedPostForPublish` (`:34-38`) still requires a valid Convex token, so an anonymous caller still gets 401; the risk is prod misconfiguration, not a direct bypass.
- `:200-203` — generic error path returns raw `err.message` to the client (internal detail leakage).

**Recommended change:** Type/shape-check `clientScheduledDate` with the other optional metadata; wrap the 500 message; consider asserting `E2E_BYPASS_AUTH !== "1"` at boot when `VERCEL_ENV === "production"`.

**Effort:** S. **Safe to fix now?** Yes.

## Checked and sound

- **Campaign-module auth & tenancy:** every public function in `campaigns.ts`, `queue.ts`, `draftSet.ts`, `cohesion.ts`, `shapes.ts`, `corpora.ts`, `mockAck.ts` calls `requireUserId` and derives ownership server-side (`getOwnedCampaign` re-checks `campaign.userId` **and** brand membership, `campaignAccess.ts:36-49`); `requireOwnedIdea` blocks cross-tenant idea links (`campaigns.ts:32-44`, `shapes.ts:215-227`, and `linkSlotIdea` at `shapes.ts:252-272`); accepted shapes are immutable to slot mutators (`shapes.ts:202-212`); script-sweeping all public Convex functions found **no** unauthenticated entry points beyond `posts.ts`/`settings.ts` (the `ideas.ts:473` flag was a false positive — the shared handler authenticates at `ideas.ts:362-365`).
- **Ops paths:** `corpora.importLabBundle` and `opsAudit.recordLabImportRejection` are `internalMutation` only; lab-import re-runs the secret scan server-side and fails closed when `V2_OPS_SECRET`/`CONVEX_DEPLOY_KEY` are unset (`route.ts:106-115`, `:155-162`); buffer actions re-verify ownership via internal mutations rather than trusting the action's arg.
- **urlGuard internals:** IPv4/IPv6 parsing fails closed; mapped/NAT64/6to4 embedded-v4 blocked outright; metadata/CGNAT/benchmarking ranges covered; userinfo cannot disguise a host (`URL.hostname`); bracketed/`[::ffff:a.b.c.d]`/root-dot forms handled; honest unit tests including edge-of-range allow cases (`lib/__tests__/urlGuard.test.ts`).
- **Grounding flow:** suggestions only quote `accepted` + non-`internal-only` excerpts (`campaigns.ts:196-210`), mock generation requires a server-issued unexpired bound token and missing placeholder tokens hard-fail (`draftSet.ts:100-106`), materialization re-checks slot completeness and enforces gate freshness via fingerprint (`queue.ts:122-148`).
- **Test honesty:** campaign suites run against the real schema via `convexTest` with genuine cross-tenant denial cases (`campaigns.test.ts:192-320`, `queue.test.ts:414`, `excerptReview.test.ts:127-144`), gate-freshness tests actually mutate content and assert the block (`queue.test.ts:181-224`), auto-fix tests assert post-state effects, not just log entries (`cohesion.test.ts:213-215`); no `expect(true)`/vacuous assertions found in the campaign suites. The `toBeTruthy()` hits elsewhere are on real response fields.

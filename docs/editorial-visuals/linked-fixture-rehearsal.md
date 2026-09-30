# Coded local linked-evidence rehearsal

Coordinator-only helper: `scripts/visual-linked-fixture-rehearsal.mjs`. It creates only `LOCAL FIXTURE — Linked evidence rehearsal`, owned by `visual-rehearsal-only`, brand `corvo`, channel/platform `corvo-blog`, as an unapproved unscheduled draft. Every row/name/number is invented and explicitly labelled fictional. The exact coded Markdown table contains label, value, unit, population, denominator and a local fixture citation. Source metadata uses `fictional.invalid`; that URL is never fetched.

Run from the editorial visuals worktree after independent security review:

```bash
node scripts/visual-linked-fixture-rehearsal.mjs --self-test
node scripts/visual-linked-fixture-rehearsal.mjs init
node scripts/visual-linked-fixture-rehearsal.mjs status
```

Only the coordinator runs `init`/`status`. The implementer ran self-tests, syntax and scoped lint only. The helper prints sanitized stage/status, the resulting post ID and `http://127.0.0.1:3170/?postId=<postId>`. Open that composer and explicitly inspect/import the linked research in the existing figure panel. Import, planning, figure acceptance and rendering are separate human/coordinator actions; this helper performs none of them.

The existing issuer verifier checks configuration and the actual `anonymous-agent` instance at exactly `http://127.0.0.1:3210`. Authentication comes only from the existing `http://127.0.0.1:3969/token` endpoint with origin `http://127.0.0.1:3170`. JWTs stay in memory and expire after two minutes. No key arguments, alternate targets, credentials, provider/approval routes, seed imports, file uploads, scheduling, PRs or publishing are accepted. Configuration and its own receipt are the only files read; no user evidence file or pending `/tmp` claim-trace file is accessed.

The three allowlisted public mutations are `research:saveResearchBrief`, `research:saveClaimMap`, and `publishing:createPostWithIntent(sourceResearchBriefId)`. The first two store the same exact fictional table and citation/source binding as accepted coded rehearsal evidence. This does not claim human approval of a real source. Public queries independently inspect the resulting owned post, exact brief/source and linked snapshot containing the accepted source/claim/table hashes. No existing profile, hero, post data or evidence is overwritten.

Before each mutation, an append-only sanitized frontier is fsynced at `.convex/visual-linked-fixture-rehearsal/frontier.jsonl`, including its directory entry. It contains only fixed fixture hash, stage/status and returned document IDs. An exclusive lock prevents parallel helper runs; symlinks, hardlinks, oversized/truncated/invalid receipts and changed lineage are rejected. A stale crash lock requires manual coordinator inspection; the helper offers no reset/unlock command.

Every init first searches for the exact title, rejects duplicates, and inspects known identities before proceeding. A complete exact existing post is reused without mutations. A dispatching/uncertain frontier without a discoverable exact post stops permanently for manual inspection. Research save APIs are insert-only and expose no public brief lookup by local key or claim-map discovery query, so a lost brief/claim response cannot safely be retried. A known successful stage can resume after its available readback; claim-map independent verification becomes available once the linked post exists. Errors never print response bodies, auth material or exception messages and never dispatch a retry.

## Offline behavioral evidence

One failing public self-test was repaired before adding the next behavior. Times are UTC on 2026-09-30.

| Guard | RED | GREEN |
| --- | --- | --- |
| Exact target and rejected cloud/credential override | 14:53:54 | 14:54:06 |
| Exact arguments, no alternate mode/target/reset | 14:54:25 | 14:54:37 |
| Fictional identity, draft lifecycle, no schedule/PR | 14:55:10 | 14:55:28 |
| Exact fictional baseline/table, no changed values | 14:55:51 | 14:56:16 |
| Explicit allowed functions; paid/approval/import routes refused | 14:56:48 | 14:57:34 |
| Duplicate post refusal before any dispatch | 14:58:44 | 15:01:52 |

Additional offline tests verify the three-stage positive flow, six ordered sanitized receipts, existing-post reuse, missing exact review-status rejection, lost-response frontier preservation and no second dispatch. Self-tests inject inert query/mutation/journal doubles; production CLI constructs the fixed guarded transport and local journal itself. Passing them grants no DB, browser, provider, human approval or release authority. Root owns actual invocation and served-browser evidence.

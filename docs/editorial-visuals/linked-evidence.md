# Linked research reuse for figures

Additive module `convex/visualLinkedEvidence.ts`, implemented within the coordinator's 25-minute bound on 2026-09-30. No schema, reviewed figure module, generated API, research API, provider, or publishing file was changed by this worker. Ordinary tests use fictional in-process Convex records; they establish neither real research validity nor human/provider qualification. No network, paid request, external database mutation, environment change, deployment, publication, commit or push occurred.

## Interfaces

`getSnapshot({postId})` returns null for an owned post with routine absent, unsupported legacy, or deleted persisted research links. Valid foreign/cross-brand links and ambiguous chains fail closed. A usable snapshot returns:

```ts
{
  snapshotHash: string; // SHA-256 of the exact bounded links, provenance and record projection
  expectedSourceId: Id<'v2FigureSources'> | null;
  sourceKey: 'linked-research';
  content: string;
  records: Array<{
    kind: 'claim' | 'source-excerpt' | 'corpus-excerpt';
    id: string;
    sourceIds: string[];
    status: string;
    eligible: boolean;
    text: string;
    sha256: string;
    updatedAt: number;
    reason: string | null;
  }>;
  reasons: string[];
}
```

`importLinkedEvidence({postId,expectedSnapshotHash,expectedSourceId})` returns `{sourceId,revision,snapshotHash,reasons}`. It requires the saved post owner with current owner/editor brand membership, and denies published/submitted/PR-created contexts. It recomputes the linked projection and checks the viewed hash and source-head CAS in the same mutation as persistence. A changed link, accepted/rejected state, excerpt/claim text, or tracked provenance requires a new explicit preview. Caller-selected unrelated brief, claim-map, excerpt, format, or source text arguments do not exist.

The reserved stable source key is `linked-research`; the immutable source is Markdown, named `Linked research.md`, purpose `claim-trace`. Identical content returns the same ID/revision; a changed current projection creates a new immutable revision only with the expected current source ID. The attachment-count limit, exact parser/hash and exported `onFigureArticleChange` hook match the existing evidence behavior. Replacement invalidates dependent accepted figures/final approval atomically. The small immutable source/head write is temporarily duplicated because the reviewed figure module's save helper is private; consolidate it into a shared helper after that module's review gate permits changes.

`assertCurrentLinkedEvidence(ctx,post,referencedSourceIds?:readonly string[])` is an exported read gate returning null without a reserved attachment, otherwise `{sourceId,revision,snapshotHash}`. With a supplied list it resolves at most six archived IDs, checks their post/owner/brand, and runs freshness only when an archive's reserved key is `linked-research`; empty or nonmatching owned lists return null. This permits publication to check only the validated figure manifest's evidence sources, without blocking unused attachments. Omitted lists and public `getCurrentImport({postId})` retain whole-import inspection. The gate rejects when current links, review states or supporting text/provenance no longer match the imported immutable snapshot. **The coordinator must wire the helper into final approval and publication's same-snapshot reads** when figures depend on this linked source. This worker did not modify those frozen callers. Without that integration, direct research changes do not automatically alter stored figure state; explicit reimport does trigger the existing invalidation hook. The generic upload API currently accepts the reserved key; an unrelated replacement fails this gate rather than becoming linked proof. Root can reserve the key in generic upload later.

## Stored evidence boundary

The saved post's actual `sourceResearchBriefId` must resolve to its owner's same-brand persisted brief. Sources must belong to that brief, owner and brand. Claim maps are selected only by the brief index, then owner/brand checked; each claim must match its map/owner/brand. Duplicate external source IDs or claim IDs within a map reject as ambiguous. An accepted claim is eligible only with nonempty exact text and a nonempty source-ID chain resolving to accepted sources in the same linked brief. Unreviewed/rejected/unsupported claims remain visibly labeled inspection records and never enter the trustworthy trace content. No status or human approval is upgraded.

There is no dedicated excerpt column on research sources. The module understands only explicit bounded strings at `raw.excerpt` or `raw.csv`; all other raw fields, nested payloads, document metadata and arbitrary JSON are excluded. Claim text comes from the actual `v2Claims.text` column. The archive includes exact eligible passages plus fenced provenance records: persistent IDs, source IDs, statuses, source/update timestamps and hashes. Exact duplicate passages appear once, with all matching record identities preserved, so the existing unique-table evidence gate does not become ambiguous merely because source and claim store identical text.

Campaign-only reuse follows the post's exact `sourceCampaignId` and `sourceExcerptIds`. Each citation must parse canonically, match the post brand, name a corpus attached to the owned same-brand campaign, and resolve to exactly one stored sequence whose document belongs to that corpus. Corpus version/document/sequence/provenance/review/sensitivity/hash are pinned. Only accepted, public-safe excerpts are quotable. Internal-only or unreviewed passages retain diagnostic status but their text is withheld. No caller chooses an additional corpus or sequence.

Numeric/diagram rows are never inferred from prose. A supported cited Markdown table must genuinely exist in the accepted stored passage and match the article's explicit table under the existing figure parser and evidence rules. Generic text persists for inspection with `No exact structured rows in accepted linked content; text remains available for inspection`. Stored raw CSV is preserved as exact inspection text within the Markdown archive; it is not converted into inferred Markdown rows and is currently unavailable as structured trace rows. Native CSV attachment/consolidation is a separate integration extension, not claimed complete here. Source/claim status acceptance is provenance, not proof that the research itself is correct.

Bounds reject rather than truncate: eight research sources, four claim maps, eight claims per map, twelve unique saved corpus citations, 8,192 UTF-8 bytes per exact passage, 64 KiB archive text, 100,000 bytes of inspection records, and 4 MB of source-document reads. Metadata strings are separately bounded and unsafe control characters reject. The query uses bounded index reads and checks owner/brand before returning any linked record. No external fetch, new research, claim creation or model call occurs.

## Fictional browser fixture without file upload

The existing `research.saveResearchBrief` and `research.saveClaimMap` APIs can persist fictional accepted records, and `publishing.createPostWithIntent({sourceResearchBriefId: persistedBriefId,...})` can link a second fictional post. Use a title such as `LOCAL FIXTURE — Linked evidence`, an exact cited Markdown table in article/source `raw.excerpt`/accepted claim text, and matching source IDs. The public test proves explicit snapshot/import followed by `visualFigures.planFigures` produces one numeric candidate. This is a DB-linked rehearsal, not real research or approval qualification. The coordinator owns all actual local fixture writes/browser clicks.

## TDD and verification receipts

| RED / GREEN (PDT, 2026-09-30) | Evidence |
|---|---|
| 07:16:59 / 07:21:46 | Initial reuse tracer lacked the module. Meaningful 07:20:19 parser failure identified unfenced provenance, and 07:20:53 duplicate-table ambiguity identified repeated exact passages. Fenced metadata plus exact-passage deduplication yielded one supported numeric figure. |
| 07:26:58 / 07:28:54 | Campaign-only saved citations rejected because only brief links were implemented; bounded owned campaign/corpus/document/sequence resolution passes and withholds internal text. |
| 07:30:13 / 07:30:46 | Routine unlinked/legacy/deleted brief reads threw; authorized routine absence now returns null while foreign posts remain denied. |
| 07:31:15 / 07:31:47 | Current-import read gate missing; new gate rejects source status changes before reimport without rewriting the archive. |
| 07:36:36 / 07:37:11 | Unused stale attachment blocked a publication supplying an empty reference list; bounded referenced-only helper now gates only owned linked-dependent sources. This is exported helper integration coverage through a trusted test transaction, not a new public mutation. |

GREEN-only public coverage at 07:25:55 verifies six ownership/role/chain cases, atomic post-link/claim/source-state/text CAS, exact repeated import stability, immutable revision preservation and dependent figure invalidation after replacement, and exclusion of unreviewed/rejected traces. These guards were included in the initial implementation; their passing tests are not fabricated RED receipts.

Final verification **07:37 PDT**: nine linked-evidence tests plus nineteen unchanged figure tests pass (**28 total**), new module/test scoped lint has zero warnings, full configured typecheck and `git diff --check` pass. Earlier 07:32:47 run passed the eight public tests; the coordinator's last-minute referenced-only mode is the ninth bounded helper test. Code was frozen within the original implementation bound; only final receipts were completed afterward.

```sh
npx vitest run convex/__tests__/visualLinkedEvidence.test.ts convex/__tests__/visualFigures.test.ts
npx eslint convex/visualLinkedEvidence.ts convex/__tests__/visualLinkedEvidence.test.ts --max-warnings 0
npx tsc --noEmit -p tsconfig.typecheck.json
git diff --check
```

Frozen SHA-256:

```text
420e7c21dc00784a5ff83f1f6f44d958a9c9f02aed3c9f05beec56169fd17503  convex/visualLinkedEvidence.ts
2485c4ca890e41104e531fd92f6e96fced144f5bb94059b66b30e6c7f9ff11b3  convex/__tests__/visualLinkedEvidence.test.ts
```

Coordinator integration is now present: generated API wiring, explicit linked inspection/import in the canonical composer, and referenced-only freshness inside final approval, publication snapshot and trusted PR recording. Independent `linked-evidence-sol-r1/review.json` approved the frozen backend plus publishing integration with 76 scoped tests and two independent regressions, including live corpus sensitivity/detachment revocation. The new composer UI is separately reviewed; no code review grants deployment, publishing, paid-provider, research-quality or human-aesthetic authority.

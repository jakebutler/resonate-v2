# Fixed Corvo visual seed

This directory freezes the approved 2026-09-30 discovery package. `manifest.json`, `prompting-lessons.json`, and `final-direction-prompts.json` are exact copies of the local source package. `source-document.json` retains the exact UTF-8 source document as a JSON string. The source document SHA-256 is `266302230466c497c55c2022eee036a9e80ee695a463c7d2cab139a12f604e64`.

Image masters remain external and are read only. The backend grants seed provenance only when supplied PNG bytes match the fixed manifest hash. Normal uploads cannot supply approval metadata. The historical provider is recorded as ChatGPT web per Jake, historical model IDs remain unknown, and reconstructed prompts remain untested.

Current art direction comes from the source document's current style block. Archived directions do not change it. Article 7's photographic hand requires explicit association with its exact saved Corvo article slug and remains a post exception.

The source document and raw final-direction JSON are **archive-only** and must never be passed directly to a planning, generation, or reflection model. In particular, the original article 15 extraction contains the later QA and publishing handoff sections. Those bytes remain intact for audit; `getSeedArchive` marks this boundary explicitly. The current workflow consumes bounded current guidance and scoped lesson instructions, not this archive. No prompt-only extractor is exposed by this slice.

`corvoSeedIntegrity` in `index.ts` anchors the original JSON file bytes and the canonical serialized archive bytes. Always-on tests verify the UTF-8 source-document text against the manifest hash and verify all three original JSON files, without external image masters. Uploading an approved seed asset and importing a seed run the archive integrity check before assigning provenance; archive retrieval checks persisted bytes. The source-only hero chart policy is quoted from the current style block and QA item 5. The separately authorized PRD policy for evidence-bound informational figures is not attributed to the historical hero approval.

`scripts/import-visual-seed.mjs` defaults to a local hash preflight. Applying an import requires an explicit destination URL, `--apply`, and an application JWT supplied via `RESONATE_VISUAL_IMPORT_TOKEN`. It does not accept a deployment/admin key or print token bytes. No provider requests, image edits, default budget, model qualification, or publication occur.

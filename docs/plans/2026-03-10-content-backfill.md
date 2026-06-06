# Content Backfill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Backfill live Corvo Labs blog posts and existing LinkedIn posts into Convex without creating duplicate rows.

**Architecture:** Add an idempotent Convex backfill mutation keyed by `externalUrl`, then drive it from a local script that scrapes the Corvo Labs blog and optionally reads LinkedIn post seeds from JSON. Keep the import path bounded, rerunnable, and separate from the product UI.

**Tech Stack:** Next.js, Convex, Vitest, Playwright (library), Node.js

---

### Task 1: Add the failing tests

**Files:**
- Create: `lib/__tests__/backfill.test.ts`
- Create: `lib/backfill.ts`

**Step 1: Write the failing test**

Add tests for:
- Normalizing a live post seed into a published Convex post payload.
- Deduping repeated source URLs before import.

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/__tests__/backfill.test.ts`
Expected: FAIL because `@/lib/backfill` does not exist yet.

### Task 2: Add the shared normalization helpers

**Files:**
- Create: `lib/backfill.ts`

**Step 1: Write minimal implementation**

Add:
- `ImportedPostSeed` type
- `normalizeImportedPost`
- `dedupeImportedPosts`

**Step 2: Run test to verify it passes**

Run: `npm test -- lib/__tests__/backfill.test.ts`
Expected: PASS

### Task 3: Add an idempotent Convex backfill API

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/backfill.ts`

**Step 1: Add index**

Add an `externalUrl` index so imports can find existing rows without a table scan.

**Step 2: Add bounded upsert mutation**

Create a validated mutation that:
- accepts a batch of normalized imported posts
- looks up existing records by `externalUrl`
- inserts missing rows
- patches changed rows
- returns inserted/updated/unchanged counts

### Task 4: Add the local backfill runner

**Files:**
- Create: `scripts/backfill-content.mjs`

**Step 1: Scrape the blog**

Use Playwright to:
- enumerate post URLs from `https://www.corvolabs.com/blog`
- visit each post
- extract title, body text, canonical URL, and publish date

**Step 2: Support LinkedIn seed input**

Allow `--linkedin-file <path>` with JSON records matching the shared imported-post shape.

**Step 3: Add dry-run and live modes**

Default to dry-run output. Require `--write` for a live mutation call into Convex.

### Task 5: Verify end-to-end

**Files:**
- Modify if needed after verification

**Step 1: Codegen**

Run: `npx convex codegen`

**Step 2: Targeted tests**

Run: `npm test -- lib/__tests__/backfill.test.ts`

**Step 3: Project verification**

Run:
- `npm run lint`
- `npm run build`

**Step 4: Dry-run the importer**

Run: `node scripts/backfill-content.mjs`
Expected: Prints the blog payload summary without writing.

**Step 5: Live run when payload looks correct**

Run: `node scripts/backfill-content.mjs --write [--linkedin-file path/to/linkedin.json]`

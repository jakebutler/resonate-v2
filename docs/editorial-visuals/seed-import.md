# Guarded archive import from local masters

The Corvo archive seed import is operator-run. It is deliberately not exposed in
the composer UI: importing touches the verified archive, and the panel only
reports saved status (`imported` / verified asset count).

## Prerequisites

- Project checkout with dependencies installed.
- Local PNG masters whose bytes match the fixed manifest hashes.
- An authenticated application JWT exported as `RESONATE_VISUAL_IMPORT_TOKEN`
  in the command environment (never committed, never passed as an argument).

## Dry run (verifies local bytes only)

```sh
node scripts/import-visual-seed.mjs --source-directory /path/to/approved-masters
```

All approved PNG masters must match the fixed manifest hashes. Inspect the dry
run output before applying anything.

## Apply (uploads verified masters and imports the archive)

```sh
node scripts/import-visual-seed.mjs --source-directory /path/to/approved-masters --apply --url <explicit-destination-url>
```

Replace both path and destination placeholders. After applying, inspect saved
status in the composer panel before any retry.

# Compatibility Operations

This project should avoid implementing every feature twice at the same time. Prefer a source-first workflow:

1. Pick the source version for the feature.
   - Use `core` for parsing, matching, schemas, CSV, and copy formats.
   - Use `node-first` when the local workflow is the easiest place to stabilize behavior.
   - Use `lite-first` when the feature mainly exists for GitHub Pages or browser-only use.
   - Use `platform` when parity means equivalent user outcome, not identical implementation.
2. Implement and stabilize the source version.
3. Add or update fixture/contract checks before porting.
4. Port the behavior to the other version only after the source behavior is stable.
5. If porting is impossible or intentionally deferred, update `CAPABILITY_EXCEPTIONS.md`.

## Required Agent Workflow

For any change touching parsing, result shape, filtering, exporting, thumbnails, uploads, or viewer behavior:

1. Read `docs/compatibility/FEATURE_MATRIX.md`.
2. Identify the affected feature IDs.
3. If a feature ID is missing, add one before implementing.
4. Update `test/compatibility/feature-checks.json` for each affected ID.
5. Run `npm run check:compat`.
6. When implementation behavior changes, add or update fixture-based tests before considering the task complete.

## Porting Rule

Do not start from "make both versions at once" unless the change is already isolated in shared `core` code.

Default sequence:

```text
source version -> contract/fixture test -> mirror version -> parity verification
```

This keeps each change small while still forcing the project to record when the mirror version has not caught up.

## What Counts As Parity

Parity means the same user-observable result for the same saved HTML:

- same extracted content keys
- same rank detection
- same in-top3 / not-in-top3 classification
- same CSV and clipboard columns
- same ad URLs and original content URLs
- equivalent filtering, searching, sorting, and result counts

Parity does not require identical UI implementation or identical file storage mechanics.

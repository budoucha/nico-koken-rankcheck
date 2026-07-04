# AGENTS.md

## Compatibility Workflow

For changes that touch parsing, result shape, filtering, exporting, thumbnails, uploads, viewer behavior, or the future browser-only lite version:

1. Read `docs/compatibility/FEATURE_MATRIX.md`.
2. Identify the affected `Fxxx` feature IDs.
3. If a feature ID is missing, add it before implementing the behavior.
4. Update `test/compatibility/feature-checks.json` when feature coverage or required checks change.
5. Update `docs/compatibility/CAPABILITY_EXCEPTIONS.md` when one version omits or only best-effort supports behavior.
6. Follow the source-first workflow in `docs/compatibility/OPERATIONS.md`: stabilize one version, add/adjust contract checks, then port to the other version.
7. Run `npm run check:compat` before finishing.

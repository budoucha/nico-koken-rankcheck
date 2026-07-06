# Feature Compatibility Matrix

This file is the compatibility contract between the Node/local-server version and the browser-only lite version.

Rules:

- Every compatibility-relevant feature must have a stable `Fxxx` ID.
- The `Source` column says where the feature should become stable first.
- The `Node` and `Lite` columns describe the expected support level.
- If a version cannot support a feature, add a row to `CAPABILITY_EXCEPTIONS.md`.
- Every feature ID must also appear in `test/compatibility/feature-checks.json`.

Support levels:

- `required`: must be implemented.
- `optional`: useful, but not required for parity.
- `best-effort`: implemented when the platform allows it; failure must not break core analysis.
- `omitted`: intentionally unsupported; must have an exception.

Source values:

- `core`: shared code or shared result schema is the source of truth.
- `node-first`: stabilize in the Node version, then port to lite.
- `lite-first`: stabilize in the lite version, then port to Node if useful.
- `platform`: platform-specific behavior; document parity limits.

| ID | Feature | Source | Node | Lite | Contract / Notes |
|---|---|---|---|---|---|
| F001 | content type definitions | core | required | required | Static definitions for `seiga` and `video`, including labels, URL patterns, ad URLs, and thumbnail fallbacks. |
| F002 | contents HTML type detection | core | required | required | Detect content type from the selected contents HTML. |
| F003 | contents item extraction | core | required | required | Extract title, URL, content ID, numeric ID, contribution, thumbnail source, and type. |
| F004 | reward top-3 rank extraction | core | required | required | Extract `type:numericId -> rank` from reward HTML. SVG-path dependency must be tested with fixtures. |
| F005 | result item schema | core | required | required | Both versions must produce or consume the shared result item shape. |
| F006 | rank/type/search/sort result operations | core | required | required | Same result semantics; UI can differ. |
| F007 | upload and input selection | platform | required | required | Node accepts uploads and stores files; lite uses File API. Same validation expectations. |
| F008 | persisted input history | platform | required | optional | Node persists to `input/`; lite may use browser storage only with explicit user consent. |
| F009 | CSV/TXT export | core | required | required | Same columns and UTF-8 BOM for CSV. Node writes files; lite downloads blobs. |
| F010 | spreadsheet clipboard copy | core | required | required | Same tab-separated columns for visible rows. |
| F011 | result HTML/viewer rendering | platform | required | required | Node generates `result.html`; lite renders in the current page. Both expose equivalent result operations. |
| F012 | local saved thumbnail reuse | platform | required | best-effort | Node can copy local files. Lite can only use user-selected files or visible URLs. |
| F013 | remote/video thumbnail fallback | platform | required | best-effort | Lite must tolerate CORS/API failures without breaking analysis. |
| F014 | GitHub Pages static deployment | lite-first | optional | required | Lite version must run from static hosting without a server. |
| F015 | lite result history | lite-first | optional | required | Lite stores parsed result data in `localStorage` for reopening past analyses. Raw uploaded HTML must not be persisted. |
| F016 | source HTML bookmarklet | platform | required | required | Both versions expose the same bookmarklet choices for saving the current nicokoken page HTML as an uploadable file. The default choice should automatically load before saving, and one action should support click-to-copy plus drag-to-bookmark registration with a descriptive bookmark title. The auto-load choice should click detected load-more controls, select the reward content tab when needed, and stop reward scrolling after detecting a contribution below 100. |

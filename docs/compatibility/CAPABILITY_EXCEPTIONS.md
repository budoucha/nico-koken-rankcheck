# Capability Exceptions

This file records intentional compatibility gaps. A gap is allowed only when the feature is impossible, unsafe, or disproportionately costly on one platform.

Rules:

- `Feature ID` must exist in `FEATURE_MATRIX.md`.
- `Support` must match the relevant matrix cell.
- `Revisit trigger` should say what would make the exception worth revisiting.

| Feature ID | Version | Support | Reason | Revisit trigger |
|---|---|---|---|---|
| F008 | lite | optional | GitHub Pages cannot persist uploaded HTML to a server-side `input/` directory. Browser storage is possible but should be opt-in because saved HTML may contain private account state. | Add an explicit "remember inputs on this browser" setting. |
| F012 | lite | best-effort | Browsers cannot automatically read sibling `_files` folders saved with an HTML file unless the user selects those files or a directory. | Add an advanced directory/multiple-file picker flow. |
| F013 | lite | best-effort | Browser-side thumbnail API calls depend on CORS and network policy. External image display can work even when `fetch()` cannot. | Confirm a stable CORS-compatible endpoint or proxy-free metadata source. |

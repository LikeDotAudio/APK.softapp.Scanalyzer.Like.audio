# Known Issues & Task Tracking — Scanalyzer.Like.audio

## 🔍 Active Issues & Edge Cases
Tracked: WASM linear memory heap growth when scanning sound libraries exceeding 50,000 WAV files.

## Found while refreshing the README (2026-10-30)
- **A database password is in git history.** Until 2026-10-30 the MySQL user and password
  for `scanalyzer.like.audio` were committed in `describe_db.py` and in `lib.rs`. Both now
  carry none (`describe_db.py` reads `SCAN_DB_*`; `cloud_db_url()` passes a credential-free
  upload URL, since the engine POSTs to `upload_peak.php` and never opens MySQL). The old
  password stays in history: **the owner must rotate it on the host.**
- **`npm run build` fails on `tsc -b`**: 20+ pre-existing errors (missing `jszip`,
  `exifreader`, `tesseract.js`; `verbatimModuleSyntax` type-only imports). `vite build`
  alone succeeds, and the parent CI builds with `npx vite build --base ./` for that reason.
- **13 of 44 `npm test` cases fail** (depth-axis, percent-fill, puck, sense-warning,
  stall-notice consumers): source-text assertions that no longer match the components.
  The synonym tests pass.
- **The front end's UCS mirrors are hand-regenerated.** `ucsIndex.ts` and `categoryEmoji.ts`
  say "GENERATED" but their generators are not in the repo (only
  `scripts/gen-ucs-synonyms.mjs` is). `ucsIndex.ts` has no `8.2.APK` instrument ids
  (no DRUMS, GUITAR, …); it is only consulted for legacy packed-string runner-ups, which
  predate those categories, so nothing is known to resolve wrongly today.

# Known Issues & Task Tracking — Scanalyzer.Like.audio

## 🔍 Active Issues & Edge Cases
Tracked: WASM linear memory heap growth when scanning sound libraries exceeding 50,000 WAV files.

## Found while refreshing the README (2026-10-30)
- **Database credentials are committed.** The MySQL user and password for
  `scanalyzer.like.audio` sit in plain text in `describe_db.py` and in the `--db-url` that
  `start_analysis` (`Web_Front/src-tauri/src/lib.rs`) passes to the engine. They are in
  git history either way; removing them needs a rotation, not just an edit.
- **The desktop engine path is stale.** `main.py::build_analyzer` and `lib.rs::start_analysis`
  look for `SCANALYZER:softapps/SCANALIZER.SampleAnalyzer-Engine`, which the family reorg
  removed; the core is `../../PROCESSOR/PROCESSOR.SampleAnalyzer` (also reachable as
  `sample_analyzer_rs/`). `main.py` exits before launching, and a desktop scan cannot spawn.
- **`SCAN` is a dangling symlink** (`SCAN -> Scanalyzer.Like.audio`, a name that no longer
  exists).
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

# Known Issues & Task Tracking — Scanalyzer.Like.audio

## 🔍 Active Issues & Edge Cases
Tracked: WASM linear memory heap growth when scanning sound libraries exceeding 50,000 WAV files.

## Found while refreshing the README (2026-10-30)
- **A database password is in git history.** Until 2026-10-30 the MySQL user and password
  for `scanalyzer.like.audio` were committed in `describe_db.py` and in `lib.rs`. Both now
  carry none (`describe_db.py` reads `SCAN_DB_*`; `cloud_db_url()` passes a credential-free
  upload URL, since the engine POSTs to `upload_peak.php` and never opens MySQL). The old
  password stays in history: **the owner must rotate it on the host.**
- ~~`npm run build` fails on `tsc -b`~~ — fixed 2026-10-30: the four packages the legacy
  shell's absorbed modules import (`pdfjs-dist`, `jszip`, `exifreader`, `tesseract.js`) are
  declared, and the type-only imports say so. `npm run build` (tsc + vite) passes; the
  parent deploy still runs `vite build` alone, and the root `scanalyzer.yml` runs tsc,
  `npm test`, the gates and `cargo test` beside it.
- ~~13 of 44 `npm test` cases fail~~ — fixed 2026-10-30. The tests were right: when the
  monorepo's `APK:Softapps/SCAN` copy became this submodule (4e8604b54), the helper modules
  (`spaceMouse.ts`, `percentFill.ts`, `Pct.tsx`, `percent-fill.css`) came across but the
  components that consume them were the older ones. `CloudTab.tsx`, `SampleCloud.tsx`,
  `SliceTable.tsx`, `main.tsx` and the allow-fill notes in `ScanalyzeTab.tsx` /
  `PropertyBars.tsx` were restored from that copy; `Header.tsx` (reduced to `return null` in
  382f068) left the fill-host list. 47/47 pass.
- ~~The front end's UCS mirrors are hand-regenerated~~ — fixed 2026-10-30:
  `scripts/gen-ucs-index.mjs` (`npm run gen:ucs-index`, `--check` to gate) rewrites the tables
  in `ucsIndex.ts` and `categoryEmoji.ts` from DATATYPE.soundfx.UCS. `ucsIndex.ts` now carries
  the 8.2.APK instrument ids (828 subcategories in 94 categories) and keeps the 43 retired
  MUSICAL/MUSICPROD ids, since legacy packed runner-ups still name them.

## Found while writing the wiki (2026-10-30)
- ~~**Record upload is not opt-in.**~~ — fixed 2026-10-30: the "Contribute the analysis" box
  (`cloudShare.ts`, off by default) gates all three upload paths. Was: the browser scan posts every analysed record to
  `./api/upload_peak.php` (`ScanalyzeTab.tsx` `flushDbBatch`), and the desktop always passes
  `--db-url`, so the engine posts to scanalyzer.like.audio (`Encoders/db.rs`). The README's
  "100% private / opt-in upload" holds for the audio, not for its analysis.

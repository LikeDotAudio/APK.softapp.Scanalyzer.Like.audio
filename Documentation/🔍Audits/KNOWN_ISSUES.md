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
  parent CI still runs `vite build` alone.
- ~~13 of 44 `npm test` cases fail~~ — fixed 2026-10-30. The tests were right: when the
  monorepo's `APK:Softapps/SCAN` copy became this submodule (4e8604b54), the helper modules
  (`spaceMouse.ts`, `percentFill.ts`, `Pct.tsx`, `percent-fill.css`) came across but the
  components that consume them were the older ones. `CloudTab.tsx`, `SampleCloud.tsx`,
  `SliceTable.tsx`, `main.tsx` and the allow-fill notes in `ScanalyzeTab.tsx` /
  `PropertyBars.tsx` were restored from that copy; `Header.tsx` (reduced to `return null` in
  382f068) left the fill-host list. 47/47 pass.
- **The front end's UCS mirrors are hand-regenerated.** `ucsIndex.ts` and `categoryEmoji.ts`
  say "GENERATED" but their generators are not in the repo (only
  `scripts/gen-ucs-synonyms.mjs` is). `ucsIndex.ts` has no `8.2.APK` instrument ids
  (no DRUMS, GUITAR, …); it is only consulted for legacy packed-string runner-ups, which
  predate those categories, so nothing is known to resolve wrongly today.

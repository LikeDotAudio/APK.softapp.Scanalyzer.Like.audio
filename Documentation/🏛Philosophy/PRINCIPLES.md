# Principles — SCANALYZER.Like.audio

What this application holds to, each pointed at the code that holds it, and where the code
breaks it today. The ecosystem rules these sit under live in the APK.audio root
`Documentation/🏛Philosophy/` (notably `Doctrine/readme.Refusal over fabrication.md` and
`Soft Apps/readme.Soft Apps.md`); they are cited here, not copied.

## 1. One engine, one UI, two targets

The same Rust crate (`sample_analyzer_rs` → PROCESSOR/PROCESSOR.SampleAnalyzer) is the
WebAssembly core in the browser and the native binary on the desktop; the same React app is
the web page and the Tauri window.

- Browser: `Web_Front/wasm_analyzer` wraps the crate with `wasm-bindgen`; `ScanalyzeTab.tsx`
  starts one `wasmWorker.ts` per `navigator.hardwareConcurrency`.
- Desktop: `Web_Front/src-tauri/Cargo.toml` links `oa-sample-analyzer` by path, and
  `start_analysis` (`src-tauri/src/lib.rs`) spawns the CLI built from the same crate
  (`analyzer_binary()`; `main.py` `build_analyzer` builds it first so the desktop never runs a
  stale engine).

## 2. The `.PEAK` sidecar is the record

One JSON per audio file, written beside it, plus the folder's aggregate. Everything the UI
draws is read back from those files, and every record carries the `analyzer_version` that
wrote it.

- `sample_analyzer_rs/src/Encoders/sidecar.rs` `write_sidecar` / `read_sidecar`.
- `Pipeline/run.rs` stamps `ANALYZER_VERSION`; a sidecar from the same version is reused,
  anything else is re-analysed (`--force` ignores all of them). The browser does the same
  check in `ScanalyzeTab.tsx` before it reads a single byte of audio.

## 3. Listen first, read the name last

Measurements and blind classification come before the file name is consulted. The order is
the pipeline's (README, *The pipeline*): decode → measure → classify blind → name taxonomy
→ clustering/PCA → write.

## 4. One taxonomy: the UCS

Categories, colours, emoji, scope chips and search hang off DATATYPE.soundfx.UCS — generated
from it, not typed in beside it.

- `Web_Front/scripts/gen-ucs-index.mjs` writes the tables in `src/ucsIndex.ts` and
  `src/categoryEmoji.ts`; `--check` fails when they drift from the data.
- `Web_Front/scripts/gen-ucs-synonyms.mjs` writes `src/ucsSynonyms.json`.
- The engine's `build.rs` splices the same category JSONs into the crate.

## 5. Keep going on errors

A file that will not decode, a sidecar that will not parse, a synonym library that will not
build — each is skipped or degraded and reported; none stops the scan.

- `ScanalyzeTab.tsx`: per-file `try/catch` around the parse; upload batches tracked with
  `Promise.allSettled` and their stored/skipped/error counts shown.
- `CloudTab.tsx` `WebGLBoundary`: a WebGL crash draws a notice, not a blank tab.

## 6. Report the outcome, not the attempt

An upload reports what the server stored, not what was sent (`Encoders/db.rs` comment and
`run.rs` `db_export` events; `ScanalyzeTab.tsx` `flushDbBatch` checks `res.ok`). The
unconfirmed-sense and stall warnings in `CloudTab.tsx` (`senseWarning`, `stallWarning` from
`src/spaceMouse.ts`) decide whether an element is drawn, not just a tooltip — held by
`test/sense-warning-consumer.test.mjs` and `test/stall-notice-consumer.test.mjs`. This is the
root doctrine *Refusal over fabrication* applied to a UI.

## 7. Every screen can be opened; nothing is served that nothing calls

- `Web_Front/scripts/check-mount-reach.mjs`: every exported screen component must be
  reachable from `src/main.tsx`.
- `Web_Front/scripts/check-public-api.mjs`: every `.php` under `public/` (copied verbatim into
  `dist/`, so served) must have a caller in `src/`. Hand-run migrations live in
  `Web_Front/tools/api/`.
- `Docker/Dockerfile` COPYs the three endpoints by name, so the scan-api image cannot pick up
  a fourth file.

## 8. One build, many windows

The APK.audio OS opens single screens of the one build with `?solo=1#/<tab>`; a solo window
pushes sideways to the window that owns the next screen instead of switching its own tab
(`Web_Front/src/soloWindow.ts`, `App.tsx` `revealTab` / `footerPush`).

## Where the code breaks these

- ~~"Your audio never leaves your machine" is not true of the records~~ — fixed 2026-10-30:
  upload is opt-in. One box before every scan ("Contribute the analysis…",
  `CloudShareToggle.tsx`, stored by `cloudShare.ts`, off by default) gates the browser
  `flushDbBatch`, the desktop `start_analysis` (`upload`; without it `--db-url` is not passed)
  and the desktop `sync_to_db` on open. Unticked, nothing but the audio's own sidecars is written.
- **A database password is in git history** (committed until 2026-10-30 in `describe_db.py`
  and `lib.rs`). The source no longer carries it; rotating it is the owner's step
  (`Documentation/🔍Audits/KNOWN_ISSUES.md`).
- **`Header.tsx` returns `null`** (since 382f068): the branding/progress strip is gone from
  the standalone page, and the solo-window progress strip with it.

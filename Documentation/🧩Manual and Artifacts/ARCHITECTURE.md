# Architecture — SCANALYZER.Like.audio

How to use it, and how it works inside. The measurement maths, the classification stack and
the `.PEAK` schema are long and live in the repo [README](../../README.md); this page is the
map of entry points, data flow and files.

## Using it

| Want | Do |
|---|---|
| Browser, dev | `cd Web_Front && npm install && npm run dev` |
| Browser, build | `npm run build` (`tsc -b && vite build` → `Web_Front/dist/`) |
| Desktop | `python3 Web_Front/desktop.py` — builds the engine, then `npm run tauri dev` |
| CLI only | `oa_sample_analyzer <dir> [--out p] [--workers n] [--max-len s] [--clusters k] [--no-per-file] [--force] [--stride n] [--db-url u]` |
| Corpus API on the bench | `docker compose -f Docker/docker-compose.yml up -d --build` (scan-api, php-fpm :9000) |

In the APK.audio OS the app opens as one window per screen:
`APK:Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html?solo=1#/<tab>`.

## The parts

```
Web_Front/
  src/main.tsx            entry: loads percent-fill.css, mounts <App/>
  src/App.tsx             tab strip, global filter (UCS synonyms), scope bar, footer transport,
                          favorites, solo-window hand-off, cloud-DB status poll (db_status.php)
  src/components/         one folder per screen (see Screens)
  src/wasmWorker.ts       browser analysis worker → wasm_analyzer
  src/extractorWorker.ts  Extractor worker → wasm_extractor
  src/soloWindow.ts       ?solo=1 contract with the OS shell
  src/components/ConvertMenu.tsx   footer ⚙ Convert: the selected sample → Worker-SAMPLE_CONVERSION
  src/sampleConversion.ts, sampleConversionJob.ts   its MQTT client; its job/result rules (tested)
  src/spaceMouse.ts       SpaceMouse puck frames, sense/stall rules (CloudTab, SampleCloud)
  src/ucsIndex.ts, categoryEmoji.ts, ucsSynonyms*.ts   UCS mirrors (generated tables)
  src/shell/              legacy vanilla-DOM shell; nothing loads it (kept for porting)
  src-tauri/src/lib.rs    desktop commands (Tauri v2)
  wasm_analyzer/, wasm_extractor/   wasm-bindgen wrappers; committed pkg/ for builds without Rust
  public/api/             db_status.php, get_peaks.php, upload_peak.php — served
  tools/api/              hand-run migrations/debug PHP, describe_db.py (peaks table layout; credentials from SCAN_DB_*) — never served
  desktop.py              desktop launcher (rebuilds the engine, then `npm run tauri dev`)
  scripts/                gates (check-*.mjs) and generators (gen-logo, gen-ucs-synonyms, gen-ucs-index)
  test/                   node --test suites (npm test)
Docker/                   scan-api image (the three endpoints only)
sample_analyzer_rs → PROCESSOR.SampleAnalyzer     the engine (own repo)
extractor_engine_rs → CAPTURE.Extractor-Engine    region detection / slicing (own repo)
folder_scanner_rs/, graphics_suite_rs/, PROCESSORS.sidecar_tools/   Folder-ScanAnalyzer stages
graphics_suite_rs/src/lib.rs   the library the CLI (main.rs) and the worker both link
graphics_suite_rs/SRC/, Docker/   Worker-GRAPHICS_SUITE (POD.workers, token graphics_suite):
                                a job {op: ocr|vectorize, content_b64} answered with what the
                                CLI's `ocr` / `to-svg` print; no port, decoded in memory
graphics_suite_rs/src/ocr.rs    OCR is Tesseract's: the image is piped to `tesseract stdin
                                stdout tsv makebox` (words → word_regions/extracted_text,
                                boxes → detected_characters); no tesseract = an error, never
                                a guess (APK_OCR_TESSERACT, APK_OCR_LANG, TESSDATA_PREFIX);
                                per job `psm` (0-13, default 3) and `whitelist` (OcrOptions;
                                CLI --psm/--whitelist) — a code label like "IO-AE", read
                                "10-AE" by default, reads right with psm 8/13 + a whitelist
01_CAPTURES … 08_VISUALIZERS/   hub folders: symlinks to each Scanalyzer softapp, by stage
                                each module's own display.json is its menu entry; there is
                                no suite-wide manifest (SCANALIZER_DYNAMIC_MANIFEST.json named
                                pre-reorg paths, was read by nothing, removed 2026-10-30)
SCANNER.Scanalyze/, Crawler.Like.Audio/   submodules
```

## Screens

`TAB_IDS` in `App.tsx`: `scanalyze` (pick a folder, scan), `devices` (bench devices,
`DevicesTab`), `cloud` (3D, `CloudTab` + `SampleCloud`), `faceball` (4D), `stats` (2D),
`groups`, `examiner`, `favorites`, `extractor`, `rename`. `scripts/check-mount-reach.mjs`
fails if a screen component exists that none of these can reach.

## Data flow

**Browser scan.** `ScanalyzeTab` lists the folder through the File System Access API,
counts audio and existing `.PEAK` files, absorbs sidecars whose `analyzer_version` matches the
loaded WASM engine, and sends the rest to a pool of `wasmWorker.ts` workers. Each result is
written as `<file>.PEAK` beside the audio (where the browser allows writes), batched to
`./api/upload_peak.php` only when the opt-in box is ticked (`cloudShare.ts`), and appended to `analysisResult` in `App`, which every view reads.

**Desktop scan.** `TauriScan.tsx` invokes `start_analysis` (`lib.rs`), which spawns
`oa_sample_analyzer <dir> --workers <cores>`, plus `--db-url <upload URL>` only when the
opt-in box is ticked (`upload`) (binary from
`analyzer_binary()`: `SCAN_ANALYZER_BIN`, set by `Web_Front/desktop.py` after it asks `cargo metadata`
where cargo built it). The CLI streams one JSON line per file; `lib.rs` batches results into
`analyzer-batch` events (1,000 at a time) and progress into `analyzer-progress`. The engine
writes the sidecars and `sample_cloud_data.PEAK` itself. Other commands read back what is on
disk: `open_sidecars`, `open_peak_file` / `read_peak_page`, `open_manifest`, `build_manifest`,
`read_audio_bytes`, `backfill_previews`, and the extractor trio
(`extractor_detect`, `extractor_slice_wav`, `extractor_analyze_chunk`).

**Cloud database.** `Encoders/db.rs` (engine) and `peakUpload.ts` (browser) trim each record
to the stored columns and POST it to `upload_peak.php`; `get_peaks.php` reads the corpus back
("Load/Reload from Database", and the auto-connect when `db_status.php` reports records and
nothing is loaded yet). On the APK.audio bench those three run in the `scan-api` container and
reach MariaDB at `sql-proxy:3306`; on scanalyzer.like.audio they run on the cPanel host.

**Convert.** The footer's ⚙ Convert (`ConvertMenu.tsx`) reads the selected sample the way
Download does (`footerAudioFile` in `App.tsx`), and `sampleConversion.ts` sends it as one job to
`APK.audio/System/Protocols/sample_conversion/outgoing/job` over the broker's WebSocket
(`oa_bus_url`, else ws://<page host>:9001 on a local origin; none on a public one), with
mqtt.js loaded from the shell (`/engine/vendor/mqtt.min.js` first). The answer on
`incoming/result`, matched by `job_id`, comes back as a playable, downloadable file. The worker
is `Worker-SAMPLE_CONVERSION` (PROCESSOR.SampleConversion, POD.workers); a refused job shows its
error, and a worker whose retained `status` is not `online` is reported at once.

**Incremental re-analysis.** `read_sidecar` (`Encoders/sidecar.rs`) returns nothing for a
sidecar from a different `ANALYZER_VERSION` or a different file name, so that file is
re-analysed; `--force` ignores every sidecar.

## Checks

| Command | Holds |
|---|---|
| `npm test` | 57 cases: depth axis, percent-fill hosts, puck qualification/flyability, sense and stall notices, stale window, UCS synonyms, the convert job (with a live round trip to the worker when ws://127.0.0.1:9001 answers; skipped otherwise) |
| `npm run build` | `tsc -b` then `vite build` |
| `node scripts/check-mount-reach.mjs` | every screen reachable from `main.tsx` |
| `node scripts/check-public-api.mjs` | every served `.php` has a caller |
| `node scripts/check-effect-abort.mjs`, `check-discovery.mjs` | effect cancellation; gate/test discovery |
| `npm run gen:ucs-index -- --check` | UCS tables match DATATYPE.soundfx.UCS |
| `cargo check` in `Web_Front/src-tauri` | the desktop crate compiles |

## Since the 2026-10-30 audit
- Crates: `extractor_engine` and `oa-sample-analyzer` by git rev; `Web_Front/.cargo/config.toml` (local, excluded) patches them to `../../../CAPTURE/CAPTURE.Extractor-Engine` and `../../../PROCESSOR/PROCESSOR.SampleAnalyzer/SRC/core`.
- Bus: `src/busLink.ts` (one link via `window.APKBus`), `src/sampleConversionJob.ts` and `src/graphicsSuiteJob.ts` (jobs; topics from `src/vendor/apk-contracts/apk-contracts.mjs`).
- Corpus API: `public/api/db.php` (connection, CORS, upload token), `upload_columns.json` (served by `upload_peak.php?columns`).
- Suite: `SUITE/suite.json`; stage folders hold only their README.
- Build: `Docker/dist.Dockerfile` → stage `dist`; `Docker/check.sh` is the one check.

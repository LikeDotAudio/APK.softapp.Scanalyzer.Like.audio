# Delivery — SCANALYZER.Like.audio

How it is built, tested and shipped, and where it lands.

## Where it lands

| Target | What arrives | How |
|---|---|---|
| **apk.audio** (the OS windows) | `Web_Front/dist/` at `/APK:Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/` | APK.audio root `.github/workflows/ci.yml`, *Deploy* job |
| **WEB.Frontend-Assets image** | the whole `PODS/POD.THIN/Softapps` tree, sources as checked out | `WEB.Frontend-Assets/Docker/Dockerfile` `COPY ["PODS/POD.THIN/Softapps", …]` |
| **scan-api container** (bench) | `db_status.php`, `get_peaks.php`, `upload_peak.php` (+ `db.php`, `upload_columns.json`) on php-fpm :9000 | `Docker/docker-compose.yml` (project `apk-audio`), image `scanalyzer-api:local` |
| **scanalyzer.like.audio** | the app's public home and the cPanel PHP endpoints the desktop uploads to | no workflow in this repo (see *Not automated*) |
| **Desktop** | a Tauri window run from the checkout | `python3 Web_Front/desktop.py` |
| **Worker-GRAPHICS_SUITE** (bench) | `graphics_suite_rs`'s OCR and SVG tracer as jobs on `graphics_suite/outgoing/job` | `graphics_suite_rs/Docker/docker-compose.yml` (project `workers`, included by `PODS/POD.workers`), image `worker-graphics-suite:local`, built from the repo root |

## Build

- **Web.** The root CI step *Build the Scanalyzer* runs, in `Web_Front/`:
  `wasm-pack build wasm_analyzer --target web --release`,
  `wasm-pack build wasm_extractor --target web --release`, `npm ci`,
  `npx vite build --base ./` (relative base, because the bundle is served from a deep path; vite.config.ts now sets `base: './'` itself).
  **The image recipe is `Docker/dist.Dockerfile`** (context `PODS/POD.THIN/Softapps`, final stage `dist` = the built tree): it patches the two git-pinned crates to the copied siblings, so it builds offline. WEB.Frontend-Assets takes `Web_Front/dist` from it.
  The root deploy (`WEB.Frontend-Assets/.apk.scripts/deploy.py`) then uploads the site by FTPS.
  Locally `npm run build` runs `tsc -b && vite build`; both pass as of 2026-10-30.
- **Desktop.** `Web_Front/desktop.py` builds `oa_sample_analyzer` through `src-tauri`'s dependency (`-p oa-sample-analyzer`), asks
  `cargo metadata` for the target directory (the APK.audio checkout sets one at the root),
  exports the binary as `SCAN_ANALYZER_BIN`, then `npm run tauri dev`. `npm run tauri build`
  makes an installer; nothing publishes one.
- **scan-api image.** Build context is `Web_Front/public/api/`; the Dockerfile COPYs the three
  endpoints by name and `php -l`s them at build time. An edit to an endpoint needs
  `docker compose … up -d --build`.

## Test

Run in `Web_Front/`: `npm test` (47 node --test cases), `npm run build`, `npx oxlint src`
(fails on errors only; warnings are reported),
`node scripts/check-mount-reach.mjs`, `node scripts/check-public-api.mjs`,
`node scripts/check-effect-abort.mjs`, `node scripts/check-discovery.mjs`,
`npm run gen:ucs-index -- --check`. The desktop crate: `cargo check` in `Web_Front/src-tauri`.
The Folder-ScanAnalyzer tools: `cargo test` in `folder_scanner_rs` and `graphics_suite_rs`.
The worker: `cargo test` in `graphics_suite_rs/SRC` (needs the APK.audio checkout: it links
`apk-plugin-runner` and `apkaudio-contracts` by path); after a change to `graphics_suite_rs/src`
or `SRC/`, `docker compose -f PODS/POD.workers/Docker/docker-compose.yml up -d --build graphics-suite`.

In CI, the APK.audio root `.github/workflows/scanalyzer.yml` runs all of the above except the
desktop crate on every push that moves this submodule, the engine, the extractor or the UCS
data: it builds the two wasm cores (tsc resolves them through the gitignored `pkg/`), then `npm ci`, `npm test`, `tsc -b`, `oxlint src`, the four gates, `gen:ucs-index --check`, and both
`cargo test`s. It lives at the root, not here, because the wasm cores and the UCS mirror build
from sibling submodules a lone clone of this repo does not have. It does not gate the deploy.
The repo's smoke result is in [SMOKE.md](../🧩Manual%20and%20Artifacts/SMOKE.md).

## Not automated

- **The deploy does not wait for the tests.** The root deploy builds with `vite build` only;
  `scanalyzer.yml` goes red beside it but does not stop it. `cargo check` of the desktop crate
  runs only by hand.
- **scanalyzer.like.audio is not deployed from here.** This repo's own `.github/` was removed
  in `53236b7`. The `public/api/*.php` files there use the placeholder
  `GITHUB_SECRET_DB_PASSWORD` when `SCAN_DB_PASS` is unset; whatever substitutes it on that
  host is outside this repo.
- **The WASM `pkg/` folders are not committed** (each holds a `*` .gitignore), so every build
  runs `wasm-pack build` first; after an engine change a local `npm run build` needs that rerun
  by hand.
- **Generated UCS tables** (`npm run gen:ucs-index`, `npm run gen:ucs-synonyms`) are rerun by
  hand when DATATYPE.soundfx.UCS changes.
- **Rotating the database password** after its exposure in git history is the owner's step.
- **The desktop app is not packaged or released**; it runs from a checkout.

## Delivered from the 2026-10-30 audit
- **Engine and analyzer by commit** — `Web_Front/{wasm_extractor,wasm_analyzer,src-tauri}/Cargo.toml` name `extractor_engine` (rev `e66e6be…`) and `oa-sample-analyzer` (rev `177daac…`, its crate now in `SRC/core`) by git; the locally excluded `Web_Front/.cargo/config.toml` patches both to the sibling folders, and `Docker/dist.Dockerfile` writes the same file inside its build so the image never fetches GitHub. Verified: `cargo test` in both wasm crates, `cargo check` of src-tauri, lockfiles hold no git sources (patched), `docker build` of dist.Dockerfile. The revs must be pushed (coordinator) before a standalone clone resolves them; publishing tags needs the owner.
- **Worker-GRAPHICS_SUITE on the SDK by tag** — `graphics_suite_rs/SRC/Cargo.toml` names the runner and contracts by `tag = "sdk-v0.5"` (local `[patch]` in an excluded `SRC/.cargo/config.toml`); the health probe is built with `-p apk-plugin-runner`. Verified: `cargo test` 7/7, `docker build` of the image OK. Part of POD.workers.
- **Kept by design: repo-root context for the worker image** — the rule every SDK-linking image follows (`.apk.scripts/plugin_standalone.py`, DATABUS.Broker.MQTT): the crate builds alone from git, the image builds the checkout's runner/contracts patched in with `--config`, never fetching GitHub. Written in `graphics_suite_rs/Docker/Dockerfile`.
- **40 sibling symlinks → `suite.json`** — every tracked symlink (`01_CAPTURES/…` … `08_VISUALIZERS/…`, `sample_analyzer_rs`, `extractor_engine_rs`, `graphing_rs`, `Sample_Conversion_rs`) removed; `suite.json` lists the 34 live members by stage, portal path and repository (the retired DATABASE.Data-Channels dropped, per S07; the CAPTURE pointer links dropped, per S02); stage READMEs point at it. `desktop.py` and `src-tauri` no longer reach through `sample_analyzer_rs`. Test: `test/suite-manifest.test.mjs` (no symlink comes back; every portal path resolves in a monorepo checkout).
- **The shared bus helper and contract topics** — `src/busLink.ts` loads `/FrontEnd/shared/apk-bus.js` (`window.APKBus`, W09) instead of probing four mqtt.js paths and guessing `ws://<host>:9001`; topics come from the vendored contracts browser build (`src/vendor/apk-contracts/`, held by `.apk.scripts/vendor_contract_web.py --check`) via `Topics.protocols.topic`. Tests assert the built topics; the live conversion round trip passed against Worker-SAMPLE_CONVERSION.
- **One `db.php` adapter, narrowed CORS, optional upload token** — `Web_Front/public/api/db.php` holds the connection, CORS (reflects only the Tauri origins + `SCAN_ALLOWED_ORIGINS`, never `*`) and `SCAN_UPLOAD_TOKEN` (`X-Upload-Token`); the three endpoints `require` it. Verified in a throwaway php:8.3 container: foreign origin gets no CORS header, a POST without the token is 401, a Tauri preflight is 204 with its origin; `php -l` clean; the scan-api image builds. Whether to SET the token on the bench/public host is the owner's (see the audit).
- **One upload column list** — `Web_Front/public/api/upload_columns.json`, served by `upload_peak.php?columns`, read by `slimForUpload` (`src/peakUpload.ts`, which also fixes `records.map(slimForUpload)` passing the index) and fetched by the analyzer's `db.rs`. Test: `test/upload-columns.test.mjs` (incl. every listed field is read by the PHP).
- **One check command** — `./check.sh`: `npm test` (70), `tsc -b`, oxlint, `cargo test` in wasm_extractor, wasm_analyzer, graphics_suite_rs and its worker, `php -l`. Green 2026-10-30. The root `scanalyzer.yml` runs alongside the deploy without gating it (deliberate root policy).
- **Version and the `.PEAK` contract** — `Web_Front/package.json` 0.1.0; the `.PEAK` schema is published by its owner (PROCESSOR.SampleAnalyzer `SRC/core/schema/peak.schema.json`, analyzer-peak 1.1.0) — the copy that lived here as `Web_Front/src/analyzerPeakSchema.json` moved there; `wasm_analyzer/tests/peak_fixtures.rs` validates every shipped `.PEAK` against it and `peak_schema()` hands it to the browser.
- **The Web_Front dist recipe** (W09 handoff) — `Docker/dist.Dockerfile`, final stage `dist`; `vite.config.ts` sets `base: './'`.
- **Kept by design: two crates in graphics_suite_rs** — `graphics_suite_rs/` (library + CLI + micro-API) and `graphics_suite_rs/SRC/` (the worker, its own workspace so a broken worker never fails another build); the worker links the library by path. Now `graphics_suite_rs/display.json` names the worker and its `requires`.
- **WS-05 broker fallback** (SDK/contracts audit) — no host:9001 guess; the shared helper's same-origin `/mqtt` order.
- **WS-06 / DS-03 topics by the contract builder** (SDK/contracts audit) — see above; asserted in `test/sample-conversion-job.test.mjs` and `test/graphics-suite-job.test.mjs`.
- **WS-06 / OS-06 liveness leaf** (SDK/contracts audit) — the client no longer reads `/status` (set `online` once, never cleared by a will); it subscribes `incoming/state` and names the will's `unavailable` in the timeout error. Not a refusal up front: on this bench a live worker withdrawn onto the workbench also holds `unavailable` retained and still answers (observed 2026-10-30), so only a missing answer is proof.
- **WS-07 brand accent from the token** (SDK/contracts audit) — `#f4902c` removed from code: CSS uses `var(--apk-accent)` (vendored `apk-tokens.css`, imported in `main.tsx`), canvas/three.js code imports `ACCENT` from `src/brand.ts` (the contracts bundle).
- **DS-02 OCR and vectorize as bus jobs** (SDK/contracts audit) — `src/graphicsSuiteJob.ts` sends `ocr` / `vectorize` to Worker-GRAPHICS_SUITE (`fetchAnalysis.ts`, `ocr.ts`); the micro-API answers only where the page has no bus. `/api/analyze-image`, `/api/photo-id`, DOCX and DXF stay HTTP: the worker has no such op. Test incl. a live vectorize round trip (passed).
- **WK-07 / WS-08 requires blocks** (SDK/contracts audit) — `display.json` and `Web_Front/display.json`: plugins `sample_conversion`, `graphics_suite` (both now called by Web_Front), services `broker` (+ `osapi` for the app); `graphics_suite_rs/display.json` added (requires `graphics_suite`, `broker`).
- **The corpus schema is authored here** (W07 handoff) — `Docker/schema.scanalyzer.mariadb.sql`, the exact schema of DATABASE.server.SQL's copy with its header saying where it is authored; DATABASE.server.SQL's `Dockerfile.node` is to COPY it from here and drop its own (their side).
- **Suite list follows its members** (S07, S12 handoffs) — `suite.json` names DATATYPE.soundfx.UCS instead of the pointer-only DATABASE.UCS-Taxonomy and drops VISUALIZER.Simple-Data-Graphing (no tile); the UCS signature spec here is a pointer to DATATYPE.soundfx.UCS.

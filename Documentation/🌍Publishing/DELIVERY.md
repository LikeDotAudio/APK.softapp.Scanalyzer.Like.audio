# Delivery — SCANALYZER.Like.audio

How it is built, tested and shipped, and where it lands.

## Where it lands

| Target | What arrives | How |
|---|---|---|
| **apk.audio** (the OS windows) | `Web_Front/dist/` at `/APK:Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/` | APK.audio root `.github/workflows/ci.yml`, *Deploy* job |
| **WEB.Frontend-Assets image** | the whole `PODS/POD.THIN/Softapps` tree, sources as checked out | `WEB.Frontend-Assets/Docker/Dockerfile` `COPY ["PODS/POD.THIN/Softapps", …]` |
| **scan-api container** (bench) | `db_status.php`, `get_peaks.php`, `upload_peak.php` on php-fpm :9000 | `Docker/docker-compose.yml` (project `apk-audio`), image `scanalyzer-api:local` |
| **scanalyzer.like.audio** | the app's public home and the cPanel PHP endpoints the desktop uploads to | no workflow in this repo (see *Not automated*) |
| **Desktop** | a Tauri window run from the checkout | `python3 main.py` |

## Build

- **Web.** The root CI step *Build the Scanalyzer* runs, in `Web_Front/`:
  `wasm-pack build wasm_analyzer --target web --release`,
  `wasm-pack build wasm_extractor --target web --release`, `npm ci`,
  `npx vite build --base ./` (relative base, because the bundle is served from a deep path).
  The root deploy (`WEB.Frontend-Assets/.apk.scripts/deploy.py`) then uploads the site by FTPS.
  Locally `npm run build` runs `tsc -b && vite build`; both pass as of 2026-10-30.
- **Desktop.** `main.py` runs `cargo build --release` in `sample_analyzer_rs`, asks
  `cargo metadata` for the target directory (the APK.audio checkout sets one at the root),
  exports the binary as `SCAN_ANALYZER_BIN`, then `npm run tauri dev`. `npm run tauri build`
  makes an installer; nothing publishes one.
- **scan-api image.** Build context is `Web_Front/public/api/`; the Dockerfile COPYs the three
  endpoints by name and `php -l`s them at build time. An edit to an endpoint needs
  `docker compose … up -d --build`.

## Test

Run in `Web_Front/`: `npm test` (47 node --test cases), `npm run build`,
`node scripts/check-mount-reach.mjs`, `node scripts/check-public-api.mjs`,
`node scripts/check-effect-abort.mjs`, `node scripts/check-discovery.mjs`,
`npm run gen:ucs-index -- --check`. The desktop crate: `cargo check` in `Web_Front/src-tauri`.
The Folder-ScanAnalyzer tools: `cargo test` in `folder_scanner_rs` and `graphics_suite_rs`.

In CI, the APK.audio root `.github/workflows/scanalyzer.yml` runs all of the above except the
desktop crate on every push that moves this submodule, the engine, the extractor, the UCS
data or one of the seven CAPTURE repos that copy files from here: it first runs
`01_CAPTURES/sync_copies.py --check` (those copies match the files built here), builds the two
wasm cores (tsc resolves them through the gitignored `pkg/`), then `npm ci`, `npm test`, `tsc -b`, the four gates, `gen:ucs-index --check`, and both
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

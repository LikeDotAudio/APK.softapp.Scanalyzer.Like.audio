# 🔍 Architecture audit — SCANALYZER.Like.audio (2026-10-30)

Audited against the APK.audio multi-repo architecture standard: coupling, boundaries, duplication, contracts.
← [Audits](INDEX.md) · Improvements: [🛣Roadmap/IMPROVEMENTS.md](../%F0%9F%9B%A3Roadmap/IMPROVEMENTS.md)

## Bounded context
The sound-library analyser as one application: React/Vite + Tauri front end (`Web_Front/`), WASM wrappers over the shared Rust DSP crates, the corpus API (three PHP endpoints, container `Scanalyzer-API`) and the OCR/vectorizer worker (`graphics_suite_rs`, container in `POD.workers`). TypeScript, Rust, PHP; 559 tracked files, 423 of them under `Web_Front/` (124 are sample audio fixtures).

Sampled: `display.json`, `Docker/`, `graphics_suite_rs/{Cargo.toml,SRC/Cargo.toml,Docker/}`, `Web_Front/{package.json,src-tauri/Cargo.toml,wasm_*/Cargo.toml}`, `Web_Front/public/api/*.php`, `Web_Front/src/sampleConversion*.ts`, `Web_Front/test/`, the 40 tracked symlinks and the two nested submodules. The React component tree (`src/components`, `src/shell`, ~105 files) was not read file by file.

## Context map
| Talks to | How (topic / endpoint / file / import) | Relationship |
|---|---|---|
| PROCESSOR.SampleAnalyzer, CAPTURE.Extractor-Engine | Cargo `git = …, rev = …` in `Web_Front/{wasm_extractor,wasm_analyzer,src-tauri}/Cargo.toml`; local `[patch]` (excluded `Web_Front/.cargo/config.toml`, written again inside `Docker/dist.Dockerfile`) | Customer–Supplier (versioned by commit) |
| `.PEAK` schema (owned by PROCESSOR.SampleAnalyzer) | `oa_sample_analyzer::schema` through the crate; `wasm_analyzer::peak_schema()` for the browser | Conformist to a Published Language |
| APK.plugin.SDK (runner, contracts) | `graphics_suite_rs/SRC/Cargo.toml` by `tag = "sdk-v0.5"`; image patches to the checkout with `--config` | Conformist (versioned) |
| Sibling Scanalyzer softapps | `SUITE/suite.json` (portal path + repository per member) | Published Language (data, no file reach) |
| Worker-SAMPLE_CONVERSION, Worker-GRAPHICS_SUITE | MQTT `…/{sample_conversion,graphics_suite}/outgoing/job` → `incoming/result`, topics from the vendored contracts build | Customer–Supplier over the bus |
| WEB.Frontend-Assets | `/FrontEnd/shared/apk-bus.js` (`window.APKBus`); takes `Web_Front/dist` from `Docker/dist.Dockerfile` | Conformist / Supplier |
| DATABASE.server.SQL | PDO through `Web_Front/public/api/db.php` to `sql-proxy:3306` | Customer–Supplier (schema owned there) |
| WEB.Traffic-Router / Storage-Portal | FastCGI to `scan-api:9000` | Customer–Supplier |
| Crawler.Like.Audio, SCANNER.Scanalyze | nested submodules — audited in their own repos | — |

## Scorecard
| Category | Score (0–3) | Finding |
|---|---|---|
| Coupling & Cohesion | 3 | No symlink or `path =` into a sibling: crates by git rev (patched locally), the suite as `SUITE/suite.json`; image contexts outside the repo are the house rule (kept by design) |
| Boundary Integrity | 2 | Rows translated into `.PEAK`; one `db.php` adapter, CORS narrowed; the upload token is opt-in and not yet set on any host (needs owner) |
| Duplication Control | 3 | Shared bus helper, contract topic builders and brand token; one upload column file; the `.PEAK` schema lives with its owner |
| Testing & Contracts | 3 | `Docker/check.sh` (70 node tests incl. live bus round trips, tsc, 4 cargo suites incl. every shipped `.PEAK` against the published schema, php -l) |
| Change management | 2 | `package.json` 0.1.0, crates pinned by commit; no tags yet (needs owner) |
Score key: 3 meets the standard · 2 minor gaps · 1 significant gaps · 0 absent / violated.

## Findings
1. **Good: the corpus API is isolated.** `Docker/Dockerfile` copies exactly the three endpoints, their adapter and the upload column list from a context of `Web_Front/public/api`; the destructive migrations live in `Web_Front/tools/api/` outside the image.
2. **Good: rows are translated, not dumped.** `Web_Front/public/api/get_peaks.php` rebuilds each joined row into the `.PEAK` record shape, so the HTTP payload is the sidecar format, not the schema.
3. **Good: contract-shaped tests.** Job payload tests and live round trips for both workers, every shipped `.PEAK` against the analyzer's published schema (`wasm_analyzer/tests/peak_fixtures.rs`), WASM vs native cut parity (`wasm_extractor/tests/cut_identically.rs`), the upload column file against the PHP.
4. **Needs owner: set `SCAN_UPLOAD_TOKEN`.** `upload_peak.php` refuses a write without `X-Upload-Token` once the server has the variable (`Web_Front/public/api/db.php`); it is set nowhere yet — the public corpus is crowd-filled, so whether to close it is the owner's call, and secrets are the owner's to place.
5. **Needs owner: publish tags.** `package.json` is 0.1.0 and the crates pin commits; tagging releases (and pushing the pinned revs, which the coordinator's deploy does) is outside an agent's reach.
6. **Waiting on WEB.Frontend-Assets (handoff filed).** Portal-WebStatic must take `Web_Front/dist` from `Docker/dist.Dockerfile` (or add the same `[patch]` file to its own stage); until it does, its old stage fetches the git-pinned crates from GitHub. The root CI's *Build the Scanalyzer* step needs the same two `[patch]` lines (handoff filed to the root).

Delivered items are in [🌍Publishing/DELIVERY.md](../%F0%9F%8C%8DPublishing/DELIVERY.md).

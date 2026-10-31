#!/usr/bin/env bash
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
#
# The one check for this repository, run by hand before a push (the monorepo's
# CI deliberately verifies nothing; the root .github/workflows/scanalyzer.yml runs
# the same suites beside the deploy without gating it):
#   Docker/check.sh
# 1. Web_Front: npm test (node --test: contracts, payloads, suite.json, upload
#    columns, live bus round trips when a broker answers), tsc -b, oxlint.
# 2. The Rust crates: wasm_extractor and wasm_analyzer (incl. every shipped .PEAK
#    against the analyzer's published schema), graphics_suite_rs and its worker.
# 3. php -l on the corpus API (local php, else the php:8.3-cli-alpine image).
set -euo pipefail
cd "$(dirname "$0")/.."     # the stack root (this file is Docker/check.sh: no loose files at the root)
( cd Web_Front && npm test && npx tsc -b && npx oxlint src )
for crate in Web_Front/wasm_extractor Web_Front/wasm_analyzer graphics_suite_rs graphics_suite_rs/SRC; do
  # From inside the crate: cargo reads config (the local [patch] in
  # Web_Front/.cargo/config.toml) from the cwd up, not from the manifest.
  echo "== cargo test $crate"; ( cd "$crate" && cargo test --quiet )
done
API=Web_Front/public/api
if command -v php >/dev/null; then
  for f in "$API"/*.php; do php -l "$f"; done
elif command -v docker >/dev/null; then
  docker run --rm -v "$PWD/$API":/a:ro php:8.3-cli-alpine sh -c 'for f in /a/*.php; do php -l "$f" || exit 1; done'
else
  echo "check.sh: php -l SKIPPED (no php, no docker)" >&2
fi
echo "check.sh: all green"

# Worker-GRAPHICS_SUITE — Scanalyzer's OCR and raster→SVG tracer as a worker on the bus (LOOSE-workers-convert-rest).
#   docker compose -f 'PODS/POD.workers/Docker/docker-compose.yml' up -d --build graphics-suite
#   docker build -f 'PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/Docker/Dockerfile' -t worker-graphics-suite:local .
#
# ⚠️ THE BUILD CONTEXT IS THE REPO ROOT (`context: ../../../../../../..` in the
#    compose file beside this one) — BY DESIGN, the rule every image that links
#    the SDK follows (.apk.scripts/plugin_standalone.py; DATABUS.Broker.MQTT's
#    Dockerfile): the crate names apk-plugin-runner and apkaudio-contracts by
#    tag `sdk-v0.5`, so a clone of this repository builds on its own; THE IMAGE
#    builds the checkout's runner and contracts instead, patched in with
#    `--config`, so it never fetches GitHub and ships what the bench runs.
#    Every COPY source below is a REAL repo-root path (PODS/README.md rule 1). Same recipe
#    as PROCESSOR.SampleConversion's worker, without ffmpeg: the image is
#    decoded in memory by the library itself. OCR is Tesseract's
#    (LOOSE-ocr-not-recognition): the runtime installs its CLI and English
#    data, and the library pipes each image through it on stdin/stdout.

# ---------- build ----------
FROM rust:1.94-bookworm AS build
WORKDIR /src
ENV CARGO_TARGET_DIR=/src/target
COPY rust-toolchain.toml ./

# THE DESTINATION MIRRORS THE CHECKOUT. NODE.BareMetal/SRC/contracts is a
# SYMLINK to <repo>/contracts in a checkout; the real directories land there.
COPY ["contracts/rust",   "./PODS/POD.THICK/NODE.BareMetal/SRC/contracts/rust"]
COPY ["contracts/tokens", "./PODS/POD.THICK/NODE.BareMetal/SRC/contracts/tokens"]
COPY ["PODS/POD.THICK/DISCOVERY.Engine/SRC/Cargo.toml", "./PODS/POD.THICK/DISCOVERY.Engine/SRC/Cargo.toml"]
COPY ["PODS/POD.THICK/DISCOVERY.Engine/SRC/RUNNER",     "./PODS/POD.THICK/DISCOVERY.Engine/SRC/RUNNER"]
# The tool: the graphics-suite crate (its library is the OCR and the tracer)
# and the worker crate in its SRC/. Not the rest of Scanalyzer.
ARG TOOL=PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs
COPY ["PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/Cargo.toml", "./PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/Cargo.toml"]
COPY ["PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/lib",        "./PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/lib"]
COPY ["PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/SRC",        "./PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/SRC"]

ARG SDK=https://github.com/LikeDotAudio/APK.plugin.SDK
RUN set -e; \
    P1="patch.\"$SDK\".apk-plugin-runner.path=\"PODS/POD.THICK/DISCOVERY.Engine/SRC/RUNNER\""; \
    P2="patch.\"$SDK\".apkaudio-contracts.path=\"PODS/POD.THICK/NODE.BareMetal/SRC/contracts/rust\""; \
    cargo build --release --locked --config "$P1" --config "$P2" \
        --manifest-path "$TOOL/SRC/Cargo.toml" --bin apk-worker-graphics-suite; \
    cargo build --release --locked --config "$P1" --config "$P2" \
        --manifest-path "$TOOL/SRC/Cargo.toml" -p apk-plugin-runner --bin apk-plugin-health; \
    mkdir -p /out \
 && cp target/release/apk-worker-graphics-suite target/release/apk-plugin-health /out/

# ---------- runtime ----------
FROM debian:bookworm-slim
# Tesseract and its English model: the OCR op shells out to `tesseract stdin
# stdout tsv makebox` (graphics_suite_rs/lib/ocr.rs). Its `configs/tsv` and
# `configs/makebox` ship in tesseract-ocr. The self test reads a rendered line
# back, so an image without them fails `an_ocr_job_reads_the_probe`.
# OMP_THREAD_LIMIT=1: one job at a time already; OpenMP threads only contend.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*
ENV OMP_THREAD_LIMIT=1
# Not root: the worker opens no port and touches no device.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin worker
COPY --from=build /out/ /usr/local/bin/
USER worker
ENTRYPOINT ["apk-worker-graphics-suite"]

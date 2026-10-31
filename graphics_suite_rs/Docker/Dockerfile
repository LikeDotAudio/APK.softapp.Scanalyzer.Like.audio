# Worker-GRAPHICS_SUITE — Scanalyzer's OCR and raster→SVG tracer as a worker on the bus (LOOSE-workers-convert-rest).
#   docker compose -f 'PODS/POD.workers/Docker/docker-compose.yml' up -d --build graphics-suite
#   docker build -f 'PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/Docker/Dockerfile' -t worker-graphics-suite:local .
#
# ⚠️ THE BUILD CONTEXT IS THE REPO ROOT (`context: ../../../../../../..` in the
#    compose file beside this one), because the worker links apkaudio-contracts
#    and apk-plugin-runner, which live outside this repository. Every COPY
#    source below is a REAL repo-root path (PODS/README.md rule 1). Same recipe
#    as PROCESSOR.SampleConversion's worker, without ffmpeg: the image is
#    decoded and read in memory by the library itself.

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
COPY ["PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/src",        "./PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/src"]
COPY ["PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/SRC",        "./PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/graphics_suite_rs/SRC"]

RUN cargo build --release --locked --manifest-path "$TOOL/SRC/Cargo.toml" --bins \
 && mkdir -p /out \
 && cp target/release/apk-worker-graphics-suite target/release/apk-plugin-health /out/

# ---------- runtime ----------
FROM debian:bookworm-slim
# Nothing to install: the library decodes every format itself. Not root: the
# worker opens no port and touches no device.
RUN useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin worker
COPY --from=build /out/ /usr/local/bin/
USER worker
ENTRYPOINT ["apk-worker-graphics-suite"]

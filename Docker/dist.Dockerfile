# Scanalyzer Web_Front's built page — the dist/ the OS's Scanalyzer windows and the
# VISUALIZER.* pointers open (Web_Front/dist/index.html?solo=1#/<tab>). dist/ is
# gitignored, so whoever serves it builds it with THIS recipe, owned here (the
# W09 dist contract, 2026-10-30): the LAST stage is `FROM scratch AS dist` holding
# the built tree at `/`.
#
#   docker build -f SCANALYZER_SUITE/SCANALYZER.Like.audio/Docker/dist.Dockerfile \
#       --output type=local,dest=/tmp/scan-dist PODS/POD.THIN/Softapps     # from the repo root
#   WEB.Frontend-Assets: COPY --from=scanalyzer-dist / …/Web_Front/dist
#
# ⚠️ THE BUILD CONTEXT IS PODS/POD.THIN/Softapps, by the same house rule as the
#    plugin and worker images: the wasm crates name PROCESSOR.SampleAnalyzer and
#    CAPTURE.Extractor-Engine by git rev (a clone builds alone, fetching them);
#    this image builds the CHECKOUT's copies instead, patched in through the same
#    Web_Front/.cargo/config.toml a checkout uses, so it never fetches GitHub and
#    ships the analyzer the bench runs. The analyzer's build.rs reads
#    DATATYPE.soundfx.UCS from beside it (see PROCESSOR.SampleAnalyzer's README).

FROM rust:1-slim AS wasm
ARG WASM_PACK_VERSION=0.13.1
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && rustup target add wasm32-unknown-unknown \
 && arch="$(uname -m)" \
 && curl -sSfL "https://github.com/rustwasm/wasm-pack/releases/download/v${WASM_PACK_VERSION}/wasm-pack-v${WASM_PACK_VERSION}-${arch}-unknown-linux-musl.tar.gz" \
    | tar -xz -C /tmp \
 && mv "/tmp/wasm-pack-v${WASM_PACK_VERSION}-${arch}-unknown-linux-musl/wasm-pack" /usr/local/bin/
WORKDIR /src
# The siblings, at their checkout paths relative to Web_Front.
COPY ["DATATYPE/DATATYPE.soundfx.UCS/categories", "DATATYPE/DATATYPE.soundfx.UCS/categories"]
COPY ["DATATYPE/DATATYPE.soundfx.UCS/producer_synonyms.json", "DATATYPE/DATATYPE.soundfx.UCS/"]
COPY ["CAPTURE/CAPTURE.Extractor-Engine/Cargo.toml", "CAPTURE/CAPTURE.Extractor-Engine/Cargo.lock", "CAPTURE/CAPTURE.Extractor-Engine/build.rs", "CAPTURE/CAPTURE.Extractor-Engine/"]
COPY ["CAPTURE/CAPTURE.Extractor-Engine/src", "CAPTURE/CAPTURE.Extractor-Engine/src"]
COPY ["PROCESSOR/PROCESSOR.SampleAnalyzer/SRC/core", "PROCESSOR/PROCESSOR.SampleAnalyzer/SRC/core"]
WORKDIR /src/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front
COPY ["SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/wasm_analyzer/Cargo.toml", "SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/wasm_analyzer/Cargo.lock", "wasm_analyzer/"]
COPY ["SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/wasm_analyzer/src", "wasm_analyzer/src"]
COPY ["SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/wasm_extractor/Cargo.toml", "SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/wasm_extractor/Cargo.lock", "wasm_extractor/"]
COPY ["SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/wasm_extractor/src", "wasm_extractor/src"]
# The checkout's local patch file, written here (it is never committed).
RUN mkdir -p .cargo && printf '%s\n' \
      '[patch."https://github.com/LikeDotAudio/APK.softapp.CAPTURE.Extractor-Engine"]' \
      'extractor_engine = { path = "../../../CAPTURE/CAPTURE.Extractor-Engine" }' \
      '[patch."https://github.com/LikeDotAudio/APK.softapp.PROCESSOR.SampleAnalyzer"]' \
      'oa-sample-analyzer = { path = "../../../PROCESSOR/PROCESSOR.SampleAnalyzer/SRC/core" }' \
      > .cargo/config.toml \
 && wasm-pack build wasm_analyzer --target web --release \
 && wasm-pack build wasm_extractor --target web --release \
 && test -s wasm_analyzer/pkg/wasm_analyzer_bg.wasm && test -s wasm_extractor/pkg/wasm_extractor_bg.wasm

FROM node:22-alpine AS build
WORKDIR /src
COPY ["SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/package.json", "SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/package-lock.json", "./"]
COPY --from=wasm ["/src/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/wasm_analyzer/pkg", "wasm_analyzer/pkg"]
COPY --from=wasm ["/src/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/wasm_extractor/pkg", "wasm_extractor/pkg"]
RUN npm ci --no-audit --no-fund
COPY ["SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/index.html", "SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/manifest.webmanifest", "SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/vite.config.ts", "SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/tsconfig.json", "SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/tsconfig.app.json", "SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/tsconfig.node.json", "./"]
COPY ["SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/public", "public"]
COPY ["SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/src", "src"]
# No tsc gate here, as the root ci.yml decided: a type error is not a reason to
# ship ten 404ing windows (check.sh runs tsc -b before a push). The relative
# base comes from vite.config.ts.
RUN npx vite build \
 && test -s dist/index.html && grep -q 'src="./assets/' dist/index.html

FROM scratch AS dist
COPY --from=build /src/dist/ /

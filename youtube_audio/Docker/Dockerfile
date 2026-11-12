# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
#
# Worker-YOUTUBE_AUDIO — a song from a YouTube link, for the Song Analyzer.
#   docker compose -f 'PODS/POD.workers/Docker/docker-compose.yml' up -d --build youtube-audio
#
# THE BUILD CONTEXT IS youtube_audio/ (`context: ..` in the compose file beside
#    this one), as AUDIO.VoiceSynth's worker; .dockerignore trims it to worker/.
#
# yt-dlp IS NOT PINNED, ON PURPOSE: YouTube changes what its pages serve and an
#    old yt-dlp stops working within weeks. Every rebuild takes the newest one,
#    so "every link fails" is fixed by rebuilding this image. yt-dlp[default]
#    brings yt-dlp-ejs; deno is the JavaScript runtime it solves YouTube's player
#    challenges with. No ffmpeg: the audio is never re-encoded.

FROM debian:bookworm-slim AS sdk
ARG SDK=https://github.com/LikeDotAudio/APK.plugin.SDK
ARG SDK_TAG=sdk-v2.4
ARG SDK_COMMIT=24496d9ecfd4376c404b71ceb6e05bee8ad805b0
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git clone --quiet --depth 1 --branch "$SDK_TAG" "$SDK" /sdk \
 && test "$(git -C /sdk rev-parse HEAD)" = "$SDK_COMMIT" \
 && mkdir -p /out \
 && cp /sdk/runner/python/apk_plugin_runner.py /sdk/runner/python/apk_plugin_api.py \
       /sdk/runner/python/apk_plugin_panels.py /sdk/runner/python/apk_plugin_health.py /out/ \
 && cp -r /sdk/contracts/python/apkaudio_contracts /out/apkaudio_contracts \
 && rm -rf /out/apkaudio_contracts/__pycache__

FROM python:3.12-slim-bookworm
RUN pip install --no-cache-dir --disable-pip-version-check --upgrade \
        "yt-dlp[default]" deno paho-mqtt==2.1.0 \
 && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin worker
COPY --from=sdk /out/apk_plugin_runner.py /out/apk_plugin_api.py /out/apk_plugin_panels.py /opt/apk/runner/
COPY --from=sdk /out/apkaudio_contracts /opt/apk/runner/apkaudio_contracts
COPY --from=sdk /out/apk_plugin_health.py /usr/local/bin/apk-plugin-health
RUN chmod 755 /usr/local/bin/apk-plugin-health
COPY ["worker/apk_worker_youtube_audio.py", "worker/youtube_job.py", \
      "worker/config.ini", "worker/agent.toml", "/opt/apk/youtube_audio/worker/"]
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/opt/apk/runner \
    HOME=/tmp \
    DENO_DIR=/tmp/deno \
    XDG_CACHE_HOME=/tmp/cache
USER worker
WORKDIR /tmp
ENTRYPOINT ["python3", "/opt/apk/youtube_audio/worker/apk_worker_youtube_audio.py"]

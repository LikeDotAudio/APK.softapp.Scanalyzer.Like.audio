#!/usr/bin/env python3
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""Worker-YOUTUBE_AUDIO — a song from a YouTube link, for the Song Analyzer.

    page   ── APK.audio/System/Protocols/youtube_audio/outgoing/job ──▶ worker
    worker ── APK.audio/System/Protocols/youtube_audio/incoming/result ─▶ page
    worker ── PUT http://Storage-Portal/api/files/youtube_audio/<job_id>.<ext>

ON THE PYTHON RUNNER (`apk_plugin_runner`, DISCOVERY.Engine/SRC/RUNNER/python),
as CAPTURE.crawler's worker: the runner publishes the config, the last will, the
self-test door and the retained `incoming/api`; this file adds the job loop,
shaped as `apk_plugin_runner::jobs::JobWorker`:

  · neither leaf retains: a retained job runs again on every reconnect;
  · subscribe on EVERY connect — a clean session forgets it;
  · the job runs on a lane thread, never on the network thread, so keep-alive
    pings go out while a long song downloads; JOB_QUEUE jobs may wait, the next
    is answered `busy` at once under its own job_id;
  · the agent ticks while both threads live; a dead one makes the agent RETURN
    and the runner exits the process so Docker restarts it.

Copied from Worker-VOICE_SYNTH's loop (AUDIO.VoiceSynth), the same shape. The
tool itself is `youtube_job.handle_job`, with no bus in it.
"""

from __future__ import annotations

import functools
import json
import os
import queue
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_INI = os.path.join(HERE, "config.ini")
PLUGIN_CRATE = "apk-worker-youtube-audio"
PLUGIN_VERSION = "1.0.0"
JOB_QUEUE = 4


def _load_runner():
    """On PYTHONPATH in the image; APK_PLUGIN_RUNNER_PATH or the monorepo's
    DISCOVERY.Engine/SRC/RUNNER/python on a bench."""
    for path in (os.environ.get("APK_PLUGIN_RUNNER_PATH"),
                 os.path.join(HERE, *[".."] * 6, "POD.THICK", "DISCOVERY.Engine", "SRC", "RUNNER", "python")):
        if path and os.path.isdir(path) and path not in sys.path:
            sys.path.insert(0, path)
    try:
        import apk_plugin_runner
    except ImportError as error:
        _cannot_start(error)
    return apk_plugin_runner


def _cannot_start(error: ImportError):
    """The runner (or its paho-mqtt) is not importable: a plain problem and exit 1, not a traceback."""
    name = (error.name or "apk_plugin_runner").split(".")[0]
    if name == "apk_plugin_runner":
        detail = "the Python plugin runner (apk_plugin_runner) is not importable"
        fix = ["Set APK_PLUGIN_RUNNER_PATH to DISCOVERY.Engine/SRC/RUNNER/python, or run the worker "
               "from the APK.audio checkout or its Docker image."]
    else:
        detail = "the Python module '%s' is not installed" % name
        fix = ["pip install %s" % {"paho": "paho-mqtt", "yt_dlp": "yt-dlp[default]"}.get(name, name)]
    try:
        try:
            from apkaudio_contracts.problems import problem, problem_text
        except ImportError:
            checkout = next((os.path.join(q, "contracts", "python") for q in _parents(HERE)
                             if os.path.isdir(os.path.join(q, "contracts", "python", "apkaudio_contracts"))), None)
            if checkout is None:
                raise
            sys.path.append(checkout)
            from apkaudio_contracts.problems import problem, problem_text
        text = problem_text(problem("config_invalid", detail=detail, subject=name, fix=fix))
    except ImportError:
        text = "%s [config_invalid]\n  Fix: %s" % (detail, fix[0])
    print(text, file=sys.stderr)
    raise SystemExit(1)


def _parents(path):
    while True:
        parent = os.path.dirname(path)
        if parent == path:
            return
        yield parent
        path = parent


runner = _load_runner()
sys.path.insert(0, HERE)
import youtube_job  # noqa: E402

MODULE = youtube_job.MODULE


def job_topic() -> str:
    return runner.module_outgoing(MODULE, "job")


def result_topic() -> str:
    return runner.module_incoming(MODULE, "result")


def busy(payload: bytes) -> dict:
    """The runner's busy answer (`jobs::busy`): no schema, no result."""
    return {"job_id": youtube_job.job_id_of(payload), "tool": youtube_job.TOOL, "ok": False, "result": None,
            "error": "the worker is busy (%d jobs already wait); send the job again later" % JOB_QUEUE,
            "elapsed_ms": 0, "problem": "device_busy"}


class JobLane:
    """One thread that runs jobs in turn, fed without ever blocking the feeder."""

    def __init__(self, run, answer):
        self.jobs: "queue.Queue[bytes]" = queue.Queue(maxsize=JOB_QUEUE)
        self.thread = threading.Thread(target=self._loop, args=(run, answer), name="%s-job" % MODULE, daemon=True)
        self.thread.start()

    def _loop(self, run, answer):
        while True:
            answer(run(self.jobs.get()))

    def offer(self, payload: bytes):
        """None when queued, else the busy answer to send now."""
        try:
            self.jobs.put_nowait(payload)
            return None
        except queue.Full:
            return busy(payload)


def make_worker(config) -> "youtube_job.Worker":
    return youtube_job.Worker(youtube_job.settings(config))


def run_job_agent(host: str, port: int) -> None:
    """The job loop. Blocking; returns only when a thread it needs is gone."""
    worker = make_worker(runner.config())
    client = runner.agent_client(MODULE, "job")

    def answer(doc):
        print("🧰 [%s] job %s → ok=%s (%s ms) %s" % (MODULE, json.dumps(doc.get("job_id")), doc.get("ok"),
                                                   doc.get("elapsed_ms"), doc.get("error") or ""))
        _counted(client.publish(result_topic(), json.dumps(doc), qos=1, retain=False))

    lane = JobLane(functools.partial(_guarded_job, worker=worker), answer)

    def on_connect(c, userdata, flags, rc, *rest):
        if runner.connect_failed(rc):
            print("⚠️  [%s] broker refused the job session (rc=%s)" % (MODULE, rc), file=sys.stderr)
            return
        c.subscribe(job_topic(), qos=1)

    def on_message(c, userdata, message):
        if message.topic != job_topic():
            return
        refused = lane.offer(bytes(message.payload or b""))
        if refused is not None:
            _counted(c.publish(result_topic(), json.dumps(refused), qos=1, retain=False))

    client.on_connect = on_connect
    client.on_message = on_message
    client.connect_async(host, port, keepalive=30)
    net = threading.Thread(target=lambda: client.loop_forever(retry_first_connection=True),
                           name="%s-net" % MODULE, daemon=True)
    net.start()
    print("🧰 [%s] worker listening on %s, answering on %s; fetching from %s"
          % (MODULE, job_topic(), result_topic(), ", ".join(worker.limits["allowed_hosts"])))
    while lane.thread.is_alive() and net.is_alive():
        runner.tick()
        time.sleep(1.0)
    print("⚠️  [%s] the %s thread is gone; exiting" % (MODULE, "job" if not lane.thread.is_alive() else "network"),
          file=sys.stderr)


def _counted(info) -> None:
    """A result publish, COUNTED in the loopback telemetry: paho answers a
    refused publish with a non-zero `rc`, not an exception."""
    runner.published(getattr(info, "rc", 0) == 0)


def _guarded_job(payload: bytes, worker) -> dict:
    """handle_job never raises on input; anything else is still an answer, not a dead lane.
    One job taken off outgoing/job and run is this worker's packet."""
    runner.packet_received()
    try:
        return youtube_job.handle_job(payload, worker)
    except Exception as error:                          # noqa: BLE001
        return youtube_job.failure(youtube_job.job_id_of(payload), "the worker raised: %r" % error,
                                 time.monotonic(), youtube_job.P_FAILED)


# ------------------------------------------------------------- self test

def self_test(depth_word: str) -> str:
    def run(depth):
        report = runner.Report(MODULE, depth)
        report.record(runner.Check.of(
            "landing_spots_build", "self", "job and result address this module's leaves",
            lambda: _expect(job_topic().endswith("/youtube_audio/outgoing/job")
                            and result_topic().endswith("/youtube_audio/incoming/result"))))
        report.record(runner.Check.of(
            "config_section_still_names_this_module", "self",
            "config.ini declares [youtube_audio] with legal settings",
            lambda: youtube_job.settings(runner.ini_to_json(_read(CONFIG_INI)))))
        report.record(runner.Check.of(
            "yt_dlp_is_importable", "self", "yt-dlp imports (YoutubeDL)",
            _probe_ytdlp))
        return report
    return runner.run_as_json(MODULE, depth_word, run)


def _probe_ytdlp():
    from yt_dlp import YoutubeDL  # noqa: F401


def _read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def _expect(condition, why="not as expected"):
    if not condition:
        raise AssertionError(why)


def main():
    # A WORKER, NOT A PLUGIN, in the `kind` GET /plugins reads; `manifest=` serves
    # GET /status and /telemetry on the loopback port agent.toml declares.
    runner.main(token=MODULE, config_ini=CONFIG_INI, self_test=self_test, run=[run_job_agent],
                plugin_crate=PLUGIN_CRATE, plugin_version=PLUGIN_VERSION, pod="POD.THIN", kind="worker",
                manifest="agent.toml")


if __name__ == "__main__":
    main()

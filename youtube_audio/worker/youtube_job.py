# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""youtube_audio — a song from a link, for the Song Analyzer. The tool, with no bus in it.

    {"job_id": "scanalyzer-…", "op": "fetch", "url": "https://youtu.be/…"}
  → {"job_id": …, "ok": true, "result": {
        "url": "/api/files/youtube_audio/<job_id>.m4a", "title": …, "uploader": …,
        "duration_s": 212.0, "video_id": …, "webpage_url": …, "ext": "m4a",
        "content_type": "audio/mp4", "bytes": 3456789}}

A BROWSER CANNOT DO THIS ITSELF: a YouTube page is not an audio file, and the
streams behind it answer no other origin. So the page posts the link as a job,
this worker asks yt-dlp for the best audio-only stream (no video, no
re-encode — the analyser decodes AAC and Opus as they are), and the audio
MOVES BY URL like every other worker's output: PUT in-network to the
Storage-Portal file store, which the page then GETs on its own origin. Never
on the bus.

The link is checked before anything is fetched: http(s) and one of the hosts
config.ini allows. A long or huge video is refused by yt-dlp's own filters
before its audio is downloaded.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, Optional

MODULE = "youtube_audio"
TOOL = "SCANALYZER.youtube_audio"
SCHEMA = 1
OPS = ("fetch",)

# The problem codes this worker answers with (contracts/problems/problems.json).
P_BAD_INPUT = "bad_input"
P_REFUSED_LINK = "youtube_audio_refused_link"
P_FAILED = "youtube_audio_failed"
P_STORE = "youtube_audio_store_refused"

# The store's segment rule (nginx.conf /api/files/ location), with a length cap.
JOB_ID_FILE = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9._-]{0,100}$")
# What the stream is called on the store, by its container.
CONTENT_TYPES = {"m4a": "audio/mp4", "mp4": "audio/mp4", "webm": "audio/webm", "opus": "audio/ogg",
                 "ogg": "audio/ogg", "mp3": "audio/mpeg", "aac": "audio/aac", "wav": "audio/wav"}

# Used when config.ini does not say; config.ini's [youtube_audio] is the source.
NUMBERS = {
    "max_job_bytes": (int, 16 * 1024),
    "max_url_chars": (int, 2048),
    "max_duration_s": (int, 3600),
    "max_audio_bytes": (int, 120 * 1024 * 1024),
    "fetch_timeout_s": (float, 60.0),
    "put_timeout_s": (float, 120.0),
}
TEXTS = {
    "allowed_hosts": "youtube.com, youtu.be, youtube-nocookie.com",
    "audio_format": "bestaudio[ext=m4a]/bestaudio[acodec=opus]/bestaudio",
    "work_dir": "/tmp",
    "file_store_origin": "http://Storage-Portal",
    "file_store_path": "/api/files/youtube_audio/",
}


class JobError(Exception):
    """A job refused for a reason the caller can act on, with its problem code."""

    def __init__(self, message: str, problem: str = P_BAD_INPUT):
        super().__init__(message)
        self.problem = problem


def settings(config: Dict[str, Dict[str, str]], env: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """[youtube_audio] checked: numbers above zero, a host list, a store path."""
    env = os.environ if env is None else env
    section = config.get(MODULE) or {}
    out: Dict[str, Any] = {}
    for key, (kind, default) in NUMBERS.items():
        raw = section.get(key)
        try:
            value = kind(str(raw).strip()) if raw is not None else default
        except ValueError:
            raise ValueError("config.ini [%s] %s = %r is not a number" % (MODULE, key, raw))
        if value <= 0:
            raise ValueError("config.ini [%s] %s = %r must be above zero" % (MODULE, key, raw))
        out[key] = value
    for key, default in TEXTS.items():
        out[key] = str(section.get(key, default)).strip()
    out["allowed_hosts"] = [h.strip().lower().lstrip(".") for h in out["allowed_hosts"].split(",") if h.strip()]
    if not out["allowed_hosts"]:
        raise ValueError("config.ini [%s] allowed_hosts names no host" % MODULE)
    if env.get("APK_YOUTUBE_AUDIO_WORK_DIR"):
        out["work_dir"] = env["APK_YOUTUBE_AUDIO_WORK_DIR"]
    if not out["file_store_path"].startswith("/") or not out["file_store_path"].endswith("/"):
        raise ValueError("config.ini [%s] file_store_path = %r must start and end with /" % (MODULE, out["file_store_path"]))
    out["file_store_origin"] = out["file_store_origin"].rstrip("/")
    return out


def job_id_of(payload: bytes) -> Any:
    """The `job_id` a job carries, or None — what every answer is filed under."""
    try:
        job = json.loads(payload)
    except Exception:                                   # noqa: BLE001
        return None
    if isinstance(job, dict):
        job_id = job.get("job_id")
        if isinstance(job_id, str) and job_id:
            return job_id
    return None


def failure(job_id: Any, error: str, started: float, problem: str = P_BAD_INPUT) -> Dict[str, Any]:
    """The runner's failure document (`apk_plugin_runner::jobs::failure`) plus `schema`, `problem`."""
    return {"job_id": job_id, "tool": TOOL, "ok": False, "result": None, "error": error,
            "elapsed_ms": int((time.monotonic() - started) * 1000), "schema": SCHEMA, "problem": problem}


def success(job_id: str, result: Dict[str, Any], started: float) -> Dict[str, Any]:
    return {"schema": SCHEMA, "job_id": job_id, "tool": TOOL, "ok": True, "result": result,
            "error": None, "elapsed_ms": int((time.monotonic() - started) * 1000)}


def checked_link(raw: Any, limits: Dict[str, Any]) -> str:
    """The link, or JobError: http(s), not too long, on an allowed host (or a subdomain of one)."""
    if not isinstance(raw, str) or not raw.strip():
        raise JobError("the job has no url", P_REFUSED_LINK)
    url = raw.strip()
    if len(url) > limits["max_url_chars"]:
        raise JobError("the url is longer than %d characters" % limits["max_url_chars"], P_REFUSED_LINK)
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise JobError("%r is not an http(s) link" % url[:120], P_REFUSED_LINK)
    host = (parts.hostname or "").lower().rstrip(".")
    if not any(host == h or host.endswith("." + h) for h in limits["allowed_hosts"]):
        raise JobError("%s is not a host this worker fetches from (config.ini allowed_hosts: %s)"
                       % (host or "no host", ", ".join(limits["allowed_hosts"])), P_REFUSED_LINK)
    return url


# ------------------------------------------------------------------ the store

class Store:
    """PUT <origin><path><name> — the file store on Storage-Portal, nothing else."""

    def __init__(self, origin: str, path: str, timeout_s: float, opener: Optional[Callable] = None):
        self.origin = origin.rstrip("/")
        self.path = path
        self.timeout_s = timeout_s
        self._open = opener or urllib.request.urlopen

    def url_path(self, name: str) -> str:
        return self.path + name

    def put(self, name: str, data: bytes, content_type: str) -> None:
        url = self.origin + self.url_path(name)
        request = urllib.request.Request(url, data=data, method="PUT",
                                         headers={"Content-Type": content_type, "Content-Length": str(len(data))})
        try:
            with self._open(request, timeout=self.timeout_s) as response:
                status = getattr(response, "status", 201)
        except urllib.error.HTTPError as error:
            raise JobError(_store_refusal(url, error.code), P_STORE)
        except (urllib.error.URLError, OSError) as error:
            reason = getattr(error, "reason", error)
            raise JobError("PUT %s: the file store is unreachable (%s)" % (url, reason), P_STORE)
        if status not in (200, 201, 204):
            raise JobError(_store_refusal(url, status), P_STORE)


def _store_refusal(url: str, status: int) -> str:
    why = {
        404: "the store has no youtube_audio prefix yet (Storage-Portal nginx.conf, the /api/files/ allow-list)",
        409: "a file of that name is already there — the job_id was used before; send a new one",
        401: "the store did not take this worker as in-network",
        403: "the store refused the write",
        413: "the audio is over the store's size cap",
        405: "the store does not take PUT there",
    }.get(status, "the store answered %d" % status)
    return "PUT %s: HTTP %d — %s" % (url, status, why)


# ------------------------------------------------------------------ yt-dlp

def ytdlp_fetch(url: str, folder: str, limits: Dict[str, Any]) -> Dict[str, Any]:
    """Download the best audio-only stream of `url` into `folder`; its info dict with `_path`.

    Duration and size are refused by yt-dlp's own filters before the audio
    comes down; a playlist link fetches its one video only."""
    import yt_dlp                                       # in the image; imported here so tests need none
    from yt_dlp.utils import DownloadError, match_filter_func

    longest = limits["max_duration_s"]
    options = {
        "format": limits["audio_format"],
        "outtmpl": os.path.join(folder, "audio.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "socket_timeout": limits["fetch_timeout_s"],
        "max_filesize": limits["max_audio_bytes"],
        "match_filter": match_filter_func("!is_live & duration <=? %d" % longest),
        "fixup": "never",                               # no ffmpeg in the image, and none needed to decode
        "cachedir": False,
        "restrictfilenames": True,
    }
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=True)
    except DownloadError as error:
        raise JobError(_plain(str(error)), P_FAILED)
    if not info:
        raise JobError("yt-dlp found nothing at that link", P_FAILED)
    if info.get("_type") == "playlist":
        entries = [e for e in (info.get("entries") or []) if e]
        if not entries:
            raise JobError("the link is a playlist with nothing fetchable in it", P_FAILED)
        info = entries[0]
    if info.get("duration") and info["duration"] > longest:
        raise JobError("the video is %d s long — over max_duration_s (%d s)" % (info["duration"], longest), P_FAILED)
    files = [os.path.join(folder, n) for n in os.listdir(folder) if n.startswith("audio.") and not n.endswith(".part")]
    if not files:
        raise JobError("yt-dlp downloaded no audio (filtered out: live, longer than %d s, or over %d bytes)"
                       % (longest, limits["max_audio_bytes"]), P_FAILED)
    info["_path"] = files[0]
    return info


def _plain(text: str) -> str:
    """yt-dlp's message without its colour codes and the 'ERROR: ' prefix."""
    text = re.sub(r"\x1b\[[0-9;]*m", "", text)
    return re.sub(r"^ERROR:\s*", "", text).strip()[:500] or "yt-dlp failed"


# ------------------------------------------------------------------ the job

class Worker:
    """What a job needs: the checked limits, the store, and how audio is fetched (swappable in tests)."""

    def __init__(self, limits: Dict[str, Any], store: Optional[Store] = None,
                 fetch: Optional[Callable[[str, str, Dict[str, Any]], Dict[str, Any]]] = None):
        self.limits = limits
        self.store = store or Store(limits["file_store_origin"], limits["file_store_path"], limits["put_timeout_s"])
        self.fetch = fetch or ytdlp_fetch


def handle_job(payload: bytes, worker: Worker) -> Dict[str, Any]:
    """One job in, one answer out. Never raises on input."""
    started = time.monotonic()
    limits = worker.limits
    if len(payload) > limits["max_job_bytes"]:
        return failure(job_id_of(payload), "the job is %d bytes — over max_job_bytes (%d)"
                       % (len(payload), limits["max_job_bytes"]), started)
    try:
        job = json.loads(payload)
    except Exception:                                   # noqa: BLE001
        return failure(None, "the job is not JSON", started)
    if not isinstance(job, dict):
        return failure(None, "the job is not a JSON object", started)
    job_id = job.get("job_id")
    if not isinstance(job_id, str) or not JOB_ID_FILE.match(job_id):
        return failure(job_id if isinstance(job_id, str) else None,
                       "job_id must be 1–101 characters of A-Z a-z 0-9 . _ - (it names the stored file)", started)
    op = job.get("op", "fetch")
    if op not in OPS:
        return failure(job_id, "op %r is not one of %s" % (op, ", ".join(OPS)), started)
    try:
        url = checked_link(job.get("url"), limits)
        with tempfile.TemporaryDirectory(prefix="yt-", dir=limits["work_dir"]) as folder:
            info = worker.fetch(url, folder, limits)
            path = info["_path"]
            size = os.path.getsize(path)
            if size > limits["max_audio_bytes"]:
                raise JobError("the audio is %d bytes — over max_audio_bytes (%d)" % (size, limits["max_audio_bytes"]), P_FAILED)
            ext = os.path.splitext(path)[1].lstrip(".").lower() or "bin"
            content_type = CONTENT_TYPES.get(ext, "application/octet-stream")
            name = "%s.%s" % (job_id, ext)
            with open(path, "rb") as handle:
                worker.store.put(name, handle.read(), content_type)
    except JobError as error:
        return failure(job_id, str(error), started, error.problem)
    return success(job_id, {
        "url": worker.store.url_path(name),
        "title": info.get("title") or "",
        "uploader": info.get("uploader") or info.get("channel") or "",
        "duration_s": info.get("duration"),
        "video_id": info.get("id") or "",
        "webpage_url": info.get("webpage_url") or url,
        "ext": ext,
        "content_type": content_type,
        "bytes": size,
    }, started)

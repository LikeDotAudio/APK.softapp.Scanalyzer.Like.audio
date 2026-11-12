# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""youtube_job without the bus, without YouTube and without the store."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "worker"))
import youtube_job  # noqa: E402

LIMITS = youtube_job.settings({}, env={})


class FakeStore(youtube_job.Store):
    def __init__(self):
        super().__init__("http://store", "/api/files/youtube_audio/", 1)
        self.put_calls = []

    def put(self, name, data, content_type):
        self.put_calls.append((name, len(data), content_type))


def fake_fetch(url, folder, limits):
    path = os.path.join(folder, "audio.m4a")
    with open(path, "wb") as handle:
        handle.write(b"\0" * 1000)
    return {"_path": path, "title": "A Song", "uploader": "Someone", "duration": 212.0, "id": "abc123"}


def job(**kw):
    return json.dumps(dict({"job_id": "scanalyzer-1", "op": "fetch"}, **kw)).encode()


class Links(unittest.TestCase):
    def test_youtube_hosts_pass(self):
        for url in ("https://www.youtube.com/watch?v=x", "https://youtu.be/x", "https://music.youtube.com/watch?v=x",
                    "https://m.youtube.com/shorts/x", "http://youtube.com/watch?v=x"):
            self.assertEqual(youtube_job.checked_link(url, LIMITS), url)

    def test_others_refused(self):
        for url in ("https://evilyoutube.com/x", "ftp://youtube.com/x", "file:///etc/passwd", "not a link", "",
                    "https://youtube.com.evil.net/x", None):
            with self.assertRaises(youtube_job.JobError) as caught:
                youtube_job.checked_link(url, LIMITS)
            self.assertEqual(caught.exception.problem, youtube_job.P_REFUSED_LINK)


class Jobs(unittest.TestCase):
    def setUp(self):
        self.store = FakeStore()
        self.worker = youtube_job.Worker(dict(LIMITS, work_dir="/tmp"), store=self.store, fetch=fake_fetch)

    def test_fetch_stores_and_answers_url(self):
        doc = youtube_job.handle_job(job(url="https://youtu.be/abc123"), self.worker)
        self.assertTrue(doc["ok"], doc)
        self.assertEqual(doc["job_id"], "scanalyzer-1")
        self.assertEqual(doc["result"]["url"], "/api/files/youtube_audio/scanalyzer-1.m4a")
        self.assertEqual(doc["result"]["title"], "A Song")
        self.assertEqual(doc["result"]["content_type"], "audio/mp4")
        self.assertEqual(self.store.put_calls, [("scanalyzer-1.m4a", 1000, "audio/mp4")])

    def test_bad_link_is_answered_not_raised(self):
        doc = youtube_job.handle_job(job(url="https://example.com/song.mp3"), self.worker)
        self.assertFalse(doc["ok"])
        self.assertEqual(doc["problem"], youtube_job.P_REFUSED_LINK)
        self.assertEqual(self.store.put_calls, [])

    def test_unsafe_job_id_refused(self):
        doc = youtube_job.handle_job(json.dumps({"job_id": "../x", "url": "https://youtu.be/x"}).encode(), self.worker)
        self.assertFalse(doc["ok"])

    def test_not_json(self):
        self.assertFalse(youtube_job.handle_job(b"{nope", self.worker)["ok"])

    def test_fetch_failure_carries_problem(self):
        def broken(url, folder, limits):
            raise youtube_job.JobError("Video unavailable", youtube_job.P_FAILED)
        self.worker.fetch = broken
        doc = youtube_job.handle_job(job(url="https://youtu.be/x"), self.worker)
        self.assertEqual((doc["ok"], doc["problem"], doc["error"]), (False, youtube_job.P_FAILED, "Video unavailable"))


class Config(unittest.TestCase):
    def test_shipped_config_is_legal(self):
        import configparser
        ini = configparser.ConfigParser()
        ini.read(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "worker", "config.ini"))
        limits = youtube_job.settings({"youtube_audio": dict(ini["youtube_audio"])}, env={})
        self.assertIn("youtu.be", limits["allowed_hosts"])
        self.assertLessEqual(limits["max_audio_bytes"], 128 * 1024 * 1024)


if __name__ == "__main__":
    unittest.main()

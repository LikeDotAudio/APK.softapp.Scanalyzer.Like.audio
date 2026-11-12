# Smoke test — SCANALYZER.Like.audio

Is `SCANALYZER.Like.audio` deployed? Written by `.apk.scripts/smoke.py` from the module's own shape; what each check means is in that script's header.

← [Wiki home](../README.md)

**❌ FAIL** — 13/15 checks, since 2026-11-12 00:16 EST

| Check | Target | Result | Detail |
|---|---|---|---|
| pushed | [APK.softapp.Scanalyzer.Like.audio](https://github.com/LikeDotAudio/APK.softapp.Scanalyzer.Like.audio.git) | ❌ | 1 commit(s) not pushed |
| container | `Scanalyzer-API` | ✅ | running, healthy |
| web | [Web_Front/desktop.py](https://apk.audio/APK%3ASoftapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/desktop.py) | ❌ | HTTPError: HTTP Error 404: Not Found |
| app | `OS/Capture Extractor` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Capture Extractor Engine` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer 2D` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer 3D` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer 4D` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer Devices` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer Examiner` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer Extractor` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer Favorites` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer Rename` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |
| app | `OS/Scanalyzer Song` → `PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/Web_Front/dist/index.html` | ✅ | present |

Re-run: `python3 .apk.scripts/smoke.py PODS/POD.THIN/Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio`

<!-- smoke:sig a4188fa06f08 since 2026-11-12 00:16 EST -->

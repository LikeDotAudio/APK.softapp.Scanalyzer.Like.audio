# Scanalyzer · 06 · SCANNERS

This folder contains the primary automated scan execution runner module.

The members of this stage are listed in [`../SUITE/suite.json`](../SUITE/suite.json) (stage `06_SCANNERS`), each by its portal path and repository. Until 2026-10-30 this folder held a symlink into each sibling repository; those dangled in any standalone clone and broke silently when a sibling moved, so the list is data now (audit 2026-10-30). Where each one lives:

`SCANNER.Scanalyze` → `APK:Softapps/SCANALYZER_SUITE/SCANALYZER.Like.audio/SCANNER.Scanalyze` (nested submodule)

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`SCANNER.Scanalyze`** | `LikeDotAudio/APK.softapp.SCANNER.Scanalyze` | Main scanalyze runner triggering directory walks, extracting metadata, and writing `.PEAK` sidecars. |

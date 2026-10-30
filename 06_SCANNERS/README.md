# Scanalyzer · 06 · SCANNERS

This folder contains the primary automated scan execution runner module.

Each module here is a **symlink** into its real home in the Softapps tree (repointed 2026-10-30 after the family reorg; the old flat `../../<name>` targets no longer exist):

`SCANNER.Scanalyze` → `SCANALYZER.Like.audio/SCANNER.Scanalyze`

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`SCANNER.Scanalyze`** | `LikeDotAudio/APK.softapp.SCANNER.Scanalyze` | Main scanalyze runner triggering directory walks, extracting metadata, and writing `.PEAK` sidecars. |

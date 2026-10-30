# Scanalyzer · 05 · PROCESSORS

This folder contains signal synthesis, array buffer processing, and tone generation modules.

Each module here is a **symlink** into its real home in the Softapps tree (repointed 2026-10-30 after the family reorg; the old flat `../../<name>` targets no longer exist):

`PROCESSOR.Arrays-In-Data-Out` → `Softapps/PROCESSOR/PROCESSOR.Arrays-In-Data-Out`  
`PROCESSOR.DroneKiln` → `Softapps/PROCESSOR/PROCESSOR.DroneKiln`

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`PROCESSOR.Arrays-In-Data-Out`** | `LikeDotAudio/APK.softapp.SCANALIZER.Arrays-In-Data-Out` | Array buffer processor ingesting raw PCM audio arrays and outputting structured JSON metadata matrices. |
| **`PROCESSOR.DroneKiln`** | `LikeDotAudio/APK.softapp.SCANALIZER.DroneKiln` | Continuous harmonic drone generator and audio signal synthesis processor. |

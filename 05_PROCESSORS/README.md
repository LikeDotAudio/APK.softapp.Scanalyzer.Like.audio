# Scanalyzer · 05 · PROCESSORS

This folder contains signal synthesis, array buffer processing, and tone generation modules.

The members of this stage are listed in [`../SUITE/suite.json`](../SUITE/suite.json) (stage `05_PROCESSORS`), each by its portal path and repository. Until 2026-10-30 this folder held a symlink into each sibling repository; those dangled in any standalone clone and broke silently when a sibling moved, so the list is data now (audit 2026-10-30). Where each one lives:

`PROCESSOR.Arrays-In-Data-Out` → `APK:Softapps/PROCESSOR/PROCESSOR.Arrays-In-Data-Out`  
`PROCESSOR.DroneKiln` → `APK:Softapps/PROCESSOR/PROCESSOR.DroneKiln`

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`PROCESSOR.Arrays-In-Data-Out`** | `LikeDotAudio/APK.softapp.PROCESSOR.Arrays-In-Data-Out` | Array buffer processor ingesting raw PCM audio arrays and outputting structured JSON metadata matrices. |
| **`PROCESSOR.DroneKiln`** | `LikeDotAudio/APK.softapp.PROCESSOR.DroneKiln` | Continuous harmonic drone generator and audio signal synthesis processor. |

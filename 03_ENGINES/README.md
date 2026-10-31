# Scanalyzer · 03 · ENGINES

This folder contains the core DSP and calculation engines of the **Scanalyzer** system.

The members of this stage are listed in [`../suite.json`](../suite.json) (stage `03_ENGINES`), each by its portal path and repository. Until 2026-10-30 this folder held a symlink into each sibling repository; those dangled in any standalone clone and broke silently when a sibling moved, so the list is data now (audit 2026-10-30). Where each one lives:

`ENGINE.Graphing` → `APK:Softapps/VISUALIZER/VISUALIZER.Graphing`  
`ENGINE.SampleAnalyzer` → `APK:Softapps/PROCESSOR/PROCESSOR.SampleAnalyzer`  
`ENGINE.SampleConversion` → `APK:Softapps/PROCESSOR/PROCESSOR.SampleConversion`

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`ENGINE.Graphing`** | `LikeDotAudio/APK.softapp.VISUALIZER.Graphing` | Real-time 2D and 3D plotting calculation engine powering visualizers. |
| **`ENGINE.SampleAnalyzer`** | `LikeDotAudio/APK.softapp.PROCESSOR.SampleAnalyzer` | Audio signal analysis core computing RMS, peak power, pitch class, and spectral descriptors. |
| **`ENGINE.SampleConversion`** | `LikeDotAudio/APK.softapp.PROCESSOR.SampleConversion` | High-fidelity sample rate, bit depth, channel format, and encoding conversion engine. |

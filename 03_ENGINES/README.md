# Scanalyzer · 03 · ENGINES

This folder contains the core DSP and calculation engines of the **Scanalyzer** system.

Each module here is a **symlink** into its real home in the Softapps tree (repointed 2026-10-30 after the family reorg; the old flat `../../<name>` targets no longer exist):

`ENGINE.Graphing` → `Softapps/VISUALIZER/VISUALIZER.Graphing`  
`ENGINE.SampleAnalyzer` → `Softapps/PROCESSOR/PROCESSOR.SampleAnalyzer`  
`ENGINE.SampleConversion` → `Softapps/PROCESSOR/PROCESSOR.SampleConversion`

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`ENGINE.Graphing`** | `LikeDotAudio/APK.softapp.SCANALIZER.Graphing-Engine` | Real-time 2D and 3D plotting calculation engine powering visualizers. |
| **`ENGINE.SampleAnalyzer`** | `LikeDotAudio/APK.softapp.SCANALIZER.SampleAnalyzer-Engine` | Audio signal analysis core computing RMS, peak power, pitch class, and spectral descriptors. |
| **`ENGINE.SampleConversion`** | `LikeDotAudio/APK.softapp.SCANALIZER.SampleConversion-Engine` | High-fidelity sample rate, bit depth, channel format, and encoding conversion engine. |

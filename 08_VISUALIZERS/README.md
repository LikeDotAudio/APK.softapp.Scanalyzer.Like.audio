# Scanalyzer · 08 · VISUALIZERS

This folder contains the visualizer display widgets and multi-dimensional graphing components of the **Scanalyzer** system.

The members of this stage are listed in [`../suite.json`](../suite.json) (stage `08_VISUALIZERS`), each by its portal path and repository. Until 2026-10-30 this folder held a symlink into each sibling repository; those dangled in any standalone clone and broke silently when a sibling moved, so the list is data now (audit 2026-10-30). Where each one lives:

`VISUALIZER.2D-Graphs` → `APK:Softapps/VISUALIZER/VISUALIZER.2D-Graphs`  
`VISUALIZER.3D-PointCloud` → `APK:Softapps/VISUALIZER/VISUALIZER.3D-PointCloud`  
`VISUALIZER.4D-FaceBall` → `APK:Softapps/VISUALIZER/VISUALIZER.4D-FaceBall`  
`VISUALIZER.5D-MultiVector` → `APK:Softapps/VISUALIZER/VISUALIZER.5D-MultiVector`  
`VISUALIZER.Examiner` → `APK:Softapps/VISUALIZER/VISUALIZER.Examiner`  
## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`VISUALIZER.2D-Graphs`** | `LikeDotAudio/APK.softapp.VISUALIZER.2D-Graphs` | 2D line plot, spectrum analyzer, and time-series waveform graph renderer. |
| **`VISUALIZER.3D-PointCloud`** | `LikeDotAudio/APK.softapp.VISUALIZER.3D-PointCloud` | 3D WebGL point cloud renderer for multi-dimensional feature space visualization. |
| **`VISUALIZER.4D-FaceBall`** | `LikeDotAudio/APK.softapp.VISUALIZER.4D-FaceBall` | 4D spherical projection and faceball vector visualizer. |
| **`VISUALIZER.5D-MultiVector`** | `LikeDotAudio/APK.softapp.VISUALIZER.5D-MultiVector` | 5D multi-vector tensor and high-dimensional audio descriptor visualizer. |
| **`VISUALIZER.Examiner`** | `LikeDotAudio/APK.softapp.VISUALIZER.Examiner` | Deep item examination widget showing raw binary structure, tags, and sidecar inspection. |

# Scanalyzer · 04 · HARDWARE

This folder contains hardware device integration, mDNS discovery, and media router management modules.

The members of this stage are listed in [`../suite.json`](../suite.json) (stage `04_HARDWARE`), each by its portal path and repository. Until 2026-10-30 this folder held a symlink into each sibling repository; those dangled in any standalone clone and broke silently when a sibling moved, so the list is data now (audit 2026-10-30). Where each one lives:

`HARDWARE.Devices` → `APK:Softapps/HARDWARE_AND_NETWORK/HARDWARE.Devices`

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`HARDWARE.Devices`** | `LikeDotAudio/APK.softapp.HARDWARE.Devices` | Device discovery dashboard managing mDNS probes, IS-04 NMOS nodes, and hardware registries. |

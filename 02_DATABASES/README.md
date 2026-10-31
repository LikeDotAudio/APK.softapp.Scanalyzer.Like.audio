# Scanalyzer · 02 · DATABASES & SCHEMAS

This folder contains the database schema, data routing, taxonomy, and reference corpus modules of the **Scanalyzer** system.

The members of this stage are listed in [`../suite.json`](../suite.json) (stage `02_DATABASES`), each by its portal path and repository. Until 2026-10-30 this folder held a symlink into each sibling repository; those dangled in any standalone clone and broke silently when a sibling moved, so the list is data now (audit 2026-10-30). Where each one lives:

`DATABASE.Electronics-Emoji` → `APK:Softapps/DATABASE/DATABASE.Electronics-Emoji`  
`DATABASE.Favorites` → `APK:Softapps/DATABASE/DATABASE.Favorites`  
`DATABASE.Groups` → `APK:Softapps/DATABASE/DATABASE.Groups`  
`DATABASE.linuxCommands` → `APK:Softapps/DATABASE/DATABASE.linuxCommands`  
`DATABASE.Machinist.Like.audio` → `APK:Softapps/DATABASE/DATABASE.Machinist.Like.audio`  
`DATABASE.Microphones.Like.audio` → `APK:Softapps/DATABASE/DATABASE.Microphones.Like.audio`  
`DATABASE.Schema` → `APK:Softapps/DATABASE/DATABASE.Schema`  
`DATATYPE.soundfx.UCS` → `APK:Softapps/DATATYPE/DATATYPE.soundfx.UCS` (the one UCS tile; DATABASE.UCS-Taxonomy is a pointer to it)

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`DATABASE.Electronics-Emoji`** | `LikeDotAudio/APK.softapp.DATABASE.Electronics-Emoji` | 82 schematic symbol ES modules, 18px and 72px renders, and Unicode proposal database. |
| **`DATABASE.Favorites`** | `LikeDotAudio/APK.softapp.DATABASE.Favorites` | Bookmarking, starring, and favorites collection store for scanned assets. |
| **`DATABASE.Groups`** | `LikeDotAudio/APK.softapp.DATABASE.Groups` | Multi-item grouping, tagging, and category aggregation store. |
| **`DATABASE.Machinist.Like.audio`** | `LikeDotAudio/APK.softapp.DATABASE.Machinist.Like.audio` | Machining feeds, speeds, speeds/feeds calculators, and material reference database. |
| **`DATABASE.Microphones.Like.audio`** | `LikeDotAudio/APK.softapp.DATABASE.Microphones.Like.audio` | 2,067 microphone datasheets, frequency response curves, and polar pattern corpus. |
| **`DATABASE.Schema`** | `LikeDotAudio/APK.softapp.DATABASE.Schema` | MariaDB / MySQL relational database tables and migration scripts for .PEAK data. |
| **`DATABASE.UCS-Taxonomy`** | `LikeDotAudio/APK.softapp.DATABASE.UCS-Taxonomy` | Universal Category System (UCS v8.2) audio taxonomy dictionary and validator. |
| **`DATABASE.linuxCommands`** | `LikeDotAudio/APK.softapp.DATABASE.linuxCommands` | Linux shell command cheatsheet and command reference corpus. |

# Scanalyzer · 02 · DATABASES & SCHEMAS

This folder contains the database schema, data routing, taxonomy, and reference corpus modules of the **Scanalyzer** system.

Each module here is a **symlink** into its real home in the Softapps tree (repointed 2026-10-30 after the family reorg; the old flat `../../<name>` targets no longer exist):

`DATABASE.Data-Channels` → `Softapps/DATABASE/DATABASE.Data-Channels`  
`DATABASE.Electronics-Emoji` → `Softapps/DATABASE/DATABASE.Electronics-Emoji`  
`DATABASE.Favorites` → `Softapps/DATABASE/DATABASE.Favorites`  
`DATABASE.Groups` → `Softapps/DATABASE/DATABASE.Groups`  
`DATABASE.linuxCommands` → `Softapps/DATABASE/DATABASE.linuxCommands`  
`DATABASE.Machinist.Like.audio` → `Softapps/DATABASE/DATABASE.Machinist.Like.audio`  
`DATABASE.Microphones.Like.audio` → `Softapps/DATABASE/DATABASE.Microphones.Like.audio`  
`DATABASE.Schema` → `Softapps/DATABASE/DATABASE.Schema`  
`DATABASE.UCS-Taxonomy` → `Softapps/DATABASE/DATABASE.UCS-Taxonomy`

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`DATABASE.Data-Channels`** | `LikeDotAudio/APK.softapp.SCANALIZER.Data-Channels` | Inter-softapp messaging router and postMessage / MQTT data channel bus. |
| **`DATABASE.Electronics-Emoji`** | `LikeDotAudio/APK.softapp.DATABASE.electronicsEmoji` | 82 schematic symbol ES modules, 18px and 72px renders, and Unicode proposal database. |
| **`DATABASE.Favorites`** | `LikeDotAudio/APK.softapp.SCANALIZER.Favorites` | Bookmarking, starring, and favorites collection store for scanned assets. |
| **`DATABASE.Groups`** | `LikeDotAudio/APK.softapp.SCANALIZER.Groups` | Multi-item grouping, tagging, and category aggregation store. |
| **`DATABASE.Machinist.Like.audio`** | `LikeDotAudio/machinist.like.audio` | Machining feeds, speeds, speeds/feeds calculators, and material reference database. |
| **`DATABASE.Microphones.Like.audio`** | `LikeDotAudio/Microphones.Like.audio` | 2,067 microphone datasheets, frequency response curves, and polar pattern corpus. |
| **`DATABASE.Schema`** | `LikeDotAudio/APK.softapp.SCANALIZER.Database-Schema` | MariaDB / MySQL relational database tables and migration scripts for .PEAK data. |
| **`DATABASE.UCS-Taxonomy`** | `LikeDotAudio/APK.softapp.SCANALIZER.UCS-Taxonomy` | Universal Category System (UCS v8.2) audio taxonomy dictionary and validator. |
| **`DATABASE.linuxCommands`** | `LikeDotAudio/APK.softapp.DATABASE.linuxCommands` | Linux shell command cheatsheet and command reference corpus. |

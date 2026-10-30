# Scanalyzer · 01 · CAPTURES & EXTRACTORS

This folder contains the data ingestion, extraction, and capture modules of the **Scanalyzer** system. These modules intake external documents, audio files, images, schematics, and web pages, converting them into structured `.PEAK` metadata and search indexes.

Each module here is a **symlink** into its real home in the Softapps tree (repointed 2026-10-30 after the family reorg; the old flat `../../<name>` targets no longer exist):

`CAPTURE.crawler` → `Softapps/CAPTURE/CAPTURE.crawler`  
`CAPTURE.Czur-Fast-Capture` → `Softapps/CAPTURE/CAPTURE.Czur-Fast-Capture`  
`CAPTURE.Document` → `Softapps/CAPTURE/CAPTURE.Document`  
`CAPTURE.Extractor` → `Softapps/CAPTURE/CAPTURE.Extractor`  
`CAPTURE.Extractor-Engine` → `Softapps/CAPTURE/CAPTURE.Extractor-Engine`  
`CAPTURE.FaceID` → `Softapps/CAPTURE/CAPTURE.FaceID`  
`CAPTURE.FolderScanner` → `Softapps/CAPTURE/CAPTURE.FolderScanner`  
`CAPTURE.Image` → `Softapps/CAPTURE/CAPTURE.Image`  
`CAPTURE.OCR` → `Softapps/CAPTURE/CAPTURE.OCR`  
`CAPTURE.Schematics` → `Softapps/CAPTURE/CAPTURE.Schematics`  
`CAPTURE.Vectorizer` → `Softapps/CAPTURE/CAPTURE.Vectorizer`  
`CAPTURE.WebScraper` → `Softapps/CAPTURE/CAPTURE.WebScraper`

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`CAPTURE.Document`** | `LikeDotAudio/APK.softapp.CAPTURE.Document` | Parses PDF, TXT, MD, and Office documents into structured text and PEAK metadata tags. |
| **`CAPTURE.Extractor`** | `LikeDotAudio/APK.softapp.CAPTURE.Extractor` | Central coordinator interface managing all extraction pipelines and sidecars. |
| **`CAPTURE.Extractor-Engine`** | `LikeDotAudio/APK.softapp.CAPTURE.Extractor-Engine` | Low-level WASM/Rust binary feature extraction core for high-throughput metadata generation. |
| **`CAPTURE.FaceID`** | `LikeDotAudio/APK.softapp.CAPTURE.FaceID` | Facial feature extraction, face-detection bounding boxes, and identity tagging module. |
| **`CAPTURE.FolderScanner`** | `LikeDotAudio/APK.softapp.CAPTURE.FolderScanner` | Recursive file system directory crawler indexing folder hierarchies and file sizes. |
| **`CAPTURE.Image`** | `LikeDotAudio/APK.softapp.CAPTURE.Image` | Visual feature extraction, image aspect ratio, resolution, and EXIF metadata extractor. |
| **`CAPTURE.OCR`** | `LikeDotAudio/APK.softapp.CAPTURE.OCR` | Tesseract/WASM-powered Optical Character Recognition for text extraction from raster images. |
| **`CAPTURE.Schematics`** | `LikeDotAudio/APK.softapp.CAPTURE.Schematics` | Electronic schematic diagram parser extracting CAD symbols, nets, and component topologies. |
| **`CAPTURE.Vectorizer`** | `LikeDotAudio/APK.softapp.CAPTURE.Vectorizer` | Raster-to-vector SVG vectorizer for technical drawings, logos, and schematics. |
| **`CAPTURE.WebScraper`** | `LikeDotAudio/APK.softapp.CAPTURE.WebScraper` | Documentation harvester and Web API specification scraper (AMWA IS-12 / NMOS). |
| **`CAPTURE.crawler`** | `LikeDotAudio/APK.softapp.CAPTURE.crawler` | Web and local network asset crawler for audio corpora. |
| **`CAPTURE.Czur-Fast-Capture`** | `LikeDotAudio/APK.softapp.CAPTURE.Czur-Fast-Capture` | High-speed document overhead scanner camera interface and page crop manager. |

## Copies kept in step

Seven of these repositories (FolderScanner, Document, FaceID, Image, OCR, Schematics, Vectorizer) publish files that are **compiled here**. [`copies.tsv`](copies.tsv) names every pair, the Scanalyzer file being the source of truth; `python3 sync_copies.py --write` copies each one over its CAPTURE copy and `--check` exits 1 on any drift. The root `.github/workflows/scanalyzer.yml` runs `--check`, so a fix made here and not carried over goes red.

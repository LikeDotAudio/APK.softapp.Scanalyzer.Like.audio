# Scanalyzer · 01 · CAPTURES & EXTRACTORS

This folder contains the data ingestion, extraction, and capture modules of the **Scanalyzer** system. These modules intake external documents, audio files, images, schematics, and web pages, converting them into structured `.PEAK` metadata and search indexes.

## Modules

| Module Name | Repository / Path | Description |
| :--- | :--- | :--- |
| **`CAPTURE.Document`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor.Document` | Parses PDF, TXT, MD, and Office documents into structured text and PEAK metadata tags. |
| **`CAPTURE.Extractor`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor` | Central coordinator interface managing all extraction pipelines and sidecars. |
| **`CAPTURE.Extractor-Engine`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor-Engine` | Low-level WASM/Rust binary feature extraction core for high-throughput metadata generation. |
| **`CAPTURE.FaceID`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor.FaceID` | Facial feature extraction, face-detection bounding boxes, and identity tagging module. |
| **`CAPTURE.FolderScanner`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor.FolderScanner` | Recursive file system directory crawler indexing folder hierarchies and file sizes. |
| **`CAPTURE.Image`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor.Image` | Visual feature extraction, image aspect ratio, resolution, and EXIF metadata extractor. |
| **`CAPTURE.OCR`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor.OCR` | Tesseract/WASM-powered Optical Character Recognition for text extraction from raster images. |
| **`CAPTURE.Schematics`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor.Schematics` | Electronic schematic diagram parser extracting CAD symbols, nets, and component topologies. |
| **`CAPTURE.Vectorizer`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor.Vectorizer` | Raster-to-vector SVG vectorizer for technical drawings, logos, and schematics. |
| **`CAPTURE.WebScraper`** | `LikeDotAudio/APK.softapp.SCANALIZER.Extractor.WebScraper` | Documentation harvester and Web API specification scraper (AMWA IS-12 / NMOS). |
| **`CAPTURE.crawler`** | `LikeDotAudio/Crawler.Like.Audio` | Web and local network asset crawler for audio corpora. |
| **`CAPTURE.Czur-Fast-Capture`** | `LikeDotAudio/APK.softapp.CAPTURE.Czur-Fast-Capture` | High-speed document overhead scanner camera interface and page crop manager. |

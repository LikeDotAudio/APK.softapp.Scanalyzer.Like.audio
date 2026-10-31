// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// THE LIBRARY behind `apkaudio_graphics_suite` (src/main.rs, the CLI and the
// micro-API) and the bus worker in SRC/ (Worker-GRAPHICS_SUITE, POD.workers),
// so both run ONE implementation of OCR and vectorization rather than a copy
// each (LOOSE-workers-convert-rest; the copies CAPTURE.OCR and
// CAPTURE.Vectorizer used to carry drifted twice).
//
// Every analysis here is a pure function of the bytes handed to it; nothing in
// the library touches the bus or reads a path a caller did not name.

pub mod face_detector;
pub mod file_sorter;
pub mod image_analyzer;
pub mod ocr;
pub mod photo_id;
pub mod plugins;
pub mod server;
pub mod sorting;
pub mod vectorizer;
pub mod word_analyzer;

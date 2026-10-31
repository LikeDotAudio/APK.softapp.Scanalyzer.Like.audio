// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//! THE CONSUMER'S CONTRACT TEST. Every `.PEAK` this repository ships for its readers
//! (`SampleSamplesForSampling/`, `public/SampleSamplesForSampling/` — what `peakSchema.ts`,
//! the sample cloud and the examiner load) must satisfy the schema the analyzer
//! publishes (`oa_sample_analyzer::schema`, pinned by rev in Cargo.toml). A field the
//! analyzer renames or drops, or a fixture edited by hand into a shape the analyzer never
//! writes, fails here instead of in a reader.
use std::path::{Path, PathBuf};

fn peaks(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            peaks(&p, out);
        } else if p.extension().and_then(|x| x.to_str()) == Some("PEAK") {
            out.push(p);
        }
    }
}

#[test]
fn every_shipped_peak_satisfies_the_published_schema() {
    let web_front = Path::new(env!("CARGO_MANIFEST_DIR")).join("..");
    let mut files = Vec::new();
    peaks(&web_front.join("SampleSamplesForSampling"), &mut files);
    peaks(&web_front.join("public/SampleSamplesForSampling"), &mut files);
    assert!(files.len() >= 60, "expected the tracked .PEAK corpus, found {}", files.len());
    let mut broken = Vec::new();
    for f in &files {
        let text = std::fs::read_to_string(f).unwrap();
        let doc: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", f.display()));
        if let Err(errors) = oa_sample_analyzer::schema::validate(&doc) {
            broken.push(format!("{}: {}", f.display(), errors.into_iter().take(3).collect::<Vec<_>>().join("; ")));
        }
    }
    assert!(broken.is_empty(), "{} .PEAK file(s) break the schema:\n{}", broken.len(), broken.join("\n"));
}

#[test]
fn the_schema_handed_to_the_browser_is_the_analyzers() {
    assert_eq!(wasm_analyzer::peak_schema(), oa_sample_analyzer::schema::PEAK_SCHEMA);
    let schema: serde_json::Value = serde_json::from_str(&wasm_analyzer::peak_schema()).unwrap();
    assert!(schema["$id"].as_str().unwrap().contains("analyzer-peak"));
}

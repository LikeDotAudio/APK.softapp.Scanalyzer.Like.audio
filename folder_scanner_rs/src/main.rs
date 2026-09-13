// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// STAGE 1 OF Folder-ScanAnalyzer: the FOLDER scan.
//
// Owns: walking one directory tree and writing ONE catalog describing the whole
// of it -- a FileRecord per file, extension counts, total bytes, and the word
// frequencies its filenames carry. Nothing here opens a file's CONTENT; that is
// stage 2 (sidecar_tools/) and stage 3 (graphics_suite_rs/).
//
// Must not: default its target. An earlier life of this binary defaulted to
// "../..", which walks whatever happens to sit two levels above the working
// directory -- a path written as a string and verified by nothing, which
// CLAUDE.md §5 names as the cause of three production outages. Both the target
// and the catalog destination are required arguments and neither is guessed.
//
// Skips its own output: the sidecar suffixes stage 2 writes (.exif.json,
// .meta.json, .ocr.json) are excluded from the walk, so re-running after a
// sidecar pass does not count the sidecars as corpus.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;
use std::time::Instant;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRecord {
    pub file_name: String,
    pub relative_path: String,
    pub extension: String,
    pub size_bytes: u64,
    pub is_image: bool,
    pub is_manual: bool,
    pub special_flag: Option<String>,
    pub word_tokens: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DatasetCatalog {
    pub total_files: usize,
    pub total_manual_files: usize,
    pub total_size_bytes: u64,
    pub extension_counts: HashMap<String, usize>,
    pub word_frequencies: Vec<(String, usize)>,
    pub records: Vec<FileRecord>,
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("usage: apkaudio_folder_scanner <TARGET_DIR> <CATALOG_JSON>");
        eprintln!();
        eprintln!("Neither argument has a default. The target is the folder to walk;");
        eprintln!("the catalog is where the single JSON describing it is written.");
        std::process::exit(2);
    }
    let target_directory = &args[1];
    let out_path = &args[2];

    if !Path::new(target_directory).is_dir() {
        eprintln!("error: target {} is not a directory", target_directory);
        std::process::exit(1);
    }

    println!("==================================================");
    println!("🦀 Folder-ScanAnalyzer — stage 1, the folder walk");
    println!("Target Directory: {}", target_directory);
    println!("Catalog Output  : {}", out_path);
    println!("==================================================");

    let start_time = Instant::now();
    let mut records = scan_directory(Path::new(target_directory));
    println!("Scanned {} files in {:.2?}", records.len(), start_time.elapsed());

    let manual_count = records.iter().filter(|r| r.is_manual).count();
    println!("📘 Detected {} MANUAL files marked with special_flag: 'MANUAL_DOCUMENT'", manual_count);

    // 1. Test Custom Radix Sort (Sort by Size)
    let t0 = Instant::now();
    let mut radix_sorted = records.clone();
    radix_sort_by_size(&mut radix_sorted);
    println!("⚡ RadixSort (by size_bytes): {:.2?}", t0.elapsed());

    // 2. Test Custom MergeSort (Sort by Extension then Size)
    let t1 = Instant::now();
    let mut merge_sorted = records.clone();
    merge_sort(&mut merge_sorted);
    println!("⚡ MergeSort (by extension + size): {:.2?}", t1.elapsed());

    // 3. Test Parallel QuickSort (by File Name)
    let t2 = Instant::now();
    parallel_quicksort(&mut records);
    println!("⚡ Parallel QuickSort (by file_name): {:.2?}", t2.elapsed());

    // 4. Compute Word Frequency Index & Generate Catalog
    let word_freqs = compute_word_frequencies(&records);
    let mut counts_by_extension: HashMap<String, usize> = HashMap::new();
    let mut total_size = 0u64;

    for r in &records {
        *counts_by_extension.entry(r.extension.clone()).or_insert(0) += 1;
        total_size += r.size_bytes;
    }

    let catalog = DatasetCatalog {
        total_files: records.len(),
        total_manual_files: manual_count,
        total_size_bytes: total_size,
        extension_counts: counts_by_extension,
        word_frequencies: word_freqs.into_iter().take(50).collect(),
        records,
    };

    match File::create(out_path) {
        Ok(file) => {
            let writer = BufWriter::new(file);
            match serde_json::to_writer_pretty(writer, &catalog) {
                Ok(()) => println!("💾 Saved structured dataset to '{}'", out_path),
                Err(err) => {
                    eprintln!("error: could not serialise catalog to {}: {}", out_path, err);
                    std::process::exit(1);
                }
            }
        }
        Err(err) => {
            eprintln!("error: could not create {}: {}", out_path, err);
            std::process::exit(1);
        }
    }
}

fn scan_directory(root: &Path) -> Vec<FileRecord> {
    let mut records = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            let path = entry.path();
            let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

            // Skip sidecars in scanning
            if file_name.ends_with(".json") || file_name.ends_with(".ocr.json") || file_name.ends_with(".exif.json") || file_name.ends_with(".meta.json") {
                continue;
            }

            let relative_path = path.strip_prefix(root).unwrap_or(path).to_string_lossy().to_string();
            let extension = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
            let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
            let is_image = matches!(
                extension.as_str(),
                "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "tif" | "tiff" | "svg"
            );

            let lower_name = file_name.to_lowercase();
            let is_manual = lower_name.contains("manual") || lower_name.contains("manuals");
            let special_flag = if is_manual {
                Some("MANUAL_DOCUMENT".to_string())
            } else {
                None
            };

            let word_tokens = extract_word_tokens(&file_name);

            records.push(FileRecord {
                file_name,
                relative_path,
                extension,
                size_bytes,
                is_image,
                is_manual,
                special_flag,
                word_tokens,
            });
        }
    }
    records
}

fn extract_word_tokens(name: &str) -> Vec<String> {
    name.split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() > 1)
        .map(|s| s.to_lowercase())
        .collect()
}

fn radix_sort_by_size(records: &mut [FileRecord]) {
    let mut buffer = records.to_vec();
    for shift in (0..64).step_by(8) {
        let mut counts = [0usize; 256];
        for r in records.iter() {
            let bucket = ((r.size_bytes >> shift) & 0xFF) as usize;
            counts[bucket] += 1;
        }
        let mut start = [0usize; 256];
        let mut sum = 0;
        for i in 0..256 {
            start[i] = sum;
            sum += counts[i];
        }
        for r in records.iter() {
            let bucket = ((r.size_bytes >> shift) & 0xFF) as usize;
            buffer[start[bucket]] = r.clone();
            start[bucket] += 1;
        }
        records.clone_from_slice(&buffer);
    }
}

fn merge_sort(records: &mut [FileRecord]) {
    if records.len() <= 1 {
        return;
    }
    let mid = records.len() / 2;
    merge_sort(&mut records[..mid]);
    merge_sort(&mut records[mid..]);
    
    let mut merged = Vec::with_capacity(records.len());
    let (mut i, mut j) = (0, mid);

    while i < mid && j < records.len() {
        if records[i].extension <= records[j].extension {
            merged.push(records[i].clone());
            i += 1;
        } else {
            merged.push(records[j].clone());
            j += 1;
        }
    }
    merged.extend_from_slice(&records[i..mid]);
    merged.extend_from_slice(&records[j..records.len()]);
    records.clone_from_slice(&merged);
}

fn parallel_quicksort(records: &mut [FileRecord]) {
    if records.len() <= 1024 {
        records.sort_unstable_by(|a, b| a.file_name.cmp(&b.file_name));
        return;
    }

    let pivot_index = records.len() / 2;
    records.swap(pivot_index, records.len() - 1);
    let mut i = 0;

    for j in 0..records.len() - 1 {
        if records[j].file_name < records[records.len() - 1].file_name {
            records.swap(i, j);
            i += 1;
        }
    }
    let last = records.len() - 1;
    records.swap(i, last);

    let (left, right) = records.split_at_mut(i);
    rayon::join(|| parallel_quicksort(left), || parallel_quicksort(&mut right[1..]));
}

fn compute_word_frequencies(records: &[FileRecord]) -> Vec<(String, usize)> {
    let mut map = HashMap::new();
    for r in records {
        for word in &r.word_tokens {
            *map.entry(word.clone()).or_insert(0) += 1;
        }
    }
    let mut freqs: Vec<(String, usize)> = map.into_iter().collect();
    freqs.sort_by(|a, b| b.1.cmp(&a.1));
    freqs
}

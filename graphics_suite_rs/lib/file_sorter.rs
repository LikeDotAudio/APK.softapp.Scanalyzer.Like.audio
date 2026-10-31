use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::SystemTime;

use crate::plugins::cad_plugin::CadPlugin;
use crate::plugins::cdr_plugin::CdrPlugin;
use crate::plugins::docx_plugin::DocxPlugin;
use crate::plugins::dxf_plugin::DxfPlugin;
use crate::plugins::psd_plugin::PsdPlugin;
use crate::plugins::wordpress_plugin::WordPressPlugin;
use crate::sorting::benchmark::{BenchmarkResult, BenchmarkSuite};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Sidecar {
    pub file_tags: Vec<String>,
    pub ocr_tags: Vec<String>,
    pub image_tags: Vec<String>,
    pub metadata_tags: Vec<String>,
    pub plugin_tags: Vec<String>,
    pub plugin_fields: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileRecord {
    pub relative_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub extension: String,
    pub mod_time_secs: u64,
    pub is_image: bool,
    pub sidecar: Sidecar,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileStackGroup {
    pub group_id: String,
    pub tag_layer: String,
    pub primary_tag: String,
    pub co_occurring_tags: Vec<String>,
    pub repeating_pattern_count: usize,
    pub total_bytes: u64,
    pub sample_files: Vec<FileRecord>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CategoryChart {
    pub category_name: String,
    pub tag_layer: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub percentage: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CatalogSortReport {
    pub total_files_indexed: usize,
    pub total_bytes_scanned: u64,
    pub sort_key_used: String,
    pub total_stacks_created: usize,
    pub top_file_stacks: Vec<FileStackGroup>,
    pub category_chart_distribution: Vec<CategoryChart>,
    pub sorting_benchmarks: Vec<BenchmarkResult>,
    pub sidecar_architecture_summary: String,
}

pub struct FileSorter;

impl FileSorter {
    pub fn index_and_sort(dir_path: &Path, sort_key: &str) -> Result<CatalogSortReport, Box<dyn std::error::Error>> {
        let mut records = Vec::new();
        let mut total_bytes = 0u64;

        Self::walk_directory(dir_path, dir_path, &mut records, &mut total_bytes)?;

        let total_files = records.len();

        // 1. Group & Stack files based on FILE_TAGS, PLUGIN_TAGS, OCR_TAGS, and IMAGE_TAGS
        let mut records_by_tag: HashMap<String, Vec<FileRecord>> = HashMap::new();

        for rec in &records {
            for tag in &rec.sidecar.file_tags {
                if tag.len() >= 2 {
                    records_by_tag
                        .entry(format!("FILE:{}", tag.to_lowercase()))
                        .or_default()
                        .push(rec.clone());
                }
            }
            for tag in &rec.sidecar.plugin_tags {
                if tag.len() >= 2 {
                    records_by_tag
                        .entry(format!("PLUGIN:{}", tag.to_lowercase()))
                        .or_default()
                        .push(rec.clone());
                }
            }
        }

        // 2. Build Sidecar-Tagged Stacks
        let mut stacks: Vec<FileStackGroup> = records_by_tag
            .into_iter()
            .filter(|(_, files)| files.len() >= 2)
            .enumerate()
            .map(|(idx, (key, files))| {
                let parts: Vec<&str> = key.splitn(2, ':').collect();
                let layer = parts.first().copied().unwrap_or("FILE").to_string();
                let tag_value = parts.get(1).copied().unwrap_or("").to_string();

                let total_b = files.iter().map(|f| f.file_size).sum();
                let group_id = format!("SIDECAR-{:04}-{:X}", idx + 1, Self::simple_hash(&key) % 0xFFFF);

                let sample_files: Vec<FileRecord> = files.into_iter().take(10).collect();

                FileStackGroup {
                    group_id,
                    tag_layer: layer.clone(),
                    primary_tag: format!("#{}", tag_value),
                    co_occurring_tags: vec![format!("#{}", layer)],
                    repeating_pattern_count: sample_files.len(),
                    total_bytes: total_b,
                    sample_files,
                }
            })
            .collect();

        // 3. Sort Stacks with strict total ordering tie-breakers
        match sort_key {
            "name" => stacks.sort_by(|a, b| a.primary_tag.cmp(&b.primary_tag).then_with(|| a.group_id.cmp(&b.group_id))),
            "size" => stacks.sort_by(|a, b| b.total_bytes.cmp(&a.total_bytes).then_with(|| a.group_id.cmp(&b.group_id))),
            _ => stacks.sort_by(|a, b| b.repeating_pattern_count.cmp(&a.repeating_pattern_count).then_with(|| a.group_id.cmp(&b.group_id))),
        }

        let total_stacks = stacks.len();
        let top_stacks: Vec<FileStackGroup> = stacks.into_iter().take(40).collect();

        // 4. Distribution Chart Data
        let category_charts: Vec<CategoryChart> = top_stacks
            .iter()
            .take(10)
            .map(|s| {
                let percent = if total_files > 0 {
                    (s.repeating_pattern_count as f32 / total_files as f32) * 100.0
                } else {
                    0.0
                };
                CategoryChart {
                    category_name: format!("[{}] {}", s.tag_layer, s.primary_tag),
                    tag_layer: s.tag_layer.clone(),
                    file_count: s.repeating_pattern_count,
                    total_bytes: s.total_bytes,
                    percentage: percent,
                }
            })
            .collect();

        let tag_names: Vec<String> = top_stacks.iter().map(|s| s.primary_tag.clone()).collect();
        let benchmarks = BenchmarkSuite::benchmark_strings("Plugin_MultiTag_Sort", &tag_names);

        let architecture_summary = format!(
            "File Type Plugins & Multi-Layer Sidecar Taxonomy:\n\
             1. CDR_PLUGIN      : CorelDRAW Vector Graphics (.cdr).\n\
             2. DXF_PLUGIN      : AutoCAD DXF Vector Drawings (.dxf).\n\
             3. DOCX_PLUGIN     : Microsoft Word Documents (.docx, .doc).\n\
             4. WORDPRESS_PLUGIN: WordPress Exports, WXR XML, & DB SQL.\n\
             5. PSD_CAD_PLUGINS : Photoshop (.psd), DWG, AI, EPS.\n\
             Indexed {} files into {} plugin-tagged pattern stacks.",
            total_files, total_stacks
        );

        Ok(CatalogSortReport {
            total_files_indexed: total_files,
            total_bytes_scanned: total_bytes,
            sort_key_used: sort_key.to_string(),
            total_stacks_created: total_stacks,
            top_file_stacks: top_stacks,
            category_chart_distribution: category_charts,
            sorting_benchmarks: benchmarks,
            sidecar_architecture_summary: architecture_summary,
        })
    }

    fn generate_sidecar(rel_path: &str, filename: &str, extension: &str, full_path: &Path, is_image: bool) -> Sidecar {
        let mut file_tags = HashSet::new();
        let mut ocr_tags = HashSet::new();
        let mut image_tags = HashSet::new();
        let mut metadata_tags = HashSet::new();
        let mut plugin_tags = HashSet::new();
        let mut plugin_fields = HashMap::new();

        // 1. FILE TAGS (Strictly file name, extension, path)
        let stem = Path::new(filename)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();

        for token in stem.split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-') {
            for sub in token.split(&['_', '-'][..]) {
                let clean_sub = sub.trim();
                if clean_sub.len() >= 2 && !Self::is_stop_word(clean_sub) {
                    file_tags.insert(clean_sub.to_lowercase());
                }
            }
        }
        if !extension.is_empty() {
            file_tags.insert(format!("ext_{}", extension));
        }

        // 2. SPECIALIZED FILE TYPE PLUGINS (CDR, DXF, DOCX/DOC, WORDPRESS, PSD, CAD/DWG/AI/EPS)
        match extension {
            "cdr" => {
                let cdr_meta = CdrPlugin::parse_file(full_path);
                for t in cdr_meta.cdr_tags {
                    plugin_tags.insert(t);
                }
                plugin_fields.insert("format".to_string(), cdr_meta.format_type);
                plugin_fields.insert("version".to_string(), cdr_meta.version_label);
            }
            "dxf" => {
                let dxf_meta = DxfPlugin::parse_file(full_path);
                for t in dxf_meta.dxf_tags {
                    plugin_tags.insert(t);
                }
                plugin_fields.insert("cad_version".to_string(), dxf_meta.acad_version);
            }
            "docx" | "doc" => {
                let docx_meta = DocxPlugin::parse_file(full_path, extension);
                for t in docx_meta.docx_tags {
                    plugin_tags.insert(t);
                }
                plugin_fields.insert("format".to_string(), docx_meta.format_type);
            }
            "psd" => {
                let psd_meta = PsdPlugin::parse_file(full_path);
                for t in psd_meta.psd_tags {
                    plugin_tags.insert(t);
                }
                plugin_fields.insert("color_mode".to_string(), psd_meta.color_mode);
                plugin_fields.insert("resolution".to_string(), format!("{}x{}", psd_meta.width, psd_meta.height));
            }
            "dwg" | "ai" | "eps" => {
                let cad_meta = CadPlugin::parse_file(full_path, extension);
                for t in cad_meta.cad_tags {
                    plugin_tags.insert(t);
                }
                plugin_fields.insert("cad_type".to_string(), cad_meta.file_type);
                plugin_fields.insert("version".to_string(), cad_meta.version_code);
            }
            "xml" | "sql" | "php" => {
                let wp_meta = WordPressPlugin::parse_file(full_path, filename, extension);
                if wp_meta.is_wordpress {
                    for t in wp_meta.wordpress_tags {
                        plugin_tags.insert(t);
                    }
                    plugin_fields.insert("wordpress_doc_type".to_string(), wp_meta.document_type);
                }
            }
            _ => {
                // Check filename for wordpress keywords even on other extensions
                let wp_meta = WordPressPlugin::parse_file(full_path, filename, extension);
                if wp_meta.is_wordpress {
                    for t in wp_meta.wordpress_tags {
                        plugin_tags.insert(t);
                    }
                    plugin_fields.insert("wordpress_doc_type".to_string(), wp_meta.document_type);
                }
            }
        }

        // Image & Metadata Classification
        if is_image {
            image_tags.insert("raster_image".to_string());
            image_tags.insert(format!("format_{}", extension));
        } else {
            ocr_tags.insert(format!("doc_{}", extension));
        }

        metadata_tags.insert(format!("path_depth_{}", rel_path.split(&['/', '\\'][..]).count()));

        Sidecar {
            file_tags: file_tags.into_iter().collect(),
            ocr_tags: ocr_tags.into_iter().collect(),
            image_tags: image_tags.into_iter().collect(),
            metadata_tags: metadata_tags.into_iter().collect(),
            plugin_tags: plugin_tags.into_iter().collect(),
            plugin_fields,
        }
    }

    fn is_stop_word(token: &str) -> bool {
        matches!(
            token.to_lowercase().as_str(),
            "the" | "and" | "for" | "with" | "copy" | "file" | "new" | "old"
        )
    }

    fn simple_hash(s: &str) -> u32 {
        let mut h = 0u32;
        for b in s.bytes() {
            h = h.wrapping_mul(31).wrapping_add(b as u32);
        }
        h
    }

    fn walk_directory(
        root: &Path,
        current: &Path,
        records: &mut Vec<FileRecord>,
        total_bytes: &mut u64,
    ) -> Result<(), Box<dyn std::error::Error>> {
        if let Ok(entries) = fs::read_dir(current) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let _ = Self::walk_directory(root, &path, records, total_bytes);
                } else if path.is_file() {
                    if let Ok(metadata) = entry.metadata() {
                        let size = metadata.len();
                        *total_bytes += size;

                        let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                        let lower_name = file_name.to_lowercase();

                        // Disregard known scan JSON sidecars (*.exif.json, *.meta.json, *.sidecar.json)
                        if lower_name.ends_with(".exif.json") || lower_name.ends_with(".meta.json") || lower_name.ends_with(".sidecar.json") {
                            continue;
                        }

                        let rel_path = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().to_string();
                        let extension = path.extension().unwrap_or_default().to_string_lossy().to_lowercase();
                        let is_image = matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "tiff");

                        let sidecar = Self::generate_sidecar(&rel_path, &file_name, &extension, &path, is_image);

                        let mod_time = metadata
                            .modified()
                            .unwrap_or(SystemTime::UNIX_EPOCH)
                            .duration_since(SystemTime::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs();

                        records.push(FileRecord {
                            relative_path: rel_path,
                            file_name,
                            file_size: size,
                            extension: extension,
                            mod_time_secs: mod_time,
                            is_image: is_image,
                            sidecar,
                        });
                    }
                }
            }
        }
        Ok(())
    }
}

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DxfMetadata {
    pub is_dxf: bool,
    pub acad_version: String,
    pub line_count: usize,
    pub dxf_tags: Vec<String>,
    pub entity_counts: std::collections::HashMap<String, usize>,
    pub layers: Vec<String>,
    pub extracted_text: Vec<String>,
    pub svg_preview: Option<String>,
}

pub struct DxfPlugin;

impl DxfPlugin {
    pub fn parse_bytes(bytes: &[u8]) -> DxfMetadata {
        let content = String::from_utf8_lossy(bytes);
        let mut acad_version = "AutoCAD DXF Vector Drawing".to_string();
        let mut is_dxf = false;
        let mut tags = vec!["#dxf_drawing".to_string(), "#autocad_dxf".to_string(), "#vector_cad".to_string()];
        let mut entity_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let mut layers: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut extracted_text: Vec<String> = Vec::new();

        let lines: Vec<&str> = content.lines().collect();
        let line_count = lines.len();

        let mut in_entities = false;
        let mut current_code = -1i32;

        for i in 0..lines.len() {
            let line = lines[i].trim();
            if line == "SECTION" || line == "HEADER" || line == "$ACADVER" {
                is_dxf = true;
            }
            if line == "ENTITIES" {
                in_entities = true;
            }
            if line == "ENDSEC" {
                in_entities = false;
            }

            if line.starts_with("AC10") {
                acad_version = match line {
                    "AC1009" => "AutoCAD Release 11/12 (AC1009)".to_string(),
                    "AC1012" => "AutoCAD Release 13 (AC1012)".to_string(),
                    "AC1014" => "AutoCAD Release 14 (AC1014)".to_string(),
                    "AC1015" => "AutoCAD 2000 (AC1015)".to_string(),
                    "AC1018" => "AutoCAD 2004 (AC1018)".to_string(),
                    "AC1021" => "AutoCAD 2007 (AC1021)".to_string(),
                    "AC1024" => "AutoCAD 2010 (AC1024)".to_string(),
                    "AC1027" => "AutoCAD 2013 (AC1027)".to_string(),
                    "AC1032" => "AutoCAD 2018 (AC1032)".to_string(),
                    _ => format!("AutoCAD DXF ({})", line),
                };
            }

            // Simple DXF group code parser
            if i % 2 == 0 {
                current_code = line.parse::<i32>().unwrap_or(-1);
            } else {
                if current_code == 0 && in_entities {
                    *entity_counts.entry(line.to_string()).or_insert(0) += 1;
                } else if current_code == 8 {
                    layers.insert(line.to_string());
                } else if (current_code == 1 || current_code == 3) && line.len() > 1 {
                    if !line.starts_with('{') && !line.starts_with('\\') {
                        extracted_text.push(line.to_string());
                    }
                }
            }
        }

        if is_dxf {
            tags.push("#cad_dxf_entities".to_string());
        }

        let mut layer_names: Vec<String> = layers.into_iter().collect();
        layer_names.sort();

        DxfMetadata {
            is_dxf,
            acad_version: acad_version,
            line_count,
            dxf_tags: tags,
            entity_counts,
            layers: layer_names,
            extracted_text,
            svg_preview: None,
        }
    }

    pub fn parse_file(path: &Path) -> DxfMetadata {
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(_) => return Self::empty(),
        };
        Self::parse_bytes(&bytes)
    }

    fn empty() -> DxfMetadata {
        DxfMetadata {
            is_dxf: false,
            acad_version: "Unknown DXF".to_string(),
            line_count: 0,
            dxf_tags: Vec::new(),
            entity_counts: std::collections::HashMap::new(),
            layers: Vec::new(),
            extracted_text: Vec::new(),
            svg_preview: None,
        }
    }
}

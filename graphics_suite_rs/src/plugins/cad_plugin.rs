use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CadMetadata {
    pub file_type: String,
    pub version_code: String,
    pub is_vector_drawing: bool,
    pub cad_tags: Vec<String>,
}

pub struct CadPlugin;

impl CadPlugin {
    pub fn parse_file(path: &Path, ext: &str) -> CadMetadata {
        let mut file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return Self::empty(),
        };

        let mut header = [0u8; 16];
        let _ = file.read_exact(&mut header);

        let mut tags = Vec::new();
        let f_type = ext.to_uppercase();
        let mut version = "Standard".to_string();

        match ext {
            "dwg" => {
                tags.push("#autocad_dwg".to_string());
                tags.push("#cad_drawing".to_string());
                if &header[0..4] == b"AC10" {
                    version = format!("AutoCAD DWG Header {}", String::from_utf8_lossy(&header[0..6]));
                }
            }
            "dxf" => {
                tags.push("#autocad_dxf".to_string());
                tags.push("#vector_drawing".to_string());
            }
            "ai" | "eps" => {
                tags.push("#illustrator_vector".to_string());
                tags.push("#postscript".to_string());
                if &header[0..4] == b"%!PS" {
                    version = "Adobe PostScript / EPS".to_string();
                } else if &header[0..4] == b"PK\x03\x04" {
                    version = "Adobe Illustrator PDF-based AI".to_string();
                }
            }
            _ => {}
        }

        CadMetadata {
            file_type: f_type,
            version_code: version,
            is_vector_drawing: true,
            cad_tags: tags,
        }
    }

    fn empty() -> CadMetadata {
        CadMetadata {
            file_type: "Unknown".to_string(),
            version_code: "Unknown".to_string(),
            is_vector_drawing: false,
            cad_tags: Vec::new(),
        }
    }
}

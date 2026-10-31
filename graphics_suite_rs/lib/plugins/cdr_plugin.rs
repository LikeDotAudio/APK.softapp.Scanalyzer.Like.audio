use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CdrMetadata {
    pub is_cdr: bool,
    pub version_label: String,
    pub format_type: String,
    pub estimated_page_count: usize,
    pub has_embedded_thumbnail: bool,
    pub cdr_tags: Vec<String>,
}

pub struct CdrPlugin;

impl CdrPlugin {
    pub fn parse_file(path: &Path) -> CdrMetadata {
        let mut file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return Self::empty(),
        };

        let mut header = [0u8; 16];
        if file.read_exact(&mut header).is_err() {
            return Self::empty();
        }

        let mut tags = vec!["#cdr_vector".to_string(), "#coreldraw".to_string()];
        let mut version_label = "CorelDRAW Vector Graphic".to_string();
        let mut format_type = "CDR Binary Format".to_string();
        let mut has_thumb = false;

        // Check RIFF header (CorelDRAW v3-v12 use RIFF container with 'CDR' chunk)
        if &header[0..4] == b"RIFF" {
            let chunk_type = &header[8..12];
            if chunk_type == b"CDR " || chunk_type == b"CDRv" || chunk_type == b"CDRb" {
                version_label = format!("CorelDRAW RIFF (Chunk: {})", String::from_utf8_lossy(chunk_type));
                format_type = "RIFF CDR Container".to_string();
                tags.push("#riff_cdr".to_string());
            }
        } else if &header[0..4] == b"PK\x03\x04" {
            // Modern CorelDRAW X3+ files are ZIP containers
            version_label = "CorelDRAW X3+ Zip Package".to_string();
            format_type = "ZIP CDR Package".to_string();
            has_thumb = true;
            tags.push("#zip_cdr".to_string());
            tags.push("#embedded_thumbnail".to_string());
        }

        CdrMetadata {
            is_cdr: true,
            version_label,
            format_type,
            estimated_page_count: 1,
            has_embedded_thumbnail: has_thumb,
            cdr_tags: tags,
        }
    }

    fn empty() -> CdrMetadata {
        CdrMetadata {
            is_cdr: false,
            version_label: "Unknown CDR".to_string(),
            format_type: "Unknown".to_string(),
            estimated_page_count: 0,
            has_embedded_thumbnail: false,
            cdr_tags: Vec::new(),
        }
    }
}

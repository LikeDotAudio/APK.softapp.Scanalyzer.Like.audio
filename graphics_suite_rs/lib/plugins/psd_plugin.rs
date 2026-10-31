use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PsdMetadata {
    pub is_psd: bool,
    pub width: u32,
    pub height: u32,
    pub channels: u16,
    pub depth_bits: u16,
    pub color_mode: String,
    pub psd_tags: Vec<String>,
}

pub struct PsdPlugin;

impl PsdPlugin {
    pub fn parse_file(path: &Path) -> PsdMetadata {
        let mut file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return Self::empty(),
        };

        let mut header = [0u8; 26];
        if file.read_exact(&mut header).is_err() {
            return Self::empty();
        }

        // Magic 8BPS
        if &header[0..4] != b"8BPS" {
            return Self::empty();
        }

        let channels = u16::from_be_bytes([header[12], header[13]]);
        let height = u32::from_be_bytes([header[14], header[15], header[16], header[17]]);
        let width = u32::from_be_bytes([header[18], header[19], header[20], header[21]]);
        let depth_bits = u16::from_be_bytes([header[22], header[23]]);
        let color_mode_code = u16::from_be_bytes([header[24], header[25]]);

        let color_mode = match color_mode_code {
            0 => "Bitmap",
            1 => "Grayscale",
            2 => "Indexed",
            3 => "RGB",
            4 => "CMYK",
            7 => "Multichannel",
            8 => "Duotone",
            9 => "Lab",
            _ => "Unknown",
        }.to_string();

        let mut tags = vec![
            "#psd_drawing".to_string(),
            "#photoshop".to_string(),
            format!("#mode_{}", color_mode.to_lowercase()),
        ];
        tags.push(format!("#{}x{}", width, height));

        PsdMetadata {
            is_psd: true,
            width,
            height,
            channels,
            depth_bits,
            color_mode,
            psd_tags: tags,
        }
    }

    fn empty() -> PsdMetadata {
        PsdMetadata {
            is_psd: false,
            width: 0,
            height: 0,
            channels: 0,
            depth_bits: 0,
            color_mode: "Unknown".to_string(),
            psd_tags: Vec::new(),
        }
    }
}

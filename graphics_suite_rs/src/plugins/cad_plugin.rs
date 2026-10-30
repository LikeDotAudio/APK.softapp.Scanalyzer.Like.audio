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

/// How many leading bytes the format checks below need. The longest is the
/// binary-DXF sentinel's first 18 bytes; a file shorter than a check's magic
/// fails that check rather than being read as zero-padded.
const HEADER_LEN: usize = 32;

impl CadPlugin {
    /// Name a CAD/vector file by its BYTES, with the extension only choosing
    /// which formats to try. The extension is the claim; the header is the
    /// evidence. A file whose header matches none of the formats its extension
    /// allows says so — `"Unknown"`, `is_vector_drawing: false`, no format tags —
    /// rather than inheriting a format from its name
    /// (LOOSE-capture-schematics-cadpluginrs-labels-the).
    pub fn parse_file(path: &Path, ext: &str) -> CadMetadata {
        let file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return Self::empty(),
        };

        // `take().read_to_end`, not `read_exact`: a short file yields the bytes
        // it has, and an I/O error is an unreadable file, not sixteen zeros.
        let mut header = Vec::with_capacity(HEADER_LEN);
        if file.take(HEADER_LEN as u64).read_to_end(&mut header).is_err() {
            return Self::empty();
        }
        Self::identify(&header, ext)
    }

    /// The decision, on bytes already read — separate so it can be tested
    /// without files.
    pub fn identify(header: &[u8], ext: &str) -> CadMetadata {
        let ext = ext.to_ascii_lowercase();
        let found = match ext.as_str() {
            "dwg" => Self::dwg(header),
            "dxf" => Self::dxf(header),
            "ai" | "eps" => Self::postscript_family(header),
            _ => None,
        };
        match found {
            Some((file_type, version, tags)) => CadMetadata {
                file_type: file_type.to_string(),
                version_code: version,
                is_vector_drawing: true,
                cad_tags: tags.iter().map(|t| t.to_string()).collect(),
            },
            None => Self::unrecognised(&ext),
        }
    }

    /// DWG opens with a six-byte ASCII version string, `AC1015` and friends
    /// (`AC1.2`/`AC1.40` on the oldest), so the version is read, not assumed.
    fn dwg(h: &[u8]) -> Option<(&'static str, String, &'static [&'static str])> {
        if h.len() >= 6 && h.starts_with(b"AC") && h[2..6].iter().all(|b| b.is_ascii_alphanumeric() || *b == b'.') {
            let code = String::from_utf8_lossy(&h[0..6]).into_owned();
            return Some(("DWG", format!("AutoCAD DWG {}", code), &["#autocad_dwg", "#cad_drawing"]));
        }
        None
    }

    /// Binary DXF carries a fixed sentinel; ASCII DXF is group-code/value
    /// pairs, and every one starts with group code 0 (optionally after a
    /// leading 999 comment) on its own line.
    fn dxf(h: &[u8]) -> Option<(&'static str, String, &'static [&'static str])> {
        if h.starts_with(b"AutoCAD Binary DXF") {
            return Some(("DXF", "Binary DXF".to_string(), &["#autocad_dxf", "#vector_drawing"]));
        }
        let text = String::from_utf8_lossy(h);
        let first = text.trim_start_matches('\u{feff}').lines().next().map(str::trim);
        if matches!(first, Some("0") | Some("999")) {
            return Some(("DXF", "ASCII DXF".to_string(), &["#autocad_dxf", "#vector_drawing"]));
        }
        None
    }

    /// `.ai` and `.eps` share a family: PostScript (`%!PS`, every EPS and
    /// pre-CS Illustrator), a DOS-binary EPS wrapper with a preview
    /// (`C5 D0 D3 C6`), or a PDF (`%PDF`, Illustrator 9 and later). `PK\x03\x04`
    /// is a ZIP signature and is none of these.
    fn postscript_family(h: &[u8]) -> Option<(&'static str, String, &'static [&'static str])> {
        if h.starts_with(b"%!PS") {
            let line = String::from_utf8_lossy(h);
            let line = line.lines().next().unwrap_or("").trim().to_string();
            let kind = if line.contains("EPSF") { "Encapsulated PostScript" } else { "PostScript" };
            return Some(("EPS", format!("{} ({})", kind, line), &["#illustrator_vector", "#postscript"]));
        }
        if h.starts_with(&[0xC5, 0xD0, 0xD3, 0xC6]) {
            return Some(("EPS", "Encapsulated PostScript, DOS binary header".to_string(), &["#illustrator_vector", "#postscript"]));
        }
        if h.starts_with(b"%PDF-") {
            let ver: String = h[5..].iter().take_while(|b| b.is_ascii_digit() || **b == b'.').map(|b| *b as char).collect();
            return Some(("AI", format!("PDF-based Illustrator (PDF {})", ver), &["#illustrator_vector", "#pdf_compatible"]));
        }
        None
    }

    /// The extension promised a format the bytes do not carry.
    fn unrecognised(ext: &str) -> CadMetadata {
        CadMetadata {
            file_type: "Unknown".to_string(),
            version_code: format!("Unrecognised header for .{}", ext),
            is_vector_drawing: false,
            cad_tags: vec!["#cad_unverified".to_string()],
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dwg_version_comes_from_the_header() {
        let m = CadPlugin::identify(b"AC1027\0\0\0\0\0\0\0\0\0\0", "dwg");
        assert_eq!(m.file_type, "DWG");
        assert_eq!(m.version_code, "AutoCAD DWG AC1027");
        assert!(m.is_vector_drawing);
    }

    #[test]
    fn zip_magic_is_not_illustrator() {
        let m = CadPlugin::identify(b"PK\x03\x04\x14\0\0\0", "ai");
        assert_eq!(m.file_type, "Unknown");
        assert!(!m.is_vector_drawing);
        assert!(!m.version_code.contains("Illustrator"));
    }

    #[test]
    fn pdf_based_ai_is_read_from_percent_pdf() {
        let m = CadPlugin::identify(b"%PDF-1.6\n%\xe2\xe3", "ai");
        assert_eq!(m.file_type, "AI");
        assert_eq!(m.version_code, "PDF-based Illustrator (PDF 1.6)");
    }

    #[test]
    fn eps_header_line_is_reported() {
        let m = CadPlugin::identify(b"%!PS-Adobe-3.0 EPSF-3.0\n", "eps");
        assert_eq!(m.file_type, "EPS");
        assert!(m.version_code.starts_with("Encapsulated PostScript"));
    }

    #[test]
    fn ascii_and_binary_dxf_are_recognised() {
        assert_eq!(CadPlugin::identify(b"  0\r\nSECTION\r\n", "dxf").version_code, "ASCII DXF");
        assert_eq!(CadPlugin::identify(b"AutoCAD Binary DXF\r\n\x1a\0", "dxf").version_code, "Binary DXF");
    }

    #[test]
    fn a_short_or_mismatched_file_is_not_a_drawing() {
        for (h, ext) in [(&b"AC"[..], "dwg"), (&b""[..], "dxf"), (&b"hello world"[..], "eps"), (&b"\0\0\0\0"[..], "dwg")] {
            let m = CadPlugin::identify(h, ext);
            assert_eq!(m.file_type, "Unknown", "{:?} as .{}", h, ext);
            assert!(!m.is_vector_drawing);
            assert_eq!(m.cad_tags, vec!["#cad_unverified".to_string()]);
        }
    }

    #[test]
    fn a_short_file_on_disk_is_read_as_what_it_has() {
        let dir = std::env::temp_dir().join(format!("cad_plugin_short_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("tiny.dwg");
        std::fs::write(&p, b"AC10").unwrap();
        let m = CadPlugin::parse_file(&p, "dwg");
        std::fs::remove_dir_all(&dir).ok();
        assert_eq!(m.file_type, "Unknown");
    }
}

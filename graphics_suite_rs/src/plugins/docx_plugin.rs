use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocxMetadata {
    pub is_docx: bool,
    pub format_type: String,
    pub docx_tags: Vec<String>,
    pub word_count: usize,
    pub paragraph_count: usize,
    pub extracted_text_snippet: String,
    pub title: String,
    pub author: String,
}

pub struct DocxPlugin;

impl DocxPlugin {
    pub fn parse_file(path: &Path, ext: &str) -> DocxMetadata {
        let mut file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return Self::empty(),
        };

        let mut header = [0u8; 16];
        let _ = file.read_exact(&mut header);

        let mut tags = vec!["#ms_word".to_string(), "#word_processor".to_string()];
        let mut format_name = "Microsoft Word Document".to_string();
        let mut word_count = 0usize;
        let mut paragraph_count = 0usize;
        let mut extracted_text_snippet = String::new();
        let mut title = String::new();
        let mut author = String::new();

        if ext == "docx" || &header[0..4] == b"PK\x03\x04" {
            format_name = "Microsoft Word OpenXML (.docx)".to_string();
            tags.push("#docx_document".to_string());
            tags.push("#openxml".to_string());

            // Extract internal document XML text and core properties from ZIP container
            if let Ok(file_handle) = File::open(path) {
                if let Ok(mut archive) = ZipArchive::new(file_handle) {
                    // 1. Read word/document.xml for text paragraphs
                    if let Ok(mut doc_xml_file) = archive.by_name("word/document.xml") {
                        let mut xml_content = String::new();
                        if doc_xml_file.read_to_string(&mut xml_content).is_ok() {
                            let clean_text = Self::strip_xml_tags(&xml_content);
                            paragraph_count = xml_content.matches("<w:p").count();
                            word_count = clean_text.split_whitespace().count();
                            extracted_text_snippet = clean_text.chars().take(500).collect();
                            tags.push(format!("#word_count_{}", word_count));
                        }
                    }

                    // 2. Read docProps/core.xml for author & title
                    if let Ok(mut core_xml_file) = archive.by_name("docProps/core.xml") {
                        let mut core_xml = String::new();
                        if core_xml_file.read_to_string(&mut core_xml).is_ok() {
                            if let Some(t) = Self::extract_xml_element_text(&core_xml, "dc:title") {
                                title = t;
                            }
                            if let Some(a) = Self::extract_xml_element_text(&core_xml, "dc:creator") {
                                author = a;
                            }
                        }
                    }
                }
            }
        } else if ext == "doc" || &header[0..8] == b"\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1" {
            format_name = "Microsoft Word Legacy Compound Binary (.doc)".to_string();
            tags.push("#doc_legacy".to_string());
            tags.push("#ole_compound".to_string());
        }

        DocxMetadata {
            is_docx: true,
            format_type: format_name,
            docx_tags: tags,
            word_count,
            paragraph_count,
            extracted_text_snippet,
            title,
            author,
        }
    }

    /// Read buffer from byte payload for API endpoints
    pub fn parse_bytes(body: &[u8], ext: &str) -> DocxMetadata {
        let mut tags = vec!["#ms_word".to_string(), "#word_processor".to_string()];
        let mut format_name = "Microsoft Word Document".to_string();
        let mut word_count = 0usize;
        let mut paragraph_count = 0usize;
        let mut extracted_text_snippet = String::new();
        let mut title = String::new();
        let mut author = String::new();

        if ext == "docx" || body.starts_with(b"PK\x03\x04") {
            format_name = "Microsoft Word OpenXML (.docx)".to_string();
            tags.push("#docx_document".to_string());
            tags.push("#openxml".to_string());

            let cursor = std::io::Cursor::new(body);
            if let Ok(mut archive) = ZipArchive::new(cursor) {
                if let Ok(mut doc_xml_file) = archive.by_name("word/document.xml") {
                    let mut xml_content = String::new();
                    if doc_xml_file.read_to_string(&mut xml_content).is_ok() {
                        let clean_text = Self::strip_xml_tags(&xml_content);
                        paragraph_count = xml_content.matches("<w:p").count();
                        word_count = clean_text.split_whitespace().count();
                        extracted_text_snippet = clean_text.chars().take(500).collect();
                        tags.push(format!("#word_count_{}", word_count));
                    }
                }

                if let Ok(mut core_xml_file) = archive.by_name("docProps/core.xml") {
                    let mut core_xml = String::new();
                    if core_xml_file.read_to_string(&mut core_xml).is_ok() {
                        if let Some(t) = Self::extract_xml_element_text(&core_xml, "dc:title") {
                            title = t;
                        }
                        if let Some(a) = Self::extract_xml_element_text(&core_xml, "dc:creator") {
                            author = a;
                        }
                    }
                }
            }
        }

        DocxMetadata {
            is_docx: true,
            format_type: format_name,
            docx_tags: tags,
            word_count,
            paragraph_count,
            extracted_text_snippet,
            title,
            author,
        }
    }

    fn strip_xml_tags(xml: &str) -> String {
        let mut text = String::new();
        let mut inside_tag = false;
        for c in xml.chars() {
            if c == '<' {
                inside_tag = true;
            } else if c == '>' {
                inside_tag = false;
                text.push(' ');
            } else if !inside_tag {
                text.push(c);
            }
        }
        text
    }

    fn extract_xml_element_text(xml: &str, tag_name: &str) -> Option<String> {
        let open_tag = format!("<{}>", tag_name);
        let close_tag = format!("</{}>", tag_name);
        if let Some(start) = xml.find(&open_tag) {
            if let Some(end) = xml[start..].find(&close_tag) {
                let inner = &xml[start + open_tag.len()..start + end];
                return Some(inner.trim().to_string());
            }
        }
        None
    }

    fn empty() -> DocxMetadata {
        DocxMetadata {
            is_docx: false,
            format_type: "Unknown Word Document".to_string(),
            docx_tags: Vec::new(),
            word_count: 0,
            paragraph_count: 0,
            extracted_text_snippet: String::new(),
            title: String::new(),
            author: String::new(),
        }
    }
}

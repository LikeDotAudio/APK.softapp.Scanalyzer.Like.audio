use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WordPressMetadata {
    pub is_wordpress: bool,
    pub document_type: String,
    pub detected_wp_tables: Vec<String>,
    pub wordpress_tags: Vec<String>,
}

pub struct WordPressPlugin;

impl WordPressPlugin {
    pub fn parse_file(path: &Path, filename: &str, ext: &str) -> WordPressMetadata {
        let file = match File::open(path) {
            Ok(f) => f,
            Err(_) => return Self::empty(),
        };

        let reader = BufReader::new(file);
        let mut is_wp = false;
        let mut document_type = "WordPress File".to_string();
        let mut tables = Vec::new();
        let mut tags = vec!["#wordpress".to_string()];

        let lower_fn = filename.to_lowercase();
        if lower_fn.contains("wordpress") || lower_fn.contains("wp-") || lower_fn.contains("wxr") {
            is_wp = true;
        }

        for line_result in reader.lines().take(150) {
            if let Ok(line) = line_result {
                let lowered = line.to_lowercase();
                if lowered.contains("wordpress.org") || lowered.contains("wp-content") || lowered.contains("wxr_version") {
                    is_wp = true;
                    tags.push("#wordpress_export".to_string());
                    document_type = "WordPress WXR XML Export Document".to_string();
                }
                if lowered.contains("wp_posts") {
                    tables.push("wp_posts".to_string());
                    tags.push("#wp_posts_db".to_string());
                    is_wp = true;
                }
                if lowered.contains("wp_options") {
                    tables.push("wp_options".to_string());
                    tags.push("#wp_options_db".to_string());
                    is_wp = true;
                }
                if lowered.contains("wp_users") {
                    tables.push("wp_users".to_string());
                    tags.push("#wp_users_db".to_string());
                    is_wp = true;
                }
            }
        }

        if ext == "php" && (lower_fn.starts_with("wp-") || lower_fn.contains("plugin")) {
            is_wp = true;
            tags.push("#wordpress_php".to_string());
            document_type = "WordPress PHP Source File".to_string();
        }

        WordPressMetadata {
            is_wordpress: is_wp,
            document_type,
            detected_wp_tables: tables,
            wordpress_tags: tags,
        }
    }

    fn empty() -> WordPressMetadata {
        WordPressMetadata {
            is_wordpress: false,
            document_type: "Unknown".to_string(),
            detected_wp_tables: Vec::new(),
            wordpress_tags: Vec::new(),
        }
    }
}

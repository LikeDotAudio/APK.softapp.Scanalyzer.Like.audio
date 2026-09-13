use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WordFrequency {
    pub word: String,
    pub count: usize,
    pub length: usize,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WordAnalysisReport {
    pub total_words: usize,
    pub unique_words: usize,
    pub average_word_length: f32,
    pub top_frequencies: Vec<WordFrequency>,
    pub extracted_model_codes: Vec<String>,
    pub extracted_project_names: Vec<String>,
}

pub struct WordAnalyzer;

impl WordAnalyzer {
    pub fn analyze_text(text: &str) -> WordAnalysisReport {
        let cleaned_text = text.to_lowercase();
        let tokens: Vec<&str> = cleaned_text
            .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
            .flat_map(|s| s.split(&['_', '-'][..]))
            .filter(|s| s.len() >= 2 && !Self::is_stop_word(s))
            .collect();

        let total_words = tokens.len();
        let mut counts: HashMap<String, usize> = HashMap::new();
        let mut total_char_count = 0;

        let mut model_codes = Vec::new();
        let mut project_names = Vec::new();

        for token in &tokens {
            total_char_count += token.len();
            *counts.entry(token.to_string()).or_insert(0) += 1;

            // Extract real alphanumeric model/part codes (e.g. 77038, L3242, Pod7, M5200A, 9XXX)
            if token.chars().any(|c| c.is_numeric()) && token.len() >= 3 {
                if !model_codes.contains(&token.to_string()) {
                    model_codes.push(token.to_string());
                }
            } else if token.len() >= 4 && token.chars().all(|c| c.is_alphabetic()) {
                if !project_names.contains(&token.to_string()) {
                    project_names.push(token.to_string());
                }
            }
        }

        let unique_words = counts.len();
        let average_word_length = if total_words > 0 {
            total_char_count as f32 / total_words as f32
        } else {
            0.0
        };

        let mut frequencies: Vec<WordFrequency> = counts
            .into_iter()
            .map(|(w, c)| WordFrequency {
                length: w.len(),
                word: w,
                count: c,
            })
            .collect();

        frequencies.sort_by(|a, b| b.count.cmp(&a.count));

        let top_frequencies = frequencies.into_iter().take(25).collect();

        WordAnalysisReport {
            total_words,
            unique_words,
            average_word_length,
            top_frequencies,
            extracted_model_codes: model_codes.into_iter().take(15).collect(),
            extracted_project_names: project_names.into_iter().take(15).collect(),
        }
    }

    fn is_stop_word(token: &str) -> bool {
        matches!(
            token.to_lowercase().as_str(),
            "the" | "and" | "for" | "with" | "copy" | "file" | "new" | "old" | "txt" | "png" | "jpg" | "json" | "meta"
        )
    }
}

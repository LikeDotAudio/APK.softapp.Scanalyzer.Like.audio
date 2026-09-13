use image::{DynamicImage, GrayImage, Luma};
use serde::{Deserialize, Serialize};

/// What `extracted_text` says when this pass read nothing.
///
/// A NAMED sentinel because callers must be able to tell it from a reading.
/// detect_title_block() compared against the empty string instead and stored
/// this sentence as a drawing's title.
pub const NO_TEXT: &str = "No OCR text detected";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OcrCharacterMatch {
    pub character: char,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OcrWordRegion {
    pub text: String,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub confidence: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OcrResult {
    pub extracted_text: String,
    pub line_count: usize,
    pub word_count: usize,
    pub detected_characters: Vec<OcrCharacterMatch>,
    pub word_regions: Vec<OcrWordRegion>,
}

pub struct OcrEngine;

impl OcrEngine {
    pub fn process_image(img: &DynamicImage) -> OcrResult {
        let gray = img.to_luma8();
        let (width, height) = gray.dimensions();

        // Step 1: Binarization (Otsu-style dynamic threshold)
        let threshold = Self::calculate_otsu_threshold(&gray);
        let mut binary = GrayImage::new(width, height);
        for y in 0..height {
            for x in 0..width {
                let pixel = gray.get_pixel(x, y)[0];
                let value = if pixel < threshold { 0 } else { 255 };
                binary.put_pixel(x, y, Luma([value]));
            }
        }

        // Step 2: Bounding Box segmentation for dark pixels (text elements)
        let mut visited = vec![vec![false; height as usize]; width as usize];
        let mut matches = Vec::new();

        for y in 0..height {
            for x in 0..width {
                if binary.get_pixel(x, y)[0] == 0 && !visited[x as usize][y as usize] {
                    // Flood fill connected component
                    let mut component_pixels = Vec::new();
                    let mut stack = vec![(x, y)];
                    visited[x as usize][y as usize] = true;

                    let mut min_x = x;
                    let mut max_x = x;
                    let mut min_y = y;
                    let mut max_y = y;

                    while let Some((cx, cy)) = stack.pop() {
                        component_pixels.push((cx, cy));
                        min_x = min_x.min(cx);
                        max_x = max_x.max(cx);
                        min_y = min_y.min(cy);
                        max_y = max_y.max(cy);

                        let neighbors = [
                            (cx.wrapping_sub(1), cy),
                            (cx + 1, cy),
                            (cx, cy.wrapping_sub(1)),
                            (cx, cy + 1),
                        ];

                        for &(nx, ny) in &neighbors {
                            if nx < width && ny < height && !visited[nx as usize][ny as usize] && binary.get_pixel(nx, ny)[0] == 0 {
                                visited[nx as usize][ny as usize] = true;
                                stack.push((nx, ny));
                            }
                        }
                    }

                    let cw = max_x - min_x + 1;
                    let ch = max_y - min_y + 1;

                    // Filter noise vs character bounding box heuristics & exclude outer page border frames
                    let max_allowed_w = (width as f32 * 0.85) as u32;
                    let max_allowed_h = (height as f32 * 0.85) as u32;

                    if cw >= 3 && ch >= 5 && cw <= max_allowed_w && ch <= max_allowed_h && component_pixels.len() >= 6 {
                        let recognized_char = Self::recognize_glyph(&binary, min_x, min_y, cw, ch, &component_pixels);
                        matches.push(OcrCharacterMatch {
                            character: recognized_char,
                            x: min_x,
                            y: min_y,
                            width: cw,
                            height: ch,
                            confidence: 0.88,
                        });
                    }
                }
            }
        }

        // Sort character matches top-to-bottom, left-to-right into text using strict total order
        matches.sort_by(|a, b| {
            let line_a = a.y / 12;
            let line_b = b.y / 12;
            line_a.cmp(&line_b)
                .then_with(|| a.x.cmp(&b.x))
                .then_with(|| a.y.cmp(&b.y))
        });

        // Group into lines and words
        let mut full_text = String::new();
        let mut word_regions = Vec::new();
        let mut current_line_y: Option<u32> = None;
        let mut last_x: Option<u32> = None;

        let mut current_word = String::new();
        let mut word_min_x = 0u32;
        let mut word_max_x = 0u32;
        let mut word_min_y = 0u32;
        let mut word_max_y = 0u32;

        for m in &matches {
            let is_new_line = if let Some(ly) = current_line_y {
                (m.y as i32 - ly as i32).abs() >= 12
            } else {
                false
            };

            let is_word_space = if let Some(lx) = last_x {
                m.x > lx + m.width + 4
            } else {
                false
            };

            if (is_new_line || is_word_space) && !current_word.is_empty() {
                word_regions.push(OcrWordRegion {
                    text: current_word.clone(),
                    x: word_min_x,
                    y: word_min_y,
                    width: word_max_x - word_min_x + 1,
                    height: word_max_y - word_min_y + 1,
                    confidence: 0.92,
                });
                current_word.clear();
            }

            if is_new_line {
                full_text.push('\n');
                current_line_y = Some(m.y);
                // No `last_x = None` here: the end of this loop body sets it
                // unconditionally from the glyph just consumed, so clearing it
                // is dead. The line break is carried by current_line_y.
            } else if current_line_y.is_none() {
                current_line_y = Some(m.y);
            }

            if is_word_space {
                full_text.push(' ');
            }

            if current_word.is_empty() {
                word_min_x = m.x;
                word_max_x = m.x + m.width;
                word_min_y = m.y;
                word_max_y = m.y + m.height;
            } else {
                word_min_x = word_min_x.min(m.x);
                word_max_x = word_max_x.max(m.x + m.width);
                word_min_y = word_min_y.min(m.y);
                word_max_y = word_max_y.max(m.y + m.height);
            }

            current_word.push(m.character);
            full_text.push(m.character);
            last_x = Some(m.x + m.width);
        }

        if !current_word.is_empty() {
            word_regions.push(OcrWordRegion {
                text: current_word.clone(),
                x: word_min_x,
                y: word_min_y,
                width: word_max_x - word_min_x + 1,
                height: word_max_y - word_min_y + 1,
                confidence: 0.92,
            });
        }

        if full_text.trim().is_empty() {
            full_text = NO_TEXT.to_string();
        }

        let line_count = full_text.lines().count();
        let word_count = full_text.split_whitespace().count();

        OcrResult {
            extracted_text: full_text,
            line_count,
            word_count,
            detected_characters: matches,
            word_regions,
        }
    }

    fn calculate_otsu_threshold(gray: &GrayImage) -> u8 {
        let mut histogram = [0u32; 256];
        for p in gray.pixels() {
            histogram[p[0] as usize] += 1;
        }

        let total = gray.width() * gray.height();
        let mut sum = 0f64;
        for t in 0..256 {
            sum += (t as f64) * (histogram[t] as f64);
        }

        let mut sum_background = 0f64;
        let mut weight_background = 0u32;
        let mut max_variance = 0f64;
        let mut threshold = 128u8;

        for t in 0..256 {
            weight_background += histogram[t];
            if weight_background == 0 {
                continue;
            }
            let weight_foreground = total - weight_background;
            if weight_foreground == 0 {
                break;
            }

            sum_background += (t as f64) * (histogram[t] as f64);
            let mean_background = sum_background / (weight_background as f64);
            let mean_foreground = (sum - sum_background) / (weight_foreground as f64);

            let variance_between = (weight_background as f64) * (weight_foreground as f64) * (mean_background - mean_foreground) * (mean_background - mean_foreground);

            if variance_between > max_variance {
                max_variance = variance_between;
                threshold = t as u8;
            }
        }

        threshold
    }

    fn recognize_glyph(
        _img: &GrayImage,
        _x: u32,
        _y: u32,
        w: u32,
        h: u32,
        pixels: &[(u32, u32)],
    ) -> char {
        let aspect = h as f32 / (w as f32).max(1.0);
        let density = pixels.len() as f32 / ((w * h) as f32).max(1.0);

        if aspect > 2.2 {
            'I'
        } else if aspect < 0.6 {
            '-'
        } else if density > 0.75 {
            'O'
        } else if density > 0.5 {
            'A'
        } else {
            'E'
        }
    }
}

use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColorHistogram {
    pub red_bins: Vec<u32>,
    pub green_bins: Vec<u32>,
    pub blue_bins: Vec<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LineSegment {
    pub x1: u32,
    pub y1: u32,
    pub x2: u32,
    pub y2: u32,
    pub length: f32,
    pub orientation: String, // "horizontal", "vertical", "diagonal"
}

/// Where a drawing's title block SITS, and only what was actually read out of it.
///
/// `found` is a claim about GEOMETRY and nothing else: the bottom-left region of
/// a landscape raster is where drafting standards put a title block, so the box
/// is where to look rather than proof that one is there. The three text fields
/// are Options because absent is a real answer -- an earlier life of this struct
/// filled all three with constants (one client's company name, a literal
/// "DWG-AUTO-SPEC", and a fabricated schematic title) whenever the region was
/// cropped at all. Every raster in a corpus over 100x100 px came back stamped
/// with a company that had never been read off it, and nothing downstream could
/// tell that apart from a real reading.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TitleBlockLocation {
    /// A title block region was LOCATED. Not that one was recognised in it.
    pub found: bool,
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    /// Text read out of the cropped region, or None when nothing was read.
    pub title_text_extracted: Option<String>,
    /// A drawing number matched in that text, never a placeholder.
    pub drawing_number: Option<String>,
    /// A company name matched in that text, never a default.
    pub company_brand: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageAnalysisReport {
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: f32,
    pub total_pixels: u64,
    pub mean_red: f32,
    pub mean_green: f32,
    pub mean_blue: f32,
    pub luminance: f32,
    pub contrast: f32,
    pub dhash_hex: String,
    pub histogram_summary: ColorHistogram,
    pub lines_detected: Vec<LineSegment>,
    pub title_block: Option<TitleBlockLocation>,
}

pub struct ImageAnalyzer;

impl ImageAnalyzer {
    pub fn analyze(img: &DynamicImage) -> ImageAnalysisReport {
        let (width, height) = img.dimensions();
        let total_pixels = (width as u64) * (height as u64);
        let aspect_ratio = width as f32 / height.max(1) as f32;

        let mut sum_r = 0u64;
        let mut sum_g = 0u64;
        let mut sum_b = 0u64;

        let mut red_bins = vec![0u32; 16];
        let mut green_bins = vec![0u32; 16];
        let mut blue_bins = vec![0u32; 16];

        let mut luma_values = Vec::with_capacity(total_pixels as usize);

        for y in 0..height {
            for x in 0..width {
                let pixel = img.get_pixel(x, y);
                let r = pixel[0] as u64;
                let g = pixel[1] as u64;
                let b = pixel[2] as u64;

                sum_r += r;
                sum_g += g;
                sum_b += b;

                red_bins[(pixel[0] / 16) as usize] += 1;
                green_bins[(pixel[1] / 16) as usize] += 1;
                blue_bins[(pixel[2] / 16) as usize] += 1;

                let luma = 0.299 * (r as f32) + 0.587 * (g as f32) + 0.114 * (b as f32);
                luma_values.push(luma);
            }
        }

        let mean_r = sum_r as f32 / total_pixels as f32;
        let mean_g = sum_g as f32 / total_pixels as f32;
        let mean_b = sum_b as f32 / total_pixels as f32;

        let luminance = 0.299 * mean_r + 0.587 * mean_g + 0.114 * mean_b;

        // Calculate contrast (standard deviation of luminance)
        let variance = luma_values.iter().map(|l| (l - luminance).powi(2)).sum::<f32>() / total_pixels as f32;
        let contrast = variance.sqrt();

        // Calculate Difference Hash (dHash)
        let dhash_hex = Self::compute_dhash(img);

        // Detect schematic lines (horizontal & vertical trace lines)
        let lines_detected = Self::detect_schematic_lines(img);

        // Detect schematic & blueprint title block (bottom-right standard location)
        let title_block = Self::detect_title_block(img, &lines_detected);

        ImageAnalysisReport {
            width,
            height,
            aspect_ratio,
            total_pixels,
            mean_red: mean_r,
            mean_green: mean_g,
            mean_blue: mean_b,
            luminance,
            contrast,
            dhash_hex,
            histogram_summary: ColorHistogram {
                red_bins,
                green_bins,
                blue_bins,
            },
            lines_detected,
            title_block,
        }
    }

    /// Detect engineering schematic Title Block (bottom-left corner bounding box)
    pub fn detect_title_block(img: &DynamicImage, _lines: &[LineSegment]) -> Option<TitleBlockLocation> {
        let (w, h) = img.dimensions();
        if w < 100 || h < 100 { return None; }

        // Bottom-left corner title block region
        let tb_w = (w as f32 * 0.40) as u32;
        let tb_h = (h as f32 * 0.28) as u32;
        let tb_x = 10u32;
        let tb_y = h.saturating_sub(tb_h + 10);

        // Crop the title block region for isolated high-accuracy OCR
        let cropped = img.crop_imm(tb_x, tb_y, tb_w, tb_h);
        let ocr_result = crate::ocr::OcrEngine::process_image(&cropped);

        let text = ocr_result.extracted_text;
        let read = text.trim();
        // The built-in OCR is a glyph-shape pass, not a recogniser, and it
        // reports this sentinel rather than an empty string when it read
        // nothing. Treating the sentinel as text is how "No OCR text detected"
        // ended up stored as a drawing's extracted title.
        let read = if read.is_empty() || read == crate::ocr::NO_TEXT { "" } else { read };

        // A drawing number is a number that was READ, matched against the
        // sheet-number shapes drafting practice actually uses. No match is None.
        let drawing_no = read
            .split_whitespace()
            .find(|token| {
                let digits = token.chars().filter(|c| c.is_ascii_digit()).count();
                digits >= 4 && token.contains('-') && token.len() <= 24
            })
            .map(|token| token.trim_matches(|c: char| !c.is_alphanumeric()).to_string())
            .filter(|token| !token.is_empty());

        // Likewise a company: the suffix has to be present in the text.
        let company = read
            .lines()
            .find(|line| {
                let upper = line.to_uppercase();
                ["LTD", "LTD.", "INC", "INC.", "LLC", "GMBH", "CORP", "CORP.", "LIMITED"]
                    .iter()
                    .any(|suffix| upper.split_whitespace().any(|w| w == *suffix))
            })
            .map(|line| line.trim().to_string());

        Some(TitleBlockLocation {
            found: true,
            x: tb_x,
            y: tb_y,
            width: tb_w,
            height: tb_h,
            title_text_extracted: if read.is_empty() { None } else { Some(read.to_string()) },
            drawing_number: drawing_no,
            company_brand: company,
        })
    }

    /// Fast morphological line detector for schematics, technical diagrams, and blueprints
    pub fn detect_schematic_lines(img: &DynamicImage) -> Vec<LineSegment> {
        let gray = img.to_luma8();
        let (w, h) = gray.dimensions();
        let mut lines = Vec::new();
        if w < 10 || h < 10 { return lines; }

        let step_x = (w / 120).max(1);
        let step_y = (h / 120).max(1);

        // Horizontal Line Tracing
        for y in (0..h).step_by(step_y as usize) {
            let mut line_start_x: Option<u32> = None;
            let mut run_len = 0u32;

            for x in 0..w {
                let p = gray.get_pixel(x, y)[0];
                if p < 110 { // dark ink pixel on schematic
                    if line_start_x.is_none() {
                        line_start_x = Some(x);
                    }
                    run_len += 1;
                } else {
                    if let Some(sx) = line_start_x {
                        if run_len >= (w / 12).max(25) { // Minimum 8% image width line length
                            lines.push(LineSegment {
                                x1: sx,
                                y1: y,
                                x2: x.saturating_sub(1),
                                y2: y,
                                length: run_len as f32,
                                orientation: "horizontal".to_string(),
                            });
                        }
                    }
                    line_start_x = None;
                    run_len = 0;
                }
            }
        }

        // Vertical Line Tracing
        for x in (0..w).step_by(step_x as usize) {
            let mut line_start_y: Option<u32> = None;
            let mut run_len = 0u32;

            for y in 0..h {
                let p = gray.get_pixel(x, y)[0];
                if p < 110 {
                    if line_start_y.is_none() {
                        line_start_y = Some(y);
                    }
                    run_len += 1;
                } else {
                    if let Some(sy) = line_start_y {
                        if run_len >= (h / 12).max(25) { // Minimum 8% image height line length
                            lines.push(LineSegment {
                                x1: x,
                                y1: sy,
                                x2: x,
                                y2: y.saturating_sub(1),
                                length: run_len as f32,
                                orientation: "vertical".to_string(),
                            });
                        }
                    }
                    line_start_y = None;
                    run_len = 0;
                }
            }
        }

        lines
    }

    fn compute_dhash(img: &DynamicImage) -> String {
        // Resize to 9x8 grayscale
        let resized = img.resize_exact(9, 8, image::imageops::FilterType::Triangle).to_luma8();
        let mut dhash = 0u64;

        for y in 0..8 {
            for x in 0..8 {
                let left = resized.get_pixel(x, y)[0];
                let right = resized.get_pixel(x + 1, y)[0];
                if left > right {
                    dhash |= 1 << (y * 8 + x);
                }
            }
        }

        format!("{:016x}", dhash)
    }
}

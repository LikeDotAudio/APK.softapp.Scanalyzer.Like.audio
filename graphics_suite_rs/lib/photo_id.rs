use crate::face_detector::{FaceDetectionReport, FaceDetector};
use image::DynamicImage;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhotoIdentification {
    pub primary_category: String,
    /// Always `None` (JSON `null`): the category comes from threshold rules, which yield a
    /// label but no measured likelihood. Refusal over fabrication — no per-branch constant.
    pub confidence: Option<f32>,
    pub detected_traits: Vec<String>,
    pub color_palette_type: String,
    pub fingerprint_hash: String,
    pub face_detection: FaceDetectionReport,
}

pub struct PhotoIdentifier;

impl PhotoIdentifier {
    pub fn identify(img: &DynamicImage) -> PhotoIdentification {
        let report = super::image_analyzer::ImageAnalyzer::analyze(img);
        let face_report = FaceDetector::detect_faces(img);

        let mut traits = Vec::new();

        // High contrast vs low contrast
        if report.contrast > 60.0 {
            traits.push("High Contrast".to_string());
        } else {
            traits.push("Low/Medium Contrast".to_string());
        }

        // Face traits
        if face_report.faces_detected > 0 {
            traits.push(format!("👤 Face Detected ({})", face_report.faces_detected));
        }

        // Luminance classification
        let theme = if report.luminance > 180.0 {
            "Light Theme / High Brightness".to_string()
        } else if report.luminance < 75.0 {
            "Dark Theme / Low Brightness".to_string()
        } else {
            "Balanced Exposure".to_string()
        };
        traits.push(theme);

        // Aspect ratio classification
        if (report.aspect_ratio - 1.0).abs() < 0.1 {
            traits.push("Square Aspect Ratio".to_string());
        } else if report.aspect_ratio > 1.3 {
            traits.push("Landscape Aspect Ratio".to_string());
        } else {
            traits.push("Portrait Aspect Ratio".to_string());
        }

        // Categorization heuristics
        let category = if face_report.faces_detected > 0 {
            "👤 Human Portrait / Person Photo"
        } else if report.luminance > 190.0 && report.contrast > 50.0 {
            "Document / Text Scan"
        } else if report.contrast > 75.0 {
            "Line Art / Graphic Diagram"
        } else if report.mean_red > 100.0 && report.mean_green > 90.0 && report.mean_blue > 80.0 {
            "Photographic Scene / Real World Photo"
        } else {
            "Digital Graphic / Iconography"
        };

        let palette_type = if (report.mean_red - report.mean_green).abs() < 10.0 && (report.mean_green - report.mean_blue).abs() < 10.0 {
            "Monochrome / Grayscale".to_string()
        } else {
            "Vibrant Multi-color".to_string()
        };

        PhotoIdentification {
            primary_category: category.to_string(),
            confidence: None,
            detected_traits: traits,
            color_palette_type: palette_type,
            fingerprint_hash: report.dhash_hex,
            face_detection: face_report,
        }
    }
}

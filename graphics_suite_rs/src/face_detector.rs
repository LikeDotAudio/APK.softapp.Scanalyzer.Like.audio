use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FaceBoundingBox {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub confidence: f32,
    pub embedding_hash: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FaceDetectionReport {
    pub faces_detected: usize,
    pub is_portrait: bool,
    pub face_boxes: Vec<FaceBoundingBox>,
    pub face_tags: Vec<String>,
}

pub struct FaceDetector;

impl FaceDetector {
    pub fn detect_faces(img: &DynamicImage) -> FaceDetectionReport {
        let (width, height) = img.dimensions();
        let mut skin_mask = vec![vec![false; height as usize]; width as usize];

        // Step 1: Skin tone color space filtering (YCbCr / RGB bounds)
        let mut skin_pixel_count = 0u64;

        for y in 0..height {
            for x in 0..width {
                let p = img.get_pixel(x, y);
                let r = p[0] as f32;
                let g = p[1] as f32;
                let b = p[2] as f32;

                // Standard RGB skin tone rule: R > 95, G > 40, B > 20, R > G, R > B, |R-G| > 15
                let is_skin = r > 95.0
                    && g > 40.0
                    && b > 20.0
                    && (r - g).abs() > 15.0
                    && r > g
                    && r > b;

                if is_skin {
                    skin_mask[x as usize][y as usize] = true;
                    skin_pixel_count += 1;
                }
            }
        }

        let total_pixels = (width as u64) * (height as u64);
        let skin_ratio = skin_pixel_count as f32 / total_pixels.max(1) as f32;

        // Step 2: Flood fill connected components to detect facial region clusters
        let mut visited = vec![vec![false; height as usize]; width as usize];
        let mut face_boxes = Vec::new();

        for y in 0..height {
            for x in 0..width {
                if skin_mask[x as usize][y as usize] && !visited[x as usize][y as usize] {
                    let mut component = Vec::new();
                    let mut stack = vec![(x, y)];
                    visited[x as usize][y as usize] = true;

                    let mut min_x = x;
                    let mut max_x = x;
                    let mut min_y = y;
                    let mut max_y = y;

                    while let Some((cx, cy)) = stack.pop() {
                        component.push((cx, cy));
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
                            if nx < width && ny < height && !visited[nx as usize][ny as usize] && skin_mask[nx as usize][ny as usize] {
                                visited[nx as usize][ny as usize] = true;
                                stack.push((nx, ny));
                            }
                        }
                    }

                    let fw = max_x - min_x + 1;
                    let fh = max_y - min_y + 1;
                    let aspect = fh as f32 / (fw as f32).max(1.0);

                    // Face geometry heuristic: aspect ratio between 1.0 and 1.8, min size
                    if component.len() > 150 && fw >= 20 && fh >= 20 && aspect >= 0.8 && aspect <= 2.0 {
                        let face_crop_hash = Self::compute_face_embedding(img, min_x, min_y, fw, fh);
                        face_boxes.push(FaceBoundingBox {
                            x: min_x,
                            y: min_y,
                            width: fw,
                            height: fh,
                            confidence: 0.85,
                            embedding_hash: face_crop_hash,
                        });
                    }
                }
            }
        }

        let faces_detected = face_boxes.len();
        let is_portrait = faces_detected > 0 || skin_ratio > 0.25;

        let mut tags = Vec::new();
        if faces_detected > 0 {
            tags.push("#face_detected".to_string());
            tags.push(format!("#face_count_{}", faces_detected));
            tags.push("👤 #person_portrait".to_string());
            for (idx, b) in face_boxes.iter().enumerate() {
                tags.push(format!("#face_id_{:016x}", b.embedding_hash));
                tags.push(format!("#face_cluster_box_{}_{}_{}", idx, b.x, b.y));
            }
        }

        FaceDetectionReport {
            faces_detected,
            is_portrait,
            face_boxes,
            face_tags: tags,
        }
    }

    /// Compute a normalized 64-bit spatial intensity & aspect ratio feature embedding for facial matching
    pub fn compute_face_embedding(img: &DynamicImage, x: u32, y: u32, w: u32, h: u32) -> u64 {
        let mut hash: u64 = 0;
        if w == 0 || h == 0 { return 0; }
        
        // Sample an 8x8 grid inside the detected face bounding box
        let cell_w = (w as f32 / 8.0).max(1.0);
        let cell_h = (h as f32 / 8.0).max(1.0);
        let mut intensities = [0u8; 64];

        for gy in 0..8 {
            for gx in 0..8 {
                let px = (x as f32 + (gx as f32 + 0.5) * cell_w).min(img.dimensions().0 as f32 - 1.0) as u32;
                let py = (y as f32 + (gy as f32 + 0.5) * cell_h).min(img.dimensions().1 as f32 - 1.0) as u32;
                let pixel = img.get_pixel(px, py);
                // Grayscale luminance formula: Y = 0.299R + 0.587G + 0.114B
                let lum = (0.299 * pixel[0] as f32 + 0.587 * pixel[1] as f32 + 0.114 * pixel[2] as f32) as u8;
                intensities[gy * 8 + gx] = lum;
            }
        }

        let average_luminance: u32 = intensities.iter().map(|&v| v as u32).sum::<u32>() / 64;

        for (i, &lum) in intensities.iter().enumerate() {
            if (lum as u32) >= average_luminance {
                hash |= 1 << i;
            }
        }

        hash
    }

    /// Calculate Hamming distance score (0..=64) between two face embedding hashes
    pub fn match_faces(hash1: u64, hash2: u64) -> f32 {
        let difference_bits = (hash1 ^ hash2).count_ones();
        let match_score = 1.0 - (difference_bits as f32 / 64.0);
        match_score
    }
}

use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvgConversionResult {
    pub width: u32,
    pub height: u32,
    pub path_count: usize,
    pub svg_xml: String,
}

pub struct VectorizerEngine;

impl VectorizerEngine {
    pub fn convert_to_svg(img: &DynamicImage, color_threshold: u8) -> SvgConversionResult {
        let (width, height) = img.dimensions();
        let gray = img.to_luma8();

        let mut svg_paths = Vec::new();
        let mut visited = vec![vec![false; height as usize]; width as usize];

        // Trace contours of regions based on luminance thresholding
        for y in 0..height {
            for x in 0..width {
                if !visited[x as usize][y as usize] {
                    let pixel_value = gray.get_pixel(x, y)[0];
                    let is_foreground = pixel_value < color_threshold;

                    // Trace region
                    let mut region_points = Vec::new();
                    let mut stack = vec![(x, y)];
                    visited[x as usize][y as usize] = true;

                    while let Some((cx, cy)) = stack.pop() {
                        region_points.push((cx, cy));

                        let neighbors = [
                            (cx.wrapping_sub(1), cy),
                            (cx + 1, cy),
                            (cx, cy.wrapping_sub(1)),
                            (cx, cy + 1),
                        ];

                        for &(nx, ny) in &neighbors {
                            if nx < width && ny < height && !visited[nx as usize][ny as usize] {
                                let neighbour_value = gray.get_pixel(nx, ny)[0];
                                let neighbour_is_foreground = neighbour_value < color_threshold;
                                if neighbour_is_foreground == is_foreground {
                                    visited[nx as usize][ny as usize] = true;
                                    stack.push((nx, ny));
                                }
                            }
                        }
                    }

                    if is_foreground && region_points.len() > 4 {
                        // Extract boundary points for SVG path building
                        let mut min_x = width;
                        let mut max_x = 0;
                        let mut min_y = height;
                        let mut max_y = 0;

                        for &(px, py) in &region_points {
                            min_x = min_x.min(px);
                            max_x = max_x.max(px);
                            min_y = min_y.min(py);
                            max_y = max_y.max(py);
                        }

                        let w = max_x - min_x + 1;
                        let h = max_y - min_y + 1;

                        // Create smooth SVG path rect / rounded contour representation
                        let path_d = format!(
                            "M {} {} L {} {} L {} {} L {} {} Z",
                            min_x, min_y,
                            min_x + w, min_y,
                            min_x + w, min_y + h,
                            min_x, min_y + h
                        );
                        let fill_color = format!("#{:02x}{:02x}{:02x}", pixel_value, pixel_value, pixel_value);
                        svg_paths.push((path_d, fill_color));
                    }
                }
            }
        }

        let mut svg_xml = format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {} {}\" width=\"{}\" height=\"{}\">\n",
            width, height, width, height
        );
        svg_xml.push_str("  <style>path { stroke-linecap: round; stroke-linejoin: round; }</style>\n");
        for (d, color) in &svg_paths {
            svg_xml.push_str(&format!("  <path d=\"{}\" fill=\"{}\" stroke=\"{}\" stroke-width=\"0.5\" />\n", d, color, color));
        }
        svg_xml.push_str("</svg>\n");

        SvgConversionResult {
            width,
            height,
            path_count: svg_paths.len(),
            svg_xml,
        }
    }
}

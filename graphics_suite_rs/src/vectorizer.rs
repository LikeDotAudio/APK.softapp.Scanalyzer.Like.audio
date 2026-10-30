use image::{DynamicImage, GenericImageView};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SvgConversionResult {
    pub width: u32,
    pub height: u32,
    /// One `<path>` per dark region (its outline plus any holes).
    pub path_count: usize,
    pub svg_xml: String,
}

pub struct VectorizerEngine;

/// Regions of this many pixels or fewer are dropped as speckle.
const MIN_REGION_PIXELS: usize = 4;

impl VectorizerEngine {
    /// Threshold the image on luminance (`< color_threshold` is ink), find each 4-connected
    /// dark region, and trace its boundary along pixel edges: the outer outline and every
    /// hole become closed sub-paths of one `<path>` filled with `fill-rule="evenodd"`, so the
    /// SVG reproduces the region's pixel shape exactly (a stair-step outline, not a smoothed
    /// curve — `svg_vectorizer.py`'s vtracer is the spline tracer).
    pub fn convert_to_svg(img: &DynamicImage, color_threshold: u8) -> SvgConversionResult {
        let (width, height) = img.dimensions();
        let gray = img.to_luma8();
        let (w, h) = (width as usize, height as usize);
        let ink = |x: usize, y: usize| gray.get_pixel(x as u32, y as u32)[0] < color_threshold;

        // label[y * w + x] = region id + 1 for ink pixels, 0 for background / not yet seen
        let mut label = vec![0u32; w * h];
        let mut svg_paths = Vec::new();
        let mut next_id = 0u32;

        for y in 0..h {
            for x in 0..w {
                if label[y * w + x] != 0 || !ink(x, y) {
                    continue;
                }
                next_id += 1;
                let id = next_id;
                let seed_value = gray.get_pixel(x as u32, y as u32)[0];

                // flood-fill the region (4-connected)
                let mut pixels = Vec::new();
                let mut stack = vec![(x, y)];
                label[y * w + x] = id;
                while let Some((cx, cy)) = stack.pop() {
                    pixels.push((cx, cy));
                    let mut visit = |nx: usize, ny: usize, stack: &mut Vec<(usize, usize)>| {
                        if label[ny * w + nx] == 0 && ink(nx, ny) {
                            label[ny * w + nx] = id;
                            stack.push((nx, ny));
                        }
                    };
                    if cx > 0 { visit(cx - 1, cy, &mut stack); }
                    if cx + 1 < w { visit(cx + 1, cy, &mut stack); }
                    if cy > 0 { visit(cx, cy - 1, &mut stack); }
                    if cy + 1 < h { visit(cx, cy + 1, &mut stack); }
                }
                if pixels.len() <= MIN_REGION_PIXELS {
                    continue;
                }

                let inside = |px: isize, py: isize| {
                    px >= 0 && py >= 0 && (px as usize) < w && (py as usize) < h
                        && label[py as usize * w + px as usize] == id
                };
                let d = trace_boundary(&pixels, inside);
                let fill = format!("#{:02x}{:02x}{:02x}", seed_value, seed_value, seed_value);
                svg_paths.push((d, fill));
            }
        }

        let mut svg_xml = format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {} {}\" width=\"{}\" height=\"{}\">\n",
            width, height, width, height
        );
        for (d, color) in &svg_paths {
            svg_xml.push_str(&format!("  <path d=\"{}\" fill=\"{}\" fill-rule=\"evenodd\" />\n", d, color));
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

/// Every pixel side that faces a non-region pixel is one directed unit edge on the pixel
/// grid, oriented clockwise around the ink. Chaining the edges end-to-start yields closed
/// loops — the outer outline and the holes. Under the even-odd rule the filled area depends
/// only on the set of edges, not on how loops are split where two corners touch, so the
/// result is exact. Collinear runs are merged so a straight side is one segment.
fn trace_boundary(pixels: &[(usize, usize)], inside: impl Fn(isize, isize) -> bool) -> String {
    type P = (i64, i64);
    let mut out: HashMap<P, Vec<P>> = HashMap::new();
    let mut edge_count = 0usize;
    for &(x, y) in pixels {
        let (xi, yi) = (x as isize, y as isize);
        let (x, y) = (x as i64, y as i64);
        if !inside(xi, yi - 1) { out.entry((x, y)).or_default().push((x + 1, y)); edge_count += 1; }
        if !inside(xi + 1, yi) { out.entry((x + 1, y)).or_default().push((x + 1, y + 1)); edge_count += 1; }
        if !inside(xi, yi + 1) { out.entry((x + 1, y + 1)).or_default().push((x, y + 1)); edge_count += 1; }
        if !inside(xi - 1, yi) { out.entry((x, y + 1)).or_default().push((x, y)); edge_count += 1; }
    }

    // deterministic start order: walk loops from the smallest remaining vertex
    let mut starts: Vec<P> = out.keys().copied().collect();
    starts.sort_by_key(|&(x, y)| (y, x));

    let mut d = String::new();
    let mut used = 0usize;
    for start in starts {
        while let Some(next) = out.get_mut(&start).and_then(|v| v.pop()) {
            let mut loop_pts = vec![start];
            let mut cur = next;
            used += 1;
            while cur != start {
                loop_pts.push(cur);
                cur = match out.get_mut(&cur).and_then(|v| v.pop()) {
                    Some(n) => n,
                    None => break, // cannot happen on a closed boundary; stop rather than spin
                };
                used += 1;
            }
            let pts = drop_collinear(&loop_pts);
            if pts.len() < 3 {
                continue;
            }
            d.push_str(&format!("M {} {}", pts[0].0, pts[0].1));
            for p in &pts[1..] {
                d.push_str(&format!(" L {} {}", p.0, p.1));
            }
            d.push_str(" Z ");
        }
    }
    debug_assert_eq!(used, edge_count);
    d.trim_end().to_string()
}

/// Remove vertices that lie on a straight line between their neighbours (closed loop).
fn drop_collinear(pts: &[(i64, i64)]) -> Vec<(i64, i64)> {
    let n = pts.len();
    (0..n)
        .filter(|&i| {
            let (a, b, c) = (pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n]);
            (b.0 - a.0) * (c.1 - b.1) != (b.1 - a.1) * (c.0 - b.0)
        })
        .map(|i| pts[i])
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, Luma};

    fn img(w: u32, h: u32, ink: &[(u32, u32)]) -> DynamicImage {
        let mut g = GrayImage::from_pixel(w, h, Luma([255]));
        for &(x, y) in ink {
            g.put_pixel(x, y, Luma([0]));
        }
        DynamicImage::ImageLuma8(g)
    }

    #[test]
    fn an_l_shape_is_traced_as_an_l_not_its_bounding_box() {
        // 3x3 L: left column + bottom row
        let r = VectorizerEngine::convert_to_svg(&img(5, 5, &[(1, 1), (1, 2), (1, 3), (2, 3), (3, 3)]), 128);
        assert_eq!(r.path_count, 1);
        // six corners, not the four of a rectangle
        assert!(r.svg_xml.contains("M 1 1 L 2 1 L 2 3 L 4 3 L 4 4 L 1 4 Z"), "{}", r.svg_xml);
    }

    #[test]
    fn a_ring_keeps_its_hole() {
        let mut ink = Vec::new();
        for y in 0..4 { for x in 0..4 { if !(x == 1 || x == 2) || !(y == 1 || y == 2) { ink.push((x, y)); } } }
        let r = VectorizerEngine::convert_to_svg(&img(4, 4, &ink), 128);
        assert_eq!(r.path_count, 1);
        assert_eq!(r.svg_xml.matches(" Z").count(), 2, "outline + hole: {}", r.svg_xml);
        assert!(r.svg_xml.contains("fill-rule=\"evenodd\""));
    }

    #[test]
    fn speckle_is_dropped() {
        let r = VectorizerEngine::convert_to_svg(&img(4, 4, &[(0, 0), (3, 3)]), 128);
        assert_eq!(r.path_count, 0);
    }
}

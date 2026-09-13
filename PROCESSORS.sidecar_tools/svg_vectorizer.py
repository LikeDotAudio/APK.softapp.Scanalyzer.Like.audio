#!/usr/bin/env python3
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""STAGE 3 OF Folder-ScanAnalyzer: the raster-to-vector pass.

Owns: `<image>.svg` -- vtracer's spline trace of one raster, which is what the
Web_Front's SVG Vector overlay draws over the original.

Must not: guess its target (see sidecar_generator.py's contract for why).

Skips an existing non-empty .svg rather than re-tracing. Unlike stage 2 this
cache is NOT mtime-keyed: tracing is the most expensive thing in the pipeline
and a spurious re-run costs minutes per thousand files. Delete the .svg to
force a retrace.

The trace parameters below are one tuned set, not defaults -- filter_speckle 4
and color_precision 6 were chosen against scanned engineering drawings, where
the speckle is scanner noise and the palette is nearly binary.
"""

import sys
import os
import time
from pathlib import Path
import vtracer

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tif', '.tiff'}

def convert_single_image_to_svg(image_path: Path) -> str:
    svg_path = image_path.with_suffix('.svg')
    
    # Skip if SVG already exists and is non-empty
    if svg_path.exists() and svg_path.stat().st_size > 0:
        return "cached"

    try:
        vtracer.convert_image_to_svg_py(
            str(image_path),
            str(svg_path),
            colormode='color',
            hierarchical='stacked',
            mode='spline',
            filter_speckle=4,
            color_precision=6,
            layer_difference=16,
            corner_threshold=60,
            length_threshold=4.0,
            max_iterations=10,
            splice_threshold=45,
            path_precision=3
        )
        return "created"
    except Exception as e:
        return f"error: {e}"

def run_batch_svg_conversion(target_directory: str):
    root = Path(target_directory)
    if not root.exists():
        print(f"Error: Target path '{target_directory}' does not exist.")
        return

    print("==================================================")
    print("📐 High-Performance Batch Raster-to-SVG Vectorizer (Rust vtracer)")
    print(f"Target Directory: {root.resolve()}")
    print("==================================================")

    images = [
        p for p in root.rglob('*')
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS and not p.name.endswith('.json')
    ]
    print(f"Found {len(images)} raster images to trace into SVG vectors.")

    created = 0
    cached = 0
    errors = 0
    start_time = time.time()

    for position, image_path in enumerate(images, 1):
        status = convert_single_image_to_svg(image_path)
        if status == "created":
            created += 1
            if created % 50 == 0 or created == 1:
                print(f"[{position}/{len(images)}] 📐 [SVG Created] {image_path.name}.svg")
        elif status == "cached":
            cached += 1
            if position % 2500 == 0 or position == len(images):
                print(f"[{position}/{len(images)}] ⏩ [Cached SVG] {cached} vectors up-to-date")
        else:
            errors += 1
            print(f"[{position}/{len(images)}] ❌ {image_path.name}: {status}")

    elapsed = time.time() - start_time
    print("\n==========================================")
    print("BATCH RASTER-TO-SVG VECTORIZATION COMPLETE")
    print(f"Total Raster Images : {len(images)}")
    print(f"SVG Vectors Created : {created}")
    print(f"SVG Vectors Cached  : {cached}")
    print(f"Errors              : {errors}")
    print(f"Total Processing Time: {elapsed:.2f} seconds")
    print("==========================================")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit("usage: svg_vectorizer.py <TARGET_DIR>   (no default — see the contract above)")
    run_batch_svg_conversion(sys.argv[1])

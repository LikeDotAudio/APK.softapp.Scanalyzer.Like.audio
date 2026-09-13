#!/usr/bin/env python3
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""STAGE 3 OF Folder-ScanAnalyzer: the OCR sidecar.

Owns: `<image>.ocr.json` -- the transcript EasyOCR reads off one raster, plus
the dimensions and the MANUAL_DOCUMENT flag the front end filters on.

Must not: guess its target (see sidecar_generator.py's contract for why).

SINGLE-THREADED ON PURPOSE. EasyOCR holds a torch model per reader; one reader
is built once here and reused for the whole run. Handing this to a thread pool
builds a model per worker and exhausts memory long before it goes faster --
which is why this is the one stage that does not look like the others.

Degrades rather than fails: with easyocr absent the sidecar is still written,
with an empty `ocr_text`. A corpus that has been walked with no OCR available is
a corpus with sidecars saying so, not a corpus with no sidecars.
"""

import sys
import os
import json
import time
from pathlib import Path
from PIL import Image, ExifTags

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tif', '.tiff'}

def process_image_ocr(image_path: str) -> str:
    path = Path(image_path)
    ocr_sidecar = path.with_suffix(path.suffix + '.ocr.json')

    # Smart Cache Check: skip if sidecar exists, non-empty, and newer than source
    if ocr_sidecar.exists() and ocr_sidecar.stat().st_size > 0:
        if ocr_sidecar.stat().st_mtime >= path.stat().st_mtime:
            return "cached"

    try:
        image = Image.open(path)
        ocr_text = ""

        # Run OCR
        try:
            import easyocr
            # Global or per-worker reader
            if not hasattr(process_image_ocr, 'reader'):
                process_image_ocr.reader = easyocr.Reader(['en'], gpu=False)
            results = process_image_ocr.reader.readtext(str(path))
            lines = [res[1] for res in results if res[1].strip()]
            ocr_text = "\n".join(lines)
        except Exception as e:
            ocr_text = ""

        is_manual = "manual" in path.name.lower() or "manuals" in path.name.lower()

        data = {
            "filename": path.name,
            "relative_path": str(path),
            "width": image.size[0],
            "height": image.size[1],
            "format": image.format,
            "is_manual": is_manual,
            "special_flag": "MANUAL_DOCUMENT" if is_manual else None,
            "ocr_text": ocr_text
        }

        with open(ocr_sidecar, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

        return "created"
    except Exception as e:
        return f"error: {e}"

def run_relentless_ocr(target_directory: str):
    root = Path(target_directory)
    if not root.exists():
        print(f"Error: Path '{target_directory}' does not exist.")
        return

    print("==================================================")
    print("🔥 RELENTLESS BATCH OCR ENGINE (Multi-Core Processing)")
    print(f"Target Directory: {root.resolve()}")
    print("==================================================")

    print("Scanning directory tree for all image files...")
    images = [
        p for p in root.rglob('*')
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS and not p.name.endswith('.json')
    ]
    print(f"Found {len(images)} images to process for OCR.")

    created = 0
    cached = 0
    errors = 0
    start_time = time.time()

    # Pre-initialize EasyOCR model once
    try:
        import easyocr
        print("🚀 Initializing EasyOCR open-source neural engine...")
        process_image_ocr.reader = easyocr.Reader(['en'], gpu=False)
    except Exception as e:
        print(f"Notice: {e}")

    for position, image_path in enumerate(images, 1):
        status = process_image_ocr(str(image_path))
        if status == "created":
            created += 1
            print(f"[{position}/{len(images)}] ✅ [OCR Created] {image_path.name}")
        elif status == "cached":
            cached += 1
            if position % 1000 == 0 or position == len(images):
                print(f"[{position}/{len(images)}] ⏩ [Cached] {cached} images up-to-date")
        else:
            errors += 1
            print(f"[{position}/{len(images)}] ❌ {image_path.name}: {status}")

    elapsed = time.time() - start_time
    print("\n==========================================")
    print("RELENTLESS BATCH OCR COMPLETE")
    print(f"Total Images    : {len(images)}")
    print(f"OCR Created     : {created}")
    print(f"OCR Cached      : {cached}")
    print(f"Errors          : {errors}")
    print(f"Total Time      : {elapsed:.2f} seconds")
    print("==========================================")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit("usage: ocr_sidecar.py <TARGET_DIR>   (no default — see the contract above)")
    run_relentless_ocr(sys.argv[1])

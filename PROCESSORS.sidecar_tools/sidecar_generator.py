#!/usr/bin/env python3
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""STAGE 2 OF Folder-ScanAnalyzer: one metadata sidecar per file.

Owns: writing `<file>.exif.json` beside every image and `<file>.meta.json`
beside everything else -- size, mtime, extension, filename word tokens, the
MANUAL_DOCUMENT flag, and for images the dimensions, mode and decoded EXIF.

Must not: re-do work. A sidecar newer than its source is left alone, which is
what makes a second pass over a 50,000-file corpus cheap. That cache is keyed on
mtime, so TOUCHING a source re-analyses it and editing a sidecar by hand does
not survive the next run.

Must not: guess its target. Every tool in this folder takes the directory as
argv[1] with no default -- the ported originals defaulted to one client's
corpus two levels up, so running them anywhere else silently analysed the wrong
tree. CLAUDE.md §5 names that shape as the cause of three production outages.

Never reads a file's pixels for anything but size/mode: OCR is ocr_sidecar.py
and vectorization is svg_vectorizer.py, both stage 3.
"""

import sys
import os
import json
import time
from pathlib import Path
from PIL import Image, ExifTags
from concurrent.futures import ThreadPoolExecutor, as_completed

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.bmp', '.webp', '.tif', '.tiff'}

def extract_human_exif(image: Image.Image) -> dict:
    exif_tags = {}
    try:
        raw_exif = image._getexif() if hasattr(image, '_getexif') else None
        if raw_exif:
            for tag_id, value in raw_exif.items():
                tag_name = ExifTags.TAGS.get(tag_id, f"Tag_{tag_id}")
                if isinstance(value, bytes):
                    try:
                        value = value.decode('utf-8', errors='ignore').strip('\x00')
                    except Exception:
                        value = str(value)
                elif isinstance(value, tuple):
                    value = [str(v) for v in value]
                exif_tags[tag_name] = str(value)
    except Exception:
        pass
    return exif_tags

def extract_word_tokens(name: str) -> list:
    return [w.lower() for w in name.replace('.', ' ').replace('_', ' ').replace('-', ' ').split() if len(w) > 1]

def is_sidecar_up_to_date(source_path: Path, sidecar_path: Path) -> bool:
    if not sidecar_path.exists():
        return False
    try:
        sidecar_status = sidecar_path.stat()
        source_status = source_path.stat()
        return sidecar_status.st_size > 0 and sidecar_status.st_mtime >= source_status.st_mtime
    except Exception:
        return False

def process_single_file(path: Path) -> str:
    if path.name.endswith('.json') or path.name.endswith('.ocr.json') or path.name.endswith('.exif.json') or path.name.endswith('.meta.json'):
        return "skip"

    extension = path.suffix.lower()
    is_manual = "manual" in path.name.lower() or "manuals" in path.name.lower()
    special_flag = "MANUAL_DOCUMENT" if is_manual else None

    try:
        status = path.stat()
        file_facts = {
            "filename": path.name,
            "relative_path": str(path),
            "extension": extension,
            "size_bytes": status.st_size,
            "modified_time": time.ctime(status.st_mtime),
            "is_manual": is_manual,
            "special_flag": special_flag,
            "word_tokens": extract_word_tokens(path.stem)
        }

        if extension in IMAGE_EXTENSIONS:
            exif_sidecar_path = path.with_suffix(path.suffix + '.exif.json')
            
            if is_sidecar_up_to_date(path, exif_sidecar_path):
                # Ensure existing sidecar updated if missing is_manual flag
                try:
                    with open(exif_sidecar_path, 'r', encoding='utf-8') as f:
                        existing = json.load(f)
                    if "is_manual" not in existing or existing["is_manual"] != is_manual:
                        existing["is_manual"] = is_manual
                        existing["special_flag"] = special_flag
                        with open(exif_sidecar_path, 'w', encoding='utf-8') as f:
                            json.dump(existing, f, indent=2)
                except Exception:
                    pass
                return "up_to_date"

            try:
                with Image.open(path) as image:
                    exif_tags = extract_human_exif(image)
                    file_facts["width"] = image.size[0]
                    file_facts["height"] = image.size[1]
                    file_facts["format"] = image.format
                    file_facts["mode"] = image.mode
                    file_facts["exif"] = exif_tags

                with open(exif_sidecar_path, 'w', encoding='utf-8') as f:
                    json.dump(file_facts, f, indent=2)
            except Exception as e:
                file_facts["image_error"] = str(e)
                with open(exif_sidecar_path, 'w', encoding='utf-8') as f:
                    json.dump(file_facts, f, indent=2)
        else:
            meta_sidecar_path = path.with_suffix(path.suffix + '.meta.json')
            
            if is_sidecar_up_to_date(path, meta_sidecar_path):
                try:
                    with open(meta_sidecar_path, 'r', encoding='utf-8') as f:
                        existing = json.load(f)
                    if "is_manual" not in existing or existing["is_manual"] != is_manual:
                        existing["is_manual"] = is_manual
                        existing["special_flag"] = special_flag
                        with open(meta_sidecar_path, 'w', encoding='utf-8') as f:
                            json.dump(existing, f, indent=2)
                except Exception:
                    pass
                return "up_to_date"

            with open(meta_sidecar_path, 'w', encoding='utf-8') as f:
                json.dump(file_facts, f, indent=2)

        return "created"
    except Exception as failure:
        # The reason travels with the verdict. This used to return a bare
        # "error", and a rename that turned path.stat() into path.status()
        # made EVERY file fail while the summary — which did not print the
        # error count at all — read as a clean run.
        return f"error: {type(failure).__name__}: {failure}"

def generate_all_sidecars(target_directory: str):
    root = Path(target_directory)
    if not root.exists():
        print(f"Error: Target path '{target_directory}' does not exist.")
        return

    print("==================================================")
    print("🚀 Smart Sidecar Generator (With MANUAL_DOCUMENT Special Flag)")
    print(f"Target Directory: {root.resolve()}")
    print("==================================================")

    print("Scanning directory tree for all files...")
    all_files = [
        p for p in root.rglob('*')
        if p.is_file() and not (p.name.endswith('.json') or p.name.endswith('.ocr.json') or p.name.endswith('.exif.json') or p.name.endswith('.meta.json'))
    ]
    print(f"Found {len(all_files)} target source files.")

    created = 0
    up_to_date = 0
    errors = 0
    first_failures: list[str] = []
    manual_count = 0

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=16) as executor:
        futures = {executor.submit(process_single_file, p): p for p in all_files}
        for position, future in enumerate(as_completed(futures), 1):
            p = futures[future]
            if "manual" in p.name.lower():
                manual_count += 1
            result = future.result()
            if result == "created":
                created += 1
            elif result == "up_to_date":
                up_to_date += 1
            elif result == "skip":
                pass
            else:
                errors += 1
                if len(first_failures) < 5:
                    first_failures.append(f"{p.name}: {result}")

            if position % 5000 == 0 or position == len(all_files):
                elapsed = time.time() - start_time
                print(f"[{position}/{len(all_files)}] Processed... ({created} created, {up_to_date} cached, {manual_count} MANUAL flagged, {elapsed:.1f}s)", flush=True)

    print("\n==========================================")
    print("SMART SIDECAR GENERATION COMPLETE")
    print(f"Total Source Files    : {len(all_files)}")
    print(f"Manual Flagged Files  : {manual_count}")
    print(f"Sidecars Created      : {created}")
    print(f"Sidecars Up-To-Date   : {up_to_date}")
    print(f"Errors                : {errors}")
    for failure in first_failures:
        print(f"  ! {failure}")
    if errors > len(first_failures):
        print(f"  ... and {errors - len(first_failures)} more")
    print(f"Total Processing Time : {time.time() - start_time:.2f} seconds")
    print("==========================================")

    # A run in which NOTHING succeeded is a failed run, not a quiet one. Without
    # this the caller sees exit 0 over a corpus that produced no sidecars at all.
    if all_files and created == 0 and up_to_date == 0:
        raise SystemExit(f"no sidecar was written for any of {len(all_files)} file(s)")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit("usage: sidecar_generator.py <TARGET_DIR>   (no default — see the contract above)")
    generate_all_sidecars(sys.argv[1])

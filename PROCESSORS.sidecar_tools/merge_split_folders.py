#!/usr/bin/env python3
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""INTAKE UTILITY: rejoin one archive that arrived split across many folders.

Owns: merging `<pattern>` sibling directories into one destination tree, which
is the shape a large Google Takeout / Drive export arrives in -- one corpus cut
into 35 numbered folders, each holding a partial copy of the same hierarchy.

Not part of the scan pipeline. It runs BEFORE stage 1, once, to turn N folders
into the one folder the scanner is then pointed at.

DESTRUCTIVE, and deliberately so: it MOVES rather than copies (an export this
size will not fit twice on the disk that holds it) and removes each split folder
once drained. On a filename collision the LARGER file wins and the smaller is
deleted -- a truncated partial download is the collision this actually sees.
Run it with --dry-run first; that is why --dry-run exists.

Must not: guess. The source pattern and the destination are both required
arguments. The ported original hardcoded one client's 35-folder glob.
"""

import argparse
import os
import shutil
import glob
from pathlib import Path


def merge_directories(pattern: str, target_directory: Path, inner: str | None, dry_run: bool) -> None:
    split_dirs = sorted(glob.glob(pattern))
    if not split_dirs:
        raise SystemExit(f"no directories matched {pattern!r} — nothing to merge")

    print(f"Found {len(split_dirs)} split folders to merge into {target_directory}...")
    if dry_run:
        print("DRY RUN — nothing is moved, nothing is deleted.")

    if not dry_run:
        target_directory.mkdir(parents=True, exist_ok=True)

    moved_files = 0
    skipped_files = 0
    merged_dirs = 0

    for index, split in enumerate(split_dirs, 1):
        split_path = Path(split)
        if split_path.resolve() == target_directory.resolve():
            print(f"[{index}/{len(split_dirs)}] skipping {split_path.name} — it IS the destination")
            continue

        # An export often nests one more copy of the corpus name inside each
        # split. Descend into it when it is there so the merge does not create
        # 35 identical subfolders in the destination.
        source_sub = split_path / inner if inner else None
        source_root = source_sub if source_sub and source_sub.exists() else split_path

        print(f"[{index}/{len(split_dirs)}] Merging: {split_path.name}...")

        for root, _dirs, files in os.walk(source_root):
            rel_path = Path(root).relative_to(source_root)
            destination_directory = target_directory / rel_path
            if not dry_run:
                destination_directory.mkdir(parents=True, exist_ok=True)

            for f in files:
                source_file = Path(root) / f
                destination_file = destination_directory / f

                if not destination_file.exists():
                    if not dry_run:
                        shutil.move(str(source_file), str(destination_file))
                    moved_files += 1
                elif source_file.stat().st_size > destination_file.stat().st_size:
                    # The larger of two same-named files wins: the collision this
                    # actually sees is a truncated partial download.
                    if not dry_run:
                        shutil.move(str(source_file), str(destination_file))
                    moved_files += 1
                else:
                    if not dry_run:
                        source_file.unlink()
                    skipped_files += 1

        merged_dirs += 1
        if not dry_run:
            shutil.rmtree(split_path, ignore_errors=True)

    print("\n=======================================================")
    print(f" {'Would merge' if dry_run else 'Successfully merged'} {merged_dirs} split directories!")
    print(f"   • Total Files Moved/Merged : {moved_files}")
    print(f"   • Duplicate Files Handled  : {skipped_files}")
    print(f"   • Destination Master Path  : {target_directory}")
    print("=======================================================\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("pattern", help="glob matching the split folders, e.g. 'Corpus-2026*-1-*'")
    parser.add_argument("target", type=Path, help="destination folder the splits are merged into")
    parser.add_argument("--inner", default=None,
                        help="subfolder name to descend into inside each split, when the export nests one")
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would move without moving or deleting anything")
    args = parser.parse_args()
    merge_directories(args.pattern, args.target, args.inner, args.dry_run)


if __name__ == "__main__":
    main()

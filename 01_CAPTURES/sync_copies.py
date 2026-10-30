#!/usr/bin/env python3
# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""Keep the CAPTURE.* repositories' copies of Scanalyzer source in step.

CAPTURE.FolderScanner, .Document, .FaceID, .Image, .OCR, .Schematics and
.Vectorizer each publish files that are compiled HERE, in the Scanalyzer; a fix
made in one place used to have to be made in the other by hand, and nothing
noticed when it was not (LOOSE-capture-folderscanner-capturefolderscanner-
capturedocument-capturefaceid). `copies.tsv` beside this file names every pair;
the Scanalyzer side is the source of truth.

    python3 sync_copies.py --check   # exit 1 and name every drifted copy
    python3 sync_copies.py --write   # copy each Scanalyzer file over its CAPTURE copy

The CAPTURE repos are reached through this folder's symlinks; a checkout
without them (a lone clone of the Scanalyzer) has nothing to compare, and says so.
"""
import argparse
import pathlib
import shutil
import sys

HERE = pathlib.Path(__file__).resolve().parent
SCANALYZER = HERE.parent
MANIFEST = HERE / "copies.tsv"


def pairs():
    for n, line in enumerate(MANIFEST.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        copy, _, source = line.partition("\t")
        if not source:
            sys.exit(f"copies.tsv:{n}: expected '<copy>\\t<source>'")
        yield HERE / copy.strip(), SCANALYZER / source.strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = ap.parse_args()

    drift, missing, absent_repos, checked = [], [], set(), 0
    for copy, source in pairs():
        repo = copy.relative_to(HERE).parts[0]
        if not (HERE / repo).is_dir():
            absent_repos.add(repo)
            continue
        if not source.is_file():
            missing.append(str(source.relative_to(SCANALYZER)))
            continue
        checked += 1
        if copy.is_file() and copy.read_bytes() == source.read_bytes():
            continue
        if args.write:
            shutil.copyfile(source, copy)
            print(f"wrote {copy.relative_to(HERE)}  <- {source.relative_to(SCANALYZER)}")
        else:
            drift.append(f"{copy.relative_to(HERE)} != {source.relative_to(SCANALYZER)}")

    for repo in sorted(absent_repos):
        print(f"skip {repo}: not checked out beside the Scanalyzer")
    for m in missing:
        print(f"MISSING source {m} — copies.tsv names a file the Scanalyzer no longer has")
    for d in drift:
        print(f"DRIFT {d}")
    print(f"{checked} cop{'y' if checked == 1 else 'ies'} compared, {len(drift)} drifted, {len(missing)} missing")
    return 1 if (drift or missing) else 0


if __name__ == "__main__":
    sys.exit(main())

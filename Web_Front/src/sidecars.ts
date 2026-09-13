// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
//
// The sidecars a scan left in the folder, paired back to the files they describe.
//
// THE CORPUS IS THE DATABASE. `main.py scan` writes a metadata sidecar beside
// every file it walks — `<file>.meta.json`, `<file>.exif.json`, `<file>.ocr.json`
// and a traced `<file-stem>.svg` — so opening that folder later should be a READ,
// not a re-analysis. This module is the half that makes that true in the browser.
//
// It replaces a `continue`. The folder picker used to DROP every `*.exif.json`
// and `*.meta.json` on sight and never looked at them again, so the engine's work
// reached the screen only if the browser redid it: EXIF was re-parsed per click,
// and OCR text that was already on disk was invisible. `.ocr.json` was not even in
// that skip list, so OCR sidecars arrived as their own junk rows in the tree.
//
// PAIRING IS BY SUFFIX, NOT BY STEM, and the difference matters. The generator
// appends to the WHOLE filename — `drawing.png` becomes `drawing.png.exif.json` —
// so the source is recovered by removing the suffix, and `notes.txt.meta.json`
// pairs with `notes.txt` rather than with a `notes.png` sitting beside it. The
// traced SVG is the one exception: vtracer replaces the extension rather than
// appending, so `drawing.png` traces to `drawing.svg`, and that one is matched on
// the stem — which means a hand-drawn `drawing.svg` a person put there is
// indistinguishable from a trace. It is reported as `traced` either way, and the
// front end says "SVG beside it" rather than claiming the scanner made it.
//
// An unpaired sidecar is kept, not discarded: a `.meta.json` whose source is gone
// is the record of a file that has been deleted since the scan, which is a real
// thing to be able to see.

import { FileItem } from './types';

/** What a scan wrote beside one file. Every field is optional — a folder may
 *  have been scanned partway, or not at all. */
export interface SidecarSet {
  /** `<file>.meta.json` — size, mtime, extension, word tokens, MANUAL flag. */
  meta?: File;
  /** `<file>.exif.json` — the above plus dimensions, mode and decoded EXIF. */
  exif?: File;
  /** `<file>.ocr.json` — the EasyOCR transcript. */
  ocr?: File;
  /** A `.svg` beside the file. A vtracer trace, or one somebody drew. */
  traced?: File;
}

/** Sidecar suffixes that are APPENDED to the full filename. Order matters only
 *  for reporting; a file may legitimately carry all three. */
const APPENDED: ReadonlyArray<readonly [string, keyof SidecarSet]> = [
  ['.exif.json', 'exif'],
  ['.meta.json', 'meta'],
  ['.ocr.json', 'ocr'],
  // Written by an older revision of the generator. Recognised so a folder
  // scanned by that revision still reads as scanned rather than as unscanned.
  ['.sidecar.json', 'meta'],
];

export interface SplitResult {
  /** The corpus: everything that is not a sidecar. */
  sources: FileItem[];
  /** Sidecars keyed by the relative path of the file they describe. */
  sidecarsByPath: Map<string, SidecarSet>;
  /** Sidecars whose source file is not in this folder. */
  orphans: string[];
  /** How many sidecars were paired, for the status line. */
  paired: number;
}

/** Which sidecar suffix, if any, this filename carries. */
function appendedKind(lowerName: string): readonly [string, keyof SidecarSet] | null {
  for (const entry of APPENDED) {
    if (lowerName.endsWith(entry[0])) return entry;
  }
  return null;
}

/** Split one dropped folder into its corpus and the sidecars describing it.
 *
 *  Takes the raw picker list rather than FileItems because the decision of what
 *  IS a source file is made here — the caller cannot build FileItems until it
 *  knows which entries are sidecars. */
export function splitSidecars(
  entries: ReadonlyArray<{ file: File; relativePath: string }>,
): SplitResult {
  const sources: FileItem[] = [];
  const sidecarsByPath = new Map<string, SidecarSet>();
  const orphans: string[] = [];

  // Two passes: sidecars can appear before their source in the picker's order,
  // so nothing can be paired until every source path is known.
  const sourcePaths = new Set<string>();
  const stems = new Map<string, string>();
  const pending: Array<{ file: File; relativePath: string; owner: string; slot: keyof SidecarSet }> = [];

  for (const entry of entries) {
    const lowerName = entry.file.name.toLowerCase();
    const kind = appendedKind(lowerName);

    if (kind) {
      const owner = entry.relativePath.slice(0, entry.relativePath.length - kind[0].length);
      pending.push({ ...entry, owner, slot: kind[1] });
      continue;
    }

    sources.push({
      file: entry.file,
      relativePath: entry.relativePath,
      name: entry.file.name,
      size: entry.file.size,
      type: entry.file.type,
      isImage: isImageName(entry.file.name),
    });
    sourcePaths.add(entry.relativePath);
  }

  // A traced SVG replaces the extension, so it is matched against the stems of
  // the RASTERS only. An .svg that pairs with nothing is a source in its own
  // right and stays in the corpus, which is why this runs after the loop above.
  for (const item of sources) {
    if (!isRasterName(item.name)) continue;
    stems.set(stripExtension(item.relativePath), item.relativePath);
  }
  const tracedOwners = new Map<string, FileItem>();
  for (const item of sources) {
    if (!/\.svg$/i.test(item.name)) continue;
    const owner = stems.get(stripExtension(item.relativePath));
    if (owner) tracedOwners.set(item.relativePath, item as FileItem);
  }

  let paired = 0;
  const attach = (owner: string, slot: keyof SidecarSet, file: File): void => {
    const set = sidecarsByPath.get(owner) ?? {};
    set[slot] = file;
    sidecarsByPath.set(owner, set);
    paired += 1;
  };

  for (const entry of pending) {
    if (sourcePaths.has(entry.owner)) {
      attach(entry.owner, entry.slot, entry.file);
    } else {
      // Kept rather than dropped: a sidecar with no source is the record of a
      // file deleted since the scan.
      orphans.push(entry.relativePath);
    }
  }

  for (const [svgPath, svgItem] of tracedOwners) {
    const owner = stems.get(stripExtension(svgPath));
    if (owner) attach(owner, 'traced', svgItem.file);
  }

  for (const item of sources) {
    const set = sidecarsByPath.get(item.relativePath);
    if (set) item.sidecars = set;
  }

  return { sources, sidecarsByPath, orphans, paired };
}

/** A compact badge naming which sidecars a file carries, or '' for none. */
export function sidecarBadge(set: SidecarSet | undefined): string {
  if (!set) return '';
  const marks: string[] = [];
  if (set.exif) marks.push('📐');
  else if (set.meta) marks.push('📄');
  if (set.ocr) marks.push('🔤');
  if (set.traced) marks.push('✒️');
  return marks.join('');
}

/** Long form for a tooltip, so the glyphs above are never the only explanation. */
export function sidecarTitle(set: SidecarSet | undefined): string {
  if (!set) return 'No sidecar — this file has not been scanned';
  const said: string[] = [];
  if (set.exif) said.push('📐 .exif.json (dimensions, mode, EXIF)');
  if (set.meta) said.push('📄 .meta.json (size, mtime, word tokens)');
  if (set.ocr) said.push('🔤 .ocr.json (OCR transcript)');
  if (set.traced) said.push('✒️ .svg beside it (a trace, or drawn by hand)');
  return said.length ? said.join('\n') : 'No sidecar — this file has not been scanned';
}

/** Parse one sidecar. Returns null rather than throwing: a truncated or
 *  hand-edited sidecar must not take the whole folder down. */
export async function readSidecar(file: File | undefined): Promise<Record<string, unknown> | null> {
  if (!file) return null;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stripExtension(path: string): string {
  const cut = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  return cut > slash ? path.slice(0, cut) : path;
}

function isRasterName(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(name);
}

function isImageName(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(name);
}

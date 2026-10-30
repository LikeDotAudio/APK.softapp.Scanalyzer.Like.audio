import type { FileItem } from '../../../types';
import { readSidecar } from '../../../sidecars';
import { formatBytes } from '../../../tree';
import { escapeHTML } from '../../../lib/html';
import type { CardContext } from './index';

// WHAT THE SCAN ALREADY FOUND, read off disk rather than recomputed. This is
// the point of writing sidecars at all: a folder that has been scanned should
// open as a READ. The card is drawn first because it is the cheapest and most
// trustworthy thing on the screen — everything below it is the browser or the
// micro-API working the file out again, live.
export async function readScanSidecars(fileItem: FileItem) {
  const scanned = fileItem.sidecars;
  const storedExif = await readSidecar(scanned?.exif);
  const storedMeta = await readSidecar(scanned?.meta);
  const storedOcr = await readSidecar(scanned?.ocr);
  const storedFacts = storedExif ?? storedMeta;
  const storedOcrText = typeof storedOcr?.ocr_text === 'string' ? storedOcr.ocr_text : '';
  return { scanned, storedFacts, storedOcrText };
}

export function extractFilenameTags(filename: string): string[] {
  return filename
    .replace(/\.[^/.]+$/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(w => w.length >= 2)
    .map(w => w.toLowerCase());
}

/** What the scan wrote beside this file, or that nothing was written. */
export function sidecarCard(ctx: CardContext): string {
  const { scanned, storedFacts, storedOcrText } = ctx;
  return scanned ? `
    <div class="data-card" style="border: 2px solid #22d3ee; background: rgba(34, 211, 238, 0.08);">
      <h4 style="color:#22d3ee;">🗄️ SIDECARS ON DISK (read, not recomputed)</h4>
      <div style="font-size:0.7rem; color:#94a3b8; margin-bottom:0.35rem;">
        Written beside this file by <code>PROCESSORS.sidecar_tools</code>. The corpus is the database.
      </div>
      <table class="meta-table">
        <tr><th>Sidecars</th><td>${[
            scanned.exif ? '<span class="tag-badge" style="background:#22d3ee;color:#0f172a;">📐 .exif.json</span>' : '',
            scanned.meta ? '<span class="tag-badge" style="background:#22d3ee;color:#0f172a;">📄 .meta.json</span>' : '',
            scanned.ocr  ? '<span class="tag-badge" style="background:#22d3ee;color:#0f172a;">🔤 .ocr.json</span>'  : '',
            scanned.traced ? '<span class="tag-badge" style="background:#22d3ee;color:#0f172a;">✒️ .svg</span>' : '',
          ].filter(Boolean).join(' ')}</td></tr>
        ${storedFacts && typeof storedFacts.modified_time === 'string'
          ? `<tr><th>Modified (at scan)</th><td>${escapeHTML(storedFacts.modified_time)}</td></tr>` : ''}
        ${storedFacts && storedFacts.width && storedFacts.height
          ? `<tr><th>Dimensions</th><td>${String(storedFacts.width)} × ${String(storedFacts.height)} px${
              storedFacts.mode ? ` · ${escapeHTML(String(storedFacts.mode))}` : ''}</td></tr>` : ''}
        ${storedFacts && storedFacts.special_flag
          ? `<tr><th>Flag</th><td><span class="tag-badge" style="background:#f59e0b;color:#0f172a;">${escapeHTML(String(storedFacts.special_flag))}</span></td></tr>` : ''}
        ${Array.isArray(storedFacts?.word_tokens) && storedFacts.word_tokens.length
          ? `<tr><th>Word tokens</th><td>${(storedFacts.word_tokens as unknown[]).slice(0, 12).map(t => `<span class="tag-badge">${escapeHTML(String(t))}</span>`).join(' ')}</td></tr>` : ''}
        ${storedFacts && storedFacts.exif && Object.keys(storedFacts.exif as object).length
          ? `<tr><th>EXIF tags</th><td>${Object.keys(storedFacts.exif as object).length} tag(s) stored</td></tr>` : ''}
      </table>
      ${storedOcrText ? `
      <div style="margin-top:0.4rem; font-size:0.75rem; color:#cbd5e1;">
        <strong>🔤 Stored OCR transcript:</strong>
        <div class="json-view" style="margin-top:2px; color:#a5f3fc; white-space:pre-wrap; max-height:160px; overflow:auto;">${escapeHTML(storedOcrText)}</div>
      </div>` : (scanned.ocr ? `
      <div style="margin-top:0.4rem; font-size:0.72rem; color:#64748b;">
        An <code>.ocr.json</code> is here and its transcript is empty — the scan ran with no OCR engine available.
      </div>` : '')}
    </div>
    ` : `
    <div class="data-card" style="border:1px dashed #475569; background:rgba(71,85,105,0.08);">
      <h4 style="color:#94a3b8;">🗄️ NO SIDECAR FOR THIS FILE</h4>
      <div style="font-size:0.72rem; color:#94a3b8;">
        Nothing has been written beside it. Everything below is being worked out live, now.
        Run <code>python3 PROCESSORS.sidecar_tools/sidecar_generator.py &lt;FOLDER&gt;</code> (and <code>svg_vectorizer.py</code> for traces) to make this folder a read.
      </div>
    </div>
    `;
}

/** Tags read off the file name and extension. */
export function fileTagsCard(ctx: CardContext): string {
  const { fileTags } = ctx;
  return `    <div class="data-card">
      <h4>📁 FILE TAGS (Filename & Extension Basis)</h4>
      <div class="tag-cloud">
        ${fileTags.map(t => `<span class="tag-badge" style="background:#0284c7; color:#fff;">📁 #${t}</span>`).join(' ')}
      </div>
    </div>`;
}

/** EXIF / metadata and filesystem details. */
export function exifCard(ctx: CardContext): string {
  const { fileItem } = ctx;
  return `    <!-- EXIF / METADATA -->
    <div class="data-card">
      <h4>🏷️ EXIF / METADATA & FILESYSTEM DETAILS</h4>
      <table class="meta-table">
        <tr><th>File Name</th><td>${fileItem.name}</td></tr>
        <tr><th>Path</th><td>${fileItem.relativePath}</td></tr>
        <tr><th>Size</th><td>${formatBytes(fileItem.size)}</td></tr>
        <tr><th>Type</th><td>${fileItem.type || 'Binary'}</td></tr>
      </table>
    </div>`;
}

/** The complete sidecar JSON as the shell would write it. */
export function sidecarJsonCard(ctx: CardContext): string {
  const { fileItem, fileTags, meta, rustOcr, rustAnalyzer, rustPhoto } = ctx;
  return `    <!-- COMPLETE SIDECAR JSON -->
    <div class="data-card">
      <h4>📋 COMPLETE SIDECAR METADATA JSON</h4>
      <div class="json-view">${JSON.stringify({
        file_name: fileItem.name,
        relative_path: fileItem.relativePath,
        file_size: fileItem.size,
        sidecar: {
          FILE_TAGS: fileTags,
          OCR_TAGS: rustOcr ? rustOcr.extracted_text.split_whitespace().slice(0, 10) : [],
          IMAGE_TAGS: rustAnalyzer ? [rustAnalyzer.dhash_hex] : [],
          FACE_DETECTION: rustPhoto ? rustPhoto.face_detection : {},
          PHOTO_ID: rustPhoto ? rustPhoto.primary_category : "Unknown",
          EXIF: meta.exifTags || {}
        }
      }, null, 2)}</div>
    </div>`;
}

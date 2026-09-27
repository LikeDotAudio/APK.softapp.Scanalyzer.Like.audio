import { formatBytes } from '../../../tree';
import { escapeHTML } from '../../../lib/html';
import type { CardContext } from './index';

/** PDF breakout and multi-page viewer. */
export function pdfCard(ctx: CardContext): string {
  const { fileItem, isPdf, currentInspectedImgUrl } = ctx;
  return isPdf ? `
    <div class="data-card" style="border: 2px solid #ec4899; background: rgba(236, 72, 153, 0.08);">
      <h4 style="color:#ec4899;">🚀 PDF DOCUMENT BREAKOUT & MULTI-PAGE VIEWER</h4>
      <div style="font-size:0.7rem; color:#cbd5e1; margin-bottom:0.2rem;">
        Interactive PDF Document. Break out full document into standalone window or browser tab:
      </div>
      <table class="meta-table">
        <tr><th>Document Title</th><td><strong>${escapeHTML(fileItem.name)}</strong></td></tr>
        <tr><th>Format</th><td><span class="tag-badge" style="background:#ec4899; color:#fff;">PDF Document</span></td></tr>
        <tr><th>File Size</th><td>${formatBytes(fileItem.size)}</td></tr>
        <tr><th>Path</th><td><code>${escapeHTML(fileItem.relativePath)}</code></td></tr>
      </table>
      <div style="display:flex; gap:4px; margin-top:0.3rem;">
        <button id="btnInspectorPdfBreakout" class="btn primary" style="flex:1; font-size:0.68rem; background:#ec4899; color:#fff;">
          🚀 Break Out Fullscreen Modal
        </button>
        <a href="${currentInspectedImgUrl}" target="_blank" class="btn secondary" style="flex:1; text-align:center; font-size:0.68rem; text-decoration:none;">
          ↗ Open in New Tab
        </a>
      </div>
    </div>
    ` : '';
}

/** AutoCAD DXF vector analysis. */
export function dxfCard(ctx: CardContext): string {
  const { rustDxf } = ctx;
  return rustDxf ? `
    <div class="data-card" style="border: 2px solid #38bdf8; background: rgba(56, 189, 248, 0.08);">
      <h4 style="color:#38bdf8;">📐 AUTOCAD DXF VECTOR ANALYSIS</h4>
      <table class="meta-table">
        <tr><th>Format / Version</th><td><strong style="color:#38bdf8;">${escapeHTML(rustDxf.acad_version)}</strong></td></tr>
        <tr><th>Total Lines</th><td>${rustDxf.line_count.toLocaleString()} lines</td></tr>
        <tr><th>Layers Detected (${rustDxf.layers ? rustDxf.layers.length : 0})</th><td><span style="color:#f472b6;">${rustDxf.layers ? rustDxf.layers.slice(0, 10).join(', ') : '-'}</span></td></tr>
      </table>
      ${rustDxf.entity_counts && Object.keys(rustDxf.entity_counts).length > 0 ? `
        <div style="margin-top:6px; font-size:0.7rem; font-weight:700; color:#e2e8f0;">CAD Entities Breakdown:</div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:3px;">
          ${Object.entries(rustDxf.entity_counts).map(([ent, count]) => `
            <span class="tag-badge" style="background:#0f172a; border:1px solid #38bdf8; color:#38bdf8; font-size:0.68rem;">${ent}: <strong>${count}</strong></span>
          `).join('')}
        </div>
      ` : ''}
      ${rustDxf.extracted_text && rustDxf.extracted_text.length > 0 ? `
        <div style="margin-top:6px; font-size:0.7rem; font-weight:700; color:#38bdf8;">Extracted CAD Text Annotations (${rustDxf.extracted_text.length}):</div>
        <div style="font-size:0.68rem; font-family:monospace; color:#cbd5e1; white-space:pre-wrap; max-height:140px; overflow-y:auto; background:#020617; padding:5px; border-radius:4px; margin-top:2px;">${escapeHTML(rustDxf.extracted_text.join('\n'))}</div>
      ` : ''}
    </div>
    ` : '';
}

/** Word document content extraction. */
export function docxCard(ctx: CardContext): string {
  const { rustDocx } = ctx;
  return rustDocx ? `
    <div class="data-card" style="border: 2px solid #38bdf8; background: rgba(56, 189, 248, 0.08);">
      <h4 style="color:#38bdf8;">📄 MICROSOFT WORD (.DOCX / .DOC) EXTRACTOR</h4>
      <table class="meta-table">
        <tr><th>Format Type</th><td><strong>${rustDocx.format_type}</strong></td></tr>
        <tr><th>Word Count</th><td><span style="font-weight:700; color:#38bdf8;">${rustDocx.word_count} words</span></td></tr>
        <tr><th>Paragraphs</th><td>${rustDocx.paragraph_count} paragraph(s)</td></tr>
        ${rustDocx.author ? `<tr><th>Author</th><td>${rustDocx.author}</td></tr>` : ''}
        ${rustDocx.title ? `<tr><th>Document Title</th><td>${rustDocx.title}</td></tr>` : ''}
      </table>
      <div style="margin-top:0.4rem; font-size:0.75rem; color:#cbd5e1;">
        <strong>Document OpenXML Text Snippet:</strong>
        <div class="json-view" style="margin-top:2px; color:#e2e8f0; font-weight:600; max-height:120px;">${rustDocx.extracted_text_snippet || 'No text extracted.'}</div>
      </div>
      <div class="tag-cloud" style="margin-top:0.4rem;">
        ${rustDocx.docx_tags.map((t: string) => `<span class="tag-badge" style="background:#0284c7; color:#fff;">📄 ${t}</span>`).join(' ')}
      </div>
    </div>
    ` : '';
}

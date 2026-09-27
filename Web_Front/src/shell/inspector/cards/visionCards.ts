import { escapeHTML, unread } from '../../../lib/html';
import type { CardContext } from './index';

/** Sub-area meta-photos cropped from the image. */
export function metaPhotoCard(ctx: CardContext): string {
  const { fileItem, metaPhotos } = ctx;
  return metaPhotos.length > 0 ? `
    <div class="data-card" style="border: 2px solid #10b981; background: rgba(16, 185, 129, 0.08);">
      <h4 style="color:#10b981;">📸 EXTRACTED SUB-AREA META-PHOTOS (${metaPhotos.length} Sub-Assets)</h4>
      <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:0.3rem;">
        Sub-region photos automatically extracted & cropped from title blocks, face areas, text regions, and panel sub-quadrants.
      </div>
      <div class="meta-photo-grid">
        ${metaPhotos.map(mp => `
          <div class="meta-photo-card">
            <img src="${mp.dataUrl}" alt="${mp.title}" class="meta-photo-thumb" />
            <div class="meta-photo-title" title="${mp.title}">${mp.title}</div>
            <div class="meta-photo-meta">${mp.width}x${mp.height} px @ (${mp.x}, ${mp.y})</div>
            <div style="display:flex; gap:3px; margin-top:2px;">
              <button class="btn-preview-subphoto" data-url="${mp.dataUrl}" style="flex:1; padding:2px 4px; font-size:0.65rem; background:var(--card-bg); color:#fff; border:none; border-radius:3px; cursor:pointer;" title="View this sub-photo preview">
                🔍 View
              </button>
              <button class="btn-download-subphoto" data-url="${mp.dataUrl}" data-name="${fileItem.name.replace(/\.[^/.]+$/, "")}_${mp.id}.png" style="flex:1; padding:2px 4px; font-size:0.65rem; background:#10b981; color:#fff; border:none; border-radius:3px; cursor:pointer;" title="Extract & download sub-photo PNG">
                ⬇️ Extract
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : '';
}

/** Face detection, extraction and matching. */
export function faceCard(ctx: CardContext): string {
  const { rustPhoto } = ctx;
  return rustPhoto && rustPhoto.face_detection ? `
    <div class="data-card">
      <h4>👤 FACE DETECTION, EXTRACTION & IDENTIFICATION / MATCHING</h4>
      <table class="meta-table">
        <tr><th>Faces Detected</th><td><strong>${rustPhoto.face_detection.faces_detected} face(s)</strong></td></tr>
        <tr><th>Portrait Mode</th><td>${rustPhoto.face_detection.is_portrait ? 'YES 👤' : 'NO'}</td></tr>
        <tr><th>Face Bounding Boxes</th><td>${rustPhoto.face_detection.face_boxes.length} bounding box(es)</td></tr>
      </table>
      
      ${rustPhoto.face_detection.face_boxes.length > 0 ? `
      <div style="margin-top: 0.5rem; font-size: 0.8rem; background: rgba(236,72,153,0.1); padding: 0.5rem; border-radius: 4px; border: 1px solid rgba(236,72,153,0.3);">
        <strong>Detected Face Feature Signatures & Matcher:</strong>
        <div style="margin-top: 0.3rem;">
          ${rustPhoto.face_detection.face_boxes.map((box: any, idx: number) => `
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 4px;">
              <span>👤 Face #${idx+1}: (${box.x}, ${box.y}, ${box.width}x${box.height}) Hash: <code>0x${(box.embedding_hash || 0).toString(16)}</code></span>
              <button class="btn-compact-face-match" data-hash="${box.embedding_hash || 0}" style="padding: 2px 6px; font-size: 0.7rem; background:#ec4899; color:white; border:none; border-radius:3px; cursor:pointer;">
                🔍 Match Face
              </button>
            </div>
          `).join('')}
        </div>
        <div id="faceMatchResultContainer" style="margin-top:0.4rem; display:none; background:#0f172a; padding:6px; border-radius:4px; font-family:monospace; color:#38bdf8;"></div>
      </div>
      ` : ''}

      <div class="tag-cloud" style="margin-top:0.4rem;">
        ${rustPhoto.face_detection.face_tags.map((ft: string) => `<span class="tag-badge" style="background:#ec4899; color:#fff;">👤 ${ft}</span>`).join(' ')}
      </div>
    </div>
    ` : '';
}

/** The schematic title block and its isolated OCR. */
export function titleBlockCard(ctx: CardContext): string {
  const { rustAnalyzer } = ctx;
  return rustAnalyzer && rustAnalyzer.title_block && rustAnalyzer.title_block.found ? `
    <div class="data-card" style="border: 2px solid #f59e0b; background: rgba(245, 158, 11, 0.08);">
      <h4 style="color:#f59e0b;">📌 SCHEMATIC TITLE BLOCK (ISOLATED OCR)</h4>
      <div style="font-size:0.7rem; color:#94a3b8; margin-bottom:0.3rem;">
        The BOX is where drafting practice puts a title block. The rows below are
        only what was actually read out of it — a dash means nothing was.
      </div>
      <table class="meta-table">
        <tr><th>Company / Brand</th><td><strong>${unread(rustAnalyzer.title_block.company_brand)}</strong></td></tr>
        <tr><th>Drawing Number</th><td>${rustAnalyzer.title_block.drawing_number
            ? `<span style="font-family:monospace; background:#f59e0b; color:#0f172a; padding:1px 6px; border-radius:3px; font-weight:700;">${escapeHTML(rustAnalyzer.title_block.drawing_number)}</span>`
            : unread(null)}</td></tr>
        <tr><th>Title Block Box</th><td>(${rustAnalyzer.title_block.x}, ${rustAnalyzer.title_block.y}) ${rustAnalyzer.title_block.width}x${rustAnalyzer.title_block.height} px</td></tr>
      </table>
      <div style="margin-top:0.4rem; font-size:0.75rem; color:#cbd5e1;">
        <strong>Title Block Text OCR:</strong>
        <div class="json-view" style="margin-top:2px; color:#fef08a; font-weight:600;">${unread(rustAnalyzer.title_block.title_text_extracted)}</div>
      </div>
    </div>
    ` : '';
}

/** Image tags and visual metrics. */
export function metricsCard(ctx: CardContext): string {
  const { rustAnalyzer } = ctx;
  return rustAnalyzer ? `
    <div class="data-card">
      <h4>🎨 IMAGE TAGS & VISUAL METRICS</h4>
      <table class="meta-table">
        <tr><th>Dimensions</th><td>${rustAnalyzer.width} x ${rustAnalyzer.height} px (${rustAnalyzer.aspect_ratio.toFixed(2)})</td></tr>
        <tr><th>Schematic Lines</th><td><strong>${rustAnalyzer.lines_detected ? rustAnalyzer.lines_detected.length : 0} line trace(s)</strong></td></tr>
        <tr><th>Mean RGB</th><td>R:${rustAnalyzer.mean_red.toFixed(1)}, G:${rustAnalyzer.mean_green.toFixed(1)}, B:${rustAnalyzer.mean_blue.toFixed(1)}</td></tr>
        <tr><th>Luminance & Contrast</th><td>Luma: ${rustAnalyzer.luminance.toFixed(1)}, Contrast StdDev: ${rustAnalyzer.contrast.toFixed(2)}</td></tr>
        <tr><th>Perceptual dHash</th><td><code>${rustAnalyzer.dhash_hex}</code></td></tr>
      </table>
    </div>
    ` : '';
}

/** OCR recognised text. */
export function ocrCard(ctx: CardContext): string {
  const { rustOcr } = ctx;
  return rustOcr ? `
    <div class="data-card">
      <h4>🔤 OCR TAGS & RECOGNIZED TEXT</h4>
      <div class="json-view" style="color:#e2e8f0; font-weight:600;">${rustOcr.extracted_text || 'No text detected.'}</div>
    </div>
    ` : '';
}

/** Photo classification and traits. */
export function photoCard(ctx: CardContext): string {
  const { rustPhoto } = ctx;
  return rustPhoto ? `
    <div class="data-card">
      <h4>🏷️ PHOTO CLASSIFICATION & TRAITS</h4>
      <table class="meta-table">
        <tr><th>Category</th><td><strong>${rustPhoto.primary_category}</strong> (${(rustPhoto.confidence * 100).toFixed(0)}%)</td></tr>
        <tr><th>Palette Type</th><td>${rustPhoto.color_palette_type}</td></tr>
        <tr><th>Traits</th><td>${rustPhoto.detected_traits.join(', ')}</td></tr>
      </table>
    </div>
    ` : '';
}

/** Image-to-SVG vector conversion. */
export function svgCard(ctx: CardContext): string {
  const { rustSvg } = ctx;
  return rustSvg ? `
    <div class="data-card">
      <h4>📐 IMAGE TO SVG VECTOR GRAPHICS</h4>
      <table class="meta-table">
        <tr><th>SVG Paths</th><td>${rustSvg.path_count} paths</td></tr>
      </table>
      <div class="json-view" style="max-height:100px;">${escapeHTML(rustSvg.svg_xml.slice(0, 400))}...</div>
    </div>
    ` : '';
}

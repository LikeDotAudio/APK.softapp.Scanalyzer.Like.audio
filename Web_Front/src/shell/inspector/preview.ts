import type { FileItem } from '../../types';
import type { ExtractedImagePage } from '../../documentBreakout';
import { escapeHTML } from '../../lib/html';
import { shell } from '../state';
import { els } from '../dom';
import { openDocumentBreakoutModal, openPdfBreakoutModal } from '../overlays/docModal';
import { renderVisualDocumentOverlays } from '../overlays/render';

/** The first preview of a file: an image only records its URL (the overlay
 *  renderer draws it), a PDF gets the breakout viewer, anything else a label. */
export function renderInitialPreview(fileItem: FileItem, isPdf: boolean) {
  if (fileItem.isImage) {
    shell.currentInspectedImgUrl = URL.createObjectURL(fileItem.file);
  } else if (isPdf) {
    shell.currentInspectedImgUrl = URL.createObjectURL(fileItem.file);
    els.imagePreviewContainer.innerHTML = `
      <div style="width:100%; height:100%; display:flex; flex-direction:column; background:#0f172a; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:3px 6px; background:#1e293b; border-bottom:1px solid var(--border-color); font-size:0.7rem;">
          <span style="color:#ec4899; font-weight:700;">📄 PDF Breakout Viewer: ${escapeHTML(fileItem.name)}</span>
          <div style="display:flex; gap:4px;">
            <button id="btnPdfBreakoutHeader" class="btn primary btn-sm" style="font-size:0.65rem; padding:1px 6px; background:#ec4899; color:#fff;">🚀 Break Out Fullscreen</button>
            <a href="${shell.currentInspectedImgUrl}" target="_blank" class="btn secondary btn-sm" style="font-size:0.65rem; padding:1px 6px; text-decoration:none;">↗ Open in Tab</a>
          </div>
        </div>
        <iframe src="${shell.currentInspectedImgUrl}#toolbar=1&navpanes=1" style="flex:1; width:100%; border:none; background:#525659;" title="PDF Breakout Frame"></iframe>
      </div>
    `;
    setTimeout(() => {
      document.getElementById('btnPdfBreakoutHeader')?.addEventListener('click', () => {
        openPdfBreakoutModal(fileItem, shell.currentInspectedImgUrl);
      });
    }, 50);
  } else {
    shell.currentInspectedImgUrl = '';
    els.imagePreviewContainer.innerHTML = `
      <div class="empty-state" style="color:var(--accent);">
        📄 Non-Image File Preview<br>
        <span style="font-size:1.1rem; font-weight:700; color:#fff;">${escapeHTML(fileItem.name)}</span>
      </div>
    `;
  }
}

/** The DXF render, once the micro-API has drawn it. */
export function renderDxfPreview(fileItem: FileItem, pngUrl: string) {
  shell.currentInspectedImgUrl = pngUrl;
  els.imagePreviewContainer.innerHTML = `
            <div style="width:100%; height:100%; display:flex; flex-direction:column; background:#020617; position:relative; align-items:center; justify-content:center; overflow:hidden;">
              <div style="position:absolute; top:4px; left:6px; background:rgba(15,23,42,0.85); padding:3px 8px; border-radius:4px; border:1px solid #38bdf8; font-size:0.7rem; color:#38bdf8; font-weight:700; z-index:10;">
                📐 DXF Vector Drawing View: ${escapeHTML(fileItem.name)}
              </div>
              <img src="${shell.currentInspectedImgUrl}" style="max-width:100%; max-height:100%; object-fit:contain;" alt="DXF Drawing Render" />
            </div>
          `;
}

/** Every page or media asset broken out of a PDF or DOCX, stacked. */
export function renderBreakoutPages(fileItem: FileItem, docBreakoutPages: ExtractedImagePage[]) {
  if (docBreakoutPages.length > 0) {
    els.imagePreviewContainer.innerHTML = `
      <div style="width:100%; height:100%; display:flex; flex-direction:column; background:#090d16; position:relative;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding:3px 6px; background:#1e293b; border-bottom:1px solid var(--border-color); font-size:0.7rem; flex-shrink:0;">
          <span style="color:#ec4899; font-weight:700;">🚀 Broken Out Document (${docBreakoutPages.length} Image Pages / Media Assets): ${escapeHTML(fileItem.name)}</span>
          <div style="display:flex; gap:4px;">
            <button id="btnBreakoutFullGallery" class="btn primary btn-sm" style="font-size:0.65rem; padding:1px 6px; background:#ec4899; color:#fff;">🚀 Fullscreen Gallery</button>
          </div>
        </div>
        <div style="flex:1; overflow-y:auto; padding:0.4rem; display:flex; flex-direction:column; gap:0.5rem; align-items:center;">
          ${docBreakoutPages.map(p => `
            <div style="background:#0f172a; border:1px solid var(--border-color); padding:0.3rem; border-radius:4px; max-width:100%; text-align:center;">
              <div style="font-size:0.68rem; color:#38bdf8; font-weight:700; margin-bottom:3px;">${escapeHTML(p.title)} (${p.width}x${p.height} px)</div>
              <img src="${p.dataUrl}" style="max-width:100%; max-height:480px; object-fit:contain; border-radius:2px;" />
            </div>
          `).join('')}
        </div>
      </div>
    `;
    setTimeout(() => {
      document.getElementById('btnBreakoutFullGallery')?.addEventListener('click', () => {
        openDocumentBreakoutModal(fileItem, docBreakoutPages);
      });
    }, 50);
  }
}

/** One meta-photo full size, with a button back to the document and overlays. */
export function renderSubPhotoPreview(dataUrl: string) {
  els.imagePreviewContainer.innerHTML = `
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.5rem; height:100%; width:100%;">
            <img src="${dataUrl}" style="max-width:100%; max-height:85%; object-fit:contain; border:2px solid var(--accent); border-radius:4px; box-shadow:0 0 15px rgba(56,189,248,0.4);" />
            <button id="btnResetMainPreview" class="btn primary" style="font-size:0.75rem; padding:0.25rem 0.6rem;">↺ Back to Full Document & Overlays</button>
          </div>
        `;
  document.getElementById('btnResetMainPreview')?.addEventListener('click', () => {
    renderVisualDocumentOverlays();
  });
}

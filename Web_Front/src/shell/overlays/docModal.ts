import type { FileItem } from '../../types';
import type { ExtractedImagePage } from '../../documentBreakout';
import { formatBytes } from '../../tree';
import { escapeHTML } from '../../lib/html';
import { els } from '../dom';

export function openPdfBreakoutModal(fileItem: FileItem, pdfUrl: string) {
  els.fullDocModal.style.display = 'flex';
  const modalTitle = document.getElementById('fullDocTitle');
  if (modalTitle) {
    modalTitle.innerHTML = `🚀 PDF Breakout Fullscreen Viewer: ${escapeHTML(fileItem.name)} (${formatBytes(fileItem.size)})`;
  }
  els.fullDocModalBody.innerHTML = `
    <div style="width:100%; height:100%; display:flex; flex-direction:column; background:#0f172a;">
      <iframe src="${pdfUrl}#toolbar=1&navpanes=1" style="width:100%; height:100%; border:none; background:#525659;" title="PDF Breakout Modal Frame"></iframe>
    </div>
  `;
}

export function openDocumentBreakoutModal(fileItem: FileItem, pages: ExtractedImagePage[]) {
  els.fullDocModal.style.display = 'flex';
  const modalTitle = document.getElementById('fullDocTitle');
  if (modalTitle) {
    modalTitle.innerHTML = `🚀 Document Breakout Gallery (${pages.length} Images/Pages): ${escapeHTML(fileItem.name)}`;
  }
  els.fullDocModalBody.innerHTML = `
    <div style="width:100%; height:100%; overflow-y:auto; padding:1rem; display:flex; flex-direction:column; gap:1rem; align-items:center; background:#020617;">
      ${pages.map(p => `
        <div style="background:#0f172a; border:1px solid var(--border-color); padding:0.5rem; border-radius:6px; max-width:90%; text-align:center; box-shadow:0 8px 20px rgba(0,0,0,0.5);">
          <div style="font-size:0.8rem; color:#38bdf8; font-weight:700; margin-bottom:0.4rem;">${escapeHTML(p.title)} (${p.width}x${p.height} px)</div>
          <img src="${p.dataUrl}" style="max-width:100%; height:auto; border-radius:3px;" />
        </div>
      `).join('')}
    </div>
  `;
}

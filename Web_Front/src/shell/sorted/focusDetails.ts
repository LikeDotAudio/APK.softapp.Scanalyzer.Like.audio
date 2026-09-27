import type { FileItem } from '../../types';
import { formatBytes } from '../../tree';
import { escapeHTML } from '../../lib/html';
import { els } from '../dom';

/** One row of the sorted view: a loaded file, or a manual inventory record. */
export interface SortedItem {
  fileItem?: FileItem;
  name: string;
  path: string;
  size: number;
  ext: string;
  project: string;
  status: string;
  location: string;
}

export function renderFocusDetails(item: SortedItem) {
  if (!els.sortedFocusDetailsContainer) return;

  els.sortedFocusDetailsContainer.innerHTML = `
    <div style="background:#0f172a; padding:0.75rem; border-radius:6px; border:1px solid #ec4899; margin-bottom:0.75rem;">
      <div style="font-weight:700; font-size:0.85rem; color:#ec4899; margin-bottom:4px;">📄 ${escapeHTML(item.name)}</div>
      <div style="font-size:0.72rem; color:#94a3b8; margin-bottom:2px;">Path: <span style="color:#e2e8f0;">${escapeHTML(item.path)}</span></div>
      <div style="font-size:0.72rem; color:#94a3b8; margin-bottom:2px;">Size: <span style="color:#38bdf8;">${item.size ? formatBytes(item.size) : 'N/A'}</span></div>
      <div style="font-size:0.72rem; color:#94a3b8; margin-bottom:2px;">Project/Category: <span style="color:#f472b6;">${escapeHTML(item.project || 'Uncategorized')}</span></div>
      <div style="font-size:0.72rem; color:#94a3b8;">Status: <span style="color:#38bdf8;">${escapeHTML(item.status || 'Pending')}</span> (${escapeHTML(item.location || 'N/A')})</div>
    </div>
    ${item.fileItem?.ocrText ? `
      <div style="background:#0f172a; padding:0.6rem; border-radius:6px; border:1px solid #38bdf8;">
        <div style="font-size:0.75rem; font-weight:700; color:#38bdf8; margin-bottom:4px;">📝 OCR Extracted Text Preview</div>
        <div style="font-size:0.68rem; font-family:monospace; color:#cbd5e1; white-space:pre-wrap; max-height:220px; overflow-y:auto; background:#020617; padding:6px; border-radius:4px;">${escapeHTML(item.fileItem.ocrText)}</div>
      </div>
    ` : `
      <div style="font-size:0.72rem; color:#64748b; font-style:italic; padding:0.5rem; text-align:center; background:#0f172a; border-radius:6px;">
        Click "Inspect" to view full document breakout, OCR overlay, and EXIF metadata.
      </div>
    `}
  `;
}

/** The focus pane for one word of the cloud: its count and the items carrying it. */
export function renderWordFocus(
  word: string,
  freq: string | null,
  items: Array<{ name: string; path: string; project: string; status: string; location: string; fileItem?: FileItem }>,
) {
  const matchingItems = items.filter(i => {
    const combined = `${i.name} ${i.path} ${i.project} ${i.status} ${i.location} ${i.fileItem?.ocrText || ''}`.toLowerCase();
    return combined.includes(word.toLowerCase());
  });

  els.sortedFocusDetailsContainer.innerHTML = `
          <div style="background:#0f172a; padding:0.6rem; border-radius:6px; border:1px solid #a855f7; margin-bottom:0.6rem;">
            <div style="font-size:0.85rem; font-weight:700; color:#a855f7;">☁️ Word Focus: <span style="color:#fff;">"${escapeHTML(word)}"</span></div>
            <div style="font-size:0.72rem; color:#94a3b8; margin-top:2px;">Total Occurrences: <strong style="color:#38bdf8;">${freq}</strong> | Matching Items: <strong style="color:#ec4899;">${matchingItems.length}</strong></div>
          </div>
          <div style="font-size:0.72rem; font-weight:700; color:#38bdf8; margin-bottom:4px;">Matching Items (${matchingItems.length}):</div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            ${matchingItems.slice(0, 50).map(m => `
              <div style="padding:4px 6px; background:#1e293b; border-radius:4px; font-size:0.7rem; display:flex; justify-content:space-between; align-items:center;">
                <span style="color:#f8fafc; font-weight:600;">${escapeHTML(m.name)}</span>
                <span style="color:#f472b6;">${escapeHTML(m.project || 'General')}</span>
              </div>
            `).join('')}
          </div>
        `;
}

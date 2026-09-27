import { formatBytes } from '../../tree';
import { escapeHTML } from '../../lib/html';
import { shell } from '../state';
import type { SortCriterion } from '../state';
import { els } from '../dom';
import { matchInventoryForPath } from '../inventory/match';
import { inspectFileItem } from '../inspector';
import { renderWordCloud } from './wordCloud';
import { renderFocusDetails, type SortedItem } from './focusDetails';

function setActiveSortBtn(targetBtn: HTMLButtonElement) {
  [els.sortBtnName, els.sortBtnSize, els.sortBtnExt, els.sortBtnCategory, els.sortBtnStatus].forEach(btn => {
    btn?.classList.toggle('active', btn === targetBtn);
  });
}

/** The modal's open and close buttons and its five sort buttons. */
export function bindSortedView() {
  els.btnOpenSortedView?.addEventListener('click', () => {
    els.sortedViewModal.style.display = 'flex';
    renderSortedViewTable();
  });

  els.closeSortedViewModalBtn?.addEventListener('click', () => {
    els.sortedViewModal.style.display = 'none';
  });

  const sortBy = (btn: HTMLButtonElement, criterion: SortCriterion) => {
    btn?.addEventListener('click', () => { setActiveSortBtn(btn); shell.currentSortCriterion = criterion; renderSortedViewTable(); });
  };
  sortBy(els.sortBtnName, 'name');
  sortBy(els.sortBtnSize, 'size');
  sortBy(els.sortBtnExt, 'ext');
  sortBy(els.sortBtnCategory, 'category');
  sortBy(els.sortBtnStatus, 'status');
}

function renderSortedViewTable() {
  if (!els.sortedViewTableContainer) return;

  const itemsToDisplay: SortedItem[] = [];

  if (shell.loadedFiles.length > 0) {
    shell.loadedFiles.forEach(f => {
      const ext = f.name.split('.').pop() || '';
      const match = matchInventoryForPath(shell.manualInventory, f.relativePath);
      itemsToDisplay.push({
        fileItem: f,
        name: f.name,
        path: f.relativePath,
        size: f.size,
        ext: ext.toLowerCase(),
        project: match ? match.project : '',
        status: match ? match.scanned_status : '',
        location: match ? match.location : ''
      });
    });
  } else if (shell.manualInventory.length > 0) {
    shell.manualInventory.forEach(m => {
      itemsToDisplay.push({
        name: m.item || m.project,
        path: m.project,
        size: 0,
        ext: 'manual',
        project: m.project,
        status: m.scanned_status,
        location: m.location
      });
    });
  }

  // Perform Sorting
  itemsToDisplay.sort((a, b) => {
    if (shell.currentSortCriterion === 'name') return a.name.localeCompare(b.name);
    if (shell.currentSortCriterion === 'size') return b.size - a.size;
    if (shell.currentSortCriterion === 'ext') return a.ext.localeCompare(b.ext);
    if (shell.currentSortCriterion === 'category') return a.project.localeCompare(b.project);
    if (shell.currentSortCriterion === 'status') return a.status.localeCompare(b.status);
    return 0;
  });

  if (els.sortedItemCountBadge) {
    els.sortedItemCountBadge.textContent = `${itemsToDisplay.length.toLocaleString()} Items`;
  }

  // Panel 1: Render 1/3 Scanned Data Table
  const limit = Math.min(itemsToDisplay.length, 500);
  const rowsHtml = itemsToDisplay.slice(0, limit).map((item, idx) => `
    <tr class="sorted-row" data-idx="${idx}" style="border-bottom:1px solid var(--border-color); cursor:pointer; background: ${idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}; transition:background 0.15s;">
      <td style="padding:4px 6px; color:var(--text-muted); font-size:0.68rem;">${idx + 1}</td>
      <td style="padding:4px 6px; font-weight:600; color:#f8fafc; font-size:0.72rem;">${escapeHTML(item.name)}</td>
      <td style="padding:4px 6px; color:#f472b6; font-weight:600; font-size:0.7rem;">${escapeHTML(item.project || '-')}</td>
      <td style="padding:4px 6px; color:#94a3b8; font-size:0.68rem;">${escapeHTML(item.path)}</td>
      <td style="padding:4px 6px; color:#38bdf8; font-size:0.7rem;">${item.size ? formatBytes(item.size) : '-'}</td>
      <td style="padding:4px 6px; font-size:0.68rem;">
        ${item.status ? `<span style="color:#38bdf8;">${escapeHTML(item.status)}</span>` : ''}
        ${item.location ? ` <span style="color:#f59e0b;">(${escapeHTML(item.location)})</span>` : ''}
      </td>
      <td style="padding:4px 6px; text-align:center;">
        ${item.fileItem ? `
          <button class="btn-inspect-sorted btn primary btn-sm" data-idx="${idx}" style="font-size:0.65rem; padding:1px 5px; background:#a855f7; color:#fff;">
            🔍 Inspect
          </button>
        ` : '-'}
      </td>
    </tr>
  `).join('');

  els.sortedViewTableContainer.innerHTML = `
    <table class="meta-table" style="width:100%; border-collapse:collapse; font-size:0.72rem;">
      <thead>
        <tr style="background:#1e293b; color:#a855f7; border-bottom:2px solid #a855f7; text-align:left;">
          <th style="padding:5px 6px;">#</th>
          <th style="padding:5px 6px;">File / Item Name</th>
          <th style="padding:5px 6px;">Project / Category</th>
          <th style="padding:5px 6px;">Relative Path</th>
          <th style="padding:5px 6px;">Size</th>
          <th style="padding:5px 6px;">Scan Status / Location</th>
          <th style="padding:5px 6px; text-align:center;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  `;

  // Row click & inspect handlers
  els.sortedViewTableContainer.querySelectorAll('.sorted-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const targetBtn = (e.target as HTMLElement).closest('.btn-inspect-sorted');
      const idxStr = row.getAttribute('data-idx');
      if (idxStr !== null) {
        const idx = parseInt(idxStr);
        const selected = itemsToDisplay[idx];
        if (targetBtn && selected.fileItem) {
          inspectFileItem(selected.fileItem);
          els.sortedViewModal.style.display = 'none';
        } else if (selected) {
          renderFocusDetails(selected);
        }
      }
    });
  });

  // Panel 2: Render 2/3 Frequency Word Cloud
  renderWordCloud(itemsToDisplay);

  // Default Focus Details
  if (itemsToDisplay.length > 0) {
    renderFocusDetails(itemsToDisplay[0]);
  }
}

import { renderTreeUI } from '../../tree';
import { escapeHTML } from '../../lib/html';
import { shell } from '../state';
import { els } from '../dom';
import type { InventoryRecord } from '../inventory/store';
import { loadManualInventory } from '../inventory/store';
import { inspectNode } from '../browse/gallery';
import { countKeys, filterByQuery, groupByLocation, groupByPrefix, groupByStatus } from './grouping';

/** One group of the keylist: a heading, a count badge and up to 40 keys. */
function groupCard(
  heading: string,
  colour: string,
  badgeStyle: string,
  filtered: InventoryRecord[],
  line: (i: InventoryRecord) => string,
): string {
  return `
        <div style="background:rgba(15,23,42,0.8); border:1px solid var(--border-color); border-radius:6px; padding:0.5rem;">
          <div style="font-weight:700; font-size:0.8rem; color:${colour}; display:flex; justify-content:space-between; margin-bottom:0.4rem;">
            <span>${heading}</span>
            <span class="tag-badge" style="${badgeStyle}">${filtered.length} items</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:3px;">
            ${filtered.slice(0, 40).map(i => `
              <div class="keylist-item-btn" data-key="${escapeHTML(i.project || i.item)}" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:4px 6px; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                ${line(i)}
              </div>
            `).join('')}
          </div>
        </div>
      `;
}

/** A prefix-group key: project, item, and the scan status when there is one. */
const prefixLine = (i: InventoryRecord): string =>
  `<span style="color:#f8fafc; font-weight:600;">📌 ${escapeHTML(i.project || 'Key')} - <span style="color:#cbd5e1; font-weight:normal;">${escapeHTML(i.item)}</span></span>
                ${i.scanned_status ? `<span style="font-size:0.65rem; color:#38bdf8;">${escapeHTML(i.scanned_status)}</span>` : ''}`;

/** A location- or status-group key: project and item. */
const plainLine = (i: InventoryRecord): string =>
  `<span style="color:#f8fafc; font-weight:600;">📌 ${escapeHTML(i.project)} - ${escapeHTML(i.item)}</span>`;

/** Groups keyed by an arbitrary field, filtered by the query, as cards. */
function groupsHTML(
  groups: { [key: string]: InventoryRecord[] },
  query: string,
  card: (key: string, filtered: InventoryRecord[]) => string,
  skipEmpty: boolean,
): string {
  let html = '';
  for (const [key, items] of Object.entries(groups)) {
    if (skipEmpty && items.length === 0) continue;
    const filtered = filterByQuery(items, query);
    if (query && filtered.length === 0) continue;
    html += card(key, filtered);
  }
  return html;
}

export function renderKeylistUI() {
  const container = document.getElementById('keylistGroupsContainer');
  if (!container) return;

  if (shell.manualInventory.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="display:flex; flex-direction:column; align-items:center; gap:0.75rem; padding:1.5rem; text-align:center;">
        <div style="font-size:0.85rem; color:#94a3b8;">No inventory metadata loaded.</div>
        <button id="btnReloadInventoryInState" class="btn primary btn-sm" style="background:#a855f7; color:#fff; font-weight:600; cursor:pointer; padding:0.4rem 0.8rem;">
          🔄 Reload Inventory Metadata
        </button>
      </div>
    `;
    document.getElementById('btnReloadInventoryInState')?.addEventListener('click', async () => {
      container.innerHTML = `<div class="empty-state">🔄 Fetching inventory metadata from API...</div>`;
      const ok = await loadManualInventory(renderKeylistUI);
      if (!ok && shell.manualInventory.length === 0) {
        renderKeylistUI();
      }
    });
    return;
  }

  const query = els.searchInput.value.toLowerCase().trim();

  if (shell.currentKeylistGroupMode === 'prefix') {
    container.innerHTML = groupsHTML(groupByPrefix(shell.manualInventory), query, (groupTitle, filtered) =>
      groupCard(groupTitle, '#a855f7', 'background:#a855f7; color:#fff;', filtered, prefixLine), true);
  } else if (shell.currentKeylistGroupMode === 'location') {
    container.innerHTML = groupsHTML(groupByLocation(shell.manualInventory), query, (loc, filtered) =>
      groupCard(`📦 ${escapeHTML(loc)}`, '#f59e0b', 'background:#f59e0b; color:#0f172a;', filtered, plainLine), false);
  } else if (shell.currentKeylistGroupMode === 'status') {
    container.innerHTML = groupsHTML(groupByStatus(shell.manualInventory), query, (st, filtered) =>
      groupCard(`📄 ${escapeHTML(st)}`, '#38bdf8', 'background:#0284c7; color:#fff;', filtered, plainLine), false);
  } else if (shell.currentKeylistGroupMode === 'all') {
    const keyCounts = countKeys(shell.manualInventory);

    const sortedKeys = Object.keys(keyCounts).sort();
    const filteredKeys = query ? sortedKeys.filter(k => k.toLowerCase().includes(query)) : sortedKeys;

    let html = `
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:4px;">
        ${filteredKeys.map(k => `
          <button class="keylist-item-btn toggle-btn" data-key="${escapeHTML(k)}" style="text-align:left; font-size:0.72rem; padding:4px 6px; background:#1e293b; color:#38bdf8; border:1px solid var(--border-color); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHTML(k)}">
            🔑 ${escapeHTML(k)} (${keyCounts[k]})
          </button>
        `).join('')}
      </div>
    `;
    container.innerHTML = html;
  }

  container.querySelectorAll('.keylist-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const key = (e.currentTarget as HTMLElement).getAttribute('data-key');
      if (key) {
        els.searchInput.value = key;
        if (shell.rootTreeNode) {
          renderTreeUI(shell.rootTreeNode, els.treeContainer, inspectNode, key);
        }
      }
    });
  });
}

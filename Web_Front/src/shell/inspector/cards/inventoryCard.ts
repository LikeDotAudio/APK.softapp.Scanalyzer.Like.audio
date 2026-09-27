import type { CardContext } from './index';

/** The inventory rows that match this file. */
export function inventoryCard(ctx: CardContext): string {
  const { inventoryMatches } = ctx;
  return inventoryMatches.length > 0 ? `
    <div class="data-card" style="border: 2px solid #a855f7; background: rgba(168, 85, 247, 0.08);">
      <h4 style="color:#a855f7;">📋 INVENTORY MATCH (${inventoryMatches.length} Records)</h4>
      <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:0.4rem;">
        Cross-referenced against the inventory served by <code>/api/inventory</code>:
      </div>
      <div style="display:flex; flex-direction:column; gap:0.4rem;">
        ${inventoryMatches.map(m => `
          <div style="background: rgba(15, 23, 42, 0.6); padding: 0.45rem; border-radius: 4px; border: 1px solid rgba(168, 85, 247, 0.3); font-size: 0.78rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 2px;">
              <strong style="color:#f472b6;">📌 Project / Code: ${m.project}</strong>
              <span class="tag-badge" style="background:#a855f7; color:#fff; font-size:0.68rem;">Row #${m.row}</span>
            </div>
            <div style="color:#e2e8f0; font-weight:600; margin-bottom: 2px;">Item: ${m.item}</div>
            <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:0.72rem; color:#cbd5e1; margin-top:3px;">
              ${m.scanned_status ? `<span><strong>Scanned:</strong> <span style="color:#38bdf8; font-weight:600;">${m.scanned_status}</span></span>` : ''}
              ${m.location ? `<span><strong>Location:</strong> <span style="color:#f59e0b; font-weight:600;">${m.location}</span></span>` : ''}
              ${m.status ? `<span><strong>Flag:</strong> ${m.status}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : '';
}

import type { FileItem } from '../../types';
import type { InventoryRecord } from './store';

/** The first inventory row whose project or item appears in a path. */
export function matchInventoryForPath(
  inventory: InventoryRecord[],
  relativePath: string,
): InventoryRecord | undefined {
  const cleanPath = relativePath.toLowerCase();
  return inventory.find(m => 
    (m.project && m.project.length >= 3 && cleanPath.includes(m.project.toLowerCase())) ||
    (m.item && m.item.length >= 4 && cleanPath.includes(m.item.toLowerCase()))
  );
}

/** Up to six inventory rows that plausibly describe one file.
 *
 *  The inventory is whatever JSON the operator pointed `serve --inventory` at:
 *  a spreadsheet export of what the corpus is SUPPOSED to contain, keyed by
 *  project and item. Matching is deliberately loose -- a scanned file is named
 *  by whoever scanned it, so a substring of either field in either direction
 *  counts. With no --inventory this list is empty and the card does not draw. */
export function matchInventoryForFile(inventory: InventoryRecord[], fileItem: FileItem): InventoryRecord[] {
  const cleanPath = (fileItem.relativePath || fileItem.name).toLowerCase();
  const fileTokens = fileItem.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 3);
  
  return inventory.filter(rec => {
    if (!rec.project && !rec.item) return false;
    const projLower = (rec.project || '').toLowerCase();
    const itemLower = (rec.item || '').toLowerCase();

    if (projLower.length >= 3 && cleanPath.includes(projLower)) return true;
    if (itemLower.length >= 4 && cleanPath.includes(itemLower)) return true;

    for (const token of fileTokens) {
      if ((projLower.length >= 3 && projLower.includes(token)) || (itemLower.length >= 4 && itemLower.includes(token))) return true;
    }
    return false;
  }).slice(0, 6);
}

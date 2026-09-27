import type { InventoryRecord } from '../inventory/store';

/** Inventory records by product family, read off the project code. The titles
 *  are also the display order. */
export function groupByPrefix(records: InventoryRecord[]): { [key: string]: InventoryRecord[] } {
  const groups: { [key: string]: InventoryRecord[] } = {
    '🎛️ M-Series Modules': [],
    '🎚️ L-Series Consoles': [],
    '📻 ST-Series & Consoles': [],
    '📺 TV & Broadcast Stations (CBC, CFPL, TVO, WSVN)': [],
    '📐 Technical Drawing Series (31106, 790236, 880651)': [],
    '📁 General / Other Projects': []
  };

  records.forEach(item => {
    const p = (item.project || '').toUpperCase();
    if (p.startsWith('M')) groups['🎛️ M-Series Modules'].push(item);
    else if (p.startsWith('L') || p.includes('L2042') || p.includes('L3242')) groups['🎚️ L-Series Consoles'].push(item);
    else if (p.startsWith('ST') || p.includes('2442') || p.includes('3642') || p.includes('880134')) groups['📻 ST-Series & Consoles'].push(item);
    else if (p.includes('CBC') || p.includes('CFPL') || p.includes('TVO') || p.includes('WSVN') || p.includes('CFBK')) groups['📺 TV & Broadcast Stations (CBC, CFPL, TVO, WSVN)'].push(item);
    else if (/^\d{4,}/.test(p)) groups['📐 Technical Drawing Series (31106, 790236, 880651)'].push(item);
    else groups['📁 General / Other Projects'].push(item);
  });
  return groups;
}

/** Inventory records keyed by one field, with a fallback for an empty one. */
function groupByField(
  records: InventoryRecord[],
  field: 'location' | 'scanned_status',
  fallback: string,
): { [key: string]: InventoryRecord[] } {
  const map: { [key: string]: InventoryRecord[] } = {};
  records.forEach(item => {
    const k = item[field] || fallback;
    if (!map[k]) map[k] = [];
    map[k].push(item);
  });
  return map;
}

export const groupByLocation = (records: InventoryRecord[]) =>
  groupByField(records, 'location', 'Unspecified Storage');

export const groupByStatus = (records: InventoryRecord[]) =>
  groupByField(records, 'scanned_status', 'Unspecified Status');

/** The records matching a lower-cased query on project and item; all of them
 *  for an empty query. */
export function filterByQuery(items: InventoryRecord[], query: string): InventoryRecord[] {
  return query ? items.filter(i => (i.project + ' ' + i.item).toLowerCase().includes(query)) : items;
}

/** How many records carry each key (project, else item). */
export function countKeys(records: InventoryRecord[]): { [key: string]: number } {
  const keyCounts: { [key: string]: number } = {};
  records.forEach(item => {
    const k = item.project || item.item;
    if (k) keyCounts[k] = (keyCounts[k] || 0) + 1;
  });
  return keyCounts;
}

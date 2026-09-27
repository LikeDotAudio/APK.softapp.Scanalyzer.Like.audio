import { apiUrl } from '../../apiBase';
import { shell } from '../state';

export interface InventoryRecord {
  row: number;
  status: string;
  project: string;
  item: string;
  type: string;
  location: string;
  scanned_status: string;
}

/** Fetch the inventory. `rerender` redraws the keylist, and runs only when the
 *  keylist view is the one on screen. */
export async function loadManualInventory(rerender: () => void): Promise<boolean> {
  try {
    const res = await fetch(apiUrl('/api/inventory'));
    if (res.ok) {
      shell.manualInventory = await res.json();
      console.log(`Loaded ${shell.manualInventory.length} manual inventory records`);
      const keylistBodyEl = document.getElementById('keylistBody');
      if (keylistBodyEl && keylistBodyEl.style.display === 'flex') {
        rerender();
      }
      return true;
    }
  } catch (err) {
    console.warn("Could not fetch manual inventory from API", err);
  }
  return false;
}

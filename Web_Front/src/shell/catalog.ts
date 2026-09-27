import { apiUrl } from '../apiBase';
import { els } from './dom';

/** The micro-API's catalog report, sorted by count, printed into the inspector. */
async function runRustCategoryAndSortChartsUI() {
  try {
    const resp = await fetch(apiUrl('/api/catalog?sort=count'));
    if (resp.ok) {
      const report = await resp.json();
      els.masterInspectorContainer.innerHTML = `
        <div class="data-card">
          <h4>🦀 RUST DATASET SORTING & CATEGORY CHARTS</h4>
          <div class="json-view" style="max-height:400px;">${JSON.stringify(report, null, 2)}</div>
        </div>
      `;
    }
  } catch (err) {
    console.warn("Rust API offline", err);
  }
}

export function bindCatalog() {
  els.runSortsBtn?.addEventListener('click', () => {
    runRustCategoryAndSortChartsUI();
  });
}

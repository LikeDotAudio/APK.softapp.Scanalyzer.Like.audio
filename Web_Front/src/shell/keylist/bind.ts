import { renderTreeUI } from '../../tree';
import { shell } from '../state';
import { els } from '../dom';
import { loadManualInventory } from '../inventory/store';
import { inspectNode } from '../browse/gallery';
import { renderKeylistUI } from './render';

function setActiveGroupBtn(targetBtn: HTMLButtonElement) {
  [els.btnGroupPrefix, els.btnGroupLocation, els.btnGroupStatus, els.btnGroupAllKeys].forEach(btn => {
    btn?.classList.toggle('active', btn === targetBtn);
  });
}

/** The tree/keylist view switch, the four group buttons, the reload button and
 *  the search box. */
export function bindKeylist() {
  els.btnViewTree?.addEventListener('click', () => {
    els.btnViewTree.classList.add('active');
    els.btnViewKeylist.classList.remove('active');
    els.treeSplitBody.style.display = 'flex';
    els.keylistBody.style.display = 'none';
  });

  els.btnViewKeylist?.addEventListener('click', () => {
    els.btnViewKeylist.classList.add('active');
    els.btnViewTree.classList.remove('active');
    els.treeSplitBody.style.display = 'none';
    els.keylistBody.style.display = 'flex';
    renderKeylistUI();
  });

  els.btnGroupPrefix?.addEventListener('click', () => {
    setActiveGroupBtn(els.btnGroupPrefix);
    shell.currentKeylistGroupMode = 'prefix';
    renderKeylistUI();
  });

  els.btnGroupLocation?.addEventListener('click', () => {
    setActiveGroupBtn(els.btnGroupLocation);
    shell.currentKeylistGroupMode = 'location';
    renderKeylistUI();
  });

  els.btnGroupStatus?.addEventListener('click', () => {
    setActiveGroupBtn(els.btnGroupStatus);
    shell.currentKeylistGroupMode = 'status';
    renderKeylistUI();
  });

  els.btnGroupAllKeys?.addEventListener('click', () => {
    setActiveGroupBtn(els.btnGroupAllKeys);
    shell.currentKeylistGroupMode = 'all';
    renderKeylistUI();
  });

  els.btnReloadInventoryHeader?.addEventListener('click', async () => {
    const container = document.getElementById('keylistGroupsContainer');
    if (container) {
      container.innerHTML = `<div class="empty-state">🔄 Fetching inventory metadata from API...</div>`;
    }
    await loadManualInventory(renderKeylistUI);
  });

  els.searchInput?.addEventListener('input', () => {
    if (shell.rootTreeNode) {
      renderTreeUI(shell.rootTreeNode, els.treeContainer, inspectNode, els.searchInput.value);
    }
    if (els.keylistBody.style.display === 'flex') {
      renderKeylistUI();
    }
  });
}

import { renderSchematicsTab } from '../schematicsFinder';
import { renderTagsTab } from '../tagsLibrary';
import { renderTrainingTab } from '../trainingLibrary';
import { shell } from './state';
import type { LibraryTab } from './state';
import { els } from './dom';

// ---- LIBRARIES: the three corpus-wide renderers -----------------------------
//
// PLAN-925.03. `renderSchematicsTab`, `renderTagsTab` and `renderTrainingTab`
// each take `(containerList, containerOutput, files)` — the signature of a
// two-pane tab — and the recovered shell had no tab strip to put them in. They
// are three tabs of ONE modal rather than three buttons in column 3: they take
// the whole `files` array, and column 3 is headed "EVERYTHING About Selected
// File", so folder-scope content there would be a lie about what is on screen.
//
// THE CALL SITE IS THE OPEN, NOT THE FOLDER LOAD. All three walk every file and
// `renderSchematicsTab` additionally runs `classifyImage`, `runOCR` and
// `convertImageToSVG` over each image — minutes of work on a real corpus. Doing
// that at load time would stall the tree the operator is waiting for, to fill
// panes nobody has asked to see. `loadedFiles` is module state, so the open
// always renders the corpus as it stands.
const LIBRARY_TABS: Record<LibraryTab, { button: HTMLButtonElement; list: string; output: string }> = {
  schematics: { button: els.libTabSchematics, list: '⚡ Schematics & Blueprints Found', output: 'Traced Schematic' },
  tags:       { button: els.libTabTags,       list: '🏷️ Tag Index',                    output: 'Files Carrying This Tag' },
  training:   { button: els.libTabTraining,   list: '🧠 Training Candidates',           output: 'Annotations' },
};

function renderLibraryTab(tab: LibraryTab) {
  shell.currentLibraryTab = tab;
  for (const [name, spec] of Object.entries(LIBRARY_TABS)) {
    spec.button?.classList.toggle('active', name === tab);
  }
  els.librariesListTitle.textContent = LIBRARY_TABS[tab].list;
  els.librariesOutputTitle.textContent = LIBRARY_TABS[tab].output;
  els.librariesCountBadge.textContent = `${shell.loadedFiles.length} Files`;
  // Each renderer owns both panes and states its own empty case, so nothing is
  // cleared here first — that would flash a blank over an answer one of them is
  // about to give synchronously.
  if (tab === 'schematics') {
    // The only async one: it OCRs and vectorises, and paints its own progress.
    void renderSchematicsTab(els.librariesListContainer, els.librariesOutputContainer, shell.loadedFiles);
  } else if (tab === 'tags') {
    renderTagsTab(els.librariesListContainer, els.librariesOutputContainer, shell.loadedFiles);
  } else {
    renderTrainingTab(els.librariesListContainer, els.librariesOutputContainer, shell.loadedFiles);
  }
}

export function bindLibraries() {
  els.btnOpenLibraries?.addEventListener('click', () => {
    els.librariesModal.style.display = 'flex';
    renderLibraryTab(shell.currentLibraryTab);
  });

  els.closeLibrariesModalBtn?.addEventListener('click', () => {
    els.librariesModal.style.display = 'none';
  });

  els.libTabSchematics?.addEventListener('click', () => renderLibraryTab('schematics'));
  els.libTabTags?.addEventListener('click', () => renderLibraryTab('tags'));
  els.libTabTraining?.addEventListener('click', () => renderLibraryTab('training'));
}

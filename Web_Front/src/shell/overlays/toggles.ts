import { shell } from '../state';
import type { OverlayFlag } from '../state';
import { els } from '../dom';
import { renderVisualDocumentOverlays } from './render';

/** Each overlay flag with its button in the toolbar and its twin in the
 *  full-document modal. Either button flips the flag and lights both. */
const OVERLAY_TOGGLES: ReadonlyArray<readonly [OverlayFlag, HTMLButtonElement, HTMLButtonElement]> = [
  ['showOcrBoxes', els.btnToggleOcrBoxes, els.modalBtnToggleOcrBoxes],
  ['showTextOverlay', els.btnToggleTextOverlay, els.modalBtnToggleTextOverlay],
  ['showTitleBlock', els.btnToggleTitleBlock, els.modalBtnToggleTitleBlock],
  ['showFaceOverlay', els.btnToggleFaceOverlay, els.modalBtnToggleFaceOverlay],
  ['showSchematicLines', els.btnToggleSchematicLines, els.modalBtnToggleSchematicLines],
  ['showSvgVector', els.btnToggleSvgVector, els.modalBtnToggleSvgVector],
];

function flip(flag: OverlayFlag, button: HTMLButtonElement, modalButton: HTMLButtonElement) {
  shell[flag] = !shell[flag];
  button?.classList.toggle('active', shell[flag]);
  modalButton?.classList.toggle('active', shell[flag]);
  renderVisualDocumentOverlays();
}

/** The twelve overlay toggles, and opening and closing the full-document modal. */
export function bindOverlayToggles() {
  for (const [flag, button, modalButton] of OVERLAY_TOGGLES) {
    button?.addEventListener('click', () => flip(flag, button, modalButton));
  }
  for (const [flag, button, modalButton] of OVERLAY_TOGGLES) {
    modalButton?.addEventListener('click', () => flip(flag, button, modalButton));
  }

  els.btnFullDocViewer?.addEventListener('click', () => {
    if (!shell.currentInspectedFileItem) return;
    els.fullDocModal.style.display = 'flex';
    renderVisualDocumentOverlays();
  });

  els.closeFullDocModalBtn?.addEventListener('click', () => {
    els.fullDocModal.style.display = 'none';
  });
}

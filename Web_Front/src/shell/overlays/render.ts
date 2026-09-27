import { shell } from '../state';
import { els } from '../dom';
import { faceLayer, lineLayer, modalOcrLayer, ocrLayer, titleBlockLayer } from './layers';

/** Paint the inspected image with its enabled overlays into the preview pane,
 *  and into the full-document modal as well when that is open. */
export function renderVisualDocumentOverlays() {
  if (!shell.currentInspectedFileItem || !shell.currentInspectedFileItem.isImage || !shell.currentInspectedImgUrl) return;

  const ocrWords: any[] = shell.currentInspectedOcrData?.word_regions || [];
  const faceBoxes: any[] = shell.currentInspectedPhotoData?.face_detection?.face_boxes || [];

  // Create wrapper HTML
  const svgXml = shell.currentInspectedSvgData?.svg_xml || '';
  const wrapperHTML = `
    <div class="ocr-overlay-wrapper" id="activeOverlayWrapper" style="position:relative; display:inline-block;">
      ${shell.showSvgVector && svgXml ? `
        <div class="svg-vector-preview-box" style="background:#090d16; border:2px solid #8b5cf6; padding:0.5rem; border-radius:4px; max-width:100%;">
          <div style="font-size:0.75rem; color:#8b5cf6; font-weight:700; margin-bottom:4px;">📐 Rust Vectorized SVG Paths (${shell.currentInspectedSvgData?.path_count || 0} vector paths):</div>
          ${svgXml}
        </div>
      ` : `
        <img src="${shell.currentInspectedImgUrl}" id="activeOverlayImage" alt="${shell.currentInspectedFileItem.name}" />
      `}
      <div id="overlayLayerContainer"></div>
    </div>
  `;

  // Render to Left 1/3 Preview Container
  els.imagePreviewContainer.innerHTML = wrapperHTML;

  const imgEl = els.imagePreviewContainer.querySelector('#activeOverlayImage') as HTMLImageElement;
  const overlayContainer = els.imagePreviewContainer.querySelector('#overlayLayerContainer') as HTMLElement;

  function attachScaledOverlays() {
    if (!imgEl || !overlayContainer) return;
    const naturalW = imgEl.naturalWidth || 1;
    const naturalH = imgEl.naturalHeight || 1;
    const clientW = imgEl.clientWidth || naturalW;
    const clientH = imgEl.clientHeight || naturalH;

    const scaleX = clientW / naturalW;
    const scaleY = clientH / naturalH;

    let layerHTML = '';

    if (shell.showOcrBoxes || shell.showTextOverlay) {
      layerHTML += ocrLayer(ocrWords, scaleX, scaleY, shell.showOcrBoxes, shell.showTextOverlay);
    }

    if (shell.showFaceOverlay) {
      layerHTML += faceLayer(faceBoxes, scaleX, scaleY);
    }

    if (shell.showSchematicLines) {
      layerHTML += lineLayer(shell.currentInspectedAnalyzerData?.lines_detected || [], scaleX, scaleY);
    }

    if (shell.showTitleBlock) {
      layerHTML += titleBlockLayer(shell.currentInspectedAnalyzerData?.title_block, scaleX, scaleY);
    }

    overlayContainer.innerHTML = layerHTML;
  }

  if (imgEl.complete) {
    attachScaledOverlays();
  } else {
    imgEl.onload = attachScaledOverlays;
  }

  // If Full Doc Modal is open, render to modal body as well
  if (els.fullDocModal.style.display === 'flex') {
    const modalTitle = document.getElementById('fullDocTitle');
    if (modalTitle) {
      modalTitle.innerText = `📄 Full Document: ${shell.currentInspectedFileItem.name} (${ocrWords.length} text regions, ${faceBoxes.length} face regions)`;
    }
    els.fullDocModalBody.innerHTML = wrapperHTML;
    const modalImgEl = els.fullDocModalBody.querySelector('#activeOverlayImage') as HTMLImageElement;
    const modalOverlayContainer = els.fullDocModalBody.querySelector('#overlayLayerContainer') as HTMLElement;
    if (modalImgEl) {
      const attachModalOverlays = () => {
        const nW = modalImgEl.naturalWidth || 1;
        const nH = modalImgEl.naturalHeight || 1;
        const cW = modalImgEl.clientWidth || nW;
        const cH = modalImgEl.clientHeight || nH;
        const sX = cW / nW;
        const sY = cH / nH;

        let mHTML = '';
        if (shell.showOcrBoxes || shell.showTextOverlay) {
          mHTML += modalOcrLayer(ocrWords, sX, sY, shell.showOcrBoxes, shell.showTextOverlay);
        }
        if (modalOverlayContainer) modalOverlayContainer.innerHTML = mHTML;
      };
      if (modalImgEl.complete) attachModalOverlays();
      else modalImgEl.onload = attachModalOverlays;
    }
  }
}

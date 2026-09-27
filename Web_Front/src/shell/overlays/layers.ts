import { escapeHTML } from '../../lib/html';

// Overlay-box markup from detected boxes and a display scale. Pure: every
// input is an argument, so a given set of boxes can be checked without a page.

/** OCR word boxes for the preview pane, each titled with its word and confidence. */
export function ocrLayer(ocrWords: any[], scaleX: number, scaleY: number, showOcrBoxes: boolean, showTextOverlay: boolean): string {
  let layerHTML = '';
  for (const w of ocrWords) {
    const sx = w.x * scaleX;
    const sy = w.y * scaleY;
    const sw = w.width * scaleX;
    const sh = w.height * scaleY;

    layerHTML += `
          <div class="ocr-overlay-box" style="
            left: ${sx}px;
            top: ${sy}px;
            width: ${sw}px;
            height: ${sh}px;
            display: ${showOcrBoxes ? 'block' : 'none'};
          " title="Word: '${escapeHTML(w.text)}' (Conf: ${(w.confidence * 100).toFixed(0)}%)">
            ${showTextOverlay ? `<span class="ocr-overlay-text">${escapeHTML(w.text)}</span>` : ''}
          </div>
        `;
  }
  return layerHTML;
}

/** Detected faces, numbered from 1. */
export function faceLayer(faceBoxes: any[], scaleX: number, scaleY: number): string {
  let layerHTML = '';
  for (let idx = 0; idx < faceBoxes.length; idx++) {
    const f = faceBoxes[idx];
    const sx = f.x * scaleX;
    const sy = f.y * scaleY;
    const sw = f.width * scaleX;
    const sh = f.height * scaleY;

    layerHTML += `
          <div class="face-overlay-box" style="
            left: ${sx}px;
            top: ${sy}px;
            width: ${sw}px;
            height: ${sh}px;
          " title="Face #${idx+1}">
            <span class="face-overlay-tag">👤 Face #${idx+1}</span>
          </div>
        `;
  }
  return layerHTML;
}

/** Schematic trace lines, each at least 2 px thick. */
export function lineLayer(detectedLines: any[], scaleX: number, scaleY: number): string {
  let layerHTML = '';
  for (const line of detectedLines) {
    const sx1 = line.x1 * scaleX;
    const sy1 = line.y1 * scaleY;
    const sx2 = line.x2 * scaleX;
    const sy2 = line.y2 * scaleY;

    const lw = Math.max(Math.abs(sx2 - sx1), 2);
    const lh = Math.max(Math.abs(sy2 - sy1), 2);

    layerHTML += `
          <div class="schematic-line-overlay" style="
            left: ${sx1}px;
            top: ${sy1}px;
            width: ${lw}px;
            height: ${lh}px;
          " title="Schematic Trace Line (${line.orientation}): ${line.length.toFixed(0)}px"></div>
        `;
  }
  return layerHTML;
}

/** The title-block box, when one was found. */
export function titleBlockLayer(tb: any, scaleX: number, scaleY: number): string {
  let layerHTML = '';
  if (tb && tb.found) {
    const sx = tb.x * scaleX;
    const sy = tb.y * scaleY;
    const sw = tb.width * scaleX;
    const sh = tb.height * scaleY;

    layerHTML += `
          <div class="title-block-overlay" style="
            left: ${sx}px;
            top: ${sy}px;
            width: ${sw}px;
            height: ${sh}px;
          " title="Title Block: ${escapeHTML(tb.title_text_extracted ?? 'nothing read')} | Dwg #: ${escapeHTML(tb.drawing_number ?? '—')}">
            <span class="title-block-tag">📌 SCHEMATIC TITLE BLOCK${tb.drawing_number ? ` (${escapeHTML(tb.drawing_number)})` : ''}</span>
          </div>
        `;
  }
  return layerHTML;
}

/** OCR word boxes for the full-document modal (no hover titles). */
export function modalOcrLayer(ocrWords: any[], sX: number, sY: number, showOcrBoxes: boolean, showTextOverlay: boolean): string {
  let mHTML = '';
  for (const w of ocrWords) {
    mHTML += `
              <div class="ocr-overlay-box" style="
                left: ${w.x * sX}px;
                top: ${w.y * sY}px;
                width: ${w.width * sX}px;
                height: ${w.height * sY}px;
                display: ${showOcrBoxes ? 'block' : 'none'};
              ">
                ${showTextOverlay ? `<span class="ocr-overlay-text">${escapeHTML(w.text)}</span>` : ''}
              </div>
            `;
  }
  return mHTML;
}

import type { FileItem } from '../../types';
import { initAnnotator } from '../../annotator';
import { identifyPhotoAndWords } from '../../identifier';
import { apiUrl } from '../../apiBase';
import { shell } from '../state';
import { els } from '../dom';
import { openPdfBreakoutModal } from '../overlays/docModal';
import { renderSubPhotoPreview } from './preview';

function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** Wire the freshly drawn inspector column: mount the two recovered per-file
 *  modules, and attach the PDF breakout, sub-photo and face-match buttons. */
export function bindInspector(fileItem: FileItem) {
  // The two recovered per-file modules, mounted into the hosts above. Both
  // write into the element they are handed and neither returns anything to
  // render, so there is nothing to await for layout; `identifyPhotoAndWords`
  // posts to the Rust micro-API's /api/photo-id and paints its own pending and
  // failure states, which is why it is not awaited here — a bench with no API
  // up must still get the rest of this inspector.
  const annotatorHost = document.getElementById('inspectorAnnotatorHost');
  if (annotatorHost) initAnnotator(fileItem, annotatorHost);
  const identifierHost = document.getElementById('inspectorIdentifierHost');
  if (identifierHost) void identifyPhotoAndWords(fileItem, identifierHost);

  // Attach PDF breakout listener
  document.getElementById('btnInspectorPdfBreakout')?.addEventListener('click', () => {
    openPdfBreakoutModal(fileItem, shell.currentInspectedImgUrl);
  });

  // Attach sub-photo download and preview listeners
  els.masterInspectorContainer.querySelectorAll('.btn-download-subphoto').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const dataUrl = target.getAttribute('data-url');
      const name = target.getAttribute('data-name');
      if (dataUrl && name) {
        downloadDataUrl(dataUrl, name);
      }
    });
  });

  els.masterInspectorContainer.querySelectorAll('.btn-preview-subphoto').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLButtonElement;
      const dataUrl = target.getAttribute('data-url');
      if (dataUrl) {
        renderSubPhotoPreview(dataUrl);
      }
    });
  });

  // Attach face match listener
  els.masterInspectorContainer.querySelectorAll('.btn-compact-face-match').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const targetBtn = e.currentTarget as HTMLButtonElement;
      const targetHash = targetBtn.getAttribute('data-hash') || '0';
      const resultContainer = document.getElementById('faceMatchResultContainer');
      if (resultContainer) {
        resultContainer.style.display = 'block';
        resultContainer.innerHTML = '🔍 Querying Rust Facial Identification Engine...';
        try {
          const resp = await fetch(apiUrl('/api/face-match'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash1: parseInt(targetHash), hash2: parseInt(targetHash) })
          });
          const data = await resp.json();
          resultContainer.innerHTML = `✅ <strong>Face Identified!</strong> Match Confidence: <strong>${data.match_percentage}</strong> | Feature Hash: <code>${data.hash1}</code>`;
        } catch (err) {
          resultContainer.innerHTML = `❌ Face Matcher Error: ${err}`;
        }
      }
    });
  });
}

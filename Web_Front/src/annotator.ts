import { FileItem } from './types';

export interface Annotation {
  id: number;
  label: string;
  category: string;
  x: number; // percentage
  y: number; // percentage
  width: number; // percentage
  height: number; // percentage
}

let currentAnnotations: Annotation[] = [];
let nextId = 1;
let currentFileItem: FileItem | null = null;
let isDrawing = false;
let startX = 0;
let startY = 0;

export function initAnnotator(fileItem: FileItem, container: HTMLElement) {
  currentFileItem = fileItem;
  currentAnnotations = [];
  nextId = 1;

  const imgUrl = URL.createObjectURL(fileItem.file);

  container.innerHTML = `
    <div class="inspector-detail">
      <div class="annotator-header">
        <h3>🎓 Interactive Image Annotator & Training Dataset</h3>
        <span class="badge" id="annotCountBadge">0 Saved Annotations</span>
      </div>

      <div class="annotator-canvas-container" id="annotCanvasBox">
        <img src="${imgUrl}" id="annotImage" alt="${fileItem.name}" draggable="false" />
        <div id="annotOverlay" class="annot-overlay"></div>
        <div id="drawBox" class="draw-box" style="display:none;"></div>
      </div>

      <div class="annotator-controls">
        <div class="input-group">
          <label>Component Label Name:</label>
          <input type="text" id="annotLabelInput" value="VU METER" placeholder="e.g. VU METER, TRANSFORMER, SWITCH" />
        </div>
        <div class="input-group">
          <label>Category:</label>
          <select id="annotCategorySelect">
            <option value="HARDWARE_PART">HARDWARE_PART</option>
            <option value="AUDIO_MODULE">AUDIO_MODULE</option>
            <option value="CONNECTOR">CONNECTOR</option>
            <option value="TEXT_LABEL">TEXT_LABEL</option>
            <option value="DIAGRAM_SYMBOL">DIAGRAM_SYMBOL</option>
          </select>
        </div>
      </div>

      <h4>📍 Labeled Component Pins ("Where text / component is from")</h4>
      <table class="meta-table annot-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Component Label Name</th>
            <th>Position (X%, Y%)</th>
            <th>Category</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody id="annotTableBody">
          <tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Click and drag on the image above to add bounding box annotations.</td></tr>
        </tbody>
      </table>

      <div class="button-group" style="margin-top: 1rem;">
        <button id="saveAnnotBtn" class="btn primary">💾 Save Sidecar Annotation (.annotation.json)</button>
      </div>
    </div>
  `;

  setupCanvasEvents(container);
}

function setupCanvasEvents(container: HTMLElement) {
  const box = container.querySelector('#annotCanvasBox') as HTMLElement;
  const overlay = container.querySelector('#annotOverlay') as HTMLElement;
  const drawBox = container.querySelector('#drawBox') as HTMLElement;
  const img = container.querySelector('#annotImage') as HTMLImageElement;
  const labelInput = container.querySelector('#annotLabelInput') as HTMLInputElement;
  const catSelect = container.querySelector('#annotCategorySelect') as HTMLSelectElement;
  const saveBtn = container.querySelector('#saveAnnotBtn') as HTMLButtonElement;

  if (!box || !img) return;

  box.addEventListener('mousedown', (e) => {
    const rect = box.getBoundingClientRect();
    isDrawing = true;
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    drawBox.style.left = `${startX}px`;
    drawBox.style.top = `${startY}px`;
    drawBox.style.width = '0px';
    drawBox.style.height = '0px';
    drawBox.style.display = 'block';
  });

  box.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = box.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const width = currentX - startX;
    const height = currentY - startY;

    drawBox.style.left = `${width < 0 ? currentX : startX}px`;
    drawBox.style.top = `${height < 0 ? currentY : startY}px`;
    drawBox.style.width = `${Math.abs(width)}px`;
    drawBox.style.height = `${Math.abs(height)}px`;
  });

  box.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;
    drawBox.style.display = 'none';

    const rect = box.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const leftPx = Math.min(startX, endX);
    const topPx = Math.min(startY, endY);
    const widthPx = Math.abs(endX - startX);
    const heightPx = Math.abs(endY - startY);

    if (widthPx < 10 || heightPx < 10) return; // ignore tiny accidental clicks

    const xPct = parseFloat(((leftPx / rect.width) * 100).toFixed(2));
    const yPct = parseFloat(((topPx / rect.height) * 100).toFixed(2));
    const wPct = parseFloat(((widthPx / rect.width) * 100).toFixed(2));
    const hPct = parseFloat(((heightPx / rect.height) * 100).toFixed(2));

    const newAnnot: Annotation = {
      id: nextId++,
      label: labelInput.value.trim() || `COMPONENT_${nextId}`,
      category: catSelect.value,
      x: xPct,
      y: yPct,
      width: wPct,
      height: hPct
    };

    currentAnnotations.push(newAnnot);
    renderAnnotations(overlay, container);
  });

  saveBtn?.addEventListener('click', () => {
    saveAnnotationSidecar();
  });
}

function renderAnnotations(overlay: HTMLElement, container: HTMLElement) {
  overlay.innerHTML = '';
  const tbody = container.querySelector('#annotTableBody') as HTMLElement;
  const badge = container.querySelector('#annotCountBadge') as HTMLElement;

  if (badge) badge.textContent = `${currentAnnotations.length} Saved Annotations`;

  if (currentAnnotations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">Click and drag on the image above to add bounding box annotations.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';

  currentAnnotations.forEach((annot) => {
    // Render Overlay Bounding Box
    const pin = document.createElement('div');
    pin.className = 'annot-pin';
    pin.style.left = `${annot.x}%`;
    pin.style.top = `${annot.y}%`;
    pin.style.width = `${annot.width}%`;
    pin.style.height = `${annot.height}%`;

    const tag = document.createElement('span');
    tag.className = 'annot-pin-tag';
    tag.textContent = `[#${annot.id}] ${annot.label}`;
    pin.appendChild(tag);
    overlay.appendChild(pin);

    // Render Table Row
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="id-badge">#${annot.id}</span></td>
      <td>🎯 <strong>${annot.label}</strong></td>
      <td>X:${annot.x}%, Y:${annot.y}%</td>
      <td><span class="cat-tag">${annot.category}</span></td>
      <td><button class="btn delete-btn" data-id="${annot.id}">🗑️ Delete</button></td>
    `;

    tr.querySelector('.delete-btn')?.addEventListener('click', () => {
      currentAnnotations = currentAnnotations.filter(a => a.id !== annot.id);
      renderAnnotations(overlay, container);
    });

    tbody.appendChild(tr);
  });
}

function saveAnnotationSidecar() {
  if (!currentFileItem) return;

  const data = {
    filename: currentFileItem.name,
    relative_path: currentFileItem.relativePath,
    annotations_count: currentAnnotations.length,
    annotations: currentAnnotations
  };

  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentFileItem.name}.annotation.json`;
  a.click();
  URL.revokeObjectURL(url);
}

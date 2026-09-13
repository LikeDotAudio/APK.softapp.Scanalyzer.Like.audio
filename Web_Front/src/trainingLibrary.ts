import { FileItem } from './types';
import { formatBytes } from './tree';

export interface TrainingAnnotation {
  id: string;
  fileName: string;
  relativePath: string;
  label: string;
  category: 'SCHEMATIC_COMPONENT' | 'HARDWARE_PART' | 'TEXT_LABEL' | 'CUSTOM';
  xPercent: number; // 0 - 100
  yPercent: number; // 0 - 100
  wPercent: number; // 0 - 100
  hPercent: number; // 0 - 100
  createdAt: string;
}

const STORAGE_KEY = 'wbs_training_library_v1';

let trainingAnnotations: TrainingAnnotation[] = loadSavedAnnotations();

function loadSavedAnnotations(): TrainingAnnotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAnnotations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trainingAnnotations));
  } catch (err) {
    console.warn("Could not save training annotations to localStorage", err);
  }
}

export function renderTrainingTab(
  containerList: HTMLElement,
  containerOutput: HTMLElement,
  files: FileItem[]
) {
  const imageFiles = files.filter(f => f.isImage);

  if (imageFiles.length === 0) {
    containerList.innerHTML = `<div class="empty-state">Upload images to enable training annotation library.</div>`;
    containerOutput.innerHTML = `<div class="empty-state">Select an image to click and add training annotations.</div>`;
    return;
  }

  // Render Left Image Selector List
  containerList.innerHTML = '';

  const summaryBanner = document.createElement('div');
  summaryBanner.className = 'recommendation-banner';
  summaryBanner.style.margin = '0 0 0.75rem 0';
  summaryBanner.style.fontSize = '0.82rem';
  summaryBanner.innerHTML = `🎓 <strong>${trainingAnnotations.length} Training Labels</strong> saved in library.`;
  containerList.appendChild(summaryBanner);

  const ul = document.createElement('ul');
  ul.className = 'tree-root';

  imageFiles.forEach((item, idx) => {
    const li = document.createElement('li');
    li.className = 'tree-node';

    const div = document.createElement('div');
    div.className = 'tree-item';
    if (idx === 0) div.classList.add('selected');

    const count = trainingAnnotations.filter(a => a.relativePath === item.relativePath || a.fileName === item.name).length;
    const badgeHTML = count > 0 ? `<span class="annotation-badge">${count} labels</span>` : '';

    div.innerHTML = `
      <span class="tree-icon">${item.emojiBadge || '🖼️'}</span>
      <span class="tree-name">${item.name}</span>
      ${badgeHTML}
      <span class="tree-size">${formatBytes(item.size)}</span>
    `;

    div.addEventListener('click', () => {
      containerList.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      inspectTrainingImage(item, containerOutput, () => {
        // Refresh summary banner
        summaryBanner.innerHTML = `🎓 <strong>${trainingAnnotations.length} Training Labels</strong> saved in library.`;
      });
    });

    li.appendChild(div);
    ul.appendChild(li);
  });

  containerList.appendChild(ul);

  if (imageFiles.length > 0) {
    inspectTrainingImage(imageFiles[0], containerOutput, () => {
      summaryBanner.innerHTML = `🎓 <strong>${trainingAnnotations.length} Training Labels</strong> saved in library.`;
    });
  }
}

function inspectTrainingImage(
  fileItem: FileItem,
  containerOutput: HTMLElement,
  onUpdate: () => void
) {
  const fileAnnotations = trainingAnnotations.filter(
    a => a.relativePath === fileItem.relativePath || a.fileName === fileItem.name
  );

  containerOutput.innerHTML = `
    <div class="inspector-detail">
      <div class="annotation-toolbar">
        <span style="font-size:0.88rem; font-weight:600;">🎯 Interactive Annotator:</span>
        <span style="font-size:0.82rem; color:var(--text-muted);">Click anywhere on the image below to drop a pin & label component</span>
        <button id="exportTrainingJSONBtn" class="btn primary" style="margin-left:auto; padding:0.35rem 0.75rem; font-size:0.8rem;">
          💾 Export Training Catalog (JSON)
        </button>
      </div>

      <!-- Interactive Canvas -->
      <div class="annotator-canvas-container">
        <canvas id="annotatorDisplayCanvas"></canvas>
      </div>

      <!-- Image Details & Add Label Controls -->
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 style="margin:0;">🎓 Training Library: ${fileItem.name}</h3>
        <span class="annotation-badge">
          ${fileAnnotations.length} Saved Annotations
        </span>
      </div>

      <!-- Saved Annotations Table -->
      <h4>📍 Labeled Component Pins ("Where text / component is from")</h4>
      <div style="max-height: 220px; overflow-y: auto; border:1px solid var(--border-color); border-radius:8px;">
        <table class="meta-table">
          <thead>
            <tr>
              <th style="width: 10%;">ID</th>
              <th style="width: 35%;">Component Label Name</th>
              <th style="width: 25%;">Position (X%, Y%)</th>
              <th style="width: 15%;">Category</th>
              <th style="width: 15%;">Action</th>
            </tr>
          </thead>
          <tbody id="annotationTableBody">
            ${renderAnnotationTableRows(fileAnnotations)}
          </tbody>
        </table>
      </div>

      <!-- Full Dataset Library Catalog -->
      <h4>🎓 Full Training Dataset Catalog (${trainingAnnotations.length} Total Items)</h4>
      <div class="json-view" style="max-height:180px;">${JSON.stringify(trainingAnnotations, null, 2)}</div>
    </div>
  `;

  const canvasEl = containerOutput.querySelector('#annotatorDisplayCanvas') as HTMLCanvasElement;
  const img = new Image();
  const url = URL.createObjectURL(fileItem.file);

  let activeHighlightId: string | null = null;

  img.onload = () => {
    URL.revokeObjectURL(url);
    renderAnnotatorCanvas(canvasEl, img, fileAnnotations, activeHighlightId);

    // Handle canvas click to add new training label
    canvasEl.onclick = (e: MouseEvent) => {
      const rect = canvasEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const xPercent = (clickX / rect.width) * 100;
      const yPercent = (clickY / rect.height) * 100;

      const labelInput = prompt(
        `🎓 Add Training Library Label:\nEnter component name or identification label (e.g. "Transformer T1", "Capacitor C12", "Resistor R4", "Meter Bridge"):`
      );

      if (labelInput && labelInput.trim().length > 0) {
        const newAnnotation: TrainingAnnotation = {
          id: `TRN-${Date.now().toString(16).toUpperCase()}`,
          fileName: fileItem.name,
          relativePath: fileItem.relativePath,
          label: labelInput.trim(),
          category: fileItem.name.toLowerCase().includes('schematic') || fileItem.emojiBadge === '📐'
            ? 'SCHEMATIC_COMPONENT'
            : 'HARDWARE_PART',
          xPercent: parseFloat(xPercent.toFixed(2)),
          yPercent: parseFloat(yPercent.toFixed(2)),
          wPercent: 12,
          hPercent: 8,
          createdAt: new Date().toISOString()
        };

        trainingAnnotations.push(newAnnotation);
        saveAnnotations();
        onUpdate();

        // Re-inspect to refresh table & canvas
        inspectTrainingImage(fileItem, containerOutput, onUpdate);
      }
    };
  };
  img.src = url;

  // Add click & hover handlers to table delete buttons & rows
  const tableBody = containerOutput.querySelector('#annotationTableBody');
  if (tableBody) {
    tableBody.querySelectorAll('.delete-annotation-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        if (id) {
          trainingAnnotations = trainingAnnotations.filter(a => a.id !== id);
          saveAnnotations();
          onUpdate();
          inspectTrainingImage(fileItem, containerOutput, onUpdate);
        }
      });
    });

    tableBody.querySelectorAll('tr').forEach(row => {
      row.addEventListener('mouseenter', (e) => {
        const id = (e.currentTarget as HTMLElement).getAttribute('data-id');
        activeHighlightId = id;
        renderAnnotatorCanvas(canvasEl, img, fileAnnotations, activeHighlightId);
      });
      row.addEventListener('mouseleave', () => {
        activeHighlightId = null;
        renderAnnotatorCanvas(canvasEl, img, fileAnnotations, null);
      });
    });
  }

  // Export Training Dataset JSON Button Handler
  containerOutput.querySelector('#exportTrainingJSONBtn')?.addEventListener('click', () => {
    exportTrainingDatasetJSON();
  });
}

function renderAnnotationTableRows(annotations: TrainingAnnotation[]): string {
  if (annotations.length === 0) {
    return `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No training labels added for this image yet. Click on the image preview above to place a label pin.</td></tr>`;
  }

  return annotations.map((ann, idx) => `
    <tr data-id="${ann.id}" style="cursor:pointer;">
      <td><span class="region-badge">#${idx + 1}</span></td>
      <td><strong>🎯 ${escapeHTML(ann.label)}</strong></td>
      <td><code>X:${ann.xPercent}%, Y:${ann.yPercent}%</code></td>
      <td><span class="tag-badge">${ann.category}</span></td>
      <td>
        <button class="delete-annotation-btn btn secondary" data-id="${ann.id}" style="padding:0.15rem 0.4rem; font-size:0.75rem; color:#f87171;">
          🗑️ Delete
        </button>
      </td>
    </tr>
  `).join('');
}

function renderAnnotatorCanvas(
  targetCanvas: HTMLCanvasElement,
  img: HTMLImageElement,
  annotations: TrainingAnnotation[],
  highlightedId: string | null = null
) {
  targetCanvas.width = img.naturalWidth;
  targetCanvas.height = img.naturalHeight;

  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // 1. Draw base image
  ctx.drawImage(img, 0, 0);

  // 2. Draw annotation pins & boxes
  annotations.forEach((ann, idx) => {
    const isHighlighted = ann.id === highlightedId;
    const posX = (ann.xPercent / 100) * targetCanvas.width;
    const posY = (ann.yPercent / 100) * targetCanvas.height;

    const boxW = Math.max(40, (ann.wPercent / 100) * targetCanvas.width);
    const boxH = Math.max(30, (ann.hPercent / 100) * targetCanvas.height);

    const x0 = Math.max(0, posX - boxW / 2);
    const y0 = Math.max(0, posY - boxH / 2);

    // Box fill & stroke
    ctx.fillStyle = isHighlighted ? 'rgba(245, 158, 11, 0.45)' : 'rgba(34, 197, 94, 0.25)';
    ctx.fillRect(x0, y0, boxW, boxH);

    ctx.strokeStyle = isHighlighted ? '#f59e0b' : '#22c55e';
    ctx.lineWidth = Math.max(2, Math.round(targetCanvas.width / 500));
    ctx.strokeRect(x0, y0, boxW, boxH);

    // Draw Label Badge
    const labelText = `[#${idx + 1}] ${ann.label}`;
    const fontSize = Math.max(12, Math.round(targetCanvas.height / 45));
    ctx.font = `bold ${fontSize}px sans-serif`;

    const metrics = ctx.measureText(labelText);
    const badgeW = metrics.width + 10;
    const badgeH = fontSize + 8;

    const badgeX = Math.max(0, x0);
    const badgeY = Math.max(0, y0 - badgeH);

    ctx.fillStyle = isHighlighted ? '#f59e0b' : '#22c55e';
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle = '#000000';
    ctx.fillText(labelText, badgeX + 5, badgeY + fontSize + 2);
  });
}

function exportTrainingDatasetJSON() {
  const jsonString = JSON.stringify(trainingAnnotations, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'training_library_dataset.json';
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
